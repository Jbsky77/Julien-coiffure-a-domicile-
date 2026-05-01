"""Accounting endpoints."""
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.db import db
from app.models.auth import User
from app.services.accounting import (
    accounting_all_months_data,
    accounting_month_data,
    cb_fees_data,
    reset_months,
    reset_single_month,
)

router = APIRouter()


@router.get("/accounting/month/{yyyymm}")
async def month_endpoint(yyyymm: str, user: User = Depends(get_current_user)):
    return await accounting_month_data(yyyymm)


@router.get("/accounting/months")
async def months_endpoint(user: User = Depends(get_current_user)):
    return await accounting_all_months_data()


@router.post("/accounting/urssaf/{yyyymm}")
async def urssaf_toggle(yyyymm: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    await db.urssaf_status.update_one(
        {"month": yyyymm}, {"$set": {"month": yyyymm, **payload}}, upsert=True
    )
    return await db.urssaf_status.find_one({"month": yyyymm}, {"_id": 0})


@router.get("/accounting/cb-fees")
async def cb_fees_endpoint(period: str = "month", user: User = Depends(get_current_user)):
    return await cb_fees_data(period)


@router.post("/accounting/reset-multi")
async def accounting_reset_multi(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    return await reset_months(payload.get("months", []))


@router.post("/accounting/reset/{yyyymm}")
async def accounting_reset(yyyymm: str, user: User = Depends(get_current_user)):
    return await reset_single_month(yyyymm)
