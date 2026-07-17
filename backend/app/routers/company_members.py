"""Secure company team management."""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.db import db
from app.tenancy import CompanyContext, require_role

router = APIRouter(prefix="/company/members", tags=["company-members"])


class MemberInvite(BaseModel):
    email: str
    name: str = ""
    role: Literal["admin", "employee", "reception"] = "employee"
    permissions: dict[str, bool] = Field(default_factory=dict)




class MemberCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str
    phone: str = Field(default="", max_length=30)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["admin", "employee", "reception"] = "employee"
    permissions: dict[str, bool] = Field(default_factory=dict)


class MemberUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: str | None = None
    phone: str | None = Field(default=None, max_length=30)
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


@router.post("/create")
async def create_member(payload: MemberCreate, request: Request):
    """Create an active employee account without sending an invitation."""
    context = _manager(request)
    if context.role == "admin" and payload.role == "admin":
        raise HTTPException(403, "Seul le propriétaire peut ajouter un administrateur")

    email = payload.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(400, "Adresse e-mail invalide")
    first_name = payload.first_name.strip()
    last_name = payload.last_name.strip()
    if not first_name or not last_name:
        raise HTTPException(400, "Le prénom et le nom sont obligatoires")

    url, secret = _config()
    headers = _headers(secret)
    now = datetime.now(timezone.utc)
    user_id = None
    async with httpx.AsyncClient(timeout=30) as client:
        if await _find_user(client, url, headers, email):
            raise HTTPException(409, "Un compte existe déjà avec cette adresse e-mail")

        created = await client.post(
            f"{url}/auth/v1/admin/users",
            json={
                "email": email,
                "password": payload.password,
                "email_confirm": True,
                "user_metadata": {
                    "first_name": first_name,
                    "last_name": last_name,
                    "full_name": f"{first_name} {last_name}",
                    "phone": payload.phone.strip(),
                },
            },
            headers=headers,
        )
        if created.status_code >= 400:
            body = created.json()
            detail = body.get("msg") or body.get("message") or "Création du compte impossible"
            raise HTTPException(400, detail)
        user_id = created.json().get("id")
        if not user_id:
            raise HTTPException(502, "Compte employé introuvable après sa création")

        membership = {
            "company_id": context.company_id,
            "user_id": user_id,
            "role": payload.role,
            "status": "active",
            "permissions": payload.permissions,
            "display_name": f"{first_name} {last_name}",
            "invited_by": context.user_id,
            "invited_at": None,
            "invitation_expires_at": None,
            "joined_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        saved = await client.post(
            f"{url}/rest/v1/company_members",
            json=membership,
            headers={**headers, "Prefer": "return=representation"},
        )
        if saved.status_code >= 400:
            await client.delete(f"{url}/auth/v1/admin/users/{user_id}", headers=headers)
            raise HTTPException(400, "Le compte n'a pas pu être rattaché à l'entreprise")

    await db.audit_logs.insert_one({
        "id": f"aud_{os.urandom(6).hex()}", "action": "member.created",
        "entity_type": "company_member", "entity_id": user_id,
        "actor_user_id": context.user_id,
        "details": {"role": payload.role}, "created_at": now.isoformat(),
    })
    return {"ok": True, "message": "Employé créé et accès activé"}


@router.get("")
async def list_members(request: Request):
    context = getattr(request.state, "company", None)
    if context is None:
        raise HTTPException(401, "Authentification requise")
    url, secret = _config()
    headers = _headers(secret)
    can_manage = context.role in {"owner", "admin"} or context.is_platform_admin
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"{url}/rest/v1/company_members",
            params={
                "company_id": f"eq.{context.company_id}",
                **({} if can_manage else {"status": "eq.active"}),
                "select": "*" if can_manage else "user_id,display_name,role,status",
                "order": "created_at.asc",
            },
            headers=headers,
        )
        response.raise_for_status()
        result = []
        for membership in response.json():
            user = await _auth_user(client, url, headers, membership["user_id"])
            metadata = user.get("user_metadata") or {}
            result.append({
                **membership,
                "email": (user.get("email") or "") if can_manage else "",
                "first_name": metadata.get("first_name") or "",
                "last_name": metadata.get("last_name") or "",
                "phone": metadata.get("phone") or "",
                "name": membership.get("display_name") or metadata.get("full_name") or user.get("email") or "Employé",
                "is_current_user": membership["user_id"] == context.user_id,
                "invitation_pending": membership.get("status") == "invited",
            })
    return {"members": result, "current_role": context.role}


