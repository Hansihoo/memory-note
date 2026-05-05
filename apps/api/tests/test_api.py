import re
from datetime import datetime, timedelta, timezone
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
    assert "masteredCount" in summary
    assert "weakCardCount" in summary
    assert summary["longTermReviewCount30d"] == 0
    assert summary["longTermCorrectCount30d"] == 0
    assert summary["longTermRecallRate30d"] == 0
    assert summary["masteredLapseCount30d"] == 0
    assert summary["oldMasteredDueCount"] == 0


def test_profile_summary_merges_legacy_and_review_dedup(client, auth_headers):
    wordbook = client.post("/wordbooks", json={"name": "Merge"}, headers=auth_headers).json()
    word = client.post(
        f"/wordbooks/{wordbook['id']}/words",
        json={"key": "merge", "value": "합치다"},
        headers=auth_headers,
    ).json()
    client.post(f"/study/words/{word['id']}", json={"result": "known"}, headers=auth_headers)
    today = client.get(f"/study/today?wordbookId={wordbook['id']}", headers=auth_headers).json()
    card = today["cards"][0]
    client.post(
        f"/study/cards/{card['cardId']}/review",
        json={"rating": "GOOD", "platform": "WEB", "clientEventId": "merge-good-1"},
        headers=auth_headers,
    )
    summary = client.get("/profile/summary", headers=auth_headers).json()
    assert summary["todayStudiedCount"] == 1
    assert summary["cumulativeLearningDays"] >= 1
    assert summary["memorizedWordCount"] == 1


def test_profile_summary_long_term_memory_stats(client, auth_headers):
    from app.database import SessionLocal
    from app.models import Card, MemoryItem, ReviewLog, User
    from app.security import utcnow

    wb = client.post("/wordbooks", json={"name": "Long term"}, headers=auth_headers).json()
    for payload in [
        {"key": "duplicate", "value": "D"},
        {"key": "eligible", "value": "E", "itemType": "QA"},
        {"key": "recent", "value": "R", "itemType": "QA"},
        {"key": "inactive", "value": "I", "itemType": "QA"},
        {"key": "deleted", "value": "X", "itemType": "QA"},
        {"key": "due", "value": "Due", "itemType": "QA"},
    ]:
        client.post(f"/wordbooks/{wb['id']}/words", json=payload, headers=auth_headers)

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "theo").one()
        items = {item.key: item for item in db.query(MemoryItem).filter(MemoryItem.wordbook_id == wb["id"]).all()}
        now = utcnow()

        def mark_mastered(card: Card, *, last_reviewed_days_ago: int, due_in_days: int) -> None:
            state = card.review_state
            state.status = "MASTERED"
            state.last_reviewed_at = now - timedelta(days=last_reviewed_days_ago)
            state.mastered_at = now - timedelta(days=40)
            state.due_at = now + timedelta(days=due_in_days)

        for card in items["duplicate"].cards:
            mark_mastered(card, last_reviewed_days_ago=3, due_in_days=30)
        eligible_card = items["eligible"].cards[0]
        mark_mastered(eligible_card, last_reviewed_days_ago=20, due_in_days=30)
        mark_mastered(items["recent"].cards[0], last_reviewed_days_ago=3, due_in_days=30)
        mark_mastered(items["inactive"].cards[0], last_reviewed_days_ago=20, due_in_days=30)
        items["inactive"].cards[0].active = False
        mark_mastered(items["deleted"].cards[0], last_reviewed_days_ago=20, due_in_days=30)
        items["deleted"].deleted_at = now
        mark_mastered(items["due"].cards[0], last_reviewed_days_ago=20, due_in_days=-1)

        def add_review_log(rating: str, state_before: str, days_ago: int, client_event_id: str) -> None:
            db.add(
                ReviewLog(
                    user_id=user.id,
                    card_id=eligible_card.id,
                    deck_id=wb["id"],
                    rating=rating,
                    is_correct=rating != "AGAIN",
                    reviewed_at=now - timedelta(days=days_ago),
                    platform="WEB",
                    state_before_json={"status": state_before},
                    state_after_json={"status": "MASTERED"},
                    client_event_id=client_event_id,
                )
            )

        add_review_log("HARD", "MASTERED", 1, "long-hard")
        add_review_log("GOOD", "MASTERED", 2, "long-good")
        add_review_log("EASY", "MASTERED", 3, "long-easy")
        add_review_log("AGAIN", "MASTERED", 4, "long-again")
        add_review_log("GOOD", "REVIEW", 5, "not-long-review")
        add_review_log("GOOD", "MASTERED", 31, "old-long-review")
        db.commit()
    finally:
        db.close()

    summary = client.get("/profile/summary", headers=auth_headers).json()
    assert summary["masteredCount"] == 4
    assert summary["longTermReviewCount30d"] == 4
    assert summary["longTermCorrectCount30d"] == 3
    assert summary["masteredLapseCount30d"] == 1
    assert summary["longTermRecallRate30d"] == 0.75
    assert summary["oldMasteredDueCount"] == 1


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


