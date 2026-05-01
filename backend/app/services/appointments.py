"""Appointment totals computation."""
from typing import List, Optional, Dict, Any

from app.db import db
from app.services.settings import get_settings


async def compute_appointment_totals(
    services_input: List[Dict[str, Any]],
    kilometrage: float,
    price_final_override: Optional[float] = None,
):
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
    # Base total without gifts
    subtotal = sum(x["price"] for x in svc_objs if not x["is_gift"])
    # Family pack detection: HOMME + FEMME + ENFANT all present (non-gift) -> 45€
    cats = {x["category"] for x in svc_objs if not x["is_gift"]}
    family_pack = {"HOMME", "FEMME", "ENFANT"}.issubset(cats)
    if family_pack:
        subtotal = 45.0
    # Fuel supplement: tiered: floor(km/tier_km)*tier_price
    tier_km = settings.fuel_supplement_tier_km or 10
    tier_price = settings.fuel_supplement_per_tier or 2.5
    tiers = int(kilometrage // tier_km) if kilometrage > 0 else 0
    fuel_supplement = tiers * tier_price
    price_base = subtotal + fuel_supplement
    price_final = price_final_override if price_final_override is not None else price_base
    gift_applied = any(x["is_gift"] for x in svc_objs)
    return svc_objs, subtotal, fuel_supplement, price_base, price_final, family_pack, gift_applied
