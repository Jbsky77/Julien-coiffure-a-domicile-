"""Geocoding service backed by OpenStreetMap / Nominatim with a simple cache.

P1: behaviour identical to legacy server.py — cache by raw address, no TTL.
P2 will normalize addresses, add TTL, hit/miss counters and richer error reporting.
"""
import logging
from typing import Optional, Tuple

import httpx

from app.db import db

logger = logging.getLogger(__name__)


async def auto_geocode(address: str) -> Tuple[Optional[float], Optional[float]]:
    """Resolve an address to (lat, lng). Returns (None, None) on failure."""
    if not address:
        return None, None
    cached = await db.geocache.find_one({"address": address}, {"_id": 0})
    if cached:
        return cached.get("lat"), cached.get("lng")
    try:
        async with httpx.AsyncClient(timeout=8) as http:
            r = await http.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": address, "format": "json", "limit": 1, "countrycodes": "fr"},
                headers={"User-Agent": "JulienBoucheApp/1.0"},
            )
        data = r.json()
        if not data:
            return None, None
        lat = float(data[0]["lat"])
        lng = float(data[0]["lon"])
        await db.geocache.insert_one({"address": address, "lat": lat, "lng": lng})
        return lat, lng
    except Exception as exc:
        logger.warning("geocode failed for %r: %s", address, exc)
        return None, None


async def geocode_address(address: str) -> dict:
    """Public endpoint helper. Returns {address, lat, lng}."""
    addr = (address or "").strip()
    if not addr:
        raise ValueError("Address required")
    cached = await db.geocache.find_one({"address": addr}, {"_id": 0})
    if cached:
        return cached
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            r = await http.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": addr, "format": "json", "limit": 1, "countrycodes": "fr"},
                headers={"User-Agent": "JulienBoucheApp/1.0"},
            )
        data = r.json()
        if not data:
            return {"address": addr, "lat": None, "lng": None}
        out = {"address": addr, "lat": float(data[0]["lat"]), "lng": float(data[0]["lon"])}
        await db.geocache.insert_one(out)
        return out
    except Exception as exc:
        logger.warning("geocode failed for %r: %s", addr, exc)
        return {"address": addr, "lat": None, "lng": None}