def test_example_sentence_generates_cloze_typing_and_stores_response_text(client, auth_headers):
    from app.database import SessionLocal
    from app.models import Card, MemoryItem, ReviewLog

    wordbook_id = client.post("/wordbooks", json={"name": "Sentence cards"}, headers=auth_headers).json()["id"]
    word = client.post(
        f"/wordbooks/{wordbook_id}/words",
        json={
            "key": "retain",
            "value": "유지하다",
            "exampleSentence": "I retain important details.",
            "tags": ["memory", "verb"],
            "cloze": "I {{c1::retain}} important details.",
        },
        headers=auth_headers,
    ).json()
    assert word["exampleSentence"] == "I retain important details."
    assert word["tags"] == ["memory", "verb"]
    assert word["cloze"] == "I {{c1::retain}} important details."

    today = client.get(f"/study/today?wordbookId={wordbook_id}&limit=10", headers=auth_headers).json()
    cards_by_type = {card["cardType"]: card for card in today["cards"]}
    assert set(cards_by_type) == {"BASIC_KEY_TO_VALUE", "BASIC_VALUE_TO_KEY", "CLOZE", "TYPING"}
    assert cards_by_type["CLOZE"]["prompt"] == "I ____ important details."
    assert cards_by_type["CLOZE"]["answer"] == "retain"
    assert cards_by_type["TYPING"]["prompt"] == "I retain important details."
    assert cards_by_type["TYPING"]["answer"] == "retain"

    reviewed = client.post(
        f"/study/cards/{cards_by_type['TYPING']['cardId']}/review",
        json={"rating": "GOOD", "platform": "WEB", "responseText": "retain", "clientEventId": "typing-response"},
        headers=auth_headers,
    )
    assert reviewed.status_code == 200

    patched = client.patch(f"/words/{word['id']}", json={"exampleSentence": None, "cloze": None}, headers=auth_headers).json()
    assert patched["exampleSentence"] is None
    assert patched["cloze"] is None

    db = SessionLocal()
    try:
        item = db.query(MemoryItem).filter(MemoryItem.legacy_word_id == word["id"]).one()
        assert item.example_sentence is None
        assert item.cloze_text is None
        assert item.tags == ["memory", "verb"]
        assert db.query(ReviewLog).filter(ReviewLog.client_event_id == "typing-response").one().response_text == "retain"
        assert db.query(Card).filter(Card.item_id == item.id, Card.card_type == "CLOZE").one().metadata_json == {"source": "cloze", "answer": "retain"}
        inactive_sentence_cards = (
            db.query(Card)
            .filter(Card.item_id == item.id, Card.card_type.in_(["CLOZE", "TYPING"]), Card.active.is_(False))
            .count()
        )
        assert inactive_sentence_cards == 2
    finally:
        db.close()


def test_course_pack_content_tables_are_separate_from_review_state(client, auth_headers):
    from app.database import SessionLocal
    from app.models import CourseLesson, CourseLessonItem, CoursePack, CourseUnit, ReviewState

    db = SessionLocal()
    try:
        pack = CoursePack(slug="travel-a1", title="Travel A1", description="Starter travel course")
        unit = CourseUnit(course_pack=pack, position=1, title="Airport")
        lesson = CourseLesson(unit=unit, position=1, title="Passport")
        lesson_item = CourseLessonItem(
            lesson=lesson,
            position=1,
            key="passport",
            value="여권",
            item_type="WORD",
            example_sentence="I lost my passport.",
            cloze_text="I lost my {{c1::passport}}.",
            tags=["travel", "airport"],
        )
        db.add_all([pack, unit, lesson, lesson_item])
        db.commit()

        stored = db.query(CourseLessonItem).filter(CourseLessonItem.key == "passport").one()
        assert stored.tags == ["travel", "airport"]
        assert "user_id" not in CoursePack.__table__.columns
        assert "review_state_id" not in CourseLessonItem.__table__.columns
        assert db.query(ReviewState).count() == 0
    finally:
        db.close()


