"""Professional catalogue, stock lines and traceable movements."""
from datetime import datetime, timezone
from typing import Any, Dict
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.catalog.color_products import BRANDS, CATEGORIES, PRODUCTS, PRODUCT_BY_ID
from app.db import db
from app.dependencies import get_current_user
from app.models.auth import User
from app.models.stock import CatalogStockAdd, StockAdjustment, StockCreate, StockItem
from app.services.stock import _stock_lock, ensure_stock_item, quantity, record_movement

router = APIRouter()


def _view(item: dict) -> dict:
    result = dict(item)
    result["quantity"] = quantity(result.get("quantity"))
    result.setdefault("reorder_threshold", result.get("threshold", 0) or 0)
    result.setdefault("target_stock", 1)
    result.setdefault("currency", "EUR")
    result.setdefault("unit_price", None)
    product = PRODUCT_BY_ID.get(result.get("catalog_product_id"))
    if product:
        result["catalog_product"] = product
        result.setdefault("product_snapshot", product)
    return result


@router.get("/stock/catalog")
async def stock_catalog(user: User = Depends(get_current_user)):
    return {"brands": BRANDS, "categories": CATEGORIES, "products": PRODUCTS}


@router.get("/stock")
async def stock_list(user: User = Depends(get_current_user)):
    return [_view(item) for item in await db.stock.find({}, {"_id": 0}).to_list(5000)]


@router.post("/stock/catalog-add")
async def stock_catalog_add(payload: CatalogStockAdd, user: User = Depends(get_current_user)):
    async with _stock_lock:
        product = PRODUCT_BY_ID.get(payload.catalog_product_id)
        if not product:
            raise HTTPException(400, "Produit du catalogue introuvable")
        item = await ensure_stock_item(payload.catalog_product_id)
        if payload.unit_price is not None:
            await db.stock.update_one(
                {"id": item["id"]},
                {"$set": {"unit_price": round(payload.unit_price, 2), "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            item["unit_price"] = round(payload.unit_price, 2)
        item, _ = await record_movement(
            item, payload.quantity, "stock_in", note="Ajout depuis le catalogue",
            created_by=user.user_id,
        )
    return _view(item)


@router.post("/stock")
async def stock_create(payload: StockCreate, user: User = Depends(get_current_user)):
    """Backward-compatible free stock line creation."""
    item = StockItem(**payload.model_dump())
    await db.stock.insert_one(item.model_dump())
    if item.quantity:
        await db.stock_movements.insert_one({
            "id": f"mov_{uuid.uuid4().hex[:12]}",
            "stock_item_id": item.id, "catalog_product_id": None,
            "movement_type": "stock_in", "quantity_delta": quantity(item.quantity),
            "quantity_before": 0, "quantity_after": quantity(item.quantity),
            "reason": "CrÃ©ation d'une ligne de stock existante",
            "created_by": user.user_id, "created_at": item.created_at,
        })
    return _view(item.model_dump())


@router.post("/stock/{sid}/adjust")
async def stock_adjust(sid: str, payload: StockAdjustment, user: User = Depends(get_current_user)):
    item = await db.stock.find_one({"id": sid}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Produit en stock introuvable")
    if payload.mode == "price":
        updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
        updates["unit_price"] = None if payload.remove_price else round(payload.unit_price or 0, 2)
        await db.stock.update_one({"id": sid}, {"$set": updates})
    else:
        if payload.quantity is None or payload.quantity < 0:
            raise HTTPException(400, "QuantitÃ© invalide")
        current = quantity(item.get("quantity"))
        if payload.mode == "add":
            delta = quantity(payload.quantity)
            movement_type = "stock_in"
        elif payload.mode == "remove":
            delta = -quantity(payload.quantity)
            movement_type = "manual_adjustment"
            if current + delta < 0:
                raise HTTPException(400, "Un retrait manuel ne peut pas rendre le stock nÃ©gatif")
        else:
            delta = quantity(payload.quantity - current)
            movement_type = "inventory_correction"
        await record_movement(item, delta, movement_type, note=payload.note, created_by=user.user_id)
    extra = {}
    if payload.reorder_threshold is not None:
        extra["reorder_threshold"] = quantity(payload.reorder_threshold)
    if payload.target_stock is not None:
        extra["target_stock"] = quantity(payload.target_stock)
    if extra:
        await db.stock.update_one({"id": sid}, {"$set": extra})
    return _view(await db.stock.find_one({"id": sid}, {"_id": 0}))


@router.get("/stock/{sid}/movements")
async def stock_movements(sid: str, user: User = Depends(get_current_user)):
    return await db.stock_movements.find({"stock_item_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.put("/stock/{sid}")
async def stock_update(sid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    item = await db.stock.find_one({"id": sid}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Produit en stock introuvable")
    if "quantity" in payload:
        wanted = quantity(payload.pop("quantity"))
        await record_movement(item, wanted - quantity(item.get("quantity")), "inventory_correction", note="Correction manuelle", created_by=user.user_id)
    allowed = {key: value for key, value in payload.items() if key in {"name", "threshold", "tag", "unit_price", "reorder_threshold", "target_stock"}}
    if allowed:
        allowed["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.stock.update_one({"id": sid}, {"$set": allowed})
    return _view(await db.stock.find_one({"id": sid}, {"_id": 0}))


@router.delete("/stock/{sid}")
async def stock_delete(sid: str, user: User = Depends(get_current_user)):
    item = await db.stock.find_one({"id": sid}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Produit en stock introuvable")
    if quantity(item.get("quantity")):
        await record_movement(item, -quantity(item.get("quantity")), "inventory_correction", note="Retrait du produit de l'inventaire", created_by=user.user_id)
    await db.stock.delete_one({"id": sid})
    return {"ok": True}
