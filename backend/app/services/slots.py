"""Smart slot suggestions for a given date and a target client location.

CRITICAL — durations rule:
- The duration of every existing appointment on the day is computed from the
  THEORETICAL duration of its services (sum of `services.duration_minutes`).
- The realised `duration_minutes` saved on past appointments is intentionally
  ignored by the suggestion engine — it is reserved for analytics only.
- The new appointment duration is either derived from the provided
  `service_ids` (recommended) or, as a fallback, from the explicit
  `duration_minutes` parameter.
"""
from datetime import datetime, timedelta
from typing import List, Optional

from app.db import db
from app.services.duration import (
    DEFAULT_FALLBACK_MINUTES,
    duration_for_appointment,
    duration_for_service_ids,
)
from app.services.settings import get_settings
from app.utils.travel import haversine


WORK_START_HOUR = 9
WORK_END_HOUR = 19


async def suggest_slots(
    date: str,
    duration_minutes: Optional[int],
    target_lat: Optional[float],
    target_lng: Optional[float],
    service_ids: Optional[List[str]] = None,
) -> list:
    settings = await get_settings()

    # Theoretical duration of the new appointment
    if service_ids:
        duration = await duration_for_service_ids(service_ids)
    elif duration_minutes and duration_minutes > 0:
        duration = int(duration_minutes)
    else:
        duration = DEFAULT_FALLBACK_MINUTES

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

    # Hydrate each existing rdv with its theoretical duration + client location.
    enriched = []
    for dt, r in day_rdvs:
        client = await db.clients.find_one({"id": r["client_id"]}, {"_id": 0}) or {}
        d = await duration_for_appointment(r)
        enriched.append({
            "start": dt,
            "end": dt + timedelta(minutes=d),
            "lat": client.get("lat"),
            "lng": client.get("lng"),
            "name": r.get("client_name", ""),
        })

    work_start = datetime.fromisoformat(f"{date}T{WORK_START_HOUR:02d}:00:00+00:00")
    work_end = datetime.fromisoformat(f"{date}T{WORK_END_HOUR:02d}:00:00+00:00")
    candidates = [work_start, *(e["end"] for e in enriched)]

    suggestions = []
    seen_keys = set()
    for c in candidates:
        if c < work_start:
            c = work_start
        # Round up to next 15min increment.
        if c.minute % 15:
            c = c.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1) if c.minute >= 45 else c.replace(minute=((c.minute // 15) + 1) * 15, second=0, microsecond=0)
        else:
            c = c.replace(second=0, microsecond=0)
        if c + timedelta(minutes=duration) > work_end:
            continue
        slot_end = c + timedelta(minutes=duration)
        # Overlap detection + neighbours.
        overlap = False
        prev_rdv = None
        next_rdv = None
        for e in enriched:
            if c < e["end"] and slot_end > e["start"]:
                overlap = True
                break
            if e["end"] <= c and (prev_rdv is None or e["end"] > prev_rdv["end"]):
                prev_rdv = e
            if e["start"] >= slot_end and (next_rdv is None or e["start"] < next_rdv["start"]):
                next_rdv = e
        if overlap:
            continue

        score = 0.0
        reasons = []
        # Travel from previous rdv → must fit within margin.
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
        # Travel to next rdv → must fit within margin.
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

        key = c.isoformat()
        if key in seen_keys:
            continue
        seen_keys.add(key)
        suggestions.append({
            "datetime": key,
            "label": c.strftime("%H:%M"),
            "score": score,
            "reasons": reasons,
            "duration_minutes": duration,
        })

    suggestions.sort(key=lambda x: -x["score"])
    return suggestions[:5]
