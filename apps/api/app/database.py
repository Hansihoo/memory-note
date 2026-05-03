import logging
from pathlib import Path
from typing import Generator, Optional

from fastapi import HTTPException, status
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import get_database_url


logger = logging.getLogger(__name__)
Base = declarative_base()

_engine: Optional[Engine] = None
_database_url: Optional[str] = None
_db_initialized = False
SessionLocal = sessionmaker(autocommit=False, autoflush=False)


class DatabaseConfigurationError(RuntimeError):
    pass


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
    global _database_url, _db_initialized, _engine

    resolved_url = database_url or get_database_url()
    if not resolved_url:
        raise DatabaseConfigurationError("DATABASE_URL is not configured")

    if _engine is not None and resolved_url == _database_url:
        return _engine

    _ensure_sqlite_parent(resolved_url)
    _engine = create_engine(
        resolved_url,
        connect_args=_connect_args(resolved_url),
        future=True,
    )
    _database_url = resolved_url
    _db_initialized = False
    SessionLocal.configure(bind=_engine)
    return _engine


def get_engine() -> Engine:
    return configure_database()


def init_db() -> None:
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    from .migrations import run_compat_migrations

    run_compat_migrations(engine)


def ensure_db_initialized() -> None:
    global _db_initialized

    if _db_initialized:
        return

    init_db()
    _db_initialized = True


def get_db() -> Generator:
    try:
        ensure_db_initialized()
    except DatabaseConfigurationError as exc:
        logger.error("database_configuration_missing")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not configured",
        ) from exc
    except SQLAlchemyError as exc:
        logger.exception("database_initialization_failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable",
        ) from exc
    except Exception as exc:
        logger.exception("database_initialization_unexpected_error")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable",
        ) from exc

    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as exc:
        logger.exception("database_operation_failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable",
        ) from exc
    finally:
        db.close()
