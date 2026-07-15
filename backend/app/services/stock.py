"""Stock domain rules: decimal quantities, movements and appointment formulas."""
from __future__ import annotations

import asyncio
import hashlib
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException

from app.catalog.color_products import PRODUCT_BY_ID
from app.db import db, get_active_company


_stock_lock = asyncio.Lock()
_STEP = Decimal("0.0001")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def quantity(value) -> float:
    """Use a stable four-decimal business precision for JSONB quantities."""
    return float(Decimal(str(value or 0)).quantize(_STEP, rounding=ROUND_HALF_UP))


def product_label(product: dict) -> str:
    detail = product.get("shadeCode") or product.get("shadeName") or ""
    return " ".join(x for x in (product.get("productName"), detail) if x).strip()


def snapshot(product: dict) -> dict:
    keys = (
        "id", "brand", "normalizedCategory", "range", "subrange",
        "productName", "shadeCode", "normalizedShadeCode", "shadeName",
        "format", "stockUnit", "packageAmount", "packageAmountUnit",
        "developerPercent", "developerVolume",
    )
    return {key: product.get(key) for key in keys}


async def ensure_stock_item(catalog_product_id: str) -> dict:
    product = PRODUCT_BY_ID.get(catalog_product_id)
    if not product or not product.get("active"):
        raise HTTPException(400, "Produit du catalogue introuvable ou inactif")
    item = await db.stock.find_one({"catalog_product_id": catalog_product_id}, {"_id": 0})
    if item:
        return item
    now = now_iso()
    item = {
        # Deterministic key prevents duplicate catalogue lines even if two
        # server instances create the first stock entry simultaneously.
        "id": f"stk_{hashlib.sha1(catalog_product_id.encode('utf-8')).hexdigest()[:10]}",
        "name": product_label(product),
        "quantity": 0.0,
        "threshold": 0.0,
        "tag": product["normalizedCategory"],
        "catalog_product_id": catalog_product_id,
        "product_snapshot": snapshot(product),
        "unit_price": None,
        "currency": "EUR",
        "reorder_threshold": 0.0,
        "target_stock": 1.0,
        "created_at": now,
        "updated_at": now,
    }
    await db.stock.insert_one(item)
    return item


async def record_movement(item: dict, delta: float, movement_type: str, *,
                          appointment_id=None, client_id=None, usage_id=None,
                          note="", created_by=None) -> tuple[dict, dict]:
    updated_at = now_iso()
    movement = {
        "id": f"mov_{uuid.uuid4().hex[:12]}",
        "stock_item_id": item["id"],
        "catalog_product_id": item.get("catalog_product_id"),
        "movement_type": movement_type,
        "quantity_delta": quantity(delta),
        "appointment_id": appointment_id,
        "client_id": client_id,
        "appointment_product_usage_id": usage_id,
        "reason": note,
        "created_by": created_by,
        "created_at": updated_at,
    }
    result = await db.rpc("apply_stock_movement", {
        "p_company_id": get_active_company(),
        "p_stock_key": item["id"],
        "p_delta": quantity(delta),
        "p_movement": movement,
    })
    return result["stock_item"], result["movement"]


def draft_usage(raw: dict, appointment_id: str, client_id: str, previous=None) -> dict:
    product = PRODUCT_BY_ID.get(raw["catalog_product_id"])
    if not product:
        raise HTTPException(400, "Produit du catalogue introuvable")
    now = now_iso()
    return {
        "id": raw["id"],
        "appointment_id": appointment_id,
        "client_id": client_id,
        "catalog_product_id": product["id"],
        "stock_item_id": raw.get("stock_item_id"),
        "product_snapshot": snapshot(product),
        "dose_type": raw.get("dose_type", "full"),
        "used_stock_units": quantity(raw["used_stock_units"]),
        "physical_amount": raw.get("physical_amount"),
        "physical_amount_unit": raw.get("physical_amount_unit"),
        "technical_note": (raw.get("technical_note") or "").strip(),
        "stock_before": previous.get("stock_before") if previous else None,
        "stock_after": previous.get("stock_after") if previous else None,
        "consumption_status": "draft",
        "stock_movement_id": None,
        "created_at": previous.get("created_at", now) if previous else now,
        "updated_at": now,
    }