def test_paid_course_entitlement_access_start_and_revoke(client, auth_headers):
    from app.database import SessionLocal
    from app.main import create_course_product, grant_course_entitlement, revoke_course_entitlement
    from app.models import Card, CourseLesson, CourseLessonItem, CoursePack, CourseUnit, MemoryItem, ReviewLog, ReviewState, User, UserEntitlement
    from app.security import utcnow

    no_entitlement_headers = auth_headers
    active_token = client.post("/auth/register", json={"username": "active-course", "password": "password123"}).json()["token"]
    active_headers = {"Authorization": f"Bearer {active_token}"}
    revoked_token = client.post("/auth/register", json={"username": "revoked-course", "password": "password123"}).json()["token"]
    revoked_headers = {"Authorization": f"Bearer {revoked_token}"}
    expired_token = client.post("/auth/register", json={"username": "expired-course", "password": "password123"}).json()["token"]
    expired_headers = {"Authorization": f"Bearer {expired_token}"}

    db = SessionLocal()
    try:
        active_user = db.query(User).filter(User.username == "active-course").one()
        revoked_user = db.query(User).filter(User.username == "revoked-course").one()
        expired_user = db.query(User).filter(User.username == "expired-course").one()

        paid_pack = CoursePack(slug="paid-a1", title="Paid A1", description="Paid course", access_type="PAID")
        paid_unit = CourseUnit(course_pack=paid_pack, position=1, title="Paid Unit")
        paid_lesson = CourseLesson(unit=paid_unit, position=1, title="Paid Lesson")
        paid_item = CourseLessonItem(lesson=paid_lesson, position=1, key="premium", value="paid answer", item_type="WORD")
        free_pack = CoursePack(slug="free-a1", title="Free A1", description="Free course")
        free_unit = CourseUnit(course_pack=free_pack, position=1, title="Free Unit")
        free_lesson = CourseLesson(unit=free_unit, position=1, title="Free Lesson")
        free_item = CourseLessonItem(lesson=free_lesson, position=1, key="sample", value="free answer", item_type="WORD")
        db.add_all([paid_pack, paid_unit, paid_lesson, paid_item, free_pack, free_unit, free_lesson, free_item])
        db.flush()
        product = create_course_product(db, paid_pack)
        active_entitlement = grant_course_entitlement(db, active_user, paid_pack, product=product)
        revoked_entitlement = grant_course_entitlement(db, revoked_user, paid_pack, product=product)
        revoke_course_entitlement(db, revoked_entitlement)
        grant_course_entitlement(
            db,
            expired_user,
            paid_pack,
            status_value="EXPIRED",
            product=product,
            expires_at=utcnow() - timedelta(days=1),
        )
        db.commit()
        paid_pack_id = paid_pack.id
        free_pack_id = free_pack.id
        active_entitlement_id = active_entitlement.id
    finally:
        db.close()

    no_access = client.get(f"/course-packs/{paid_pack_id}/access", headers=no_entitlement_headers)
    assert no_access.status_code == 200
    assert no_access.json()["hasAccess"] is False
    assert client.post(f"/course-packs/{paid_pack_id}/start", headers=no_entitlement_headers).status_code == 403

    revoked_access = client.get(f"/course-packs/{paid_pack_id}/access", headers=revoked_headers)
    assert revoked_access.status_code == 200
    assert revoked_access.json()["hasAccess"] is False
    assert revoked_access.json()["entitlementStatus"] == "REVOKED"
    assert client.post(f"/course-packs/{paid_pack_id}/start", headers=revoked_headers).status_code == 403

    expired_access = client.get(f"/course-packs/{paid_pack_id}/access", headers=expired_headers)
    assert expired_access.status_code == 200
    assert expired_access.json()["hasAccess"] is False
    assert expired_access.json()["entitlementStatus"] == "EXPIRED"
    assert client.post(f"/course-packs/{paid_pack_id}/start", headers=expired_headers).status_code == 403

    free_start = client.post(f"/course-packs/{free_pack_id}/start", headers=no_entitlement_headers)
    assert free_start.status_code == 201
    assert free_start.json()["created"] is True
    assert free_start.json()["wordCount"] == 1

    active_access = client.get(f"/course-packs/{paid_pack_id}/access", headers=active_headers)
    assert active_access.status_code == 200
    assert active_access.json()["hasAccess"] is True
    paid_start = client.post(f"/course-packs/{paid_pack_id}/start", headers=active_headers)
    assert paid_start.status_code == 201
    paid_body = paid_start.json()
    assert paid_body["created"] is True
    assert paid_body["wordCount"] == 1
    repeat_start = client.post(f"/course-packs/{paid_pack_id}/start", headers=active_headers)
    assert repeat_start.status_code == 201
    assert repeat_start.json()["created"] is False
    assert repeat_start.json()["wordbookId"] == paid_body["wordbookId"]

    db = SessionLocal()
    try:
        assert db.query(CourseLessonItem).filter(CourseLessonItem.key == "premium").one().value == "paid answer"
        assert "user_id" not in CourseLessonItem.__table__.columns
        assert db.query(MemoryItem).filter(MemoryItem.wordbook_id == paid_body["wordbookId"]).count() == 1
        assert db.query(ReviewState).join(Card, Card.id == ReviewState.card_id).filter(Card.wordbook_id == paid_body["wordbookId"]).count() > 0
    finally:
        db.close()

    cards = client.get(f"/study/today?wordbookId={paid_body['wordbookId']}&limit=10", headers=active_headers).json()["cards"]
    client.post(
        f"/study/cards/{cards[0]['cardId']}/review",
        json={"rating": "GOOD", "clientEventId": "paid-course-review"},
        headers=active_headers,
    )

    db = SessionLocal()
    try:
        review_count = db.query(ReviewLog).count()
        state_count = db.query(ReviewState).count()
        entitlement = db.query(UserEntitlement).filter(UserEntitlement.id == active_entitlement_id).one()
        revoke_course_entitlement(db, entitlement)
        db.commit()
        assert db.query(ReviewLog).count() == review_count
        assert db.query(ReviewState).count() == state_count
    finally:
        db.close()

    assert client.get(f"/course-packs/{paid_pack_id}/access", headers=active_headers).json()["hasAccess"] is False
    assert client.post(f"/course-packs/{paid_pack_id}/start", headers=active_headers).status_code == 403
    assert client.post("/admin/products", json={}, headers=active_headers).status_code == 404


