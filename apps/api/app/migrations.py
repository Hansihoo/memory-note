from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _has_column(engine: Engine, table_name: str, column_name: str) -> bool:
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        return False
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _exec(engine: Engine, statement: str) -> None:
    with engine.begin() as connection:
        connection.execute(text(statement))


def _add_column(engine: Engine, table_name: str, column_name: str, ddl: str) -> None:
    if not _has_column(engine, table_name, column_name):
        _exec(engine, f"ALTER TABLE {table_name} ADD COLUMN {ddl}")


def run_compat_migrations(engine: Engine) -> None:
    _add_column(engine, "users", "password_hash", "password_hash VARCHAR(255)")
    _add_column(engine, "users", "google_sub", "google_sub VARCHAR(255)")
    _add_column(engine, "users", "email", "email VARCHAR(255)")
    _add_column(engine, "users", "display_name", "display_name VARCHAR(160)")
    _add_column(engine, "users", "avatar_url", "avatar_url TEXT")
    _add_column(engine, "users", "auth_provider", "auth_provider VARCHAR(32) DEFAULT 'password'")
    _add_column(engine, "users", "sync_revision", "sync_revision INTEGER DEFAULT 0")
    _add_column(engine, "wordbooks", "deleted_at", "deleted_at DATETIME")
    _add_column(engine, "wordbooks", "sync_revision", "sync_revision INTEGER DEFAULT 0")
    _add_column(engine, "words", "deleted_at", "deleted_at DATETIME")
    _add_column(engine, "words", "sync_revision", "sync_revision INTEGER DEFAULT 0")

    _exec(engine, "UPDATE users SET auth_provider = 'password' WHERE auth_provider IS NULL")
    _exec(engine, "UPDATE users SET sync_revision = 0 WHERE sync_revision IS NULL")
    _exec(engine, "UPDATE wordbooks SET sync_revision = 1 WHERE sync_revision IS NULL OR sync_revision = 0")
    _exec(engine, "UPDATE words SET sync_revision = 1 WHERE sync_revision IS NULL OR sync_revision = 0")
    _exec(
        engine,
        """
        UPDATE users
        SET sync_revision = 1
        WHERE sync_revision = 0
          AND EXISTS (SELECT 1 FROM wordbooks WHERE wordbooks.user_id = users.id)
        """,
    )
