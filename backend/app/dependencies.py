"""Authentication dependency. Auth is currently disabled — returns the local user."""
from typing import Optional
from fastapi import Cookie, Header, Request
from app.models.auth import User


async def get_current_user(
    request: Request,
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
) -> User:
    # Single-user local app — no auth required.
    return User(user_id="local-julien", email="julien@local", name="Julien Bouche", picture="")
