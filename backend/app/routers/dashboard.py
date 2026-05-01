"""Dashboard endpoint."""
from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.auth import User
from app.services.dashboard import build_dashboard

router = APIRouter()


@router.get("/dashboard")
async def dashboard(user: User = Depends(get_current_user)):
    return await build_dashboard()
