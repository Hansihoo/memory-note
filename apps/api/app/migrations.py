from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _has_table(engine: Engine, table_name: str) -> bool:
    return table_name in inspect(engine).get_table_names()


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


def _backfill_review_tables(engine: Engine) -> None:
    if not all(_has_table(engine, table) for table in ("words", "wordbooks", "memory_items", "cards", "review_states")):
        return

    _exec(
        engine,
        """
        INSERT INTO memory_items (
            user_id,
            wordbook_id,
            legacy_word_id,
            key,
            value,
            item_type,
            source,
            created_at,
            updated_at,
            deleted_at
        )
        SELECT
            wordbooks.user_id,
            words.wordbook_id,
            words.id,
            words.key,
            words.value,
            'WORD',
            'legacy-word',
            COALESCE(words.created_at, CURRENT_TIMESTAMP),
            COALESCE(words.updated_at, CURRENT_TIMESTAMP),
            words.deleted_at
        FROM words
        JOIN wordbooks ON wordbooks.id = words.wordbook_id
        WHERE words.deleted_at IS NULL
          AND wordbooks.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM memory_items
            WHERE memory_items.legacy_word_id = words.id
        )
        """,
    )
    _exec(
        engine,
        """
        UPDATE words
        SET memory_item_id = (
            SELECT memory_items.id
            FROM memory_items
            WHERE memory_items.legacy_word_id = words.id
            LIMIT 1
        )
        WHERE memory_item_id IS NULL
          AND EXISTS (
              SELECT 1
              FROM memory_items
              WHERE memory_items.legacy_word_id = words.id
          )
        """,
    )
    _exec(
        engine,
        """
        UPDATE memory_items
        SET
            wordbook_id = (
                SELECT words.wordbook_id
                FROM words
                WHERE words.id = memory_items.legacy_word_id
                LIMIT 1
            ),
            key = (
                SELECT words.key
                FROM words
                WHERE words.id = memory_items.legacy_word_id
                LIMIT 1
            ),
            value = (
                SELECT words.value
                FROM words
                WHERE words.id = memory_items.legacy_word_id
                LIMIT 1
            ),
            deleted_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE EXISTS (
            SELECT 1
            FROM words
            JOIN wordbooks ON wordbooks.id = words.wordbook_id
            WHERE words.id = memory_items.legacy_word_id
              AND words.deleted_at IS NULL
              AND wordbooks.deleted_at IS NULL
        )
        """,
    )
    _exec(
        engine,
        """
        UPDATE memory_items
        SET
            deleted_at = COALESCE(
                (
                    SELECT words.deleted_at
                    FROM words
                    WHERE words.id = memory_items.legacy_word_id
                    LIMIT 1
                ),
                CURRENT_TIMESTAMP
            ),
            updated_at = CURRENT_TIMESTAMP
        WHERE EXISTS (
            SELECT 1
            FROM words
            WHERE words.deleted_at IS NOT NULL
              AND (
                  words.memory_item_id = memory_items.id
                  OR words.id = memory_items.legacy_word_id
              )
        )
        """,
    )
    _exec(
        engine,
        """
        UPDATE cards
        SET
            active = FALSE,
            deleted_at = COALESCE(cards.deleted_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE EXISTS (
            SELECT 1
            FROM memory_items
            WHERE memory_items.id = cards.item_id
              AND memory_items.deleted_at IS NOT NULL
        )
        """,
    )
    _exec(
        engine,
        """
        INSERT INTO cards (
            user_id,
            wordbook_id,
            item_id,
            card_type,
            prompt,
            answer,
            active,
            created_at,
            updated_at,
            deleted_at
        )
        SELECT
            memory_items.user_id,
            memory_items.wordbook_id,
            memory_items.id,
            'BASIC_KEY_TO_VALUE',
            memory_items.key,
            memory_items.value,
            CASE WHEN memory_items.deleted_at IS NULL THEN TRUE ELSE FALSE END,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            memory_items.deleted_at
        FROM memory_items
        JOIN wordbooks ON wordbooks.id = memory_items.wordbook_id
        WHERE memory_items.item_type IN ('WORD', 'QA', 'COMMAND')
          AND memory_items.deleted_at IS NULL
          AND wordbooks.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM cards
              WHERE cards.item_id = memory_items.id
                AND cards.card_type = 'BASIC_KEY_TO_VALUE'
          )
        """,
    )
    _exec(
        engine,
        """
        INSERT INTO cards (
            user_id,
            wordbook_id,
            item_id,
            card_type,
            prompt,
            answer,
            active,
            created_at,
            updated_at,
            deleted_at
        )
        SELECT
            memory_items.user_id,
            memory_items.wordbook_id,
            memory_items.id,
            'BASIC_VALUE_TO_KEY',
            memory_items.value,
            memory_items.key,
            CASE WHEN memory_items.deleted_at IS NULL THEN TRUE ELSE FALSE END,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            memory_items.deleted_at
        FROM memory_items
        JOIN wordbooks ON wordbooks.id = memory_items.wordbook_id
        WHERE memory_items.item_type = 'WORD'
          AND memory_items.deleted_at IS NULL
          AND wordbooks.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM cards
              WHERE cards.item_id = memory_items.id
                AND cards.card_type = 'BASIC_VALUE_TO_KEY'
          )
        """,
    )
    _exec(
        engine,
        """
        UPDATE cards
        SET
            active = TRUE,
            deleted_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE EXISTS (
            SELECT 1
            FROM memory_items
            JOIN wordbooks ON wordbooks.id = memory_items.wordbook_id
            WHERE memory_items.id = cards.item_id
              AND memory_items.deleted_at IS NULL
              AND wordbooks.deleted_at IS NULL
        )
        """,
    )
    _exec(
        engine,
        """
        INSERT INTO review_states (
            user_id,
            card_id,
            status,
            due_at,
            reps,
            lapses,
            streak,
            interval_days,
            ease_factor,
            difficulty,
            stability,
            leech_score,
            created_at,
            updated_at
        )
        SELECT
            cards.user_id,
            cards.id,
            'NEW',
            CURRENT_TIMESTAMP,
            0,
            0,
            0,
            0,
            2.5,
            0.3,
            0,
            0,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        FROM cards
        WHERE cards.active = TRUE
          AND cards.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM review_states
            WHERE review_states.card_id = cards.id
        )
        """,
    )