def test_study_today_returns_summary_filters_wordbook_and_spreads_related_cards(client, auth_headers):
    wordbook_one = client.post("/wordbooks", json={"name": "Travel"}, headers=auth_headers).json()
    wordbook_two = client.post("/wordbooks", json={"name": "Commands"}, headers=auth_headers).json()
    for payload in [{"key": "departure", "value": "출발"}, {"key": "passport", "value": "여권"}]:
        client.post(f"/wordbooks/{wordbook_one['id']}/words", json=payload, headers=auth_headers)
    client.post(f"/wordbooks/{wordbook_two['id']}/words", json={"key": "ls", "value": "목록 보기"}, headers=auth_headers)

    all_queue = client.get("/study/today?limit=10", headers=auth_headers)
    assert all_queue.status_code == 200
    all_body = all_queue.json()
    assert {"dueCount", "newCount", "weakCount", "estimatedMinutes"}.issubset(set(all_body["summary"]))
    assert len(all_body["cards"]) == 6
    assert {card["wordbookId"] for card in all_body["cards"]} == {wordbook_one["id"], wordbook_two["id"]}

    filtered = client.get(f"/study/today?wordbookId={wordbook_one['id']}&limit=10", headers=auth_headers).json()
    assert len(filtered["cards"]) == 4
    assert {card["wordbookId"] for card in filtered["cards"]} == {wordbook_one["id"]}
    memory_item_ids = [card["memoryItemId"] for card in filtered["cards"]]
    assert all(left != right for left, right in zip(memory_item_ids, memory_item_ids[1:]))