async def save_draft_formula(appointment: dict, desired: list[dict]) -> list[dict]:
    previous = {item.get("id"): item for item in appointment.get("product_usages") or []}
    return [draft_usage(raw, appointment["id"], appointment["client_id"], previous.get(raw["id"])) for raw in desired]


async def reconcile_formula(appointment: dict, desired: list[dict], created_by: str | None) -> list[dict]:
    """Apply only the difference from the last applied formula.

    Deterministic usage IDs plus the stored applied state make repeated saves
    idempotent. Every non-zero difference creates a compensating movement.
    """
    async with _stock_lock:
        old_list = appointment.get("product_usages") or []
        old_by_id = {item.get("id"): item for item in old_list if item.get("consumption_status") == "applied"}
        desired_by_id = {raw["id"]: raw for raw in desired}

        # Restore removed usages or usages whose selected reference changed.
        for usage_id, old in old_by_id.items():
            raw = desired_by_id.get(usage_id)
            if raw and raw.get("catalog_product_id") == old.get("catalog_product_id"):
                continue
            item = await ensure_stock_item(old["catalog_product_id"])
            _, movement = await record_movement(
                item, old["used_stock_units"], "appointment_reversal",
                appointment_id=appointment["id"], client_id=appointment["client_id"],
                usage_id=usage_id, note="Restitution aprÃ¨s suppression ou changement de produit",
                created_by=created_by,
            )
            old["consumption_status"] = "reversed"
            old["reversal_movement_id"] = movement["id"]

        result = []
        for raw in desired:
            product = PRODUCT_BY_ID.get(raw["catalog_product_id"])
            if not product:
                raise HTTPException(400, "Produit du catalogue introuvable")
            old = old_by_id.get(raw["id"])
            same_product = old and old.get("catalog_product_id") == raw["catalog_product_id"]
            old_units = quantity(old.get("used_stock_units")) if same_product else 0.0
            new_units = quantity(raw["used_stock_units"])
            delta = quantity(Decimal(str(old_units)) - Decimal(str(new_units)))
            item = await ensure_stock_item(raw["catalog_product_id"])
            movement = None
            before = quantity(item.get("quantity"))
            after = before
            if delta:
                item, movement = await record_movement(
                    item, delta,
                    "appointment_usage" if delta < 0 else "appointment_reversal",
                    appointment_id=appointment["id"], client_id=appointment["client_id"],
                    usage_id=raw["id"],
                    note="Consommation rendez-vous" if delta < 0 else "Correction de dose rendez-vous",
                    created_by=created_by,
                )
                before, after = movement["quantity_before"], movement["quantity_after"]
            elif old:
                before = old.get("stock_before")
                after = old.get("stock_after")
            now = now_iso()
            result.append({
                **draft_usage(raw, appointment["id"], appointment["client_id"], old),
                "stock_item_id": item["id"],
                "stock_before": before,
                "stock_after": after,
                "consumption_status": "applied",
                "stock_movement_id": movement["id"] if movement else (old or {}).get("stock_movement_id"),
                "updated_at": now,
            })
        return result


async def reverse_formula(appointment: dict, created_by: str | None, reason: str) -> list[dict]:
    async with _stock_lock:
        result = []
        for old in appointment.get("product_usages") or []:
            if old.get("consumption_status") != "applied":
                result.append(old)
                continue
            item = await ensure_stock_item(old["catalog_product_id"])
            _, movement = await record_movement(
                item, old["used_stock_units"], "appointment_reversal",
                appointment_id=appointment["id"], client_id=appointment["client_id"],
                usage_id=old["id"], note=reason, created_by=created_by,
            )
            result.append({
                **old,
                "consumption_status": "reversed",
                "reversal_movement_id": movement["id"],
                "updated_at": now_iso(),
            })
        return result
