import re
from pathlib import Path


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_does_not_require_database_url(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("VERCEL", "1")

    with TestClient(create_app()) as test_client:
        response = test_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_database_routes_report_503_without_database_url(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("VERCEL", "1")

    with TestClient(create_app()) as test_client:
        response = test_client.post("/auth/register", json={"username": "learner", "password": "password123"})

    assert response.status_code == 503
    assert response.json()["detail"] == "Database is not configured"


def test_cors_origins_are_env_configurable(monkeypatch):
    from app.config import get_cors_origins

    monkeypatch.setenv("CORS_ORIGINS", "https://web.example.com, http://localhost:5173")

    assert get_cors_origins() == ["https://web.example.com", "http://localhost:5173"]


def test_database_url_normalizes_postgres_urls(monkeypatch):
    from app.config import get_database_url

    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@example.com/db")

    assert get_database_url() == "postgresql://user:pass@example.com/db"


def test_auth_register_login_me_logout(client):
    registered = client.post("/auth/register", json={"username": "Learner", "password": "password123"})
    assert registered.status_code == 201
    token = registered.json()["token"]
    assert registered.json()["tokenType"] == "bearer"
    assert registered.json()["user"]["username"] == "learner"

    me = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "learner"

    login = client.post("/auth/login", json={"username": "learner", "password": "password123"})
    assert login.status_code == 200
    login_token = login.json()["token"]
    assert login_token != token

    logout = client.post("/auth/logout", headers={"Authorization": f"Bearer {login_token}"})
    assert logout.status_code == 200
    assert client.get("/me", headers={"Authorization": f"Bearer {login_token}"}).status_code == 401


def test_google_login_creates_and_reuses_user(client, monkeypatch):
    from app.google_auth import GoogleIdentity
    import app.main as main_module

    monkeypatch.setattr(
        main_module,
        "verify_google_id_token",
        lambda token: GoogleIdentity(
            subject="google-sub-1",
            email="learner@example.com",
            display_name="Google Learner",
            avatar_url="https://example.com/avatar.png",
        ),
    )

    first = client.post("/auth/google", json={"idToken": "mock-token"})
    assert first.status_code == 200
    body = first.json()
    assert body["tokenType"] == "bearer"
    assert body["user"]["email"] == "learner@example.com"
    assert body["user"]["displayName"] == "Google Learner"
    assert body["user"]["authProvider"] == "google"

    second = client.post("/auth/google", json={"idToken": "mock-token"})
    assert second.status_code == 200
    assert second.json()["user"]["id"] == body["user"]["id"]
    assert second.json()["token"] != body["token"]


def test_wordbooks_are_user_scoped(client, auth_headers):
    created = client.post("/wordbooks", json={"name": "Korean", "description": "daily"}, headers=auth_headers)
    assert created.status_code == 201
    assert created.json()["wordCount"] == 0

    other_user = client.post("/auth/register", json={"username": "other", "password": "password123"}).json()["token"]
    other_headers = {"Authorization": f"Bearer {other_user}"}

    assert client.get(f"/wordbooks/{created.json()['id']}", headers=other_headers).status_code == 404
    assert client.get("/wordbooks", headers=other_headers).json() == []


def test_words_crud_and_batch_upsert(client, auth_headers):
    wordbook_id = client.post("/wordbooks", json={"name": "English"}, headers=auth_headers).json()["id"]

    created = client.post(
        f"/wordbooks/{wordbook_id}/words",
        json={"key": "apple", "value": "fruit"},
        headers=auth_headers,
    )
    assert created.status_code == 201
    word_id = created.json()["id"]
    assert created.json()["lastViewedAt"] is None

    patched = client.patch(f"/words/{word_id}", json={"value": "fruit noun"}, headers=auth_headers)
    assert patched.status_code == 200
    assert patched.json()["value"] == "fruit noun"

    batch = client.post(
        f"/wordbooks/{wordbook_id}/words/batch",
        json={"words": [{"key": "apple", "value": "fruit"}, {"key": "book", "value": "reading item"}]},
        headers=auth_headers,
    )
    assert batch.status_code == 200
    assert len(batch.json()["words"]) == 2

    listed = client.get(f"/wordbooks/{wordbook_id}/words", headers=auth_headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 2

    deleted = client.delete(f"/words/{word_id}", headers=auth_headers)
    assert deleted.status_code == 204
    assert client.get(f"/wordbooks/{wordbook_id}/words", headers=auth_headers).json()[0]["key"] == "book"


def test_study_updates_progress_and_profile(client, auth_headers):
    wordbook = client.post("/wordbooks", json={"name": "JLPT"}, headers=auth_headers).json()
    word = client.post(
        f"/wordbooks/{wordbook['id']}/words",
        json={"key": "memory", "value": "remembered information"},
        headers=auth_headers,
    ).json()

    studied = client.post(f"/study/words/{word['id']}", json={"result": "known"}, headers=auth_headers)
    assert studied.status_code == 200
    body = studied.json()
    assert body["result"] == "known"
    assert body["word"]["lastViewedAt"] is not None

    profile = client.get("/profile/summary", headers=auth_headers)
    assert profile.status_code == 200
    summary = profile.json()
    assert summary["cumulativeLearningDays"] == 1
    assert summary["todayStudiedCount"] == 1
    assert summary["recentWordbooks"][0]["wordbookId"] == wordbook["id"]
    assert summary["recentWordbooks"][0]["studiedCount"] == 1
    assert summary["recentWordbooks"][0]["knownCount"] == 1
    assert summary["recentWordbooks"][0]["unknownCount"] == 0
    assert summary["memorizedWordCount"] == 1
    assert summary["memorizedWords"][0]["wordId"] == word["id"]
    assert summary["memorizedWords"][0]["wordbookId"] == wordbook["id"]
    assert summary["memorizedWords"][0]["wordbookName"] == "JLPT"
    assert summary["memorizedWords"][0]["key"] == "memory"
    assert summary["memorizedWords"][0]["value"] == "remembered information"
    assert summary["memorizedWords"][0]["knownCount"] == 1


def test_item_type_controls_default_card_generation(client, auth_headers):
    from app.database import SessionLocal
    from app.models import Card, MemoryItem

    wordbook_id = client.post("/wordbooks", json={"name": "Card policy"}, headers=auth_headers).json()["id"]
    created = [
        client.post(f"/wordbooks/{wordbook_id}/words", json={"key": "departure", "value": "출발"}, headers=auth_headers).json(),
        client.post(
            f"/wordbooks/{wordbook_id}/words",
            json={"key": "정규화의 목적은?", "value": "중복 최소화와 무결성 향상", "itemType": "QA"},
            headers=auth_headers,
        ).json(),
        client.post(
            f"/wordbooks/{wordbook_id}/words",
            json={"key": "git commit --amend", "value": "마지막 커밋 수정", "itemType": "COMMAND"},
            headers=auth_headers,
        ).json(),
        client.post(
            f"/wordbooks/{wordbook_id}/words",
            json={"key": "The flight was delayed.", "value": "비행기가 지연됐다.", "itemType": "SENTENCE"},
            headers=auth_headers,
        ).json(),
    ]

    assert [word["itemType"] for word in created] == ["WORD", "QA", "COMMAND", "SENTENCE"]
    db = SessionLocal()
    try:
        rows = (
            db.query(MemoryItem, Card)
            .outerjoin(Card, Card.item_id == MemoryItem.id)
            .filter(MemoryItem.wordbook_id == wordbook_id)
            .all()
        )
        cards_by_type = {}
        for item, card in rows:
            cards_by_type.setdefault(item.item_type, [])
            if card is not None:
                cards_by_type[item.item_type].append(card.card_type)
    finally:
        db.close()

    assert sorted(cards_by_type["WORD"]) == ["BASIC_KEY_TO_VALUE", "BASIC_VALUE_TO_KEY"]
    assert cards_by_type["QA"] == ["BASIC_KEY_TO_VALUE"]
    assert cards_by_type["COMMAND"] == ["BASIC_KEY_TO_VALUE"]
    assert cards_by_type["SENTENCE"] == []


def test_study_today_returns_summary_filters_wordbook_and_spreads_related_cards(client, auth_headers):
    wordbook_one = client.post("/wordbooks", json={"name": "Travel"}, headers=auth_headers).json()
    wordbook_two = client.post("/wordbooks", json={"name": "Commands"}, headers=auth_headers).json()
    for payload in [{"key": "departure", "value": "출발"}, {"key": "passport", "value": "여권"}]:
        client.post(f"/wordbooks/{wordbook_one['id']}/words", json=payload, headers=auth_headers)
    client.post(f"/wordbooks/{wordbook_two['id']}/words", json={"key": "ls", "value": "목록 보기"}, headers=auth_headers)

    all_queue = client.get("/study/today?limit=10", headers=auth_headers)
    assert all_queue.status_code == 200
    all_body = all_queue.json()
    assert set(all_body["summary"]) == {"dueCount", "newCount", "weakCount", "estimatedMinutes"}
    assert len(all_body["cards"]) == 6
    assert {card["wordbookId"] for card in all_body["cards"]} == {wordbook_one["id"], wordbook_two["id"]}

    filtered = client.get(f"/study/today?wordbookId={wordbook_one['id']}&limit=10", headers=auth_headers).json()
    assert len(filtered["cards"]) == 4
    assert {card["wordbookId"] for card in filtered["cards"]} == {wordbook_one["id"]}
    memory_item_ids = [card["memoryItemId"] for card in filtered["cards"]]
    assert all(left != right for left, right in zip(memory_item_ids, memory_item_ids[1:]))


def test_card_review_idempotency_mistakes_and_conservative_mastered(client, auth_headers):
    from app.database import SessionLocal
    from app.models import ReviewLog, ReviewState

    wordbook_id = client.post("/wordbooks", json={"name": "Review"}, headers=auth_headers).json()["id"]
    client.post(f"/wordbooks/{wordbook_id}/words", json={"key": "fragile", "value": "깨지기 쉬운"}, headers=auth_headers)
    card = client.get(f"/study/today?wordbookId={wordbook_id}&limit=1", headers=auth_headers).json()["cards"][0]

    first = client.post(
        f"/study/cards/{card['cardId']}/review",
        json={"rating": "EASY", "platform": "WEB", "clientEventId": "review-1"},
        headers=auth_headers,
    )
    assert first.status_code == 200
    assert first.json()["deduplicated"] is False
    assert first.json()["status"] != "MASTERED"

    duplicate = client.post(
        f"/study/cards/{card['cardId']}/review",
        json={"rating": "AGAIN", "platform": "WEB", "clientEventId": "review-1"},
        headers=auth_headers,
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["deduplicated"] is True

    db = SessionLocal()
    try:
        assert db.query(ReviewLog).filter(ReviewLog.client_event_id == "review-1").count() == 1
        assert "retrievability" not in ReviewState.__table__.columns
    finally:
        db.close()

    client.post(f"/study/cards/{card['cardId']}/review", json={"rating": "AGAIN", "platform": "WEB"}, headers=auth_headers)
    mistakes = client.get(f"/study/mistakes?wordbookId={wordbook_id}", headers=auth_headers)
    assert mistakes.status_code == 200
    assert any(row["cardId"] == card["cardId"] for row in mistakes.json()["cards"])


def test_deprecated_word_study_adapter_uses_card_review_service(client, auth_headers):
    from app.database import SessionLocal
    from app.models import Card, ReviewLog, ReviewState

    wordbook_id = client.post("/wordbooks", json={"name": "Adapter"}, headers=auth_headers).json()["id"]
    word = client.post(
        f"/wordbooks/{wordbook_id}/words",
        json={"key": "answer", "value": "대답"},
        headers=auth_headers,
    ).json()

    studied = client.post(
        f"/study/words/{word['id']}",
        json={"result": "known", "cardType": "BASIC_VALUE_TO_KEY", "clientEventId": "legacy-1"},
        headers=auth_headers,
    )
    assert studied.status_code == 200
    body = studied.json()
    assert body["status"] == "REVIEW"
    assert body["cardId"] is not None

    db = SessionLocal()
    try:
        card = db.query(Card).filter(Card.id == body["cardId"]).one()
        state = db.query(ReviewState).filter(ReviewState.card_id == card.id).one()
        assert card.card_type == "BASIC_VALUE_TO_KEY"
        assert state.reps == 1
        assert db.query(ReviewLog).filter(ReviewLog.client_event_id == "legacy-1").count() == 1
    finally:
        db.close()


def test_deleted_word_cards_are_excluded_from_today_queue(client, auth_headers):
    from app.database import SessionLocal
    from app.models import Card, MemoryItem, ReviewLog

    wordbook_id = client.post("/wordbooks", json={"name": "Delete"}, headers=auth_headers).json()["id"]
    word = client.post(f"/wordbooks/{wordbook_id}/words", json={"key": "ghost", "value": "유령"}, headers=auth_headers).json()
    card = client.get(f"/study/today?wordbookId={wordbook_id}", headers=auth_headers).json()["cards"][0]
    client.post(f"/study/cards/{card['cardId']}/review", json={"rating": "GOOD", "clientEventId": "delete-keeps-log"}, headers=auth_headers)

    deleted = client.delete(f"/words/{word['id']}", headers=auth_headers)
    assert deleted.status_code == 204
    today = client.get(f"/study/today?wordbookId={wordbook_id}", headers=auth_headers).json()
    assert all(row["legacyWordId"] != word["id"] for row in today["cards"])

    db = SessionLocal()
    try:
        item = db.query(MemoryItem).filter(MemoryItem.legacy_word_id == word["id"]).one()
        assert item.deleted_at is not None
        assert all(card_row.active is False for card_row in db.query(Card).filter(Card.item_id == item.id).all())
        assert db.query(ReviewLog).filter(ReviewLog.client_event_id == "delete-keeps-log").count() == 1
    finally:
        db.close()


def test_backfill_is_idempotent_and_skips_new_structures_for_deleted_words(client, auth_headers):
    from app.database import SessionLocal
    from app.models import Card, LearningEvent, MemoryItem, ReviewLog, ReviewState, User, Word, Wordbook
    from app.review import backfill_review_models
    from app.security import utcnow

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "theo").one()
        wordbook = Wordbook(user_id=user.id, name="Backfill raw")
        db.add(wordbook)
        db.flush()
        active_word = Word(wordbook_id=wordbook.id, key="passport", value="여권")
        deleted_word = Word(wordbook_id=wordbook.id, key="deleted", value="삭제됨", deleted_at=utcnow())
        db.add_all([active_word, deleted_word])
        db.flush()
        db.add(
            LearningEvent(
                user_id=user.id,
                wordbook_id=wordbook.id,
                word_id=active_word.id,
                result="known",
            )
        )
        db.commit()

        backfill_review_models(db, user)
        db.flush()
        first_counts = (
            db.query(MemoryItem).count(),
            db.query(Card).count(),
            db.query(ReviewState).count(),
            db.query(ReviewLog).count(),
        )
        backfill_review_models(db, user)
        db.flush()
        second_counts = (
            db.query(MemoryItem).count(),
            db.query(Card).count(),
            db.query(ReviewState).count(),
            db.query(ReviewLog).count(),
        )

        active_item = db.query(MemoryItem).filter(MemoryItem.legacy_word_id == active_word.id).one()
        assert sorted(card.card_type for card in active_item.cards) == ["BASIC_KEY_TO_VALUE", "BASIC_VALUE_TO_KEY"]
        assert all(card.review_state is not None and card.review_state.status == "NEW" for card in active_item.cards)
        assert db.query(MemoryItem).filter(MemoryItem.legacy_word_id == deleted_word.id).count() == 0
        assert first_counts == second_counts
        assert first_counts[3] == 0
    finally:
        db.rollback()
        db.close()


def test_backfill_deactivates_only_previously_linked_deleted_words(client, auth_headers):
    from app.database import SessionLocal
    from app.models import Card, MemoryItem, User, Word
    from app.review import backfill_review_models
    from app.security import utcnow

    wordbook_id = client.post("/wordbooks", json={"name": "Backfill linked delete"}, headers=auth_headers).json()["id"]
    word = client.post(f"/wordbooks/{wordbook_id}/words", json={"key": "ghost", "value": "유령"}, headers=auth_headers).json()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "theo").one()
        row = db.query(Word).filter(Word.id == word["id"]).one()
        row.deleted_at = utcnow()
        db.flush()
        assert db.query(Card).join(MemoryItem).filter(MemoryItem.legacy_word_id == row.id, Card.active.is_(True)).count() == 2

        backfill_review_models(db, user)
        db.flush()

        item = db.query(MemoryItem).filter(MemoryItem.legacy_word_id == row.id).one()
        assert item.deleted_at is not None
        assert all(card.active is False and card.deleted_at is not None for card in item.cards)
    finally:
        db.rollback()
        db.close()


def test_platform_api_is_rejected_for_external_requests_but_legacy_rows_remain_readable(client, auth_headers):
    from app.database import SessionLocal
    from app.models import ReviewLog, User

    wordbook_id = client.post("/wordbooks", json={"name": "Platform"}, headers=auth_headers).json()["id"]
    client.post(f"/wordbooks/{wordbook_id}/words", json={"key": "terminal", "value": "터미널"}, headers=auth_headers)
    card = client.get(f"/study/today?wordbookId={wordbook_id}&limit=1", headers=auth_headers).json()["cards"][0]

    rejected = client.post(
        f"/study/cards/{card['cardId']}/review",
        json={"rating": "GOOD", "platform": "API"},
        headers=auth_headers,
    )
    assert rejected.status_code == 422

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "theo").one()
        legacy_log = ReviewLog(
            user_id=user.id,
            card_id=int(card["cardId"]),
            deck_id=wordbook_id,
            rating="GOOD",
            is_correct=True,
            platform="API",
        )
        db.add(legacy_log)
        db.commit()
        assert db.query(ReviewLog).filter(ReviewLog.platform == "API").count() == 1
    finally:
        db.close()


def test_fastapi_and_core_enum_contracts_match(client):
    openapi = client.get("/openapi.json").json()
    schemas = openapi["components"]["schemas"]

    assert schemas["ReviewRating"]["enum"] == read_core_enum_values("ReviewRating")
    assert schemas["CardStatus"]["enum"] == read_core_enum_values("CardStatus")
    assert schemas["CardType"]["enum"] == read_core_enum_values("CardType")
    assert schemas["StudyPlatform"]["enum"] == read_core_enum_values("StudyPlatform")


def read_core_enum_values(enum_name: str):
    repo_root = Path(__file__).resolve().parents[3]
    source = (repo_root / "packages" / "core" / "src" / "types.ts").read_text(encoding="utf-8")
    match = re.search(rf"export enum {enum_name}\s*{{(?P<body>.*?)}}", source, re.S)
    assert match is not None
    return re.findall(r'=\s*"([^"]+)"', match.group("body"))


def test_sync_pull_tracks_crud_revisions_and_tombstones(client, auth_headers):
    created = client.post("/wordbooks", json={"name": "Sync"}, headers=auth_headers).json()
    word = client.post(
        f"/wordbooks/{created['id']}/words",
        json={"key": "sync", "value": "동기화"},
        headers=auth_headers,
    ).json()

    pulled = client.get("/sync/pull?sinceRevision=0", headers=auth_headers)
    assert pulled.status_code == 200
    pull_body = pulled.json()
    assert pull_body["serverRevision"] >= word["syncRevision"]
    assert any(wordbook["id"] == created["id"] for wordbook in pull_body["wordbooks"])
    assert any(row["id"] == word["id"] for row in pull_body["words"])

    since = pull_body["serverRevision"]
    deleted = client.delete(f"/words/{word['id']}", headers=auth_headers)
    assert deleted.status_code == 204

    pulled_after_delete = client.get(f"/sync/pull?sinceRevision={since}", headers=auth_headers).json()
    tombstone = next(row for row in pulled_after_delete["words"] if row["id"] == word["id"])
    assert tombstone["deletedAt"] is not None


def test_sync_push_applies_changes_and_uses_server_priority_conflicts(client, auth_headers):
    pushed = client.post(
        "/sync/push",
        json={
            "changes": [
                {
                    "entityType": "wordbook",
                    "clientId": "local-book-1",
                    "baseRevision": 0,
                    "operation": "create",
                    "payload": {"name": "Pushed"},
                }
            ]
        },
        headers=auth_headers,
    )
    assert pushed.status_code == 200
    body = pushed.json()
    assert body["conflicts"] == []
    wordbook_id = body["applied"][0]["entityId"]
    base_revision = body["applied"][0]["syncRevision"]

    server_update = client.patch(f"/wordbooks/{wordbook_id}", json={"name": "Server wins"}, headers=auth_headers).json()
    conflict = client.post(
        "/sync/push",
        json={
            "changes": [
                {
                    "entityType": "wordbook",
                    "entityId": wordbook_id,
                    "baseRevision": base_revision,
                    "operation": "update",
                    "payload": {"name": "Client loses"},
                }
            ]
        },
        headers=auth_headers,
    )
    assert conflict.status_code == 200
    conflict_body = conflict.json()
    assert conflict_body["applied"] == []
    assert conflict_body["conflicts"][0]["reason"] == "Server has newer data"
    assert conflict_body["conflicts"][0]["serverEntity"]["name"] == server_update["name"]
