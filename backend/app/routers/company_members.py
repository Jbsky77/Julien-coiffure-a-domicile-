"""Company employee management backed by Supabase Auth and company memberships."""
from __future__ import annotations

import os
import re
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.tenancy import CompanyContext, require_role

router = APIRouter(prefix="/company/members", tags=["company-members"])


class MemberInvite(BaseModel):
    email: str
    password: str | None = None
    role: Literal["admin", "employee"] = "employee"


def _config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    secret = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not secret:
        raise RuntimeError("Supabase server configuration is missing")
    return url, secret


def _admin_headers(secret: str) -> dict[str, str]:
    return {
        "apikey": secret,
        "Authorization": f"Bearer {secret}",
        "Content-Type": "application/json",
    }


def _context(request: Request) -> CompanyContext:
    return require_role(request, "owner", "admin")


async def _auth_user(client: httpx.AsyncClient, url: str, headers: dict[str, str], user_id: str) -> dict:
    response = await client.get(f"{url}/auth/v1/admin/users/{user_id}", headers=headers)
    if response.status_code == 404:
        return {}
    response.raise_for_status()
    return response.json()


async def _find_user_by_email(client: httpx.AsyncClient, url: str, headers: dict[str, str], email: str) -> dict | None:
    response = await client.get(
        f"{url}/auth/v1/admin/users",
        params={"page": 1, "per_page": 1000},
        headers=headers,
    )
    response.raise_for_status()
    payload = response.json()
    users = payload.get("users", payload if isinstance(payload, list) else [])
    wanted = email.casefold()
    return next((user for user in users if (user.get("email") or "").casefold() == wanted), None)


@router.get("")
async def list_members(request: Request):
    context = _context(request)
    url, secret = _config()
    headers = _admin_headers(secret)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{url}/rest/v1/company_members",
            params={
                "company_id": f"eq.{context.company_id}",
                "select": "user_id,role,status,created_at",
                "order": "created_at.asc",
            },
            headers=headers,
        )
        response.raise_for_status()
        memberships = response.json()
        result = []
        for membership in memberships:
            user = await _auth_user(client, url, headers, membership["user_id"])
            metadata = user.get("user_metadata") or {}
            result.append({
                **membership,
                "email": user.get("email") or "",
                "name": metadata.get("full_name") or metadata.get("name") or user.get("email") or "Employé",
                "is_current_user": membership["user_id"] == context.user_id,
                "invitation_pending": bool(user.get("invited_at") and not user.get("last_sign_in_at")),
            })
    return {"members": result, "current_role": context.role}


@router.post("/invite")
async def invite_member(payload: MemberInvite, request: Request):
    context = _context(request)
    if context.role == "admin" and payload.role != "employee":
        raise HTTPException(status_code=403, detail="Un administrateur peut uniquement ajouter un employé")

    email = str(payload.email).strip().lower()
    if not re.fullmatch(r"[^@\\s]+@[^@\\s]+\\.[^@\\s]+", email):
        raise HTTPException(status_code=400, detail="Adresse e-mail invalide")
    url, secret = _config()
    headers = _admin_headers(secret)
    async with httpx.AsyncClient(timeout=30) as client:
        user = await _find_user_by_email(client, url, headers, email)
        created = False
        if user is None:
            password = str(payload.password or "")
            if len(password) < 8:
                raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caractères")
            response = await client.post(
                f"{url}/auth/v1/admin/users",
                json={
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {"invited_to_company": context.company_id},
                },
                headers=headers,
            )
            if response.status_code >= 400:
                detail = response.json().get("msg") if response.headers.get("content-type", "").startswith("application/json") else None
                raise HTTPException(status_code=400, detail=detail or "Impossible de créer le compte employé")
            user = response.json()
            created = True

        user_id = user.get("id")
        if not user_id:
            raise HTTPException(status_code=502, detail="Compte employé introuvable")

        existing_response = await client.get(
            f"{url}/rest/v1/company_members",
            params={
                "company_id": f"eq.{context.company_id}",
                "user_id": f"eq.{user_id}",
                "select": "role,status",
                "limit": 1,
            },
            headers=headers,
        )
        existing_response.raise_for_status()
        existing = existing_response.json()
        if existing and existing[0].get("role") == "owner":
            raise HTTPException(status_code=400, detail="Le propriétaire ne peut pas être modifié")

        save_response = await client.post(
            f"{url}/rest/v1/company_members",
            params={"on_conflict": "company_id,user_id"},
            json={
                "company_id": context.company_id,
                "user_id": user_id,
                "role": payload.role,
                "status": "active",
            },
            headers={**headers, "Prefer": "resolution=merge-duplicates,return=representation"},
        )
        save_response.raise_for_status()

    return {
        "ok": True,
        "created": created,
        "email": email,
        "message": "Compte employé créé et activé" if created else "Employé ajouté à l'entreprise",
    }


@router.delete("/{user_id}")
async def remove_member(user_id: str, request: Request):
    context = _context(request)
    if user_id == context.user_id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas retirer votre propre accès")

    url, secret = _config()
    headers = _admin_headers(secret)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{url}/rest/v1/company_members",
            params={
                "company_id": f"eq.{context.company_id}",
                "user_id": f"eq.{user_id}",
                "select": "role",
                "limit": 1,
            },
            headers=headers,
        )
        response.raise_for_status()
        rows = response.json()
        if not rows:
            raise HTTPException(status_code=404, detail="Employé introuvable")
        target_role = rows[0]["role"]
        if target_role == "owner":
            raise HTTPException(status_code=400, detail="Le propriétaire ne peut pas être retiré")
        if context.role == "admin" and target_role == "admin":
            raise HTTPException(status_code=403, detail="Seul le propriétaire peut retirer un administrateur")

        delete_response = await client.delete(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{user_id}"},
            headers=headers,
        )
        delete_response.raise_for_status()

    return {"ok": True}