def test_daily_quest_summary_tracks_progress_and_distinct_mastered_items(client, auth_headers):
    from app.database import SessionLocal
    from app.models import Card, ReviewState

    wordbook = client.post("/wordbooks", json={"name": "Quest"}, headers=auth_headers).json()
    client.post(f"/wordbooks/{wordbook['id']}/words", json={"key": "quest", "value": "mission"}, headers=auth_headers)

    first = client.get("/study/daily-quest?limit=5", headers=auth_headers)
    assert first.status_code == 200
    body = first.json()
    assert body["summary"]["targetCount"] == 5
    assert body["summary"]["completedCount"] == 0
    assert body["summary"]["remainingCount"] == 5
    assert body["summary"]["questDayCount"] == 0
    assert body["summary"]["masteredCount"] == 0
    assert len(body["cards"]) >= 1

    client.post(
        f"/study/cards/{body['cards'][0]['cardId']}/review",
        json={"rating": "GOOD", "clientEventId": "daily-quest-good-1"},
        headers=auth_headers,
    )
    progressed = client.get("/study/daily-quest?limit=5", headers=auth_headers).json()
    assert progressed["summary"]["completedCount"] == 1
    assert progressed["summary"]["todayStudiedCount"] == 1
    assert progressed["summary"]["questDayCount"] == 1

    db = SessionLocal()
    try:
        states = db.query(ReviewState).join(Card, Card.id == ReviewState.card_id).filter(Card.wordbook_id == wordbook["id"]).all()
        for state in states:
            state.status = "MASTERED"
        db.commit()
    finally:
        db.close()

    mastered = client.get("/study/daily-quest?limit=5", headers=auth_headers).json()
    assert mastered["summary"]["masteredCount"] == 1


def test_analytics_summary_and_recommendation_signals(client, auth_headers):
    from app.database import SessionLocal
    from app.models import ReviewState

    wordbook = client.post("/wordbooks", json={"name": "Analytics"}, headers=auth_headers).json()
    client.post(f"/wordbooks/{wordbook['id']}/words", json={"key": "bad", "value": "needs work"}, headers=auth_headers)
    client.post(
        f"/wordbooks/{wordbook['id']}/words",
        json={"key": "ready", "value": "prepared", "exampleSentence": "ready to go", "tags": ["quality"]},
        headers=auth_headers,
    )
    today = client.get(f"/study/today?wordbookId={wordbook['id']}&limit=10", headers=auth_headers).json()
    assert all("recommendationReason" in card and "recommendationScore" in card for card in today["cards"])
    bad_card = next(card for card in today["cards"] if card["prompt"] == "bad")
    ready_card = next(card for card in today["cards"] if card["prompt"] == "ready")

    client.post(
        f"/study/cards/{bad_card['cardId']}/review",
        json={"rating": "AGAIN", "clientEventId": "analytics-bad-1"},
        headers=auth_headers,
    )
    client.post(
        f"/study/cards/{bad_card['cardId']}/review",
        json={"rating": "AGAIN", "clientEventId": "analytics-bad-2"},
        headers=auth_headers,
    )
    client.post(
        f"/study/cards/{ready_card['cardId']}/review",
        json={"rating": "GOOD", "clientEventId": "analytics-ready-1"},
        headers=auth_headers,
    )

    db = SessionLocal()
    try:
        state = db.query(ReviewState).filter(ReviewState.card_id == bad_card["cardId"]).one()
        state.lapses = 2
        state.leech_score = 3
        db.commit()
    finally:
        db.close()

    analytics = client.get(f"/analytics/summary?wordbookId={wordbook['id']}", headers=auth_headers)
    assert analytics.status_code == 200
    body = analytics.json()
    assert body["review"]["reviewCount"] == 3
    assert body["review"]["correctCount"] == 1
    assert body["review"]["againCount"] == 2
    assert body["review"]["recallRate"] == 1 / 3
    assert body["cardQuality"]["activeCardCount"] >= 4
    assert body["cardQuality"]["weakCardCount"] >= 1
    assert body["cardQuality"]["leechCardCount"] >= 1
    assert body["cardQuality"]["lowRecallCardCount"] >= 1
    assert body["contentQuality"]["activeItemCount"] == 2
    assert body["contentQuality"]["missingExampleSentenceCount"] == 1
    assert body["contentQuality"]["taggedItemCount"] == 1
    assert body["contentQuality"]["sentenceReadyItemCount"] == 1


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


