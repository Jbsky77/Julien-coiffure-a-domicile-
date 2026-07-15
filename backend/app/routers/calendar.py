"""Calendar / iCal feed."""
import secrets
from datetime import timedelta

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response as FResponse

from app.db import db
from app.services.settings import get_settings
from app.utils.dates import parse_iso

router = APIRouter()

_ICAL_DOC_ID = "ical_settings"


async def _get_or_create_ical_token() -> str:
    doc = await db.settings.find_one({"_id": _ICAL_DOC_ID})
    if doc and doc.get("token"):
        return doc["token"]
    token = secrets.token_urlsafe(24)
    await db.settings.update_one(
        {"_id": _ICAL_DOC_ID},
        {"$set": {"token": token}},
        upsert=True,
    )
    return token


@router.get("/calendar/ical-url")
async def ical_url_endpoint():
    # PIN-protected via middleware. Returns the stable iCal subscription token.
    token = await _get_or_create_ical_token()
    return {"url": f"/api/calendar/{token}.ics", "token": token}


@router.post("/calendar/ical-rotate")
async def ical_rotate():
    # Regenerate the token — invalidates any existing subscription.
    new_token = secrets.token_urlsafe(24)
    await db.settings.update_one(
        {"_id": _ICAL_DOC_ID},
        {"$set": {"token": new_token}},
        upsert=True,
    )
    return {"url": f"/api/calendar/{new_token}.ics", "token": new_token}


@router.get("/calendar/{token}.ics")
async def ical_feed(token: str):
    doc = await db.settings.find_one({"_id": _ICAL_DOC_ID})
    if not doc or doc.get("token") != token:
        raise HTTPException(401, "Invalid token")
    rdvs = await db.appointments.find({"status": {"$in": ["scheduled", "done"]}}, {"_id": 0}).to_list(5000)
    settings = await get_settings()
    brand_name = settings.brand_name or "Mon entreprise"
    calendar_id = "".join(ch.lower() if ch.isalnum() else "-" for ch in brand_name).strip("-") or "entreprise"
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//{brand_name}//FR",
        "CALSCALE:GREGORIAN",
        f"X-WR-CALNAME:{brand_name} · RDV",
    ]
    for r in rdvs:
        dt = parse_iso(r.get("date"))
        if dt is None:
            continue
        start = dt.strftime("%Y%m%dT%H%M%SZ")
        end = (dt + timedelta(minutes=60)).strftime("%Y%m%dT%H%M%SZ")
        summary = f"{r.get('client_name','RDV')} · {', '.join([s['name'] for s in r['services']])}"
        lines += [
            "BEGIN:VEVENT",
            f"UID:{r['id']}@{calendar_id}",
            f"DTSTAMP:{start}",
            f"DTSTART:{start}",
            f"DTEND:{end}",
            f"SUMMARY:{summary}",
            f"DESCRIPTION:Montant {r['price_final']}€ — {r.get('notes','')}",
            f"STATUS:{'CONFIRMED' if r['status']=='done' else 'TENTATIVE'}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return FResponse("\r\n".join(lines), media_type="text/calendar")
