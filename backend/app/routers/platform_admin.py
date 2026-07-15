"""Platform administration: directory, subscriptions, analytics and map."""
from __future__ import annotations

import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.tenancy import PlatformAdminContext

router = APIRouter(prefix="/platform-admin", tags=["platform-admin"])


class SubscriptionUpdate(BaseModel):
    plan_code: Literal["founder_free", "starter", "professional", "premium"]
    billing_cycle: Literal["free", "monthly", "quarterly", "annual"]
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


def _parse_date(value: object) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _period_start(period: str, now: datetime) -> datetime | None:
    if period == "30d":
        return now - timedelta(days=30)
    if period == "90d":
        return now - timedelta(days=90)
    if period == "year":
        return datetime(now.year, 1, 1, tzinfo=timezone.utc)
    return None


def _bucket_key(value: datetime, period: str) -> tuple[str, str]:
    if period == "30d":
        return value.strftime("%Y-%m-%d"), value.strftime("%d/%m")
    if period == "90d":
        monday = value - timedelta(days=value.weekday())
        return monday.strftime("%Y-%m-%d"), f"S{monday.isocalendar().week}"
    return value.strftime("%Y-%m"), value.strftime("%m/%Y")


def _selected_ids(value: str | None) -> set[str] | None:
    if not value:
        return None
    ids = {item.strip() for item in value.split(",") if item.strip()}
    return ids or None


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


async def _load_platform_rows(client: httpx.AsyncClient, url: str, headers: dict[str, str]):
    companies_response, memberships_response, subscriptions_response = await __import__("asyncio").gather(
        client.get(
            f"{url}/rest/v1/companies",
            params={
                "select": "id,name,legal_name,siret,email,phone,city,status,logo_url,created_at,updated_at",
                "order": "created_at.desc",
            },
            headers=headers,
        ),
        client.get(
            f"{url}/rest/v1/company_members",
            params={"select": "company_id,user_id,role,status,created_at"},
            headers=headers,
        ),
        client.get(
            f"{url}/rest/v1/company_subscriptions",
            params={
                "select": "company_id,plan_code,billing_cycle,status,current_period_start,current_period_end,trial_ends_at,cancel_at_period_end,blocked_reason,updated_at"
            },
            headers=headers,
        ),
    )
    companies_response.raise_for_status()
    memberships_response.raise_for_status()
    subscriptions_response.raise_for_status()
    return companies_response.json(), memberships_response.json(), subscriptions_response.json()


def _company_rows(companies: list[dict], memberships: list[dict], subscriptions: list[dict]) -> list[dict]:
    subscription_by_company = {item["company_id"]: item for item in subscriptions}
    active_members: dict[str, list[dict]] = defaultdict(list)
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
    return rows


@router.get("/overview")
async def overview(request: Request):
    _context(request)
    url, _, headers = _config()
    async with httpx.AsyncClient(timeout=25) as client:
        companies, memberships, subscriptions = await _load_platform_rows(client, url, headers)
    rows = _company_rows(companies, memberships, subscriptions)
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
            "subscriptions_quarterly": cycles["quarterly"],
            "subscriptions_annual": cycles["annual"],
            "subscriptions_free": cycles["free"],
            "subscriptions_past_due": statuses["past_due"] + statuses["unpaid"] + statuses["suspended"],
        },
        "companies": rows,
    }


