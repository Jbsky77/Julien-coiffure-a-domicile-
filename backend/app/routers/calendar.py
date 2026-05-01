"""Calendar / iCal feed."""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Request
from fastapi.responses import Response as FResponse

from app.db import db
from app.utils.dates import parse_iso

router = APIRouter()


@router.get("/calendar/ical-url")
async def ical_url_endpoint(
    request: Request,
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = session_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "Invalid session")
    return {"url": f"/api/calendar/{token}.ics", "token": token}


@router.get("/calendar/{token}.ics")
async def ical_feed(token: str):
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "Invalid token")
    rdvs = await db.appointments.find({"status": {"$in": ["scheduled", "done"]}}, {"_id": 0}).to_list(5000)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Julien Bouche//FR",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Julien Bouche · RDV",
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
            f"UID:{r['id']}@julienbouche",
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
