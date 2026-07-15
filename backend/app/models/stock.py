from datetime import datetime, timezone
from typing import Literal, Optional
import uuid

from pydantic import BaseModel, Field, field_validator


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class StockItem(BaseModel):
    id: str = Field(default_factory=lambda: f"stk_{uuid.uuid4().hex[:10]}")
    name: str
    quantity: float = 0
    threshold: float = 0
    tag: str = "Autre"
    catalog_product_id: Optional[str] = None
    product_snapshot: Optional[dict] = None
    unit_price: Optional[float] = None
    currency: str = "EUR"
    reorder_threshold: float = 0
    target_stock: float = 1
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class StockCreate(BaseModel):
    name: str
    quantity: float
    threshold: float = 0
    tag: str = "Autre"


class CatalogStockAdd(BaseModel):
    catalog_product_id: str
    quantity: int = Field(gt=0)
    unit_price: Optional[float] = Field(default=None, ge=0)

    @field_validator("unit_price")
    @classmethod
    def cents_only(cls, value):
        if value is not None and round(value, 2) != value:
            raise ValueError("Le tarif doit comporter au maximum deux dÃ©cimales")
        return value


class StockAdjustment(BaseModel):
    mode: Literal["add", "remove", "set", "price"]
    quantity: Optional[float] = None
    unit_price: Optional[float] = Field(default=None, ge=0)
    remove_price: bool = False
    note: str = ""
    reorder_threshold: Optional[float] = Field(default=None, ge=0)
    target_stock: Optional[float] = Field(default=None, ge=0)


class AppointmentProductUsageInput(BaseModel):
    id: str = Field(default_factory=lambda: f"use_{uuid.uuid4().hex[:12]}")
    catalog_product_id: str
    stock_item_id: Optional[str] = None
    dose_type: Literal["full", "half", "quarter", "custom"] = "full"
    used_stock_units: float = Field(gt=0)
    physical_amount: Optional[float] = Field(default=None, gt=0)
    physical_amount_unit: Optional[Literal["ml", "g"]] = None
    technical_note: str = ""
