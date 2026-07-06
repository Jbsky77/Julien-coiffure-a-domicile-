"""Prospection zone analysis.

Uses the free French open-data API (geo.api.gouv.fr) to estimate the population
of communes inside a circular zone, then computes the penetration rate
(clients / 1000 inhabitants) and suggests the 3 best communes to prospect.

Commune lists are cached per departement in MongoDB (90-day TTL).
"""
import logging
import math
from datetime import timedelta

import httpx

from app.db import db
from app.utils.dates import now_utc, parse_iso

logger = logging.getLogger(__name__)

GEO_API = "https://geo.api.gouv.fr/communes"
HTTP_TIMEOUT = 12.0
CACHE_TTL_DAYS = 90


def _dist_km(lat1, lng1, lat2, lng2) -> float:
    """Pure haversine distance (no road factor)."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def _commune_at(lat: float, lng: float) -> dict:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as http:
        r = await http.get(GEO_API, params={
            "lat": lat, "lon": lng,
            "fields": "nom,code,codeDepartement,population,centre",
        })
    r.raise_for_status()
    data = r.json()
    if not data:
        raise ValueError("Zone hors de France métropolitaine")
    return data[0]


async def _dept_communes(dep: str) -> list:
    cached = await db.communes_cache.find_one({"_id": dep})
    if cached:
        fetched = parse_iso(cached.get("fetched_at"))
        if fetched and (now_utc() - fetched) < timedelta(days=CACHE_TTL_DAYS):
            return cached["communes"]
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as http:
        r = await http.get(GEO_API, params={
            "codeDepartement": dep,
            "fields": "nom,code,population,centre",
        })
    r.raise_for_status()
    communes = r.json()
    await db.communes_cache.update_one(
        {"_id": dep},
        {"$set": {"communes": communes, "fetched_at": now_utc().isoformat()}},
        upsert=True,
    )
    return communes


async def analyze_zone(lat: float, lng: float, radius_km: float) -> dict:
    at = await _commune_at(lat, lng)
    dep = at.get("codeDepartement")
    raw_communes = await _dept_communes(dep)

    enriched = []
    for c in raw_communes:
        coords = (c.get("centre") or {}).get("coordinates")
        if not coords:
            continue
        clng, clat = coords
        enriched.append({
            "nom": c["nom"],
            "code": c["code"],
            "population": int(c.get("population") or 0),
            "lat": clat,
            "lng": clng,
            "distance_km": round(_dist_km(lat, lng, clat, clng), 1),
        })

    clients = await db.clients.find(
        {"lat": {"$ne": None}},
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "lat": 1, "lng": 1},
    ).to_list(5000)

    clients_in_zone = [c for c in clients if _dist_km(lat, lng, c["lat"], c["lng"]) <= radius_km]

    per_commune: dict = {c["code"]: 0 for c in enriched}
    for cl in clients:
        best, bd = None, 1e9
        for c in enriched:
            d = _dist_km(cl["lat"], cl["lng"], c["lat"], c["lng"])
            if d < bd:
                bd, best = d, c["code"]
        if best is not None and bd <= 15:
            per_commune[best] += 1
    for c in enriched:
        c["clients"] = per_commune[c["code"]]

    in_zone = [c for c in enriched if c["distance_km"] <= radius_km]
    population = sum(c["population"] for c in in_zone)
    n_clients = len(clients_in_zone)
    penetration = round(n_clients / population * 1000, 2) if population else None

    reach = max(radius_km * 1.5, radius_km + 5)
    candidates = [c for c in enriched if c["distance_km"] <= reach and c["population"] >= 300]
    candidates.sort(key=lambda c: -(c["population"] / (c["clients"] + 1)))
    suggestions = candidates[:3]

    return {
        "center": {"lat": lat, "lng": lng, "commune": at.get("nom"), "departement": dep},
        "radius_km": radius_km,
        "clients_in_zone": n_clients,
        "population_estimate": population,
        "penetration_per_1000": penetration,
        "communes_in_zone": sorted(in_zone, key=lambda c: -c["population"])[:20],
        "suggestions": suggestions,
        "client_ids_in_zone": [c["id"] for c in clients_in_zone],
    }
