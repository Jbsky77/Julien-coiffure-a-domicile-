"""Analytics endpoint."""
from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.auth import User
from app.services.analytics import compute_analytics

router = APIRouter()


@router.get("/analytics")
async def analytics(user: User = Depends(get_current_user)):
    return await compute_analytics()
