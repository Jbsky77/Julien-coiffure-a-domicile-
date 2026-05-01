"""Services / prestations CRUD."""
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.db import db
from app.dependencies import get_current_user
from app.models.auth import User
from app.models.services import Service, ServiceCreate

router = APIRouter()


DEFAULT_SERVICES = [
    {"name": "Coupe Homme", "price": 15.0, "category": "HOMME"},
    {"name": "Coupe + Barbe", "price": 22.0, "category": "HOMME"},
    {"name": "Coupe Femme", "price": 22.0, "category": "FEMME"},
    {"name": "Forfait Femme complet", "price": 45.0, "category": "FEMME"},
    {"name": "Coupe Enfant", "price": 12.0, "category": "ENFANT"},
]


async def ensure_default_services():
    count = await db.services.count_documents({})
    if count == 0:
        for s in DEFAULT_SERVICES:
            doc = Service(**s).model_dump()
            await db.services.insert_one(doc)


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