def test_study_events_generate_after_review_and_respect_settings(client, auth_headers):
    from app.database import SessionLocal
    from app.models import Card, ReviewState, StudyEvent

    wordbook_id = client.post("/wordbooks", json={"name": "Events"}, headers=auth_headers).json()["id"]
    client.post(f"/wordbooks/{wordbook_id}/words", json={"key": "old", "value": "오래된"}, headers=auth_headers)
    first_card = client.get(f"/study/today?wordbookId={wordbook_id}&limit=1", headers=auth_headers).json()["cards"][0]

    db = SessionLocal()
    try:
        state = db.query(ReviewState).join(Card, Card.id == ReviewState.card_id).filter(Card.id == first_card["cardId"]).one()
        state.status = "MASTERED"
        state.leech_score = 2
        db.commit()
    finally:
        db.close()

    reviewed = client.post(
        f"/study/cards/{first_card['cardId']}/review",
        json={"rating": "AGAIN", "platform": "WEB", "clientEventId": "event-lapse"},
        headers=auth_headers,
    )
    assert reviewed.status_code == 200

    db = SessionLocal()
    try:
        event_types = {event.event_type for event in db.query(StudyEvent).all()}
        assert {"MASTERED_LAPSE", "LEECH"}.issubset(event_types)
        event_count = db.query(StudyEvent).count()
    finally:
        db.close()

    settings = client.patch("/me/settings", json={"funEventsEnabled": False}, headers=auth_headers)
    assert settings.status_code == 200
    assert settings.json()["funEventsEnabled"] is False

    client.post(f"/wordbooks/{wordbook_id}/words", json={"key": "quiet", "value": "조용한"}, headers=auth_headers)
    cards = client.get(f"/study/today?wordbookId={wordbook_id}&limit=10", headers=auth_headers).json()["cards"]
    second_card = next(card for card in cards if card["prompt"] == "quiet")
    db = SessionLocal()
    try:
        state = db.query(ReviewState).join(Card, Card.id == ReviewState.card_id).filter(Card.id == second_card["cardId"]).one()
        state.status = "MASTERED"
        state.leech_score = 2
        db.commit()
    finally:
        db.close()

    client.post(
        f"/study/cards/{second_card['cardId']}/review",
        json={"rating": "AGAIN", "platform": "WEB", "clientEventId": "event-disabled"},
        headers=auth_headers,
    )
    db = SessionLocal()
    try:
        assert db.query(StudyEvent).count() == event_count
    finally:
        db.close()


def test_study_groups_permissions_progress_and_weak_cards(client, auth_headers):
    owner_headers = auth_headers
    member_token = client.post("/auth/register", json={"username": "member", "password": "password123"}).json()["token"]
    member_headers = {"Authorization": f"Bearer {member_token}"}
    outsider_token = client.post("/auth/register", json={"username": "outsider", "password": "password123"}).json()["token"]
    outsider_headers = {"Authorization": f"Bearer {outsider_token}"}

    owner_wordbook = client.post("/wordbooks", json={"name": "Owner Deck"}, headers=owner_headers).json()
    client.post(
        f"/wordbooks/{owner_wordbook['id']}/words",
        json={"key": "alpha", "value": "owner answer"},
        headers=owner_headers,
    )
    owner_card = client.get(f"/study/today?wordbookId={owner_wordbook['id']}&limit=10", headers=owner_headers).json()["cards"][0]
    client.post(
        f"/study/cards/{owner_card['cardId']}/review",
        json={"rating": "AGAIN", "clientEventId": "group-owner-again"},
        headers=owner_headers,
    )

    group = client.post("/study-groups", json={"name": "Team"}, headers=owner_headers)
    assert group.status_code == 201
    group_id = group.json()["id"]
    linked_owner = client.post(
        f"/study-groups/{group_id}/wordbooks",
        json={"wordbookId": owner_wordbook["id"]},
        headers=owner_headers,
    )
    assert linked_owner.status_code == 201

    assert client.get(f"/study-groups/{group_id}", headers=outsider_headers).status_code == 404
    assert client.get(f"/study-groups/{group_id}/progress", headers=outsider_headers).status_code == 404

    invite = client.post(f"/study-groups/{group_id}/members", json={"username": "member"}, headers=owner_headers)
    assert invite.status_code == 201
    assert invite.json()["status"] == "PENDING"
    listed_for_member = client.get("/study-groups", headers=member_headers)
    assert listed_for_member.status_code == 200
    assert listed_for_member.json()[0]["myStatus"] == "PENDING"
    assert client.get(f"/study-groups/{group_id}/progress", headers=member_headers).status_code == 404
    assert (
        client.post(
            f"/study-groups/{group_id}/wordbooks",
            json={"wordbookId": owner_wordbook["id"]},
            headers=member_headers,
        ).status_code
        == 404
    )

    accepted = client.patch(f"/study-groups/{group_id}/members/me", json={"status": "ACTIVE"}, headers=member_headers)
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "ACTIVE"

    member_wordbook = client.post("/wordbooks", json={"name": "Member Deck"}, headers=member_headers).json()
    client.post(
        f"/wordbooks/{member_wordbook['id']}/words",
        json={"key": "beta", "value": "member answer"},
        headers=member_headers,
    )
    member_card = client.get(f"/study/today?wordbookId={member_wordbook['id']}&limit=10", headers=member_headers).json()["cards"][0]
    client.post(
        f"/study/cards/{member_card['cardId']}/review",
        json={"rating": "GOOD", "clientEventId": "group-member-good"},
        headers=member_headers,
    )
    linked_member = client.post(
        f"/study-groups/{group_id}/wordbooks",
        json={"wordbookId": member_wordbook["id"]},
        headers=member_headers,
    )
    assert linked_member.status_code == 201

    progress = client.get(f"/study-groups/{group_id}/progress", headers=owner_headers)
    assert progress.status_code == 200
    progress_body = progress.json()
    assert progress_body["activeMemberCount"] == 2
    assert progress_body["linkedWordbookCount"] == 2
    assert progress_body["reviewCount30d"] == 2
    assert progress_body["correctCount30d"] == 1
    assert progress_body["recallRate30d"] == 0.5

    owner_weak = client.get(f"/study-groups/{group_id}/weak-cards", headers=owner_headers)
    assert owner_weak.status_code == 200
    assert any(card["prompt"] == "alpha" for card in owner_weak.json()["cards"])
    assert all(card["prompt"] != "beta" for card in owner_weak.json()["cards"])

    member_weak = client.get(f"/study-groups/{group_id}/weak-cards", headers=member_headers)
    assert member_weak.status_code == 200
    assert all(card["prompt"] != "alpha" for card in member_weak.json()["cards"])

    non_owner_invite = client.post(f"/study-groups/{group_id}/members", json={"username": "outsider"}, headers=member_headers)
    assert non_owner_invite.status_code == 403


