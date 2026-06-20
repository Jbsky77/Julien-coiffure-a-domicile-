"""Theoretical duration helper.

Centralises the rule used by the smart-slots engine and any planning-related
flow: never trust the realised `duration_minutes` of past appointments — always
sum the `duration_minutes` declared on each Service.

The realised duration on an Appointment stays available for analytics only.
"""
from typing import Iterable, List

from app.db import db


DEFAULT_FALLBACK_MINUTES = 45


async def duration_for_service_ids(service_ids: Iterable[str]) -> int:
    """Sum the theoretical duration of the given service ids.

    Falls back to DEFAULT_FALLBACK_MINUTES per missing id, or for the whole
    appointment if no id is provided.
    """
    ids: List[str] = [sid for sid in service_ids if sid]
    if not ids:
        return DEFAULT_FALLBACK_MINUTES
    docs = await db.services.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "duration_minutes": 1}).to_list(500)
    by_id = {d["id"]: int(d.get("duration_minutes") or DEFAULT_FALLBACK_MINUTES) for d in docs}
    total = sum(by_id.get(sid, DEFAULT_FALLBACK_MINUTES) for sid in ids)
    return max(total, 1)


async def duration_for_appointment(rdv: dict) -> int:
    """Theoretical duration of an appointment, from its declared services."""
    services = rdv.get("services") or []
    return await duration_for_service_ids([s.get("service_id") for s in services])
