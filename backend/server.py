"""Thin entrypoint kept for supervisor (`uvicorn server:app`).

The real implementation now lives in `app/` (modular structure):
- routers/ — FastAPI routers per domain
- services/ — business logic
- models/  — Pydantic schemas
- utils/   — date / travel helpers
"""
from app.main import app  # noqa: F401
