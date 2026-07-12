"""FastAPI app entrypoint. Mounts every domain router under /api."""
import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from app.db import client, reset_active_company, set_active_company
from app.routers import (
    accounting,
    analytics,
    appointment_requests,
    appointments,
    auth,
    backup,
    calendar,
    clients,
    dashboard,
    geocode,
    insights,
    photos,
    pin,
    prospection,
    public,
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
from app.tenancy import require_company_context

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI()

# Order matters: clients router exposes /clients/status BEFORE /clients/{cid} (verified inside the file).
ROUTERS = [
    auth.router,
    pin.router,
    settings_router.router,
    services_router.router,
    clients.router,
    photos.router,
    geocode.router,
    tour.router,
    slots.router,
    insights.router,
    appointments.router,
    accounting.router,
    analytics.router,
    calendar.router,
    stock.router,
    dashboard.router,
    public.router,
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


@app.middleware("http")
async def pin_guard(request: Request, call_next):
    path = request.url.path
    company_token = None
    is_api = path.startswith("/api/")
    is_public = path.startswith("/api/public/")
    is_ical_feed = path.startswith("/api/calendar/") and path.endswith(".ics")

    try:
        if is_api and not is_public and not is_ical_feed:
            company_token, _ = await require_company_context(request)

        if is_api and not is_public and not is_ical_feed:
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


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
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
