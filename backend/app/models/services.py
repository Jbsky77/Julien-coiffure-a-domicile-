from pydantic import BaseModel, Field
import uuid


class Service(BaseModel):
    id: str = Field(default_factory=lambda: f"svc_{uuid.uuid4().hex[:10]}")
    name: str
    price: float
    category: str  # HOMME, FEMME, ENFANT, AUTRE


class ServiceCreate(BaseModel):
    name: str
    price: float
    category: str