def run_compat_migrations(engine: Engine) -> None:
    _add_column(engine, "users", "password_hash", "password_hash VARCHAR(255)")
    _add_column(engine, "users", "google_sub", "google_sub VARCHAR(255)")
    _add_column(engine, "users", "email", "email VARCHAR(255)")
    _add_column(engine, "users", "display_name", "display_name VARCHAR(160)")
    _add_column(engine, "users", "avatar_url", "avatar_url TEXT")
    _add_column(engine, "users", "auth_provider", "auth_provider VARCHAR(32) DEFAULT 'password'")
    _add_column(engine, "users", "fun_events_enabled", "fun_events_enabled BOOLEAN DEFAULT TRUE")
    _add_column(engine, "users", "sync_revision", "sync_revision INTEGER DEFAULT 0")
    _add_column(engine, "wordbooks", "deleted_at", "deleted_at DATETIME")
    _add_column(engine, "wordbooks", "sync_revision", "sync_revision INTEGER DEFAULT 0")
    _add_column(engine, "words", "deleted_at", "deleted_at DATETIME")
    _add_column(engine, "words", "sync_revision", "sync_revision INTEGER DEFAULT 0")
    _add_column(engine, "words", "memory_item_id", "memory_item_id INTEGER")
    _add_column(engine, "memory_items", "tags", "tags JSON")
    _add_column(engine, "memory_items", "example_sentence", "example_sentence TEXT")
    _add_column(engine, "memory_items", "cloze_text", "cloze_text TEXT")
    _add_column(engine, "cards", "hint", "hint TEXT")
    _add_column(engine, "cards", "explanation", "explanation TEXT")
    _add_column(engine, "cards", "metadata_json", "metadata_json JSON")

    _exec(engine, "UPDATE users SET auth_provider = 'password' WHERE auth_provider IS NULL")
    _exec(engine, "UPDATE users SET fun_events_enabled = TRUE WHERE fun_events_enabled IS NULL")
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
    _backfill_review_tables(engine)
