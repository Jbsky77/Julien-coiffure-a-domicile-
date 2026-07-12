"""Routing service: real driving distance via OSRM public server.

- Falls back to Haversine (as-the-crow-flies × 1.3 corrective factor) if OSRM fails.
- Caches results in `route_cache` collection keyed by rounded coordinates.
- Never raises — always returns `{km, seconds, source, error}`.
"""
import logging
import math
import os
from typing import Optional, Tuple

import httpx

from app.db import db
from app.utils.dates import now_utc

logger = logging.getLogger(__name__)

OSRM_URL = os.environ.get("OSRM_URL", "https://router.project-osrm.org")
HTTP_TIMEOUT = float(os.environ.get("ROUTING_HTTP_TIMEOUT", "8"))
CACHE_TTL_DAYS = int(os.environ.get("ROUTING_TTL_DAYS", "180"))


def _round(x: float) -> float:
    return round(float(x), 5)  # ~1m precision


def _cache_key(a: Tuple[float, float], b: Tuple[float, float]) -> str:
    return f"{_round(a[0])},{_round(a[1])}|{_round(b[0])},{_round(b[1])}"


def _haversine_km(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    r = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


async def _query_osrm(a: Tuple[float, float], b: Tuple[float, float]) -> dict:
    """`a` and `b` are (lat, lng). OSRM expects lng,lat."""
    url = f"{OSRM_URL}/route/v1/driving/{a[1]},{a[0]};{b[1]},{b[0]}"
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as http:
            r = await http.get(url, params={"overview": "false"})
        if r.status_code != 200:
            return {"error": f"http_{r.status_code}"}
        data = r.json()
        if data.get("code") != "Ok" or not data.get("routes"):
            return {"error": data.get("code", "no_route")}
        route = data["routes"][0]
        return {
            "km": route["distance"] / 1000.0,
            "seconds": route["duration"],
            "source": "osrm",
        }
    except httpx.TimeoutException:
        return {"error": "timeout"}
    except Exception as exc:
        logger.warning("OSRM error: %s", exc)
        return {"error": "exception"}


async def route(
    a: Optional[Tuple[float, float]],
    b: Optional[Tuple[float, float]],
) -> dict:
    """Public routing. Returns `{km, seconds, source, error}`.

    Never raises. If coordinates missing → error='missing_coords'.
    """
    if not a or not b or a[0] is None or b[0] is None:
        return {"km": None, "seconds": None, "source": None, "error": "missing_coords"}
    key = _cache_key(a, b)
    cached = await db.route_cache.find_one({"_id": key}, {"_id": 0})
    if cached and cached.get("km") is not None:
        return {
            "km": cached["km"],
            "seconds": cached.get("seconds"),
            "source": "cache",
            "error": None,
        }
    result = await _query_osrm(a, b)
    if result.get("error"):
        # Fallback to Haversine × 1.3 (typical detour factor)
        km_h = _haversine_km(a, b) * 1.3
        # 40 km/h avg
        return {
            "km": km_h,
            "seconds": km_h / 40.0 * 3600,
            "source": "haversine",
            "error": result["error"],
        }
    # Persist success
    await db.route_cache.update_one(
        {"_id": key},
        {"$set": {
            "km": result["km"],
            "seconds": result["seconds"],
            "source": "osrm",
            "created_at": now_utc().isoformat(),
        }},
        upsert=True,
    )
    return {"km": result["km"], "seconds": result["seconds"], "source": "osrm", "error": None}


def compute_supplement(distance_km: Optional[float], tier_km: float, tier_price: float) -> float:
    """Barème: < tier_km → 0€; sinon floor(d/tier_km) × tier_price."""
    if distance_km is None or distance_km < tier_km:
        return 0.0
    return math.floor(distance_km / tier_km) * tier_price
