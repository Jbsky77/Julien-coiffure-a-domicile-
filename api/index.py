"""Vercel Python Function entrypoint serving both API and React frontend."""
import sys
from pathlib import Path

from fastapi import HTTPException
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "backend"))

from app.main import app  # noqa: E402


class SPAStaticFiles(StaticFiles):
    """Serve index.html for client-side React routes."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            return await super().get_response("index.html", scope)


FRONTEND_BUILD = ROOT_DIR / "frontend" / "build"
if FRONTEND_BUILD.exists():
    app.mount("/", SPAStaticFiles(directory=str(FRONTEND_BUILD), html=True), name="frontend")