@router.post("/invite")
async def invite_member(payload: MemberInvite, request: Request):
    context = _manager(request)
    if context.role == "admin" and payload.role == "admin":
        raise HTTPException(403, "Seul le propriétaire peut ajouter un administrateur")
    email = payload.email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(400, "Adresse e-mail invalide")
    url, secret = _config()
    headers = _headers(secret)
    now = datetime.now(timezone.utc)
    async with httpx.AsyncClient(timeout=30) as client:
        user = await _find_user(client, url, headers, email)
        new_user = user is None
        redirect_base = f"{os.environ.get('PUBLIC_APP_URL', 'https://julien-coiffure-domicile.vercel.app').rstrip('/')}/accept-invite?company={context.company_id}"
        if new_user:
            redirect = f"{redirect_base}&existing=0"
            response = await client.post(
                f"{url}/auth/v1/invite",
                params={"redirect_to": redirect},
                json={"email": email, "data": {"full_name": payload.name.strip(), "invited_to_company": context.company_id}},
                headers=headers,
            )
            if response.status_code >= 400:
                raise HTTPException(400, response.json().get("msg") or "Impossible d'envoyer l'invitation")
            user = response.json()
        else:
            redirect = f"{redirect_base}&existing=1"
            # Existing users receive a passwordless link so they are explicitly
            # informed and can accept the new company membership themselves.
            response = await client.post(
                f"{url}/auth/v1/otp",
                params={"redirect_to": redirect},
                json={"email": email, "create_user": False},
                headers=headers,
            )
            if response.status_code >= 400:
                raise HTTPException(400, "Impossible d'envoyer l'e-mail d'invitation")
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(502, "Compte employé introuvable")
        check = await client.get(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{user_id}", "select": "role", "limit": 1},
            headers=headers,
        )
        check.raise_for_status()
        if check.json() and check.json()[0]["role"] == "owner":
            raise HTTPException(400, "Le propriétaire ne peut pas être modifié")
        body = {
            "company_id": context.company_id,
            "user_id": user_id,
            "role": payload.role,
            "status": "invited",
            "permissions": payload.permissions,
            "display_name": payload.name.strip() or None,
            "invited_by": context.user_id,
            "invited_at": now.isoformat(),
            "invitation_expires_at": (now + timedelta(hours=1)).isoformat(),
            "joined_at": None,
            "updated_at": now.isoformat(),
        }
        saved = await client.post(
            f"{url}/rest/v1/company_members",
            params={"on_conflict": "company_id,user_id"},
            json=body,
            headers={**headers, "Prefer": "resolution=merge-duplicates,return=representation"},
        )
        saved.raise_for_status()
    return {"ok": True, "message": "Invitation envoyée par e-mail"}


@router.post("/accept")
async def accept_invitation(request: Request):
    context = getattr(request.state, "company", None)
    if context is None:
        raise HTTPException(401, "Session d'invitation requise")
    url, secret = _config()
    headers = _headers(secret)
    now = datetime.now(timezone.utc)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{context.user_id}", "select": "status,invitation_expires_at", "limit": 1},
            headers=headers,
        )
        response.raise_for_status()
        rows = response.json()
        if not rows or rows[0].get("status") != "invited":
            raise HTTPException(409, "Cette invitation a déjà été utilisée ou révoquée")
        expires_at = rows[0].get("invitation_expires_at")
        if not expires_at or datetime.fromisoformat(expires_at.replace("Z", "+00:00")) <= now:
            raise HTTPException(410, "Cette invitation a expiré. Demandez un nouvel envoi.")
        activation = await client.patch(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{context.user_id}", "status": "eq.invited"},
            json={"status": "active", "joined_at": now.isoformat(), "invitation_expires_at": None, "updated_at": now.isoformat()},
            headers={**headers, "Prefer": "return=representation"},
        )
        activation.raise_for_status()
        if not activation.json():
            raise HTTPException(409, "Invitation déjà utilisée")
    await db.audit_logs.insert_one({
        "id": f"aud_{os.urandom(6).hex()}", "action": "member.invitation_accepted",
        "entity_type": "company_member", "entity_id": context.user_id,
        "actor_user_id": context.user_id, "details": {}, "created_at": now.isoformat(),
    })
    return {"ok": True, "company_id": context.company_id}