def test_teacher_classes_assignments_and_dashboard_permissions(client, auth_headers):
    teacher_headers = auth_headers
    student_token = client.post("/auth/register", json={"username": "student", "password": "password123"}).json()["token"]
    student_headers = {"Authorization": f"Bearer {student_token}"}
    outsider_token = client.post("/auth/register", json={"username": "class-outsider", "password": "password123"}).json()["token"]
    outsider_headers = {"Authorization": f"Bearer {outsider_token}"}

    teacher_wordbook = client.post("/wordbooks", json={"name": "Lesson 1"}, headers=teacher_headers).json()
    client.post(
        f"/wordbooks/{teacher_wordbook['id']}/words",
        json={"key": "teacher", "value": "content"},
        headers=teacher_headers,
    )
    student_wordbook = client.post("/wordbooks", json={"name": "Private Student"}, headers=student_headers).json()

    classroom = client.post("/classes", json={"name": "Morning Class"}, headers=teacher_headers)
    assert classroom.status_code == 201
    class_id = classroom.json()["id"]
    assert classroom.json()["myRole"] == "TEACHER"
    assert classroom.json()["studentCount"] == 0

    assert client.get(f"/classes/{class_id}", headers=outsider_headers).status_code == 404
    invite = client.post(f"/classes/{class_id}/members", json={"username": "student"}, headers=teacher_headers)
    assert invite.status_code == 201
    assert invite.json()["role"] == "STUDENT"
    assert invite.json()["status"] == "PENDING"

    listed_for_student = client.get("/classes", headers=student_headers)
    assert listed_for_student.status_code == 200
    assert listed_for_student.json()[0]["myStatus"] == "PENDING"
    assert client.get(f"/classes/{class_id}/assignments", headers=student_headers).status_code == 404

    accepted = client.patch(f"/classes/{class_id}/members/me", json={"status": "ACTIVE"}, headers=student_headers)
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "ACTIVE"

    assignment = client.post(
        f"/classes/{class_id}/assignments",
        json={"wordbookId": teacher_wordbook["id"], "title": "Day 1"},
        headers=teacher_headers,
    )
    assert assignment.status_code == 201
    assert assignment.json()["title"] == "Day 1"
    assert assignment.json()["wordbookId"] == teacher_wordbook["id"]

    assert (
        client.post(
            f"/classes/{class_id}/assignments",
            json={"wordbookId": student_wordbook["id"], "title": "Not mine"},
            headers=teacher_headers,
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/classes/{class_id}/assignments",
            json={"wordbookId": student_wordbook["id"], "title": "Student cannot"},
            headers=student_headers,
        ).status_code
        == 403
    )

    student_assignments = client.get(f"/classes/{class_id}/assignments", headers=student_headers)
    assert student_assignments.status_code == 200
    assert student_assignments.json()[0]["title"] == "Day 1"

    dashboard = client.get(f"/classes/{class_id}/dashboard", headers=teacher_headers)
    assert dashboard.status_code == 200
    dashboard_body = dashboard.json()
    assert dashboard_body["activeStudentCount"] == 1
    assert dashboard_body["assignmentCount"] == 1
    assert dashboard_body["assignments"][0]["assignedCount"] == 1
    assert dashboard_body["assignments"][0]["reviewCount30d"] == 0
    assert dashboard_body["assignments"][0]["recallRate30d"] == 0
    assert client.get(f"/classes/{class_id}/dashboard", headers=student_headers).status_code == 403
    assert client.post(f"/classes/{class_id}/members", json={"username": "class-outsider"}, headers=student_headers).status_code == 403


