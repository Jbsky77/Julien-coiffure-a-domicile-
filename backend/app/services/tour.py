"""Daily tour: real distance (OSRM) from business address → clients → business.

Distinguishes:
- Facturé (from each RDV): billed supplement (0 € if neighbor, else theoretical).
- Théorique (from each RDV): supplement that would be normally charged.
- Réel (tour-wide): kilometers actually driven, fuel cost with ceil on daily total.
"""
import math
from datetime import timedelta
from typing import Optional

from app.db import db
from app.services.routing import route
from app.services.settings import get_settings
from app.utils.dates import PARIS_TZ, now_utc, paris_day_range, parse_iso


async def build_tour(target_date: Optional[str] = None) -> dict:
    settings = await get_settings()
    ba = getattr(settings, "business_address", None)
    biz_coords = (ba.lat, ba.lng) if (ba and ba.lat is not None and ba.lng is not None) else None

    target = target_date or now_utc().astimezone(PARIS_TZ).date().isoformat()\n    day_start, day_end = paris_day_range(target)
    rdvs = await db.appointments.find(
        {"status": {"$in": ["scheduled", "done"]}}, {"_id": 0}
    ).to_list(2000)

    day_rdvs = []
    for r in rdvs:
        dt = parse_iso(r.get("date"))
        if dt is None:
            continue
        if day_start <= dt < day_end:
            day_rdvs.append(r)
    day_rdvs.sort(key=lambda r: (parse_iso(r.get("date")), r.get("created_at") or ""))

    stops = []
    total_km = 0.0
    total_travel_min = 0.0
    total_ca_services = 0.0  # prestations (base - fuel)
    total_theoretical_supp = 0.0
    total_neighbor_discount = 0.0
    total_billed_supp = 0.0
    total_duration = 0
    neighbor_count = 0

    prev_coords = biz_coords  # start from business
    prev_end_dt = None
    for idx, r in enumerate(day_rdvs):
        client = await db.clients.find_one({"id": r["client_id"]}, {"_id": 0})
        lat = client.get("lat") if client else None
        lng = client.get("lng") if client else None
        cur_coords = (lat, lng) if lat is not None and lng is not None else None

        # Compute leg: previous → current (biz → first, then client → client)
        travel_km = None
        travel_min = None
        travel_source = None
        conflict = False
        if prev_coords and cur_coords:
            r_leg = await route(prev_coords, cur_coords)
            if r_leg["km"] is not None:
                travel_km = round(r_leg["km"], 2)
                travel_min = round(r_leg["seconds"] / 60.0, 1)
                travel_source = r_leg["source"]
                total_km += r_leg["km"]
                total_travel_min += travel_min
                # Check margin
                cur_start = parse_iso(r["date"])
                if prev_end_dt and cur_start:
                    margin = (cur_start - prev_end_dt).total_seconds() / 60.0
                    if margin < travel_min:
                        conflict = True

        duration = r.get("duration_minutes") or settings.default_duration_minutes
        total_duration += duration

        # Financial breakdown per stop
        price_final = float(r.get("price_final", 0) or 0)
        billed_supp = float(r.get("fuel_supplement", 0) or 0)
        # Legacy fallback for pre-migration RDV (no theoretical stored)
        theoretical_supp = float(
            r.get("theoretical_fuel_supplement")
            if r.get("theoretical_fuel_supplement") is not None
            else r.get("fuel_supplement", 0) or 0
        )
        neighbor_discount = float(r.get("neighbor_discount", 0) or 0)
        services_ca = round(price_final - billed_supp, 2)
        total_ca_services += services_ca
        total_billed_supp += billed_supp
        total_theoretical_supp += theoretical_supp
        total_neighbor_discount += neighbor_discount
        if r.get("is_neighbor"):
            neighbor_count += 1

        stops.append({
            **r,
            "address": client.get("address") if client else "",
            "phone": client.get("phone") if client else "",
            "gender": client.get("gender") if client else None,
            "lat": lat, "lng": lng,
            # Leg from previous step (biz on 1st stop)
            "travel_km": travel_km,
            "travel_min": travel_min,
            "travel_source": travel_source,
            "leg_from_business": idx == 0,
            "conflict": conflict,
            "duration_minutes": duration,
            "services_ca": services_ca,
            "theoretical_supplement": theoretical_supp,
            "billed_supplement": billed_supp,
            "neighbor_discount": neighbor_discount,
        })

        cur_dt = parse_iso(r["date"])
        prev_end_dt = (cur_dt + timedelta(minutes=duration)) if cur_dt else None
        if cur_coords:
            prev_coords = cur_coords

    # Return leg: last client → business
    return_km = None
    return_min = None
    if biz_coords and prev_coords and prev_coords != biz_coords and day_rdvs:
        r_ret = await route(prev_coords, biz_coords)
        if r_ret["km"] is not None:
            return_km = round(r_ret["km"], 2)
            return_min = round(r_ret["seconds"] / 60.0, 1)
            total_km += r_ret["km"]
            total_travel_min += return_min

    # Fuel cost: single ceil on daily total
    fuel_price = settings.fuel_price_per_liter or 0
    consumption = settings.consumption_l_per_100km or 0
    fuel_brut = total_km * consumption / 100.0 * fuel_price
    fuel_cost = math.ceil(fuel_brut) if total_km > 0 else 0

    total_ca = round(total_ca_services + total_billed_supp, 2)
    # Marge estimée = CA total - carburant réel - consommables approximés
    consumables = float(settings.consumables_per_client or 0) * len(day_rdvs)
    estimated_margin = round(total_ca - fuel_cost - consumables, 2)

    return {
        "date": target,
        "stops": stops,
        "total_km": round(total_km, 2),
        "total_travel_min": round(total_travel_min, 1),
        "return_leg_km": return_km,
        "return_leg_min": return_min,
        "business_geocoded": biz_coords is not None,
        # Financials
        "ca_services": round(total_ca_services, 2),
        "theoretical_supplements": round(total_theoretical_supp, 2),
        "neighbor_discounts": round(total_neighbor_discount, 2),
        "billed_supplements": round(total_billed_supp, 2),
        "total_ca": total_ca,
        "fuel_cost_brut": round(fuel_brut, 3),
        "fuel_cost": fuel_cost,
        "estimated_margin": estimated_margin,
        "total_duration_min": total_duration,
        "neighbor_count": neighbor_count,
    }
