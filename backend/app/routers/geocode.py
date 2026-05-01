"""Geocoding endpoint."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.models.auth import User
from app.services.geocoding import geocode_address, stats as geocode_stats

router = APIRouter()


@router.post("/geocode")
async def geocode_endpoint(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    try:
        return await geocode_address(payload.get("address") or "")
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/geocode/stats")
async def geocode_stats_endpoint(user: User = Depends(get_current_user)):
    return geocode_stats()
