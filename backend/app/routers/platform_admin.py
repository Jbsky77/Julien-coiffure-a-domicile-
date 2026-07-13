"""Platform administration: company directory, subscriptions and audited support access."""
from __future__ import annotations

import os
from collections import Counter, defaultdict
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.tenancy import PlatformAdminContext

router = APIRouter(prefix="/platform-admin", tags=["platform-admin"])


class SubscriptionUpdate(BaseModel):
    plan_code: Literal["founder_free", "starter", "professional", "premium"]
    billing_cycle: Literal["free", "monthly", "annual"]
    status: Literal["free", "trialing", "active", "past_due", "unpaid", "canceled", "suspended", "incomplete"]
    current_period_end: Optional[str] = None
    blocked_reason: Optional[str] = None


def _config() -> tuple[str, str, dict[str, str]]:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    secret = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not secret:
        raise RuntimeError("Supabase server configuration is missing")
    return url, secret, {
        "apikey": secret,
        "Authorization": f"Bearer {secret}",
        "Content-Type": "application/json",
    }


def _context(request: Request) -> PlatformAdminContext:
    context = getattr(request.state, "platform_admin", None)
    if context is None:
        raise HTTPException(status_code=403, detail="Platform administrator access required")
    return context


async def _audit(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    context: PlatformAdminContext,
    action: str,
    company_id: str | None,
    metadata: dict | None = None,
) -> None:
    response = await client.post(
        f"{url}/rest/v1/platform_audit_logs",
        json={
            "admin_user_id": context.user_id,
            "company_id": company_id,
            "action": action,
            "metadata": metadata or {},
        },
        headers={**headers, "Prefer": "return=minimal"},
    )
    response.raise_for_status()


@router.get("/overview")
async def overview(request: Request):
    _context(request)
    url, _, headers = _config()
    async with httpx.AsyncClient(timeout=25) as client:
        companies_response = await client.get(
            f"{url}/rest/v1/companies",
            params={
                "select": "id,name,legal_name,siret,email,phone,city,status,logo_url,created_at,updated_at",
                "order": "created_at.desc",
            },
            headers=headers,
        )
        memberships_response = await client.get(
            f"{url}/rest/v1/company_members",
            params={"select": "company_id,user_id,role,status,created_at"},
            headers=headers,
        )
        subscriptions_response = await client.get(
            f"{url}/rest/v1/company_subscriptions",
            params={
                "select": "company_id,plan_code,billing_cycle,status,current_period_start,current_period_end,trial_ends_at,cancel_at_period_end,blocked_reason,updated_at"
            },
            headers=headers,
        )
        companies_response.raise_for_status()
        memberships_response.raise_for_status()
        subscriptions_response.raise_for_status()

    companies = companies_response.json()
    memberships = memberships_response.json()
    subscriptions = subscriptions_response.json()
    subscription_by_company = {item["company_id"]: item for item in subscriptions}
    active_members = defaultdict(list)
    for member in memberships:
        if member.get("status") == "active":
            active_members[member["company_id"]].append(member)

    rows = []
    for company in companies:
        subscription = subscription_by_company.get(company["id"], {
            "plan_code": "starter",
            "billing_cycle": "monthly",
            "status": "incomplete",
            "current_period_end": None,
            "blocked_reason": "Abonnement non configuré",
        })
        members = active_members[company["id"]]
        rows.append({
            **company,
            "employee_count": sum(1 for member in members if member.get("role") != "owner"),
            "user_count": len(members),
            "subscription": subscription,
        })

    cycles = Counter(item.get("billing_cycle") or "unknown" for item in subscriptions)
    statuses = Counter(item.get("status") or "incomplete" for item in subscriptions)
    unique_users = {member["user_id"] for member in memberships if member.get("status") == "active"}
    return {
        "stats": {
            "companies_total": len(companies),
            "companies_active": sum(1 for company in companies if company.get("status") == "active"),
            "companies_blocked": sum(
                1 for row in rows
                if row["subscription"].get("status") not in {"free", "trialing", "active"}
                or row.get("status") != "active"
            ),
            "users_total": len(unique_users),
            "subscriptions_monthly": cycles["monthly"],
            "subscriptions_annual": cycles["annual"],
            "subscriptions_free": cycles["free"],
            "subscriptions_past_due": statuses["past_due"] + statuses["unpaid"] + statuses["suspended"],
        },
        "companies": rows,
    }


@router.patch("/companies/{company_id}/subscription")
async def update_subscription(company_id: str, payload: SubscriptionUpdate, request: Request):
    context = _context(request)
    url, _, headers = _config()
    body = {
        "company_id": company_id,
        **payload.model_dump(),
    }
    async with httpx.AsyncClient(timeout=25) as client:
        company_response = await client.get(
            f"{url}/rest/v1/companies",
            params={"id": f"eq.{company_id}", "select": "id,name", "limit": 1},
            headers=headers,
        )
        company_response.raise_for_status()
        companies = company_response.json()
        if not companies:
            raise HTTPException(status_code=404, detail="Entreprise introuvable")

        save_response = await client.post(
            f"{url}/rest/v1/company_subscriptions",
            params={"on_conflict": "company_id"},
            json=body,
            headers={**headers, "Prefer": "resolution=merge-duplicates,return=representation"},
        )
        save_response.raise_for_status()
        await _audit(
            client,
            url,
            headers,
            context,
            "subscription.updated",
            company_id,
            {
                "company_name": companies[0].get("name"),
                "plan_code": payload.plan_code,
                "billing_cycle": payload.billing_cycle,
                "status": payload.status,
            },
        )
    return {"ok": True, "subscription": save_response.json()[0]}


@router.post("/companies/{company_id}/impersonate")
async def impersonate(company_id: str, request: Request):
    context = _context(request)
    url, _, headers = _config()
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{url}/rest/v1/companies",
            params={"id": f"eq.{company_id}", "select": "id,name,status", "limit": 1},
            headers=headers,
        )
        response.raise_for_status()
        companies = response.json()
        if not companies:
            raise HTTPException(status_code=404, detail="Entreprise introuvable")
        await _audit(
            client,
            url,
            headers,
            context,
            "company.support_access_started",
            company_id,
            {"company_name": companies[0].get("name")},
        )
    return {"ok": True, "company": companies[0]}
