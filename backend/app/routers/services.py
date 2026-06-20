"""Services / prestations CRUD + duration migration."""
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.db import db
from app.dependencies import get_current_user
from app.models.auth import User
from app.models.services import Service, ServiceCreate

router = APIRouter()


# Durée théorique par défaut (en minutes), utilisée pour le moteur de suggestion.
# Ces valeurs sont "métier" (durée moyenne d'une prestation), pas le temps réel.
DEFAULT_DURATIONS = {
    "Coupe Homme": 30,
    "Coupe + Barbe": 45,
    "Coupe Femme": 45,
    "Forfait Femme complet": 90,
    "Brush": 30,
    "Coupe Enfant": 25,
    "Couleur Femme": 75,
    "Balayage court brush": 90,
    "Balayage mi-long brush": 105,
    "Balayage long brush": 120,
    "Patine": 20,
    "Coupe couleur brush": 90,
    "Coupe couleur mi-long brush": 105,
    "Coupe couleur long brush": 120,
    "Couleur racines": 60,
}


DEFAULT_SERVICES = [
    {"name": "Coupe Homme", "price": 15.0, "category": "HOMME", "duration_minutes": 30},
    {"name": "Coupe + Barbe", "price": 22.0, "category": "HOMME", "duration_minutes": 45},
    {"name": "Coupe Femme", "price": 22.0, "category": "FEMME", "duration_minutes": 45},
    {"name": "Forfait Femme complet", "price": 45.0, "category": "FEMME", "duration_minutes": 90},
    {"name": "Coupe Enfant", "price": 12.0, "category": "ENFANT", "duration_minutes": 25},
]


async def ensure_default_services():
    count = await db.services.count_documents({})
    if count == 0:
        for s in DEFAULT_SERVICES:
            await db.services.insert_one(Service(**s).model_dump())


async def migrate_service_durations():
    """Backfill `duration_minutes` for existing services. Idempotent.

    Runs once per database lifetime: a marker doc in `app_meta` records that the
    backfill has been applied, so user customisations after that day are never
    overwritten.

    For every service without a `duration_minutes` field (or with 0), the mapping
    DEFAULT_DURATIONS is consulted using a whitespace-normalised, case-insensitive
    name lookup. Unknown services fall back to 45 min.
    """
    marker = await db.app_meta.find_one({"_id": "service_duration_backfill_v1"}, {"_id": 0})

    norm_map = {" ".join(k.split()).lower(): v for k, v in DEFAULT_DURATIONS.items()}
    cursor = db.services.find({}, {"_id": 0})
    async for svc in cursor:
        sid = svc["id"]
        current = svc.get("duration_minutes")
        normalized = " ".join((svc.get("name") or "").split()).lower()
        target = norm_map.get(normalized, 45)

        if current is None or current == 0:
            # Always fill missing/zero values.
            await db.services.update_one({"id": sid}, {"$set": {"duration_minutes": target}})
            continue
        # If first run and the name maps to a known duration, also override the
        # legacy default 45 (created before this migration existed).
        if not marker and current == 45 and target != 45:
            await db.services.update_one({"id": sid}, {"$set": {"duration_minutes": target}})

    if not marker:
        await db.app_meta.update_one(
            {"_id": "service_duration_backfill_v1"},
            {"$set": {"_id": "service_duration_backfill_v1", "applied_at": "auto"}},
            upsert=True,
        )


@router.get("/services")
async def services_list(user: User = Depends(get_current_user)):
    await ensure_default_services()
    return await db.services.find({}, {"_id": 0}).to_list(1000)


@router.post("/services")
async def services_create(payload: ServiceCreate, user: User = Depends(get_current_user)):
    svc = Service(**payload.model_dump())
    await db.services.insert_one(svc.model_dump())
    return svc.model_dump()


@router.put("/services/{sid}")
async def services_update(sid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    await db.services.update_one({"id": sid}, {"$set": payload})
    return await db.services.find_one({"id": sid}, {"_id": 0})


@router.delete("/services/{sid}")
async def services_delete(sid: str, user: User = Depends(get_current_user)):
    await db.services.delete_one({"id": sid})
    return {"ok": True}
