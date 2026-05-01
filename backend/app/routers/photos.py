"""Before/after photo pairs for a client."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.db import db
from app.dependencies import get_current_user
from app.models.auth import User

router = APIRouter()


@router.get("/clients/{cid}/photos")
async def list_photos(cid: str, user: User = Depends(get_current_user)):
    return await db.client_photos.find({"client_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/clients/{cid}/photos")
async def create_photo(cid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    client = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    pair_id = f"ph_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": pair_id,
        "client_id": cid,
        "before": payload.get("before"),
        "after": payload.get("after"),
        "note": payload.get("note", ""),
        "date": payload.get("date") or datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.client_photos.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/clients/{cid}/photos/{pid}")
async def update_photo(cid: str, pid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    update = {k: payload[k] for k in ("before", "after", "note", "date") if k in payload}
    if update:
        await db.client_photos.update_one({"id": pid, "client_id": cid}, {"$set": update})
    return await db.client_photos.find_one({"id": pid, "client_id": cid}, {"_id": 0})


@router.delete("/clients/{cid}/photos/{pid}")
async def delete_photo(cid: str, pid: str, user: User = Depends(get_current_user)):
    await db.client_photos.delete_one({"id": pid, "client_id": cid})
    return {"ok": True}
