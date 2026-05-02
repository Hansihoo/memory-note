from pathlib import Path
from typing import Generator, Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import get_database_url


Base = declarative_base()

_engine: Optional[Engine] = None
_database_url: Optional[str] = None
SessionLocal = sessionmaker(autocommit=False, autoflush=False)


def _connect_args(database_url: str) -> dict:
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


def _ensure_sqlite_parent(database_url: str) -> None:
    if not database_url.startswith("sqlite:///"):
        return

    path = database_url.replace("sqlite:///", "", 1)
    if path and path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)


def configure_database(database_url: Optional[str] = None) -> Engine:
    global _database_url, _engine

    resolved_url = database_url or get_database_url()
    if _engine is not None and resolved_url == _database_url:
        return _engine

    _ensure_sqlite_parent(resolved_url)
    _engine = create_engine(
        resolved_url,
        connect_args=_connect_args(resolved_url),
        future=True,
    )
    _database_url = resolved_url
    SessionLocal.configure(bind=_engine)
    return _engine


def get_engine() -> Engine:
    return configure_database()


def init_db() -> None:
    engine = get_engine()
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator:
    configure_database()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
