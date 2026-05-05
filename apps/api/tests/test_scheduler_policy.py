from datetime import datetime, timezone

from app.models import ReviewState
from app.review import (
    RATING_GOOD,
    SimpleSRS,
    STATUS_MASTERED,
    STATUS_REVIEW,
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
