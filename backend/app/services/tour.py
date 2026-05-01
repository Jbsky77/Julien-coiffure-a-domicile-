"""Tour optimisation: ordered list of today's stops with travel estimates."""
from datetime import timedelta
from typing import Optional

from app.db import db
from app.services.settings import get_settings
from app.utils.dates import now_utc, parse_iso
from app.utils.travel import haversine, km_to_minutes


async def build_tour(target_date: Optional[str] = None) -> dict:
    settings = await get_settings()
    target = target_date or now_utc().strftime("%Y-%m-%d")
    rdvs = await db.appointments.find({"status": {"$in": ["scheduled", "done"]}}, {"_id": 0}).to_list(2000)
    day_rdvs = []
    for r in rdvs:
        dt = parse_iso(r.get("date"))
        if dt is None:
            continue
        if dt.strftime("%Y-%m-%d") == target:
            day_rdvs.append(r)
    day_rdvs.sort(key=lambda r: r["date"])

    out = []
    prev = None
    total_km = 0.0
    total_travel = 0
    total_ca = 0.0
    total_duration = 0
    for r in day_rdvs:
        client = await db.clients.find_one({"id": r["client_id"]}, {"_id": 0})
        lat = client.get("lat") if client else None
        lng = client.get("lng") if client else None
        travel_km = None
        travel_min = None
        conflict = False
        if prev and lat and lng and prev.get("lat") and prev.get("lng"):
            travel_km = haversine(prev["lat"], prev["lng"], lat, lng)
            if travel_km is not None:
                travel_min = km_to_minutes(travel_km, settings.avg_speed_kmh)
                prev_end = parse_iso(prev["date"])
                cur_start = parse_iso(r["date"])
                if prev_end and cur_start:
                    prev_end = prev_end + timedelta(minutes=prev.get("duration_minutes") or settings.default_duration_minutes)
                    margin = (cur_start - prev_end).total_seconds() / 60
                    if travel_min is not None and margin < travel_min:
                        conflict = True
                total_km += travel_km
                if travel_min:
                    total_travel += travel_min
        duration = r.get("duration_minutes") or settings.default_duration_minutes
        total_duration += duration
        total_ca += r.get("price_final", 0)
        out.append({
            **r,
            "address": client.get("address") if client else "",
            "phone": client.get("phone") if client else "",
            "gender": client.get("gender") if client else None,
            "lat": lat, "lng": lng,
            "travel_km": travel_km,
            "travel_min": travel_min,
            "conflict": conflict,
            "duration_minutes": duration,
        })
        prev = {"lat": lat, "lng": lng, "date": r["date"], "duration_minutes": duration}
    return {
        "date": target,
        "stops": out,
        "total_km": round(total_km, 2),
        "total_travel_min": total_travel,
        "total_ca": round(total_ca, 2),
        "total_duration_min": total_duration,
    }
