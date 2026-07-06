"""Appointment requests: client-initiated bookings pending Julien approval.

Lifecycle:
  pending          — created by client via public space
  counter_proposed — Julien proposed a different slot; awaiting client
  accepted         — both parties agreed → an Appointment is created
  rejected         — Julien refused
  cancelled        — client withdrew / expired
"""
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, Field


def _gen_id() -> str:
    return f"req_{secrets.token_hex(6)}"


class RequestServiceRef(BaseModel):
    service_id: str
    name: str = ""
    price: float = 0.0


class AppointmentRequest(BaseModel):
    id: str = Field(default_factory=_gen_id)
    client_id: str
    client_name: str = ""
    requested_date: str  # ISO datetime — client's preferred slot
    services: List[RequestServiceRef] = []
    comment: str = ""
    status: str = "pending"  # see docstring above
    counter_proposed_date: Optional[str] = None
    admin_note: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    linked_appointment_id: Optional[str] = None


class RequestCreatePayload(BaseModel):
    requested_date: str
    service_ids: List[str] = []
    comment: str = ""


class RequestAdminActionPayload(BaseModel):
    action: str  # "accept" | "reject" | "counter"
    counter_date: Optional[str] = None
    admin_note: str = ""
