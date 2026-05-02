import os
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]
DEFAULT_SQLITE_PATH = APP_DIR / ".data" / "memory_assistant.db"


def get_database_url() -> str:
    return os.getenv("DATABASE_URL") or f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"


def get_log_level() -> str:
    return os.getenv("LOG_LEVEL", "WARNING").upper()


def flag_enabled(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}
