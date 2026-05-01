"""Smart slot suggestions endpoint."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.models.auth import User
from app.services.slots import suggest_slots

router = APIRouter()


@router.post("/slots/suggest")
async def slots_suggest(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    date = payload.get("date")
    if not date:
        raise HTTPException(400, "Date required")
    suggestions = await suggest_slots(
        date=date,
        duration_minutes=int(payload.get("duration_minutes") or 0),
        target_lat=payload.get("lat"),
        target_lng=payload.get("lng"),
    )
    return {"suggestions": suggestions}
