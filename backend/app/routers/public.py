"""Public client space — accessible via magic-link token.

Endpoints under /api/public/... are NOT protected by the PIN middleware
(exempted in `main.py`). Each endpoint validates the token by looking up
a client with a matching access_token — no other data is exposed.
"""
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.db import db
from app.models.requests import AppointmentRequest, RequestServiceRef
from app.services import notifications
from app.services.loyalty import compute_loyalty_card
from app.services.next_visit import compute_next_visit
from app.services.settings import get_settings

router = APIRouter()


async def _resolve_client(token: str) -> dict:
    if not token or len(token) < 16:
        raise HTTPException(404, "Lien invalide")
    doc = await db.clients.find_one({"access_token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Lien invalide ou expiré")
    return doc


@router.get("/public/client/{token}")
async def get_client_space(token: str):
    c = await _resolve_client(token)
    settings = await get_settings()
    rdvs = await db.appointments.find({"client_id": c["id"]}, {"_id": 0}).sort("date", -1).to_list(500)
    reqs = await db.appointment_requests.find({"client_id": c["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    loyalty = await compute_loyalty_card(c["id"])
    notifs = await notifications.list_for_client(c["id"])
    next_visit = await compute_next_visit(c["id"])
    invoices = [
        {
            "id": r["id"],
            "invoice_number": r.get("invoice_number"),
            "date": r["date"],
            "finished_at": r.get("finished_at"),
            "services": [
                {
                    "name": s["name"],
                    "price": s["price"],
                    "is_gift": s.get("is_gift", False),
                    "stylist": s.get("stylist", "Julien"),
                }
                for s in r.get("services") or []
            ],
            "fuel_supplement": r.get("fuel_supplement", 0),
            "price_final": r.get("price_final", 0),
            "payment_mode": r.get("payment_mode"),
        }
        for r in rdvs
        if r.get("status") == "done"
    ]
    return {
        "client": {
            "id": c["id"],
            "first_name": c.get("first_name", ""),
            "last_name": c.get("last_name", ""),
            "gender": c.get("gender"),
            "phone": c.get("phone", ""),
            "address": c.get("address", ""),
            "birthday": c.get("birthday"),
        },
        "appointments": rdvs,
        "requests": reqs,
        "loyalty": loyalty,
        "notifications": notifs,
        "next_visit": next_visit,
        "invoices": invoices,
        "brand": {
            "name": settings.brand_name,
            "review_url_short": settings.google_review_url_short,
            "review_url": settings.google_review_url,
        },
    }


@router.get("/public/client/{token}/services")
async def public_services(token: str):
    await _resolve_client(token)  # validate token
    services = await db.services.find({}, {"_id": 0}).to_list(500)
    # Only expose the fields the client needs
    return [
        {
            "id": s["id"],
            "name": s["name"],
            "price": s["price"],
            "category": s["category"],
            "duration_minutes": s.get("duration_minutes", 45),
        }
        for s in services
    ]


@router.post("/public/client/{token}/appointment-requests")
async def public_create_request(token: str, payload: Dict[str, Any]):
    c = await _resolve_client(token)
    requested_date = (payload.get("requested_date") or "").strip()
    if not requested_date:
        raise HTTPException(400, "Date requise")
    service_ids = payload.get("service_ids") or []
    services_docs = await db.services.find({"id": {"$in": service_ids}}, {"_id": 0}).to_list(50)
    services_refs = [
        RequestServiceRef(service_id=s["id"], name=s["name"], price=s["price"]).model_dump()
        for s in services_docs
    ]
    req = AppointmentRequest(
        client_id=c["id"],
        client_name=f"{c.get('first_name','')} {c.get('last_name','')}".strip(),
        requested_date=requested_date,
        services=services_refs,
        comment=(payload.get("comment") or "")[:500],
    )
    await db.appointment_requests.insert_one(req.model_dump())
    # Notify admin and confirm to client
    await notifications.push(
        "admin",
        f"Nouvelle demande de RDV — {req.client_name}",
        meta={"request_id": req.id, "client_id": c["id"]},
    )
    await notifications.push(
        "client",
        "Votre demande a été envoyée. Vous serez notifié dès validation.",
        client_id=c["id"],
        meta={"request_id": req.id},
    )
    return req.model_dump()


@router.post("/public/client/{token}/appointment-requests/{rid}/respond")
async def public_respond_counter(token: str, rid: str, payload: Dict[str, Any]):
    """Client responds to a counter-proposal.

    payload.decision = "accept" → status → accepted (+ Appointment created via admin re-action? no, we create directly)
    payload.decision = "reject" → status → pending (client asks another date), optionally updates requested_date
    """
    c = await _resolve_client(token)
    req = await db.appointment_requests.find_one({"id": rid, "client_id": c["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(404, "Demande introuvable")
    if req["status"] != "counter_proposed":
        raise HTTPException(400, "Aucun contre-créneau en attente")
    decision = payload.get("decision")
    now = datetime.now(timezone.utc).isoformat()

    if decision == "accept":
        # Reuse admin acceptance path: create the Appointment.
        from app.models.appointments import Appointment, AppointmentService  # local import to avoid cycles
        from app.services.appointments import compute_appointment_totals

        final_date = req.get("counter_proposed_date") or req["requested_date"]
        service_ids = [s["service_id"] for s in (req.get("services") or [])]
        svc_input = [{"service_id": sid, "is_gift": False} for sid in service_ids]
        svc_objs, _, fuel, base, final_price, family, gift = await compute_appointment_totals(svc_input, 0, None)
        rdv = Appointment(
            client_id=c["id"],
            client_name=req.get("client_name", ""),
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
            {"id": rid}, {"$set": {"status": "accepted", "updated_at": now, "linked_appointment_id": rdv.id}}
        )
        await notifications.push("admin", "Le client a accepté le créneau proposé — RDV confirmé.", meta={"request_id": rid})
        await notifications.push("client", "Rendez-vous confirmé !", client_id=c["id"], meta={"request_id": rid, "appointment_id": rdv.id})
        return {"ok": True, "status": "accepted", "appointment_id": rdv.id}

    if decision == "reject":
        # Client asks for another date
        new_date = (payload.get("requested_date") or "").strip()
        update: Dict[str, Any] = {"status": "pending", "counter_proposed_date": None, "updated_at": now}
        if new_date:
            update["requested_date"] = new_date
        await db.appointment_requests.update_one({"id": rid}, {"$set": update})
        await notifications.push(
            "admin",
            "Le client a proposé une autre date pour son RDV.",
            meta={"request_id": rid, "new_date": new_date},
        )
        return {"ok": True, "status": "pending"}

    raise HTTPException(400, "decision inconnue (accept|reject)")


@router.post("/public/client/{token}/notifications/read")
async def public_mark_read(token: str):
    c = await _resolve_client(token)
    await notifications.mark_client_all_read(c["id"])
    return {"ok": True}


@router.post("/public/client/{token}/notifications/dismiss")
async def public_dismiss_notifs(token: str):
    c = await _resolve_client(token)
    await notifications.dismiss_client_all(c["id"])
    return {"ok": True}


@router.get("/public/client/{token}/invoices/{rdv_id}/pdf")
async def public_invoice_pdf(token: str, rdv_id: str):
    from app.services.invoice_pdf import build_invoice_pdf

    c = await _resolve_client(token)
    rdv = await db.appointments.find_one({"id": rdv_id, "client_id": c["id"], "status": "done"}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "Facture introuvable")
    settings = await get_settings()
    pdf = build_invoice_pdf(rdv, c, settings.invoice_brand_name)
    num = rdv.get("invoice_number") or rdv_id
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Facture-{num}.pdf"'},
    )
