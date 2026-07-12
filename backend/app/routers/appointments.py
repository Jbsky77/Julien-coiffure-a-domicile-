"""Appointments CRUD + finish/cancel + payment update + recurrence."""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.db import db
from app.dependencies import get_current_user
from app.models.appointments import (
    Appointment,
    AppointmentCreate,
    AppointmentService,
    AppointmentUpdate,
    FinishAppointment,
)
from app.models.auth import User
from app.services.appointments import compute_appointment_totals
from app.services.referrals import compute_referral_info
from app.services.routing import route
from app.utils.dates import now_utc, parse_iso

router = APIRouter()


async def _validate_and_apply_neighbor(client_id: str, is_neighbor: bool, neighbor_id):
    """Server-side neighbor validation. Returns dict or None.

    Structure: {valid, distance_km, neighbor_name, neighbor_address, verified_at, source}
    """
    if not is_neighbor or not neighbor_id:
        return None
    if neighbor_id == client_id:
        return {"valid": False, "reason": "same_client"}
    a = await db.clients.find_one({"id": client_id}, {"_id": 0, "lat": 1, "lng": 1})
    b = await db.clients.find_one({"id": neighbor_id}, {"_id": 0})
    if not a or not b:
        return {"valid": False, "reason": "not_found"}
    if a.get("lat") is None or b.get("lat") is None:
        return {"valid": False, "reason": "missing_coords"}
    r = await route((a["lat"], a["lng"]), (b["lat"], b["lng"]))
    if r["km"] is None or r["km"] >= 1.0:
        return {
            "valid": False,
            "reason": "too_far" if r["km"] is not None else "route_failed",
            "distance_km": r["km"],
        }
    name = f"{b.get('first_name','')} {b.get('last_name','')}".strip()
    return {
        "valid": True,
        "distance_km": round(r["km"], 3),
        "neighbor_name": name,
        "neighbor_address": b.get("address", ""),
        "verified_at": now_utc().isoformat(),
        "source": r["source"],
    }


@router.get("/appointments")
async def appointments_list(user: User = Depends(get_current_user)):
    return await db.appointments.find({}, {"_id": 0}).sort("date", 1).to_list(5000)


@router.post("/appointments")
async def appointments_create(payload: AppointmentCreate, user: User = Depends(get_current_user)):
    client_doc = await db.clients.find_one({"id": payload.client_id}, {"_id": 0})
    if not client_doc:
        raise HTTPException(404, "Client not found")
    # Neighbor validation (if requested) — fetches theoretical supp too
    neighbor_meta = await _validate_and_apply_neighbor(
        payload.client_id, payload.is_neighbor, payload.neighbor_of_client_id
    )
    totals = await compute_appointment_totals(
        payload.services,
        payload.kilometrage,
        payload.price_final_override,
        client_id=payload.client_id,
        is_neighbor=neighbor_meta["valid"] if neighbor_meta else False,
        neighbor_of_client_id=payload.neighbor_of_client_id if (neighbor_meta and neighbor_meta["valid"]) else None,
    )
    client_name = f"{client_doc.get('first_name','')} {client_doc.get('last_name','')}".strip()
    rdv = Appointment(
        client_id=payload.client_id,
        client_name=client_name,
        date=payload.date,
        services=[AppointmentService(**x) for x in totals["services"]],
        kilometrage=payload.kilometrage,
        notes=payload.notes,
        price_base=totals["price_base"],
        fuel_supplement=totals["fuel_supplement"],
        price_final=totals["price_final"],
        family_pack_applied=totals["family_pack"],
        gift_applied=totals["gift_applied"],
        distance_km_from_business=totals["distance_km"],
        theoretical_fuel_supplement=totals["theoretical_supplement"],
        is_neighbor=(neighbor_meta["valid"] if neighbor_meta else False),
        neighbor_of_client_id=(payload.neighbor_of_client_id if (neighbor_meta and neighbor_meta["valid"]) else None),
        neighbor_of_client_name=(neighbor_meta.get("neighbor_name") if neighbor_meta else None),
        neighbor_of_client_address=(neighbor_meta.get("neighbor_address") if neighbor_meta else None),
        neighbor_distance_km=(neighbor_meta.get("distance_km") if neighbor_meta else None),
        neighbor_verified_at=(neighbor_meta.get("verified_at") if neighbor_meta else None),
        neighbor_routing_source=(neighbor_meta.get("source") if neighbor_meta else None),
        neighbor_discount=totals["neighbor_discount"],
    )
    await db.appointments.insert_one(rdv.model_dump())
    return rdv.model_dump()


