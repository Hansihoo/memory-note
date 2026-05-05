from datetime import datetime, timedelta, timezone

from app.models import ReviewState
from app.review import (
    FSRSScheduler,
    RATING_AGAIN,
    RATING_EASY,
    RATING_GOOD,
    SimpleSRS,
    STATUS_MASTERED,
    STATUS_RELEARNING,
    STATUS_REVIEW,
    calculate_retrievability,
    scheduler_from_config,
)


def build_state(**overrides):
    state = ReviewState(
        status=STATUS_REVIEW,
        interval_days=30,
        streak=5,
        lapses=1,
        difficulty=0.5,
        ease_factor=2.5,
        stability=30,
        leech_score=0,
        reps=10,
    )
    for key, value in overrides.items():
        setattr(state, key, value)
    return state


def test_mastered_requires_interval_streak_and_lapses():
    now = datetime.now(timezone.utc)
    scheduler = SimpleSRS()
    assert scheduler.review(build_state(interval_days=31, streak=6, lapses=1), RATING_GOOD, now)["status"] == STATUS_MASTERED
    assert scheduler.review(build_state(lapses=2), RATING_GOOD, now)["status"] != STATUS_MASTERED
    assert scheduler.review(build_state(interval_days=1), RATING_GOOD, now)["status"] != STATUS_MASTERED
    assert scheduler.review(build_state(streak=0), RATING_GOOD, now)["status"] != STATUS_MASTERED


def test_mastered_difficulty_policy():
    now = datetime.now(timezone.utc)
    scheduler = SimpleSRS()
    assert scheduler.review(build_state(difficulty=0.8), RATING_GOOD, now)["status"] != STATUS_MASTERED
    assert scheduler.review(build_state(difficulty=None), RATING_GOOD, now)["status"] == STATUS_MASTERED


def test_scheduler_engine_config_defaults_to_simple(monkeypatch):
    monkeypatch.delenv("SCHEDULER_ENGINE", raising=False)
    assert isinstance(scheduler_from_config(), SimpleSRS)

    monkeypatch.setenv("SCHEDULER_ENGINE", "fsrs")
    assert isinstance(scheduler_from_config(), FSRSScheduler)

    monkeypatch.setenv("SCHEDULER_ENGINE", "unknown")
    assert isinstance(scheduler_from_config(), SimpleSRS)


def test_fsrs_scheduler_keeps_review_interface_and_again_behavior():
    now = datetime.now(timezone.utc)
    scheduler = FSRSScheduler()

    reviewed = scheduler.review(build_state(status=STATUS_REVIEW, stability=2, interval_days=2), RATING_EASY, now)
    assert reviewed["status"] == STATUS_REVIEW
    assert reviewed["stability"] > 2
    assert reviewed["interval_days"] >= 1
    assert reviewed["last_reviewed_at"] == now

    forgotten = scheduler.review(build_state(status=STATUS_MASTERED, stability=20, interval_days=20), RATING_AGAIN, now)
    assert forgotten["status"] == STATUS_RELEARNING
    assert forgotten["lapses"] == 2
    assert forgotten["interval_days"] == 10 / (24 * 60)


def test_fsrs_uses_computed_retrievability_not_persisted_column():
    now = datetime.now(timezone.utc)
    scheduler = FSRSScheduler()
    recent_state = build_state(stability=10, interval_days=10, last_reviewed_at=now)
    old_state = build_state(stability=10, interval_days=10, last_reviewed_at=now - timedelta(days=365))

    assert "retrievability" not in ReviewState.__table__.columns
    assert calculate_retrievability(recent_state, now) > calculate_retrievability(old_state, now)
    assert scheduler.review(old_state, RATING_GOOD, now)["stability"] > scheduler.review(recent_state, RATING_GOOD, now)["stability"]
