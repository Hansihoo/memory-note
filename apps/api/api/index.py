from pathlib import Path
import logging
import sys

from fastapi import FastAPI
from fastapi.responses import JSONResponse


API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

try:
    from app.main import app  # noqa: E402
except Exception:
    logging.basicConfig(level=logging.ERROR)
    logging.exception("vercel_app_import_failed")

    app = FastAPI(title="Memory Assistant API", version="0.1.0")

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    def unavailable(path: str) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": "Application failed to start"})


__all__ = ["app"]
