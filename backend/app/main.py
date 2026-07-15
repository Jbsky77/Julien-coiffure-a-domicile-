"""FastAPI app entrypoint. Mounts every domain router under /api."""
import logging
import os
import hashlib
import re
import time
from collections import defaultdict, deque

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from app.db import client, db, reset_active_company, set_active_company
from app.routers import (
    accounting,
    analytics,
    appointment_requests,
    appointments,
    auth,
    backup,
    calendar,
    clients,
    company_members,
    dashboard,
    geocode,
    insights,
    photos,
    pin,
    payroll,
    platform_admin,
    prospection,
    public,
    public_booking,
    reminders,
    services as services_router,
    settings as settings_router,
    slots,
    stock,
    tour,
    travel,
)
from app.routers.pin import _token_is_valid, _read_security
from app.routers.services import ensure_default_services, migrate_service_durations
from app.services.migrations import backfill_client_access_tokens, remove_legacy_referrals
from app.services.settings import get_settings
from app.tenancy import require_company_context, require_platform_admin_context, require_permission, require_role

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI()

# Order matters: clients router exposes /clients/status BEFORE /clients/{cid} (verified inside the file).
ROUTERS = [
    auth.router,
    pin.router,
    platform_admin.router,
    settings_router.router,
    services_router.router,
    company_members.router,
    clients.router,
    photos.router,
    geocode.router,
    tour.router,
    slots.router,
    insights.router,
    appointments.router,
    accounting.router,
    payroll.router,
    analytics.router,
    calendar.router,
    stock.router,
    dashboard.router,
    public.router,
    public_booking.router,
    appointment_requests.router,
    prospection.router,
    backup.router,
    reminders.router,
    travel.router,
]
for r in ROUTERS:
    app.include_router(r, prefix="/api")


# ---- PIN lock middleware ---------------------------------------------
# Any path under /api requires a valid X-Pin-Token header once a PIN is set.
# Exceptions: PIN routes themselves, iCal feed (uses its own token),
# and the FastAPI docs.
_OPEN_PATHS = {
    "/api/pin/status",
    "/api/pin/unlock",
    "/api/pin/set",
}

_LOCAL_RATE_BUCKETS: dict[str, deque] = defaultdict(deque)


def _rate_rule(path: str, method: str) -> tuple[int, int] | None:
    if path.endswith("/pdf") and path.startswith("/api/public/client/"):
        return 10, 60
    if method == "POST" and "/booking-requests" in path and path.startswith("/api/public/sites/"):
        return 10, 600
    if path.startswith("/api/public/client/"):
        return 120, 60
    if path.startswith("/api/public/sites/"):
        return 120, 60
    return None


async def _enforce_rate_limit(request: Request) -> None:
    rule = _rate_rule(request.url.path, request.method)
    if not rule:
        return
    limit, window_seconds = rule
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    client_ip = forwarded or (request.client.host if request.client else "unknown")
    route_group = re.sub(r"/api/public/client/[^/]+", "/api/public/client/:token", request.url.path)
    route_group = re.sub(r"/api/public/sites/[^/]+", "/api/public/sites/:site", route_group)
    key = hashlib.sha256(f"{client_ip}:{request.method}:{route_group}".encode()).hexdigest()
    try:
        allowed = await db.rpc("consume_rate_limit", {
            "p_key": key, "p_limit": limit, "p_window_seconds": window_seconds,
        })
        if not allowed:
            raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez dans quelques instants.")
        return
    except HTTPException:
        raise
    except Exception:
        # Safe fallback for local development or before the migration is applied.
        now = time.monotonic()
        bucket = _LOCAL_RATE_BUCKETS[key]
        while bucket and bucket[0] <= now - window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez dans quelques instants.")
        bucket.append(now)


def _requires_pin_token(path: str) -> bool:
    """Return whether this API path must already include an unlocked PIN token."""
    is_api = path.startswith("/api/")
    is_public = path.startswith("/api/public/")
    is_ical_feed = path.startswith("/api/calendar/") and path.endswith(".ics")
    return is_api and not is_public and not is_ical_feed and path not in _OPEN_PATHS


@app.middleware("http")
async def pin_guard(request: Request, call_next):
    path = request.url.path
    company_token = None
    company_context = None
    is_api = path.startswith("/api/")
    is_public = path.startswith("/api/public/")
    is_platform_admin_api = path.startswith("/api/platform-admin")
    is_ical_feed = path.startswith("/api/calendar/") and path.endswith(".ics")

    try:
        await _enforce_rate_limit(request)
        if is_public:
            parts = path.split("/")
            if len(parts) > 4 and parts[3] == "client":
                resolved = await db.resolve_public_client(parts[4])
                company_id = resolved[0] if resolved else None
            elif len(parts) > 4 and parts[3] == "sites":
                company_id = await db.resolve_public_company(parts[4])
            else:
                company_id = None
            if not company_id:
                return JSONResponse({"detail": "Site ou lien public invalide"}, status_code=404)
            company_token = set_active_company(company_id)
        elif is_platform_admin_api:
            await require_platform_admin_context(request)
        elif is_api and not is_ical_feed:
            company_token, company_context = await require_company_context(request)

        if company_context and not company_context.is_platform_admin:
            permission_prefixes = {
                "/api/clients": "clients",
                "/api/photos": "clients",
                "/api/stock": "stock",
                "/api/accounting": "history",
                "/api/analytics": "history",
                "/api/backup": "history",
            }
            for prefix, permission in permission_prefixes.items():
                if path.startswith(prefix):
                    require_permission(request, permission)
                    break
            if request.method != "GET" and (path.startswith("/api/settings") or path.startswith("/api/services")):
                require_role(request, "owner", "admin")
            if path.startswith("/api/accounting/reset"):
                require_role(request, "owner", "admin")
            if path.startswith("/api/payroll"):
                require_role(request, "owner", "admin")
            if path.startswith("/api/appointment-requests"):
                require_permission(request, "appointments_all")

        if _requires_pin_token(path) and not is_platform_admin_api and not (company_context and company_context.is_platform_admin):
            sec = await _read_security()
            if sec.get("hash"):
                token = request.headers.get("x-pin-token")
                if not await _token_is_valid(token):
                    return JSONResponse({"detail": "Locked"}, status_code=401)
        return await call_next(request)
    except Exception as exc:
        if hasattr(exc, "status_code"):
            return JSONResponse({"detail": getattr(exc, "detail", "Request rejected")}, status_code=exc.status_code)
        raise
    finally:
        if company_token is not None:
            reset_active_company(company_token)


allowed_origins = [
    origin.strip().rstrip("/")
    for origin in os.environ.get(
        "ALLOWED_ORIGINS",
        "https://julien-coiffure-domicile.vercel.app",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Company-ID", "X-Pin-Token"],
)


@app.on_event("startup")
async def on_startup():
    company_id = os.environ.get("DEFAULT_COMPANY_ID")
    if not company_id:
        raise RuntimeError("DEFAULT_COMPANY_ID is required")
    token = set_active_company(company_id)
    try:
        await ensure_default_services()
        await migrate_service_durations()
        await backfill_client_access_tokens()
        await remove_legacy_referrals()
        await get_settings()
    finally:
        reset_active_company(token)


@app.on_event("shutdown")
async def shutdown_db():
    client.close()
