import os
from pathlib import Path
from typing import List


APP_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = APP_DIR.parents[1]
DEFAULT_SQLITE_PATH = APP_DIR / ".data" / "memory_assistant.db"
ENV_PATH = PROJECT_ROOT / ".env"
DEFAULT_CORS_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")


def _strip_env_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _load_local_env() -> None:
    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV") or os.getenv("VERCEL_URL"):
        return
    if not ENV_PATH.exists():
        return

    for raw_line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key:
            os.environ.setdefault(key, _strip_env_quotes(value.strip()))


_load_local_env()


def is_vercel_runtime() -> bool:
    return bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV") or os.getenv("VERCEL_URL"))


def normalize_database_url(database_url: str) -> str:
    value = database_url.strip()
    if value.startswith("postgres://"):
        return f"postgresql://{value[len('postgres://'):]}"
    return value


def get_database_url() -> str:
    configured = normalize_database_url(os.getenv("DATABASE_URL", ""))
    if configured:
        return configured
    if is_vercel_runtime():
        return ""
    return f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"


def is_database_configured() -> bool:
    return bool(get_database_url())


def get_log_level() -> str:
    return os.getenv("LOG_LEVEL", "WARNING").upper()


def get_google_client_id() -> str:
    return os.getenv("GOOGLE_CLIENT_ID", "").strip()


def get_scheduler_engine() -> str:
    configured = os.getenv("SCHEDULER_ENGINE", "simple").strip().lower()
    return configured if configured in {"simple", "fsrs"} else "simple"


def get_cors_origins() -> List[str]:
    configured = os.getenv("CORS_ORIGINS", "")
    origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
    return origins or list(DEFAULT_CORS_ORIGINS)


def flag_enabled(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}
