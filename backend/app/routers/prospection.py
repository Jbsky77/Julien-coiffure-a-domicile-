"""Prospection zone analysis endpoint."""
from typing import Any, Dict

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.models.auth import User
from app.services.prospection import analyze_zone

router = APIRouter()


@router.post("/prospection/analyze")
async def prospection_analyze(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    try:
        lat = float(payload["lat"])
        lng = float(payload["lng"])
        radius_km = min(30.0, max(0.5, float(payload.get("radius_km", 5))))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, "lat, lng et radius_km requis")
    try:
        return await analyze_zone(lat, lng, radius_km)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except httpx.HTTPError:
        raise HTTPException(503, "API geo.api.gouv.fr indisponible — réessayez plus tard")