@router.post("/{user_id}/resend")
async def resend_invitation(user_id: str, request: Request):
    context = _manager(request)
    url, secret = _config()
    headers = _headers(secret)
    redirect_base = f"{os.environ.get('PUBLIC_APP_URL', 'https://julien-coiffure-domicile.vercel.app').rstrip('/')}/accept-invite?company={context.company_id}"
    now = datetime.now(timezone.utc)
    async with httpx.AsyncClient(timeout=20) as client:
        membership = await client.get(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{user_id}", "status": "eq.invited", "select": "user_id", "limit": 1},
            headers=headers,
        )
        membership.raise_for_status()
        if not membership.json():
            raise HTTPException(409, "Aucune invitation en attente")
        auth_user = await _auth_user(client, url, headers, user_id)
        email = auth_user.get("email")
        if not email:
            raise HTTPException(404, "Adresse e-mail introuvable")
        redirect = f"{redirect_base}&existing={'1' if auth_user.get('confirmed_at') else '0'}"
        sent = await client.post(
            f"{url}/auth/v1/otp", params={"redirect_to": redirect},
            json={"email": email, "create_user": False}, headers=headers,
        )
        if sent.status_code >= 400:
            raise HTTPException(400, "Impossible de renvoyer l'invitation")
        renewed = await client.patch(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{user_id}"},
            json={"invited_at": now.isoformat(), "invitation_expires_at": (now + timedelta(hours=1)).isoformat(), "updated_at": now.isoformat()},
            headers=headers,
        )
        renewed.raise_for_status()
    return {"ok": True, "message": "Invitation renvoyée"}


@router.post("/{user_id}/revoke")
async def revoke_invitation(user_id: str, request: Request):
    context = _manager(request)
    url, secret = _config()
    headers = _headers(secret)
    async with httpx.AsyncClient(timeout=20) as client:
        revoked = await client.patch(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{user_id}", "status": "eq.invited"},
            json={"status": "inactive", "invitation_expires_at": None, "updated_at": datetime.now(timezone.utc).isoformat()},
            headers={**headers, "Prefer": "return=representation"},
        )
        revoked.raise_for_status()
        if not revoked.json():
            raise HTTPException(409, "Aucune invitation en attente")
    return {"ok": True}


@router.patch("/{user_id}")
async def update_member(user_id: str, payload: MemberUpdate, request: Request):
    context = _manager(request)
    if user_id == context.user_id and (payload.role is not None or payload.status is not None):
        raise HTTPException(400, "Vous ne pouvez pas modifier votre propre rôle ou statut")
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
            raise HTTPException(404, "Employé introuvable")
        target = rows[0]
        if target["role"] == "owner":
            raise HTTPException(400, "Le propriétaire ne peut pas être modifié")
        if context.role == "admin" and (target["role"] == "admin" or payload.role == "admin"):
            raise HTTPException(403, "Seul le propriétaire gère les administrateurs")
        auth_user = await _auth_user(client, url, headers, user_id)
        metadata = auth_user.get("user_metadata") or {}
        first_name = (payload.first_name if payload.first_name is not None else metadata.get("first_name", "")).strip()
        last_name = (payload.last_name if payload.last_name is not None else metadata.get("last_name", "")).strip()
        phone = (payload.phone if payload.phone is not None else metadata.get("phone", "")).strip()
        auth_changes = {}
        if payload.first_name is not None or payload.last_name is not None or payload.phone is not None:
            if not first_name or not last_name:
                raise HTTPException(400, "Le prénom et le nom sont obligatoires")
            auth_changes["user_metadata"] = {
                **metadata,
                "first_name": first_name,
                "last_name": last_name,
                "full_name": f"{first_name} {last_name}",
                "phone": phone,
            }
        if payload.email is not None:
            email = payload.email.strip().lower()
            if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
                raise HTTPException(400, "Adresse e-mail invalide")
            auth_changes["email"] = email
            auth_changes["email_confirm"] = True
        if auth_changes:
            auth_update = await client.put(
                f"{url}/auth/v1/admin/users/{user_id}",
                json=auth_changes,
                headers=headers,
            )
            if auth_update.status_code >= 400:
                body = auth_update.json()
                raise HTTPException(400, body.get("msg") or body.get("message") or "Modification du compte impossible")

        changes = payload.model_dump(exclude_none=True, exclude={"first_name", "last_name", "email", "phone"})
        if payload.first_name is not None or payload.last_name is not None:
            changes["display_name"] = f"{first_name} {last_name}"
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
        raise HTTPException(400, "Vous ne pouvez pas retirer votre propre accès")
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
            raise HTTPException(404, "Employé introuvable")
        if rows[0]["role"] == "owner":
            raise HTTPException(400, "Le propriétaire ne peut pas être retiré")
        if context.role == "admin" and rows[0]["role"] == "admin":
            raise HTTPException(403, "Seul le propriétaire peut retirer un administrateur")
        updated = await client.patch(
            f"{url}/rest/v1/company_members",
            params={"company_id": f"eq.{context.company_id}", "user_id": f"eq.{user_id}"},
            json={"status": "inactive", "updated_at": datetime.now(timezone.utc).isoformat()},
            headers=headers,
        )
        updated.raise_for_status()
    return {"ok": True}
