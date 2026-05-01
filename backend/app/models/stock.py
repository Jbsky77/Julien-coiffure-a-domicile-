from pydantic import BaseModel, Field
import uuid


class StockItem(BaseModel):
    id: str = Field(default_factory=lambda: f"stk_{uuid.uuid4().hex[:10]}")
    name: str
    quantity: float
    threshold: float = 0
    tag: str = "Autre"


class StockCreate(BaseModel):
    name: str
    quantity: float
    threshold: float = 0
    tag: str = "Autre"
