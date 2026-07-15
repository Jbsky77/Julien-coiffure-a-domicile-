"""Authentication, tenant isolation and subscription enforcement."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException, Request

from app.db import set_active_company


ACTIVE_SUBSCRIPTION_STATUSES = {"free", "trialing", "active"}


@dataclass(frozen=True)
class CompanyContext:
    user_id: str
    email: str
    company_id: str
    role: str
    permissions: dict[str, bool] | None = None
    company_name: str = ""
    is_platform_admin: bool = False
    subscription_status: str = ""


@dataclass(frozen=True)
class PlatformAdminContext:
    user_id: str
    email: str


def _supabase_config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    secret = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not secret:
        raise RuntimeError("Supabase server configuration is missing")
    return url, secret


def _service_headers(secret: str) -> dict[str, str]:
    return {
        "apikey": secret,
        "Authorization": f"Bearer {secret}",
        "Content-Type": "application/json",
    }


async def _verified_user(client: httpx.AsyncClient, url: str, secret: str, request: Request) -> dict[str, Any]:
    authorization = request.headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    response = await client.get(
        f"{url}/auth/v1/user",
        headers={"apikey": secret, "Authorization": authorization},
    )
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    user = response.json()
    if not user.get("id"):
        raise HTTPException(status_code=401, detail="Invalid user")
    return user


async def _platform_admin(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    user_id: str,
) -> bool:
    response = await client.get(
        f"{url}/rest/v1/platform_admins",
        params={"user_id": f"eq.{user_id}", "select": "user_id", "limit": 1},
        headers=headers,
    )
    response.raise_for_status()
    return bool(response.json())


async def require_platform_admin_context(request: Request) -> PlatformAdminContext:
    url, secret = _supabase_config()
    headers = _service_headers(secret)
    async with httpx.AsyncClient(timeout=20) as client:
        user = await _verified_user(client, url, secret, request)
        if not await _platform_admin(client, url, headers, user["id"]):
            raise HTTPException(status_code=403, detail="Platform administrator access required")
    context = PlatformAdminContext(user_id=user["id"], email=user.get("email") or "")
    request.state.platform_admin = context
    return context


async def require_company_context(request: Request):
    url, secret = _supabase_config()
    headers = _service_headers(secret)
    requested_company = request.headers.get("x-company-id")

    async with httpx.AsyncClient(timeout=20) as client:
        user = await _verified_user(client, url, secret, request)
        user_id = user["id"]
        is_platform_admin = await _platform_admin(client, url, headers, user_id)

        if is_platform_admin:
            if not requested_company:
                raise HTTPException(status_code=409, detail="Select a company to open")
            company_response = await client.get(
                f"{url}/rest/v1/companies",
                params={
                    "id": f"eq.{requested_company}",
                    "select": "id,name,status",
                    "limit": 1,
                },
                headers=headers,
            )
            company_response.raise_for_status()
            company_rows = company_response.json()
            if not company_rows:
                raise HTTPException(status_code=404, detail="Company not found")
            company = company_rows[0]
            subscription_response = await client.get(
                f"{url}/rest/v1/company_subscriptions",
                params={
                    "company_id": f"eq.{requested_company}",
                    "select": "status",
                    "limit": 1,
                },
                headers=headers,
            )
            subscription_response.raise_for_status()
            subscriptions = subscription_response.json()
            subscription_status = subscriptions[0]["status"] if subscriptions else "incomplete"
            context = CompanyContext(
                user_id=user_id,
                email=user.get("email") or "",
                company_id=requested_company,
                role="platform_admin",
                company_name=company.get("name") or "",
                is_platform_admin=True,
                subscription_status=subscription_status,
            )
        else:
            accepting_invite = request.url.path == "/api/company/members/accept"
            membership_response = await client.get(
                f"{url}/rest/v1/company_members",
                params={
                    "user_id": f"eq.{user_id}",
                    "status": "in.(active,invited)" if accepting_invite else "eq.active",
                    "select": "company_id,role,status,permissions",
                    "order": "created_at.asc",
                },
                headers=headers,
            )
            membership_response.raise_for_status()
            memberships = membership_response.json()

            if requested_company:
                membership = next((item for item in memberships if item["company_id"] == requested_company), None)
                if not membership:
                    raise HTTPException(status_code=403, detail="Company access denied")
            elif len(memberships) == 1:
                membership = memberships[0]
            elif not memberships:
                raise HTTPException(status_code=403, detail="No active company membership")
            else:
                raise HTTPException(status_code=409, detail="Select an active company")

            company_response = await client.get(
                f"{url}/rest/v1/companies",
                params={
                    "id": f"eq.{membership['company_id']}",
                    "select": "id,name,status",
                    "limit": 1,
                },
                headers=headers,
            )
            company_response.raise_for_status()
            companies = company_response.json()
            if not companies:
                raise HTTPException(status_code=404, detail="Company not found")
            company = companies[0]

            subscription_response = await client.get(
                f"{url}/rest/v1/company_subscriptions",
                params={
                    "company_id": f"eq.{membership['company_id']}",
                    "select": "status,current_period_end,trial_ends_at,blocked_reason",
                    "limit": 1,
                },
                headers=headers,
            )
            subscription_response.raise_for_status()
            subscriptions = subscription_response.json()
            subscription = subscriptions[0] if subscriptions else {"status": "incomplete"}
            subscription_status = subscription.get("status") or "incomplete"

            if company.get("status") != "active" or subscription_status not in ACTIVE_SUBSCRIPTION_STATUSES:
                raise HTTPException(
                    status_code=402,
                    detail={
                        "code": "subscription_required",
                        "status": subscription_status,
                        "message": subscription.get("blocked_reason") or "Votre abonnement doit être régularisé.",
                    },
                )

            context = CompanyContext(
                user_id=user_id,
                email=user.get("email") or "",
                company_id=membership["company_id"],
                role=membership["role"],
                permissions=membership.get("permissions") or {},
                company_name=company.get("name") or "",
                subscription_status=subscription_status,
            )

    request.state.company = context
    return set_active_company(context.company_id), context


def require_role(request: Request, *allowed_roles: str) -> CompanyContext:
    context = getattr(request.state, "company", None)
    if context is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if context.is_platform_admin:
        return context
    if context.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient company role")
    return context


ROLE_PERMISSIONS = {
    "owner": {"*"},
    "admin": {"appointments_all", "appointments_own", "clients", "stock", "product_usage", "history", "orders", "team"},
    "reception": {"appointments_all", "appointments_own", "clients", "history"},
    "employee": {"appointments_own", "clients", "product_usage", "history"},
    "accountant": {"history"},
}


def has_permission(context: CompanyContext, permission: str) -> bool:
    if context.is_platform_admin or context.role == "owner":
        return True
    explicit = context.permissions or {}
    if permission in explicit:
        return bool(explicit[permission])
    defaults = ROLE_PERMISSIONS.get(context.role, set())
    return "*" in defaults or permission in defaults


def require_permission(request: Request, permission: str) -> CompanyContext:
    context = getattr(request.state, "company", None)
    if context is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not has_permission(context, permission):
        raise HTTPException(status_code=403, detail="Permission insuffisante")
    return context


def can_access_appointment(context: CompanyContext, appointment: dict) -> bool:
    if has_permission(context, "appointments_all"):
        return True
    return has_permission(context, "appointments_own") and appointment.get("assigned_employee_id") == context.user_id