@router.get("/analytics")
async def analytics(
    request: Request,
    period: Literal["30d", "90d", "year", "all"] = Query("30d"),
    company_ids: str | None = Query(None),
):
    """Aggregate company activity server-side; raw tenant documents never reach another company."""
    _context(request)
    selected = _selected_ids(company_ids)
    now = datetime.now(timezone.utc)
    start = _period_start(period, now)
    url, _, headers = _config()
    async with httpx.AsyncClient(timeout=30) as client:
        companies, memberships, _ = await _load_platform_rows(client, url, headers)
        documents_response = await client.get(
            f"{url}/rest/v1/app_documents",
            params={
                "select": "company_id,collection,document",
                "collection": "in.(appointments,clients)",
                "limit": "50000",
            },
            headers=headers,
        )
        documents_response.raise_for_status()

    company_by_id = {company["id"]: company for company in companies}
    allowed = set(company_by_id)
    if selected is not None:
        allowed &= selected
    employee_counts = Counter(
        member["company_id"] for member in memberships
        if member.get("status") == "active" and member.get("role") != "owner"
    )
    company_stats: dict[str, dict] = {
        company_id: {
            "company_id": company_id,
            "company_name": company_by_id[company_id].get("name") or "Entreprise",
            "revenue": 0.0,
            "appointments": 0,
            "completed": 0,
            "canceled": 0,
            "clients_total": 0,
            "new_clients": 0,
            "employee_count": employee_counts[company_id],
            "service_counts": Counter(),
            "service_revenue": Counter(),
        }
        for company_id in allowed
    }
    trend: dict[str, dict] = {}
    map_points: list[dict] = []

    for row in documents_response.json():
        company_id = row.get("company_id")
        if company_id not in allowed:
            continue
        doc = row.get("document") or {}
        stats = company_stats[company_id]
        if row.get("collection") == "clients":
            stats["clients_total"] += 1
            created = _parse_date(doc.get("created_at"))
            if created and (start is None or created >= start):
                stats["new_clients"] += 1
            lat, lng = doc.get("lat"), doc.get("lng")
            if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
                map_points.append({
                    "id": doc.get("id"),
                    "company_id": company_id,
                    "company_name": stats["company_name"],
                    "label": " ".join(filter(None, [doc.get("first_name"), doc.get("last_name")])) or "Client",
                    "lat": lat,
                    "lng": lng,
                    "type": "client",
                    "address": doc.get("address") or "",
                })
            continue

        event_date = _parse_date(doc.get("finished_at") or doc.get("date") or doc.get("created_at"))
        if not event_date or (start is not None and event_date < start):
            continue
        stats["appointments"] += 1
        status = doc.get("status") or "scheduled"
        if status in {"canceled", "cancelled", "annule", "annulé"}:
            stats["canceled"] += 1
        if status == "done":
            stats["completed"] += 1
            amount = float(doc.get("price_final") or 0)
            stats["revenue"] += amount
            services = doc.get("services") or []
            for service in services:
                name = service.get("name") or "Prestation"
                stats["service_counts"][name] += 1
                if not service.get("is_gift"):
                    stats["service_revenue"][name] += float(service.get("price") or 0)
            key, label = _bucket_key(event_date, period)
            bucket = trend.setdefault(key, {"key": key, "label": label, "revenue": 0.0, "appointments": 0})
            bucket["revenue"] += amount
            bucket["appointments"] += 1

    top_services = Counter()
    top_service_revenue = Counter()
    for stats in company_stats.values():
        top_services.update(stats.pop("service_counts"))
        top_service_revenue.update(stats.pop("service_revenue"))
        stats["revenue"] = round(stats["revenue"], 2)
        stats["average_basket"] = round(stats["revenue"] / stats["completed"], 2) if stats["completed"] else 0.0
        stats["cancellation_rate"] = round(stats["canceled"] / stats["appointments"] * 100, 1) if stats["appointments"] else 0.0
        stats["completion_rate"] = round(stats["completed"] / stats["appointments"] * 100, 1) if stats["appointments"] else 0.0

    ranking = sorted(company_stats.values(), key=lambda item: (item["revenue"], item["completed"]), reverse=True)
    totals = {
        "revenue": round(sum(item["revenue"] for item in ranking), 2),
        "appointments": sum(item["appointments"] for item in ranking),
        "completed": sum(item["completed"] for item in ranking),
        "clients_total": sum(item["clients_total"] for item in ranking),
        "new_clients": sum(item["new_clients"] for item in ranking),
        "employees": sum(item["employee_count"] for item in ranking),
    }
    totals["average_basket"] = round(totals["revenue"] / totals["completed"], 2) if totals["completed"] else 0.0
    totals["cancellation_rate"] = round(sum(item["canceled"] for item in ranking) / totals["appointments"] * 100, 1) if totals["appointments"] else 0.0

    return {
        "period": period,
        "generated_at": now.isoformat(),
        "totals": totals,
        "trend": [{**item, "revenue": round(item["revenue"], 2)} for _, item in sorted(trend.items())],
        "ranking": ranking,
        "top_services": [
            {"name": name, "count": count, "revenue": round(top_service_revenue[name], 2)}
            for name, count in top_services.most_common(8)
        ],
        "map": {"points": map_points, "located_clients": len(map_points)},
    }


@router.patch("/companies/{company_id}/subscription")
async def update_subscription(company_id: str, payload: SubscriptionUpdate, request: Request):
    context = _context(request)
    url, _, headers = _config()
    body = {"company_id": company_id, **payload.model_dump()}
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
        await _audit(client, url, headers, context, "subscription.updated", company_id, {
            "company_name": companies[0].get("name"),
            "plan_code": payload.plan_code,
            "billing_cycle": payload.billing_cycle,
            "status": payload.status,
        })
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
        await _audit(client, url, headers, context, "company.support_access_started", company_id, {
            "company_name": companies[0].get("name"),
        })
    return {"ok": True, "company": companies[0]}

