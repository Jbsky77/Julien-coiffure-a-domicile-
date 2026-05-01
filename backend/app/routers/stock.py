"""Stock CRUD."""
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.db import db
from app.dependencies import get_current_user
from app.models.auth import User
from app.models.stock import StockCreate, StockItem

router = APIRouter()


@router.get("/stock")
async def stock_list(user: User = Depends(get_current_user)):
    return await db.stock.find({}, {"_id": 0}).to_list(1000)


@router.post("/stock")
async def stock_create(payload: StockCreate, user: User = Depends(get_current_user)):
    item = StockItem(**payload.model_dump())
    await db.stock.insert_one(item.model_dump())
    return item.model_dump()


@router.put("/stock/{sid}")
async def stock_update(sid: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    await db.stock.update_one({"id": sid}, {"$set": payload})
    return await db.stock.find_one({"id": sid}, {"_id": 0})


@router.delete("/stock/{sid}")
async def stock_delete(sid: str, user: User = Depends(get_current_user)):
    await db.stock.delete_one({"id": sid})
    return {"ok": True}
