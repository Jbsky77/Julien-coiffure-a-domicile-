"""24h-before SMS reminders (semi-automatic: prefilled sms: links, sent-state tracking)."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException

from app.db import db
from app.dependencies import get_current_user
from app.models.auth import User
from app.services.settings import get_settings
from app.utils.dates import parse_iso

router = APIRouter()

TZ = ZoneInfo("Europe/Paris")


@router.get("/reminders/tomorrow")
async def reminders_tomorrow(user: User = Depends(get_current_user)):
    settings = await get_settings()
    tomorrow = (datetime.now(TZ) + timedelta(days=1)).date()
    rdvs = await db.appointments.find({"status": "scheduled"}, {"_id": 0}).to_list(5000)
    sent_docs = await db.reminders_sent.find({}, {"_id": 0, "appointment_id": 1}).to_list(10000)
    sent_ids = {s["appointment_id"] for s in sent_docs}

    out = []
    for r in rdvs:
        dt = parse_iso(r["date"])
        if dt is None:
            continue
        local = dt.astimezone(TZ)
        if local.date() != tomorrow:
            continue
        client = await db.clients.find_one({"id": r["client_id"]}, {"_id": 0}) or {}
        time_str = local.strftime("%Hh%M")
        services_str = " + ".join(s["name"] for s in r.get("services") or [])
        message = (settings.reminder_sms_template or "").format(
            first_name=client.get("first_name") or client.get("last_name") or "",
            last_name=client.get("last_name", ""),
            time=time_str,
            date=local.strftime("%d/%m"),
            services=services_str,
            brand_name=settings.brand_name,
        )
        out.append({
            "appointment_id": r["id"],
            "client_id": r["client_id"],
            "client_name": r.get("client_name", ""),
            "phone": client.get("phone", ""),
            "time": time_str,
            "services": services_str,
            "message": message,
            "sent": r["id"] in sent_ids,
        })
    out.sort(key=lambda x: x["time"])
    return {"date": tomorrow.isoformat(), "reminders": out}


@router.post("/reminders/{rid}/sent")
async def reminder_mark_sent(rid: str, user: User = Depends(get_current_user)):
    rdv = await db.appointments.find_one({"id": rid}, {"_id": 0, "id": 1})
    if not rdv:
        raise HTTPException(404, "RDV introuvable")
    await db.reminders_sent.update_one(
        {"appointment_id": rid},
        {"$set": {"appointment_id": rid, "sent_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}