@router.put("/appointments/{rid}")
async def appointments_update(rid: str, payload: AppointmentUpdate, user: User = Depends(get_current_user)):
    current = await db.appointments.find_one({"id": rid}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Not found")
    if current.get("status") == "done":
        raise HTTPException(400, "Appointment already finished")
    services_input = payload.services if payload.services is not None else [
        {"service_id": s["service_id"], "is_gift": s.get("is_gift", False)} for s in current["services"]
    ]
    km = payload.kilometrage if payload.kilometrage is not None else current["kilometrage"]
    # Neighbor state: use payload if provided else current
    is_neighbor = payload.is_neighbor if payload.is_neighbor is not None else current.get("is_neighbor", False)
    neighbor_id = payload.neighbor_of_client_id if payload.neighbor_of_client_id is not None else current.get("neighbor_of_client_id")
    neighbor_meta = await _validate_and_apply_neighbor(current["client_id"], is_neighbor, neighbor_id) if is_neighbor else None
    totals = await compute_appointment_totals(
        services_input,
        km,
        payload.price_final_override,
        client_id=current["client_id"],
        is_neighbor=(neighbor_meta["valid"] if neighbor_meta else False),
        neighbor_of_client_id=neighbor_id if (neighbor_meta and neighbor_meta["valid"]) else None,
    )
    update = {
        "services": totals["services"],
        "kilometrage": km,
        "price_base": totals["price_base"],
        "fuel_supplement": totals["fuel_supplement"],
        "price_final": totals["price_final"],
        "family_pack_applied": totals["family_pack"],
        "gift_applied": totals["gift_applied"],
        "distance_km_from_business": totals["distance_km"],
        "theoretical_fuel_supplement": totals["theoretical_supplement"],
        "is_neighbor": (neighbor_meta["valid"] if neighbor_meta else False),
        "neighbor_of_client_id": neighbor_id if (neighbor_meta and neighbor_meta["valid"]) else None,
        "neighbor_of_client_name": (neighbor_meta.get("neighbor_name") if neighbor_meta and neighbor_meta.get("valid") else None),
        "neighbor_of_client_address": (neighbor_meta.get("neighbor_address") if neighbor_meta and neighbor_meta.get("valid") else None),
        "neighbor_distance_km": (neighbor_meta.get("distance_km") if neighbor_meta and neighbor_meta.get("valid") else None),
        "neighbor_verified_at": (neighbor_meta.get("verified_at") if neighbor_meta and neighbor_meta.get("valid") else None),
        "neighbor_routing_source": (neighbor_meta.get("source") if neighbor_meta and neighbor_meta.get("valid") else None),
        "neighbor_discount": totals["neighbor_discount"],
    }
    if payload.date is not None:
        update["date"] = payload.date
    if payload.notes is not None:
        update["notes"] = payload.notes
    await db.appointments.update_one({"id": rid}, {"$set": update})
    return await db.appointments.find_one({"id": rid}, {"_id": 0})


@router.post("/appointments/{rid}/start-timer")
async def appointments_start_timer(rid: str, user: User = Depends(get_current_user)):
    return await _timer_action(rid, "start")


@router.post("/appointments/{rid}/timer")
async def appointments_timer(rid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    return await _timer_action(rid, payload.get("action") or "")


async def _timer_action(rid: str, action: str):
    rdv = await db.appointments.find_one({"id": rid}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "Not found")
    if rdv.get("status") == "done":
        raise HTTPException(400, "Rendez-vous déjà terminé")
    now = datetime.now(timezone.utc)
    started = rdv.get("started_at")
    status = rdv.get("timer_status") or ("running" if started else "idle")
    seconds = float(rdv.get("timer_seconds") or 0)

    if action == "start":
        update = {"started_at": now.isoformat(), "timer_seconds": 0, "timer_status": "running"}
    elif action == "pause":
        if status != "running" or not started:
            raise HTTPException(400, "Le chronomètre n'est pas en cours")
        st = parse_iso(started)
        if st:
            seconds += (now - st).total_seconds()
        update = {"started_at": None, "timer_seconds": seconds, "timer_status": "paused"}
    elif action == "resume":
        if status != "paused":
            raise HTTPException(400, "Le chronomètre n'est pas en pause")
        update = {"started_at": now.isoformat(), "timer_seconds": seconds, "timer_status": "running"}
    elif action == "stop":
        if status == "running" and started:
            st = parse_iso(started)
            if st:
                seconds += (now - st).total_seconds()
        elif status != "paused":
            raise HTTPException(400, "Le chronomètre n'est pas actif")
        update = {"started_at": None, "timer_seconds": seconds, "timer_status": "stopped"}
    else:
        raise HTTPException(400, "action inconnue (start|pause|resume|stop)")

    await db.appointments.update_one({"id": rid}, {"$set": update})
    return {"ok": True, **update}


def _auto_duration(rdv: dict, now: datetime):
    """Timer-based duration in minutes (>=1, capped at 4h), or None."""
    total = float(rdv.get("timer_seconds") or 0)
    if rdv.get("started_at") and (rdv.get("timer_status") or "running") == "running":
        start = parse_iso(rdv["started_at"])
        if start:
            total += (now - start).total_seconds()
    if total <= 0:
        return None
    return max(1, min(240, int(round(total / 60))))


async def _apply_referral_reward(rdv: dict, svcs: list, final: float):
    """Mark the most expensive non-gift service as a referral gift.

    Returns (new_final, gifted_service)."""
    info = await compute_referral_info(rdv["client_id"])
    if info["rewards_available"] <= 0:
        raise HTTPException(400, "Aucune récompense parrainage disponible")
    candidates = [s for s in svcs if not s.get("is_gift")]
    if not candidates:
        raise HTTPException(400, "Aucune prestation éligible à la gratuité")
    target = max(candidates, key=lambda s: s.get("price", 0) or 0)
    target["is_gift"] = True
    target["gift_source"] = "referral"
    return max(0.0, round(final - (target.get("price") or 0), 2)), target


async def _next_invoice_number() -> str:
    year = datetime.now(timezone.utc).year
    counter = await db.counters.find_one_and_update(
        {"_id": f"invoice_{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return f"F-{year}-{counter['seq']:04d}"


async def _update_client_after_finish(rdv: dict, svcs: list, now: datetime, referral_service):
    if referral_service is not None:
        await db.clients.update_one(
            {"id": rdv["client_id"]},
            {"$push": {"referral_rewards_used": {
                "used_at": now.isoformat(),
                "appointment_id": rdv["id"],
                "service_name": referral_service.get("name", ""),
            }}},
        )
    client = await db.clients.find_one({"id": rdv["client_id"]}, {"_id": 0})
    if not client:
        return
    counters = client.get("loyalty_counters", {}) or {}
    for s in svcs:
        sid = s["service_id"]
        if s.get("is_gift"):
            if s.get("gift_source") == "referral":
                continue  # referral gifts don't touch loyalty
            counters[sid] = 0  # reset after loyalty gift
        else:
            counters[sid] = counters.get(sid, 0) + 1
    await db.clients.update_one(
        {"id": rdv["client_id"]},
        {"$set": {"loyalty_counters": counters, "last_seen": now.isoformat()}},
    )


@router.post("/appointments/{rid}/finish")
async def appointments_finish(rid: str, payload: FinishAppointment, user: User = Depends(get_current_user)):
    rdv = await db.appointments.find_one({"id": rid}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "Not found")
    if rdv.get("status") == "done":
        raise HTTPException(400, "Already finished")
    now = datetime.now(timezone.utc)
    final = payload.price_final if payload.price_final is not None else rdv["price_final"]
    svcs = rdv.get("services") or []
    services_changed = False
    update_fields = {
        "status": "done",
        "payment_mode": payload.payment_mode,
        "finished_at": now.isoformat(),
    }
    # Duration: manual value wins, else auto-computed from the timer
    duration = payload.duration_minutes if payload.duration_minutes is not None else _auto_duration(rdv, now)
    if duration is not None:
        update_fields["duration_minutes"] = duration
    if payload.stylists:
        for s in svcs:
            if s["service_id"] in payload.stylists:
                s["stylist"] = payload.stylists[s["service_id"]]
        services_changed = True
    referral_service = None
    if payload.use_referral_reward:
        final, referral_service = await _apply_referral_reward(rdv, svcs, final)
        update_fields["gift_applied"] = True
        services_changed = True
    update_fields["price_final"] = final
    if services_changed:
        update_fields["services"] = svcs
    if not rdv.get("invoice_number"):
        update_fields["invoice_number"] = await _next_invoice_number()
    await db.appointments.update_one({"id": rid}, {"$set": update_fields})
    await _update_client_after_finish(rdv, svcs, now, referral_service)
    return await db.appointments.find_one({"id": rid}, {"_id": 0})


@router.post("/appointments/{rid}/schedule-next")
async def appointments_schedule_next(rid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    """Create the next recurring appointment: same client/services/time, +N weeks."""
    rdv = await db.appointments.find_one({"id": rid}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "Not found")
    try:
        weeks = int(payload.get("weeks", 5))
    except (TypeError, ValueError):
        raise HTTPException(400, "weeks invalide")
    weeks = min(26, max(1, weeks))
    base_dt = parse_iso(rdv["date"])
    if base_dt is None:
        raise HTTPException(400, "Date du RDV source invalide")
    new_date = (base_dt + timedelta(weeks=weeks)).isoformat()
    services_input = [{"service_id": s["service_id"], "is_gift": False} for s in rdv.get("services") or []]
    totals = await compute_appointment_totals(
        services_input,
        rdv.get("kilometrage", 0),
        None,
        client_id=rdv["client_id"],
    )
    new_rdv = Appointment(
        client_id=rdv["client_id"],
        client_name=rdv.get("client_name", ""),
        date=new_date,
        services=[AppointmentService(**x) for x in totals["services"]],
        kilometrage=rdv.get("kilometrage", 0),
        notes="",
        price_base=totals["price_base"],
        fuel_supplement=totals["fuel_supplement"],
        price_final=totals["price_final"],
        family_pack_applied=totals["family_pack"],
        gift_applied=totals["gift_applied"],
        distance_km_from_business=totals["distance_km"],
        theoretical_fuel_supplement=totals["theoretical_supplement"],
    )
    await db.appointments.insert_one(new_rdv.model_dump())
    return new_rdv.model_dump()


@router.post("/appointments/{rid}/cancel")
async def appointments_cancel(rid: str, user: User = Depends(get_current_user)):
    rdv = await db.appointments.find_one({"id": rid}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "Not found")
    await db.appointments.update_one({"id": rid}, {"$set": {"status": "cancelled"}})
    return await db.appointments.find_one({"id": rid}, {"_id": 0})


@router.put("/appointments/{rid}/payment")
async def appointments_update_payment(rid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    rdv = await db.appointments.find_one({"id": rid}, {"_id": 0})
    if not rdv:
        raise HTTPException(404, "Not found")
    update = {}
    if "payment_mode" in payload:
        update["payment_mode"] = payload["payment_mode"]
    if "price_final" in payload and payload["price_final"] is not None:
        update["price_final"] = float(payload["price_final"])
    if "duration_minutes" in payload:
        update["duration_minutes"] = payload["duration_minutes"]
    if "finished_at" in payload and payload["finished_at"]:
        update["finished_at"] = payload["finished_at"]
    if not update:
        return rdv
    await db.appointments.update_one({"id": rid}, {"$set": update})
    return await db.appointments.find_one({"id": rid}, {"_id": 0})


@router.delete("/appointments/{rid}")
async def appointments_delete(rid: str, user: User = Depends(get_current_user)):
    await db.appointments.delete_one({"id": rid})
    return {"ok": True}
