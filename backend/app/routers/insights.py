"""Insights + goals endpoints."""
from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.auth import User
from app.services.goals import goals_progress
from app.services.insights import compute_insights

router = APIRouter()


@router.get("/insights")
async def insights_endpoint(user: User = Depends(get_current_user)):
    return {"insights": await compute_insights()}


@router.get("/goals/progress")
async def goals_endpoint(user: User = Depends(get_current_user)):
    return await goals_progress()
