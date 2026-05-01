"""Daily tour itinerary."""
from typing import Optional

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.auth import User
from app.services.tour import build_tour

router = APIRouter()


@router.get("/tour/today")
async def tour_today(date: Optional[str] = None, user: User = Depends(get_current_user)):
    return await build_tour(date)
