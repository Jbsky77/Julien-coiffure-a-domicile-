"""Admin CRUD for appointment requests + accept/reject/counter actions."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.db import db
from app.dependencies import get_current_user
from app.models.appointments import Appointment, AppointmentService
from app.models.auth import User
from app.models.requests import RequestAdminActionPayload
from app.services import notifications
from app.services.appointments import compute_appointment_totals

router = APIRouter()


@router.get("/appointment-requests")
async def list_requests(status: str = "all", user: User = Depends(get_current_user)):
    q = {} if status == "all" else {"status": status}
    rows = await db.appointment_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


@router.get("/appointment-requests/pending-count")
async def pending_count(user: User = Depends(get_current_user)):
    n = await db.appointment_requests.count_documents({"status": {"$in": ["pending", "counter_proposed"]}})
    return {"count": n}


@router.post("/appointment-requests/{rid}/action")
async def admin_action(rid: str, payload: RequestAdminActionPayload, user: User = Depends(get_current_user)):
    req = await db.appointment_requests.find_one({"id": rid}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
    if req["status"] not in ("pending", "counter_proposed"):
        raise HTTPException(400, "Demande déjà traitée")
    now = datetime.now(timezone.utc).isoformat()

    if payload.action == "reject":
        await db.appointment_requests.update_one(
            {"id": rid}, {"$set": {"status": "rejected", "admin_note": payload.admin_note, "updated_at": now}}
        )
        await notifications.push(
            "client",
            "Votre demande de rendez-vous n'a pas pu être acceptée. Contactez-moi pour en discuter.",
            client_id=req["client_id"],
            meta={"request_id": rid},
        )
        return await db.appointment_requests.find_one({"id": rid}, {"_id": 0})

    if payload.action == "counter":
        if not payload.counter_date:
            raise HTTPException(400, "counter_date requis")
        await db.appointment_requests.update_one(
            {"id": rid},
            {"$set": {
                "status": "counter_proposed",
                "counter_proposed_date": payload.counter_date,
                "admin_note": payload.admin_note,
                "updated_at": now,
            }},
        )
        await notifications.push(
            "client",
            "Nouveau créneau proposé pour votre RDV — cliquez pour accepter ou proposer un autre.",
            client_id=req["client_id"],
            meta={"request_id": rid, "counter_date": payload.counter_date},
        )
        return await db.appointment_requests.find_one({"id": rid}, {"_id": 0})

    if payload.action == "accept":
        # Use counter_proposed_date if present, else the original requested_date.
        final_date = req.get("counter_proposed_date") or req["requested_date"]
        service_ids = [s["service_id"] for s in req.get("services") or []]
        svc_input = [{"service_id": sid, "is_gift": False} for sid in service_ids]
        svc_objs, _, fuel, base, final_price, family, gift = await compute_appointment_totals(svc_input, 0, None)
        client = await db.clients.find_one({"id": req["client_id"]}, {"_id": 0}) or {}
        client_name = f"{client.get('first_name','')} {client.get('last_name','')}".strip()
        rdv = Appointment(
            client_id=req["client_id"],
            client_name=client_name,
            date=final_date,
            services=[AppointmentService(**x) for x in svc_objs],
            price_base=base,
            fuel_supplement=fuel,
            price_final=final_price,
            family_pack_applied=family,
            gift_applied=gift,
            notes=(req.get("comment") or ""),
        )
        await db.appointments.insert_one(rdv.model_dump())
        await db.appointment_requests.update_one(
            {"id": rid},
            {"$set": {"status": "accepted", "updated_at": now, "linked_appointment_id": rdv.id}},
        )
        await notifications.push(
            "client",
            "Votre rendez-vous est confirmé ! Nous nous voyons prochainement.",
            client_id=req["client_id"],
            meta={"request_id": rid, "appointment_id": rdv.id, "date": final_date},
        )
        return await db.appointment_requests.find_one({"id": rid}, {"_id": 0})

    raise HTTPException(400, "Action inconnue (accept|reject|counter)")


# --- notifications (admin) --------------------------------------------


@router.get("/notifications/admin")
async def get_admin_notifs(user: User = Depends(get_current_user)):
    return await notifications.list_admin(limit=50)


@router.get("/notifications/admin/unread-count")
async def admin_unread(user: User = Depends(get_current_user)):
    return {"count": await notifications.count_admin_unread()}


@router.post("/notifications/admin/mark-read")
async def mark_admin_read(user: User = Depends(get_current_user)):
    await notifications.mark_admin_all_read()
    return {"ok": True}



@router.post("/notifications/admin/{notif_id}/dismiss")
async def dismiss_admin_notif(notif_id: str, user: User = Depends(get_current_user)):
    await notifications.dismiss_admin(notif_id)
    return {"ok": True}
