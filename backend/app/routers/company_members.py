"""Secure company team management."""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.tenancy import CompanyContext, require_role

router = APIRouter(prefix="/company/members", tags=["company-members"])


class MemberInvite(BaseModel):
    email: str
    name: str = ""
    role: Literal["admin", "employee", "reception"] = "employee"
    permissions: dict[str, bool] = Field(default_factory=dict)


class MemberUpdate(BaseModel):
    role: Literal["admin", "employee", "reception"] | None = None
    status: Literal["active", "suspended", "inactive"] | None = None
    permissions: dict[str, bool] | None = None


def _config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    secret = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not secret:
        raise RuntimeError("Supabase server configuration is missing")
    return url, secret


def _headers(secret: str) -> dict[str, str]:
    return {"apikey": secret, "Authorization": f"Bearer {secret}", "Content-Type": "application/json"}


def _manager(request: Request) -> CompanyContext:
    return require_role(request, "owner", "admin")


async def _find_user(client, url, headers, email):
    response = await client.get(f"{url}/auth/v1/admin/users", params={"page": 1, "per_page": 1000}, headers=headers)
    response.raise_for_status()
    users = response.json().get("users", [])
    return next((u for u in users if (u.get("email") or "").casefold() == email.casefold()), None)


async def _auth_user(client, url, headers, user_id):
    response = await client.get(f"{url}/auth/v1/admin/users/{user_id}", headers=headers)
    return response.json() if response.status_code == 200 else {}


@router.get("")
async def list_members(request: Request):
    context = getattr(request.state, "company", None)
    if context is None:
        raise HTTPException(401, "Authentification requise")
    url, secret = _config()
    headers = _headers(secret)
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "select": "*", "order": "created_at.asc"},
            headers=headers,
        )
        response.raise_for_status()
        result = []
        for membership in response.json():
            user = await _auth_user(client, url, headers, membership["user_id"])
            metadata = user.get("user_metadata") or {}
            result.append({
                **membership,
                "email": user.get("email") or "",
                "name": membership.get("display_name") or metadata.get("full_name") or user.get("email") or "EmployÃ©",
                "is_current_user": membership["user_id"] == context.user_id,
                "invitation_pending": membership.get("status") == "invited",
            })
    return {"members": result, "current_role": context.role}


@router.post("/invite")
async def invite_member(payload: MemberInvite, request: Request):
    context = _manager(request)
    if context.role == "admin" and payload.role == "admin":
        raise HTTPException(403, "Seul le propriÃ©taire peut ajouter un administrateur")
    email = payload.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(400, "Adresse e-mail invalide")
    url, secret = _config()
    headers = _headers(secret)
    now = datetime.now(timezone.utc)
    async with httpx.AsyncClient(timeout=30) as client:
        user = await _find_user(client, url, headers, email)
        invited = user is None
        if invited:
            redirect = f"{os.environ.get('PUBLIC_APP_URL', 'https://julien-coiffure-domicile.vercel.app').rstrip('/')}/accept-invite"
            response = await client.post(
                f"{url}/auth/v1/invite",
                params={"redirect_to": redirect},
                json={"email": email, "data": {"full_name": payload.name.strip(), "invited_to_company": context.company_id}},
                headers=headers,
            )
            if response.status_code >= 400:
                raise HTTPException(400, response.json().get("msg") or "Impossible d'envoyer l'invitation")
            user = response.json()
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(502, "Compte employÃ© introuvable")
        check = await client.get(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{user_id}", "select": "role", "limit": 1},
            headers=headers,
        )
        check.raise_for_status()
        if check.json() and check.json()[0]["role"] == "owner":
            raise HTTPException(400, "Le propriÃ©taire ne peut pas Ãªtre modifiÃ©")
        body = {
            "company_id": context.company_id,
            "user_id": user_id,
            "role": payload.role,
            "status": "invited" if invited else "active",
            "permissions": payload.permissions,
            "display_name": payload.name.strip() or None,
            "invited_by": context.user_id,
            "invited_at": now.isoformat(),
            "invitation_expires_at": (now + timedelta(hours=1)).isoformat() if invited else None,
            "joined_at": None if invited else now.isoformat(),
            "updated_at": now.isoformat(),
        }
        saved = await client.post(
            f"{url}/rest/v1/company_members",
            params={"on_conflict": "company_id,user_id"},
            json=body,
            headers={**headers, "Prefer": "resolution=merge-duplicates,return=representation"},
        )
        saved.raise_for_status()
    return {"ok": True, "message": "Invitation envoyÃ©e par e-mail" if invited else "EmployÃ© ajoutÃ© Ã  l'entreprise"}


@router.post("/accept")
async def accept_invitation(request: Request):
    context = getattr(request.state, "company", None)
    if context is None:
        raise HTTPException(401, "Session d'invitation requise")
    return {"ok": True, "company_id": context.company_id}


@router.patch("/{user_id}")
async def update_member(user_id: str, payload: MemberUpdate, request: Request):
    context = _manager(request)
    if user_id == context.user_id and (payload.role is not None or payload.status is not None):
        raise HTTPException(400, "Vous ne pouvez pas modifier votre propre rÃ´le ou statut")
    url, secret = _config()
    headers = _headers(secret)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{user_id}", "select": "role,status", "limit": 1},
            headers=headers,
        )
        response.raise_for_status()
        rows = response.json()
        if not rows:
            raise HTTPException(404, "EmployÃ© introuvable")
        target = rows[0]
        if target["role"] == "owner":
            raise HTTPException(400, "Le propriÃ©taire ne peut pas Ãªtre modifiÃ©")
        if context.role == "admin" and (target["role"] == "admin" or payload.role == "admin"):
            raise HTTPException(403, "Seul le propriÃ©taire gÃ¨re les administrateurs")
        changes = payload.model_dump(exclude_none=True)
        changes["updated_at"] = datetime.now(timezone.utc).isoformat()
        update = await client.patch(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{user_id}"},
            json=changes,
            headers={**headers, "Prefer": "return=representation"},
        )
        update.raise_for_status()
    return {"ok": True, "member": update.json()[0]}


@router.delete("/{user_id}")
async def remove_member(user_id: str, request: Request):
    context = _manager(request)
    if user_id == context.user_id:
        raise HTTPException(400, "Vous ne pouvez pas retirer votre propre accÃ¨s")
    url, secret = _config()
    headers = _headers(secret)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{user_id}", "select": "role", "limit": 1},
            headers=headers,
        )
        response.raise_for_status()
        rows = response.json()
        if not rows:
            raise HTTPException(404, "EmployÃ© introuvable")
        if rows[0]["role"] == "owner":
            raise HTTPException(400, "Le propriÃ©taire ne peut pas Ãªtre retirÃ©")
        if context.role == "admin" and rows[0]["role"] == "admin":
            raise HTTPException(403, "Seul le propriÃ©taire peut retirer un administrateur")
        updated = await client.patch(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{user_id}"},
            json={"status": "inactive", "updated_at": datetime.now(timezone.utc).isoformat()},
            headers=headers,
        )
        updated.raise_for_status()
    return {"ok": True}
