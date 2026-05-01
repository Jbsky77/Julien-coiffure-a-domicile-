"""Smart slot suggestions for a given date and a target client location."""
from datetime import datetime, timedelta
from typing import Optional

from app.db import db
from app.services.settings import get_settings
from app.utils.travel import haversine


async def suggest_slots(date: str, duration_minutes: int, target_lat: Optional[float], target_lng: Optional[float]) -> list:
    settings = await get_settings()
    duration = int(duration_minutes or settings.default_duration_minutes)

    rdvs = await db.appointments.find({"status": "scheduled"}, {"_id": 0}).to_list(2000)
    day_rdvs = []
    for r in rdvs:
        try:
            dt = datetime.fromisoformat(r["date"].replace("Z", "+00:00"))
            if dt.strftime("%Y-%m-%d") == date:
                day_rdvs.append((dt, r))
        except Exception:
            continue
    day_rdvs.sort(key=lambda x: x[0])

    enriched = []
    for dt, r in day_rdvs:
        client = await db.clients.find_one({"id": r["client_id"]}, {"_id": 0}) or {}
        d = r.get("duration_minutes") or settings.default_duration_minutes
        enriched.append({
            "start": dt,
            "end": dt + timedelta(minutes=d),
            "lat": client.get("lat"),
            "lng": client.get("lng"),
            "name": r.get("client_name", ""),
        })

    suggestions = []
    work_start = datetime.fromisoformat(date + "T09:00:00+00:00")
    work_end = datetime.fromisoformat(date + "T19:00:00+00:00")
    candidates = [work_start]
    for e in enriched:
        candidates.append(e["end"])

    for c in candidates:
        if c < work_start:
            c = work_start
        if c + timedelta(minutes=duration) > work_end:
            continue
        # Round up to next 15min
        minute = (c.minute // 15 + (1 if c.minute % 15 else 0)) * 15
        if minute >= 60:
            c = c.replace(minute=0) + timedelta(hours=1)
        else:
            c = c.replace(minute=minute, second=0, microsecond=0)
        slot_end = c + timedelta(minutes=duration)
        # Check no overlap
        overlap = False
        prev_rdv = None
        next_rdv = None
        for e in enriched:
            if c < e["end"] and slot_end > e["start"]:
                overlap = True
                break
            if e["end"] <= c:
                if prev_rdv is None or e["end"] > prev_rdv["end"]:
                    prev_rdv = e
            if e["start"] >= slot_end:
                if next_rdv is None or e["start"] < next_rdv["start"]:
                    next_rdv = e
        if overlap:
            continue
        score = 0
        reasons = []
        if prev_rdv and target_lat and prev_rdv["lat"]:
            km = haversine(prev_rdv["lat"], prev_rdv["lng"], target_lat, target_lng)
            if km is not None:
                travel_min = round(km / settings.avg_speed_kmh * 60)
                margin = (c - prev_rdv["end"]).total_seconds() / 60
                if margin < travel_min:
                    continue
                score -= km
                if km < 5:
                    reasons.append("Faible détour")
                elif km < 15:
                    reasons.append(f"Proche de {prev_rdv['name']}")
        if next_rdv and target_lat and next_rdv["lat"]:
            km = haversine(target_lat, target_lng, next_rdv["lat"], next_rdv["lng"])
            if km is not None:
                travel_min = round(km / settings.avg_speed_kmh * 60)
                margin = (next_rdv["start"] - slot_end).total_seconds() / 60
                if margin < travel_min:
                    continue
                score -= km
        if not reasons:
            reasons.append("S'insère sans conflit")
        suggestions.append({
            "datetime": c.isoformat(),
            "label": c.strftime("%H:%M"),
            "score": score,
            "reasons": reasons,
        })
    suggestions.sort(key=lambda x: -x["score"])
    return suggestions[:5]
