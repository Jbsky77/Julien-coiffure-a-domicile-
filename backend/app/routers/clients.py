"""Clients CRUD + CRM status + relance log + import."""
from datetime import datetime, timezone
import secrets
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
from app.services.stock import reverse_formula
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
    await db.sync_public_client_token(c.model_dump())
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
        await db.sync_public_client_token(c.model_dump())
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
    rdvs.sort(key=lambda r: (r.get("date") or "", r.get("created_at") or ""), reverse=True)
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
            seen = {cid}
            current_id = rb
            while current_id:
                if current_id in seen:
                    raise HTTPException(400, "Cette relation créerait une boucle de parrainage")
                seen.add(current_id)
                current = await db.clients.find_one(
                    {"id": current_id}, {"_id": 0, "id": 1, "referred_by": 1}
                )
                if not current:
                    if current_id == rb:
                        raise HTTPException(400, "Parrain introuvable")
                    break
                current_id = current.get("referred_by")
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
    appointments = await db.appointments.find({"client_id": cid}, {"_id": 0}).to_list(5000)
    for appointment in appointments:
        await reverse_formula(appointment, user.user_id, "Suppression de la fiche client")
    await db.clients.delete_one({"id": cid})
    await db.revoke_public_client_token(cid)
    await db.appointments.delete_many({"client_id": cid})
    return {"ok": True}


@router.post("/clients/{cid}/relance")
async def log_relance(cid: str, user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    await db.relances.insert_one({"client_id": cid, "date": now})
    return {"ok": True, "date": now}


@router.post("/clients/{cid}/public-link/rotate")
async def rotate_client_public_link(cid: str, user: User = Depends(get_current_user)):
    client = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client introuvable")
    token = secrets.token_urlsafe(32)
    await db.clients.update_one({"id": cid}, {"$set": {"access_token": token}})
    await db.sync_public_client_token({"id": cid, "access_token": token})
    return {"ok": True, "access_token": token}
