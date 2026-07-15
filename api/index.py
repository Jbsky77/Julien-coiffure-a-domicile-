"""Vercel Python Function entrypoint serving both API and React frontend."""
import sys
from pathlib import Path

from starlette.exceptions import HTTPException
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "backend"))

from app.main import app  # noqa: E402


class SPAStaticFiles(StaticFiles):
    """Serve React routes without retaining an obsolete HTML shell."""

    async def get_response(self, path: str, scope):
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            response = await super().get_response("index.html", scope)

        if "text/html" in response.headers.get("content-type", ""):
            response.headers["Cache-Control"] = (
                "no-store, no-cache, must-revalidate, max-age=0"
            )
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
            response.headers["Clear-Site-Data"] = '"cache"'
        return response


FRONTEND_BUILD = ROOT_DIR / "frontend" / "build"
if FRONTEND_BUILD.exists():
    app.mount("/", SPAStaticFiles(directory=str(FRONTEND_BUILD), html=True), name="frontend")
