"""Geocoding service backed by OpenStreetMap / Nominatim.

Features:
- Cache by normalized address in MongoDB (`geocache` collection).
- TTL (default 90 days) — entries older than TTL are refreshed transparently.
- Resilient to timeouts, rate-limiting and empty responses (never raises).
- In-memory hit/miss counter + per-call structured response
  (`{address, lat, lng, source, cached, error}`).
"""
import logging
import os
from datetime import timedelta
from typing import Optional, Tuple

import httpx

from app.db import db
from app.utils.dates import now_utc, parse_iso
from app.utils.formatting import normalize_address

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = os.environ.get("GEOCODING_USER_AGENT", "CoiffurePro/1.0")
DEFAULT_TTL_DAYS = int(os.environ.get("GEOCODE_TTL_DAYS", "90"))
HTTP_TIMEOUT = float(os.environ.get("GEOCODE_HTTP_TIMEOUT", "8"))

# Lightweight in-process counters (reset on backend restart).
_stats = {"hit": 0, "miss": 0, "fresh": 0, "stale": 0, "error": 0, "empty": 0}


def stats() -> dict:
    return dict(_stats)


def _is_fresh(entry: dict, ttl_days: int) -> bool:
    created = parse_iso(entry.get("created_at"))
    if created is None:
        # Legacy entries without created_at — treat as fresh once, refresh next time we miss.
        return True
    return (now_utc() - created) < timedelta(days=ttl_days)


async def _query_nominatim(address: str) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    """Returns (lat, lng, error). On success error is None."""
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as http:
            r = await http.get(
                NOMINATIM_URL,
                params={"q": address, "format": "json", "limit": 1, "countrycodes": "fr"},
                headers={"User-Agent": USER_AGENT},
            )
        if r.status_code == 429:
            return None, None, "rate_limited"
        if r.status_code != 200:
            return None, None, f"http_{r.status_code}"
        data = r.json()
        if not data:
            return None, None, "not_found"
        return float(data[0]["lat"]), float(data[0]["lon"]), None
    except httpx.TimeoutException:
        return None, None, "timeout"
    except Exception as exc:
        logger.warning("Nominatim error for %r: %s", address, exc)
        return None, None, "exception"


async def _persist(address: str, normalized: str, lat: Optional[float], lng: Optional[float]) -> None:
    """Upsert cache entry by normalized key, increment hits."""
    now = now_utc().isoformat()
    await db.geocache.update_one(
        {"address_norm": normalized},
        {
            "$set": {
                "address": address,
                "address_norm": normalized,
                "lat": lat,
                "lng": lng,
                "source": "nominatim",
                "created_at": now,
            },
            "$setOnInsert": {"first_seen": now},
            "$inc": {"resolves": 1},
        },
        upsert=True,
    )


async def resolve(address: str, ttl_days: int = DEFAULT_TTL_DAYS) -> dict:
    """Public resolver. Returns:
        {address, lat, lng, source, cached, error}
    Never raises — caller can always rely on the returned dict.
    """
    raw = (address or "").strip()
    if not raw:
        return {"address": "", "lat": None, "lng": None, "source": None, "cached": False, "error": "empty_address"}
    normalized = normalize_address(raw)

    # Cache lookup by normalized key. Fall back to legacy `address` field for older entries.
    cached = await db.geocache.find_one({"address_norm": normalized}, {"_id": 0})
    if not cached:
        cached = await db.geocache.find_one({"address": raw}, {"_id": 0})

    if cached and _is_fresh(cached, ttl_days):
        _stats["hit"] += 1
        _stats["fresh"] += 1
        # Increment hit counter best-effort (separate write so we never block the lookup).
        await db.geocache.update_one(
            {"address_norm": normalized},
            {"$inc": {"hits": 1}, "$set": {"last_hit": now_utc().isoformat()}},
            upsert=False,
        )
        return {
            "address": raw,
            "lat": cached.get("lat"),
            "lng": cached.get("lng"),
            "source": "cache",
            "cached": True,
            "error": None,
        }

    if cached:
        _stats["stale"] += 1

    # Cache miss or stale → ask Nominatim.
    _stats["miss"] += 1
    lat, lng, err = await _query_nominatim(raw)
    if err == "not_found":
        _stats["empty"] += 1
        # Persist a "no result" marker so we don't hammer the API for the same bad address.
        await _persist(raw, normalized, None, None)
        return {"address": raw, "lat": None, "lng": None, "source": "nominatim", "cached": False, "error": "not_found"}
    if err is not None:
        _stats["error"] += 1
        # Don't persist on transient errors — the caller can retry later.
        return {"address": raw, "lat": None, "lng": None, "source": None, "cached": False, "error": err}

    await _persist(raw, normalized, lat, lng)
    return {"address": raw, "lat": lat, "lng": lng, "source": "nominatim", "cached": False, "error": None}


# ---- Compatibility helpers used by clients router ------------------------------


async def auto_geocode(address: str) -> Tuple[Optional[float], Optional[float]]:
    """Convenience wrapper returning just (lat, lng). Never raises."""
    out = await resolve(address)
    return out["lat"], out["lng"]


async def geocode_address(address: str) -> dict:
    """Public endpoint helper. Returns the legacy {address, lat, lng} contract,
    enriched with `cached`, `source`, `error` so the frontend can adapt UX.
    """
    raw = (address or "").strip()
    if not raw:
        raise ValueError("Address required")
    out = await resolve(raw)
    return out
