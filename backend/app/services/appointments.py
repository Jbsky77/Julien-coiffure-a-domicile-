"""Appointment totals computation."""
import math
from typing import List, Optional, Dict, Any, Tuple

from app.db import db
from app.services.routing import compute_supplement, route
from app.services.settings import get_settings


async def _distance_from_business_km(client_id: str) -> Tuple[Optional[float], Optional[str]]:
    """Returns (km, source) computed via OSRM between business & client coords.

    Returns (None, error) if any address is missing/ungeocoded.
    """
    settings = await get_settings()
    ba = getattr(settings, "business_address", None)
    if not ba or ba.lat is None or ba.lng is None:
        return None, "business_not_geocoded"
    c = await db.clients.find_one({"id": client_id}, {"_id": 0, "lat": 1, "lng": 1})
    if not c or c.get("lat") is None or c.get("lng") is None:
        return None, "client_not_geocoded"
    r = await route((ba.lat, ba.lng), (c["lat"], c["lng"]))
    return r["km"], r.get("error")


async def compute_appointment_totals(
    services_input: List[Dict[str, Any]],
    kilometrage: float,
    price_final_override: Optional[float] = None,
    *,
    client_id: Optional[str] = None,
    is_neighbor: bool = False,
    neighbor_of_client_id: Optional[str] = None,
):
    """Compute totals for an appointment.

    Fuel supplement logic:
      1. If both business & client are geocoded, use routed distance (in km) via OSRM
         → supplement = floor(d/tier_km) × tier_price when d ≥ tier_km, else 0.
      2. Else fall back to legacy `kilometrage` param (manual km).
      3. If `is_neighbor` is True and validation passes at write time (router responsibility),
         the caller sets billed_supplement=0 and keeps theoretical value.

    This function returns both `theoretical_supp` and the effective `fuel_supplement`.
    """
    settings = await get_settings()
    # Hydrate services
    svc_objs = []
    for s in services_input:
        svc = await db.services.find_one({"id": s["service_id"]}, {"_id": 0})
        if not svc:
            continue
        svc_objs.append({
            "service_id": svc["id"],
            "name": svc["name"],
            "price": svc["price"],
            "category": svc["category"],
            "is_gift": bool(s.get("is_gift", False)),
        })
    subtotal = sum(x["price"] for x in svc_objs if not x["is_gift"])
    cats = {x["category"] for x in svc_objs if not x["is_gift"]}
    family_pack = {"HOMME", "FEMME", "ENFANT"}.issubset(cats)
    if family_pack:
        subtotal = 45.0

    tier_km = settings.fuel_supplement_tier_km or 10.0
    tier_price = settings.fuel_supplement_per_tier or 2.5

    # Distance & theoretical supplement (from business address)
    distance_km: Optional[float] = None
    if client_id:
        distance_km, _ = await _distance_from_business_km(client_id)
    if distance_km is not None:
        theoretical_supp = compute_supplement(distance_km, tier_km, tier_price)
    else:
        # Legacy fallback: use manual `kilometrage`
        theoretical_supp = compute_supplement(float(kilometrage or 0), tier_km, tier_price)

    # Neighbor exemption
    neighbor_discount = 0.0
    billed_supp = theoretical_supp
    if is_neighbor and neighbor_of_client_id:
        neighbor_discount = theoretical_supp
        billed_supp = 0.0

    price_base = subtotal + billed_supp
    price_final = price_final_override if price_final_override is not None else price_base
    gift_applied = any(x["is_gift"] for x in svc_objs)
    return {
        "services": svc_objs,
        "subtotal": subtotal,
        "distance_km": distance_km,
        "theoretical_supplement": theoretical_supp,
        "neighbor_discount": neighbor_discount,
        "fuel_supplement": billed_supp,
        "price_base": price_base,
        "price_final": price_final,
        "family_pack": family_pack,
        "gift_applied": gift_applied,
    }

