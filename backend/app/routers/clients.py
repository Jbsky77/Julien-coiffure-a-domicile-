"""Clients CRUD + CRM status + relance log + import."""
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.db import db
from app.dependencies import get_current_user
from app.models.auth import User
from app.models.clients import Client, ClientCreate
from app.services.client_status import compute_client_statuses
from app.services.geocoding import auto_geocode
from app.services.next_visit import compute_next_visit
from app.services.referrals import compute_referral_info
from app.utils.phone import phone_payload

router = APIRouter()


@router.get("/clients")
async def clients_list(user: User = Depends(get_current_user)):
    rows = await db.clients.find({}, {"_id": 0}).to_list(5000)
    counts: Dict[str, int] = {}
    for r in rows:
        rb = r.get("referred_by")
        if rb:
            counts[rb] = counts.get(rb, 0) + 1
    for r in rows:
        r["godchildren_count"] = counts.get(r["id"], 0)
        r.update(phone_payload(r.get("phone")))
    return rows


@router.post("/clients")
async def clients_create(payload: ClientCreate, user: User = Depends(get_current_user)):
    if payload.referred_by:
        sponsor = await db.clients.find_one({"id": payload.referred_by}, {"_id": 0, "id": 1})
        if not sponsor:
            raise HTTPException(400, "Parrain introuvable")
    c = Client(**payload.model_dump())
    if c.lat is None and c.address:
        c.lat, c.lng = await auto_geocode(c.address)
    await db.clients.insert_one(c.model_dump())
    return c.model_dump()


# CRITICAL: /clients/status MUST be declared before /clients/{cid}
@router.get("/clients/status")
async def clients_status(user: User = Depends(get_current_user)):
    return await compute_client_statuses()


@router.post("/clients/import")
async def clients_import(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    items = payload.get("clients", [])
    created = 0
    for it in items:
        if not it.get("last_name"):
            continue
        c = Client(
            first_name=it.get("first_name", ""),
            last_name=it.get("last_name", ""),
            phone=it.get("phone", ""),
            address=it.get("address", ""),
            comment=it.get("comment", ""),
            birthday=it.get("birthday") or None,
        )
        await db.clients.insert_one(c.model_dump())
        created += 1
    return {"created": created}


@router.get("/clients/{cid}")
async def clients_get(cid: str, user: User = Depends(get_current_user)):
    doc = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    rdvs = await db.appointments.find({"client_id": cid}, {"_id": 0}).to_list(500)
    next_visit = await compute_next_visit(cid)
    referral = await compute_referral_info(cid)
    doc.update(phone_payload(doc.get("phone")))
    rdvs.sort(key=lambda r: (r.get("date") or "", r.get("created_at") or ""))
    return {"client": doc, "appointments": rdvs, "next_visit": next_visit, "referral": referral}


@router.put("/clients/{cid}")
async def clients_update(cid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    payload.pop("referrals", None)  # legacy field
    if "referred_by" in payload:
        rb = payload.get("referred_by") or None
        payload["referred_by"] = rb
        if rb:
            if rb == cid:
                raise HTTPException(400, "Un client ne peut pas être son propre parrain")
            sponsor = await db.clients.find_one({"id": rb}, {"_id": 0, "id": 1})
            if not sponsor:
                raise HTTPException(400, "Parrain introuvable")
    has_coords = payload.get("lat") is not None and payload.get("lng") is not None
    if "address" in payload and payload["address"] and not has_coords:
        existing = await db.clients.find_one({"id": cid}, {"_id": 0}) or {}
        if existing.get("address") != payload["address"] or existing.get("lat") is None:
            lat, lng = await auto_geocode(payload["address"])
            payload["lat"] = lat
            payload["lng"] = lng
    await db.clients.update_one({"id": cid}, {"$set": payload})
    return await db.clients.find_one({"id": cid}, {"_id": 0})


@router.delete("/clients/{cid}")
async def clients_delete(cid: str, user: User = Depends(get_current_user)):
    await db.clients.delete_one({"id": cid})
    await db.appointments.delete_many({"client_id": cid})
    return {"ok": True}


@router.post("/clients/{cid}/relance")
async def log_relance(cid: str, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    await db.relances.insert_one({"client_id": cid, "date": now})
    return {"ok": True, "date": now}
