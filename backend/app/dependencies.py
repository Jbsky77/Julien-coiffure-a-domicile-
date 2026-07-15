"""Authenticated user dependency backed by the verified request company context."""
from fastapi import HTTPException, Request

from app.models.auth import User


async def get_current_user(request: Request) -> User:
    context = getattr(request.state, "company", None)
    if context is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return User(
        user_id=context.user_id,
        email=context.email,
        name=context.email,
        picture="",
    )
