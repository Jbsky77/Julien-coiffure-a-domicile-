"""Authentication routes (currently disabled — kept for compatibility)."""
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response

from app.db import db
from app.dependencies import get_current_user
from app.models.auth import User

router = APIRouter()


@router.post("/auth/google/session")
async def create_session():
    raise HTTPException(status_code=410, detail="Legacy Emergent authentication has been removed")


@router.get("/auth/me")
async def auth_me(user: User = Depends(get_current_user)):
    return user.model_dump()


@router.post("/auth/logout")
async def logout(response: Response, session_token: Optional[str] = Cookie(default=None)):
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}
