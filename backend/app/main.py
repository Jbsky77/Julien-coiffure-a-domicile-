"""FastAPI app entrypoint. Mounts every domain router under /api."""
import logging

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.db import client
from app.routers import (
    accounting,
    analytics,
    appointments,
    auth,
    calendar,
    clients,
    dashboard,
    geocode,
    insights,
    photos,
    services as services_router,
    settings as settings_router,
    slots,
    stock,
    tour,
)
from app.routers.services import ensure_default_services, migrate_service_durations
from app.services.settings import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI()

# Order matters: clients router exposes /clients/status BEFORE /clients/{cid} (verified inside the file).
ROUTERS = [
    auth.router,
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
]
for r in ROUTERS:
    app.include_router(r, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await ensure_default_services()
    await migrate_service_durations()
    await get_settings()


@app.on_event("shutdown")
async def shutdown_db():
    client.close()
