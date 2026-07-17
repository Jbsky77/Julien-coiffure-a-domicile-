"""Analytics endpoint."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.models.auth import User
from app.services.analytics import compare_periods, compute_analytics

router = APIRouter()


@router.get("/analytics")
async def analytics(month: str | None = None, user: User = Depends(get_current_user)):
    data = await compute_analytics(month)
    if data.get("error") == "invalid_month":
        raise HTTPException(400, "Mois invalide, format attendu : AAAA-MM")
    return data


@router.post("/analytics/compare")
async def analytics_compare(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    """Body: {a: {start, end}, b: {start, end}}. Returns {a, b, deltas}."""
    a = payload.get("a") or {}
    b = payload.get("b") or {}
    if not a.get("start") or not a.get("end") or not b.get("start") or not b.get("end"):
        raise HTTPException(400, "Payload requis : {a:{start,end}, b:{start,end}}")
    return await compare_periods(a["start"], a["end"], b["start"], b["end"])
