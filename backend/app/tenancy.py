"""Authenticated company context for every private API request."""
from __future__ import annotations

import os
from dataclasses import dataclass

import httpx
from fastapi import HTTPException, Request

from app.db import set_active_company


@dataclass(frozen=True)
class CompanyContext:
    user_id: str
    email: str
    company_id: str
    role: str


def _supabase_config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    secret = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not secret:
        raise RuntimeError("Supabase server configuration is missing")
    return url, secret


async def require_company_context(request: Request):
    authorization = request.headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    url, secret = _supabase_config()
    headers = {"apikey": secret, "Authorization": authorization}
    async with httpx.AsyncClient(timeout=20) as client:
        user_response = await client.get(f"{url}/auth/v1/user", headers=headers)
        if user_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        user = user_response.json()
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user")

        admin_headers = {"apikey": secret, "Authorization": f"Bearer {secret}"}
        membership_response = await client.get(
            f"{url}/rest/v1/company_members",
            params={
                "user_id": f"eq.{user_id}",
                "status": "eq.active",
                "select": "company_id,role,status",
                "order": "created_at.asc",
            },
            headers=admin_headers,
        )
        membership_response.raise_for_status()
        memberships = membership_response.json()

    requested_company = request.headers.get("x-company-id")
    if requested_company:
        membership = next((m for m in memberships if m["company_id"] == requested_company), None)
        if not membership:
            raise HTTPException(status_code=403, detail="Company access denied")
    elif len(memberships) == 1:
        membership = memberships[0]
    elif not memberships:
        raise HTTPException(status_code=403, detail="No active company membership")
    else:
        raise HTTPException(status_code=409, detail="Select an active company")

    context = CompanyContext(
        user_id=user_id,
        email=user.get("email") or "",
        company_id=membership["company_id"],
        role=membership["role"],
    )
    request.state.company = context
    return set_active_company(context.company_id), context


def require_role(request: Request, *allowed_roles: str) -> CompanyContext:
    context = getattr(request.state, "company", None)
    if context is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if context.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient company role")
    return context
