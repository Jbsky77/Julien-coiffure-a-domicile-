"""Full JSON data export (backup)."""
from fastapi import APIRouter, Depends

from app.db import db
from app.dependencies import get_current_user
from app.models.auth import User
from app.utils.dates import now_utc
from app.services.settings import get_settings

router = APIRouter()

BACKUP_COLLECTIONS = [
    "settings",
    "services",
    "clients",
    "appointments",
    "appointment_requests",
    "stock",
    "notifications",
    "relances",
    "client_photos",
    "urssaf_status",
]


@router.get("/backup/export")
async def backup_export(user: User = Depends(get_current_user)):
    settings = await get_settings()
    data = {}
    counts = {}
    for name in BACKUP_COLLECTIONS:
        docs = await db[name].find({}, {"_id": 0}).to_list(50000)
        data[name] = docs
        counts[name] = len(docs)
    return {
        "app": settings.brand_name or "Mon entreprise",
        "format_version": 1,
        "exported_at": now_utc().isoformat(),
        "counts": counts,
        "data": data,
    }