def test_study_mistakes_includes_recent_again_reviews_even_without_lapses(client, auth_headers):
    from app.database import SessionLocal
    from app.models import ReviewState
    from app.security import utcnow

    wordbook_id = client.post("/wordbooks", json={"name": "Mistakes recent"}, headers=auth_headers).json()["id"]
    client.post(f"/wordbooks/{wordbook_id}/words", json={"key": "delta", "value": "변화"}, headers=auth_headers)
    card = client.get(f"/study/today?wordbookId={wordbook_id}&limit=1", headers=auth_headers).json()["cards"][0]

    client.post(
        f"/study/cards/{card['cardId']}/review",
        json={"rating": "AGAIN", "platform": "WEB", "clientEventId": "mistake-recent-again"},
        headers=auth_headers,
    )

    db = SessionLocal()
    try:
        state = db.query(ReviewState).filter(ReviewState.card_id == card["cardId"]).one()
        state.lapses = 0
        state.leech_score = 0
        state.updated_at = utcnow()
        db.commit()
    finally:
        db.close()

    mistakes = client.get(f"/study/mistakes?wordbookId={wordbook_id}", headers=auth_headers)
    assert mistakes.status_code == 200
    assert any(row["cardId"] == card["cardId"] for row in mistakes.json()["cards"])


def test_study_today_samples_old_mastered_cards_with_filters(client, auth_headers):
    from app.database import SessionLocal
    from app.models import Card, ReviewState

    wb = client.post("/wordbooks", json={"name": "Mastered"}, headers=auth_headers).json()
    client.post(f"/wordbooks/{wb['id']}/words", json={"key": "a", "value": "A"}, headers=auth_headers)
    client.post(f"/wordbooks/{wb['id']}/words", json={"key": "b", "value": "B"}, headers=auth_headers)

    today = client.get(f"/study/today?wordbookId={wb['id']}&limit=10", headers=auth_headers).json()
    card_ids = [row["cardId"] for row in today["cards"]]
    db = SessionLocal()
    try:
        states = db.query(ReviewState).join(Card, Card.id == ReviewState.card_id).filter(Card.id.in_(card_ids)).all()
        for state in states:
            state.status = "MASTERED"
            state.due_at = datetime.now(timezone.utc) + timedelta(days=30)
            state.last_reviewed_at = datetime.now(timezone.utc) - timedelta(days=20)
            state.mastered_at = datetime.now(timezone.utc) - timedelta(days=40)
        states[0].last_reviewed_at = datetime.now(timezone.utc) - timedelta(days=3)  # exclude recent
        db.commit()
    finally:
        db.close()

    sampled = client.get(f"/study/today?wordbookId={wb['id']}&limit=10", headers=auth_headers)
    assert sampled.status_code == 200
    body = sampled.json()
    assert body["summary"].get("masteredCheckCount", 0) >= 1
    assert len(body["cards"]) <= 10
    assert len({row["cardId"] for row in body["cards"]}) == len(body["cards"])


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
