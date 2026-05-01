"""App-wide settings (singleton)."""
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.auth import User
from app.services.settings import get_settings, update_settings

router = APIRouter()


@router.get("/settings")
async def settings_get(user: User = Depends(get_current_user)):
    s = await get_settings()
    return s.model_dump()


@router.put("/settings")
async def settings_put(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    s = await update_settings(payload)
    return s.model_dump()
