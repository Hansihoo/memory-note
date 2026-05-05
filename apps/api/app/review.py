import math
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .models import Card, MemoryItem, ReviewLog, ReviewState, User, Word, Wordbook
from .security import utcnow


ITEM_TYPE_WORD = "WORD"
ITEM_TYPE_QA = "QA"
ITEM_TYPE_COMMAND = "COMMAND"
ITEM_TYPE_SENTENCE = "SENTENCE"

CARD_TYPE_KEY_TO_VALUE = "BASIC_KEY_TO_VALUE"
CARD_TYPE_VALUE_TO_KEY = "BASIC_VALUE_TO_KEY"
CARD_TYPE_CLOZE = "CLOZE"
CARD_TYPE_LISTENING = "LISTENING"
CARD_TYPE_TYPING = "TYPING"
CARD_TYPE_SITUATION_RESPONSE = "SITUATION_RESPONSE"

STATUS_NEW = "NEW"
STATUS_LEARNING = "LEARNING"
STATUS_REVIEW = "REVIEW"
STATUS_RELEARNING = "RELEARNING"
STATUS_MASTERED = "MASTERED"
STATUS_SUSPENDED = "SUSPENDED"

RATING_AGAIN = "AGAIN"
RATING_HARD = "HARD"
RATING_GOOD = "GOOD"
RATING_EASY = "EASY"

RATING_BY_LEGACY_RESULT = {
    "known": RATING_GOOD,
    "unknown": RATING_AGAIN,
}

CARD_TYPE_BY_DIRECTION = {
    "key-to-value": CARD_TYPE_KEY_TO_VALUE,
    "value-to-key": CARD_TYPE_VALUE_TO_KEY,
}


def create_default_cards_for_item(item: MemoryItem) -> List[Dict[str, str]]:
    if item.item_type == ITEM_TYPE_SENTENCE:
        return []

    cards = [
        {
            "card_type": CARD_TYPE_KEY_TO_VALUE,
            "prompt": item.key,
            "answer": item.value,
        }
    ]

    if item.item_type == ITEM_TYPE_WORD:
        cards.append(
            {
                "card_type": CARD_TYPE_VALUE_TO_KEY,
                "prompt": item.value,
                "answer": item.key,
            }
        )

    return cards


def ensure_memory_item_for_word(
    db: Session,
    user: User,
    word: Word,
    item_type: str = ITEM_TYPE_WORD,
) -> MemoryItem:
    item = word.memory_item
    now = utcnow()

    if item is None:
        item = (
            db.query(MemoryItem)
            .filter(
                MemoryItem.user_id == user.id,
                MemoryItem.legacy_word_id == word.id,
            )
            .first()
        )

    if item is None:
        item = MemoryItem(
            user_id=user.id,
            wordbook_id=word.wordbook_id,
            legacy_word_id=word.id,
            key=word.key,
            value=word.value,
            item_type=item_type,
            source="legacy-word",
            created_at=word.created_at or now,
            updated_at=now,
        )
        db.add(item)
        db.flush()
        word.memory_item_id = item.id
    else:
        item.wordbook_id = word.wordbook_id
        item.legacy_word_id = word.id
        item.key = word.key
        item.value = word.value
        item.updated_at = now
        if item.deleted_at is not None and word.deleted_at is None:
            item.deleted_at = None
        word.memory_item_id = item.id

    ensure_default_cards_for_item(db, user, item)
    return item


def ensure_default_cards_for_item(
    db: Session,
    user: User,
    item: MemoryItem,
) -> List[Card]:
    desired_cards = create_default_cards_for_item(item)
    existing_cards = {
        card.card_type: card
        for card in db.query(Card)
        .filter(Card.item_id == item.id)
        .all()
    }
    cards: List[Card] = []

    for desired in desired_cards:
        card = existing_cards.get(desired["card_type"])
        if card is None:
            card = Card(
                user_id=user.id,
                wordbook_id=item.wordbook_id,
                item_id=item.id,
                card_type=desired["card_type"],
                prompt=desired["prompt"],
                answer=desired["answer"],
                active=item.deleted_at is None,
            )
            db.add(card)
            db.flush()
        else:
            card.user_id = user.id
            card.wordbook_id = item.wordbook_id
            card.prompt = desired["prompt"]
            card.answer = desired["answer"]
            card.active = item.deleted_at is None
            if item.deleted_at is None:
                card.deleted_at = None
            card.updated_at = utcnow()

        ensure_review_state(db, user.id, card)
        cards.append(card)

    return cards


def ensure_review_state(db: Session, user_id: int, card: Card) -> ReviewState:
    state = card.review_state
    if state is None:
        state = db.query(ReviewState).filter(ReviewState.card_id == card.id).first()

    if state is None:
        state = ReviewState(user_id=user_id, card_id=card.id, status=STATUS_NEW, due_at=utcnow())
        db.add(state)
        db.flush()

    return state


def deactivate_memory_item_for_word(db: Session, user: User, word: Word) -> None:
    item = word.memory_item
    if item is None and word.memory_item_id:
        item = db.query(MemoryItem).filter(MemoryItem.id == word.memory_item_id, MemoryItem.user_id == user.id).first()
    if item is None:
        item = db.query(MemoryItem).filter(MemoryItem.user_id == user.id, MemoryItem.legacy_word_id == word.id).first()
    if item is None:
        return

    now = utcnow()
    item.deleted_at = item.deleted_at or now
    item.updated_at = now
    for card in item.cards:
        card.active = False
        card.deleted_at = card.deleted_at or now
        card.updated_at = now


def backfill_review_models(db: Session, user: Optional[User] = None) -> None:
    active_query = db.query(Word).join(Wordbook).filter(Word.deleted_at.is_(None), Wordbook.deleted_at.is_(None))
    if user is not None:
        active_query = active_query.filter(Wordbook.user_id == user.id)

    for word in active_query.all():
        owner = user or word.wordbook.user
        ensure_memory_item_for_word(db, owner, word)

    deleted_query = db.query(Word).join(Wordbook).filter(Word.deleted_at.isnot(None))
    if user is not None:
        deleted_query = deleted_query.filter(Wordbook.user_id == user.id)

    for word in deleted_query.all():
        owner = user or word.wordbook.user
        deactivate_memory_item_for_word(db, owner, word)


def find_card_for_word(
    db: Session,
    user: User,
    word: Word,
    card_type: Optional[str] = None,
) -> Card:
    item = ensure_memory_item_for_word(db, user, word)
    resolved_card_type = card_type or CARD_TYPE_KEY_TO_VALUE
    card = (
        db.query(Card)
        .filter(
            Card.user_id == user.id,
            Card.item_id == item.id,
            Card.card_type == resolved_card_type,
            Card.deleted_at.is_(None),
        )
        .first()
    )
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review card not found")
    return card


class SchedulerService:
    def review(self, state: ReviewState, rating: str, reviewed_at: datetime) -> Dict[str, Any]:
        raise NotImplementedError


class SimpleSRS(SchedulerService):
    def review(self, state: ReviewState, rating: str, reviewed_at: datetime) -> Dict[str, Any]:
        reps = int(state.reps or 0) + 1
        lapses = int(state.lapses or 0)
        streak = int(state.streak or 0)
        interval_days = float(state.interval_days or 0)
        ease = float(state.ease_factor or 2.5)
        difficulty = float(state.difficulty or 0.3)
        stability = float(state.stability or 0)
        leech_score = int(state.leech_score or 0)
        mastered_at = state.mastered_at

        if rating == RATING_AGAIN:
            lapses += 1
            streak = 0
            interval_days = 10 / (24 * 60)
            ease = max(1.3, ease - 0.2)
            difficulty = min(1.0, difficulty + 0.15)
            stability = max(0.1, stability * 0.5)
            leech_score += 2
            due_at = reviewed_at + timedelta(minutes=10)
            next_status = STATUS_RELEARNING
        elif rating == RATING_HARD:
            streak += 1
            interval_days = max(1.0, interval_days * 1.2 if interval_days else 1.0)
            ease = max(1.3, ease - 0.05)
            difficulty = min(1.0, difficulty + 0.08)
            stability = max(stability + 0.7, interval_days)
            leech_score = max(0, leech_score - 1)
            due_at = reviewed_at + timedelta(days=interval_days)
            next_status = STATUS_REVIEW
        elif rating == RATING_EASY:
            streak += 1
            interval_days = max(4.0, interval_days * ease * 1.4 if interval_days else 4.0)
            ease = min(3.2, ease + 0.1)
            difficulty = max(0.0, difficulty - 0.08)
            stability = max(stability + interval_days, interval_days)
            leech_score = max(0, leech_score - 2)
            due_at = reviewed_at + timedelta(days=interval_days)
            next_status = STATUS_REVIEW
        else:
            streak += 1
            interval_days = max(1.0, interval_days * ease if interval_days else 1.0)
            difficulty = max(0.0, difficulty - 0.04)
            stability = max(stability + interval_days, interval_days)
            leech_score = max(0, leech_score - 1)
            due_at = reviewed_at + timedelta(days=interval_days)
            next_status = STATUS_REVIEW

        can_use_difficulty = state.difficulty is not None
        difficulty_allows_mastered = (difficulty <= 0.7) if can_use_difficulty else True
        if state.status == STATUS_REVIEW and interval_days >= 30 and streak >= 5 and lapses <= 1 and difficulty_allows_mastered:
            next_status = STATUS_MASTERED
            mastered_at = mastered_at or reviewed_at

        return {
            "status": next_status,
            "due_at": due_at,
            "last_reviewed_at": reviewed_at,
            "reps": reps,
            "lapses": lapses,
            "streak": streak,
            "interval_days": interval_days,
            "ease_factor": ease,
            "difficulty": difficulty,
            "stability": stability,
            "leech_score": leech_score,
            "mastered_at": mastered_at,
        }


def review_state_snapshot(state: ReviewState) -> Dict[str, Any]:
    return {
        "status": state.status,
        "dueAt": state.due_at.isoformat() if state.due_at else None,
        "lastReviewedAt": state.last_reviewed_at.isoformat() if state.last_reviewed_at else None,
        "reps": state.reps,
        "lapses": state.lapses,
        "streak": state.streak,
        "intervalDays": state.interval_days,
        "easeFactor": state.ease_factor,
        "difficulty": state.difficulty,
        "stability": state.stability,
        "leechScore": state.leech_score,
        "masteredAt": state.mastered_at.isoformat() if state.mastered_at else None,
    }


def comparable_datetime(value: Optional[datetime], fallback: datetime, reference: datetime) -> datetime:
    resolved = value or fallback
    if reference.tzinfo is not None and resolved.tzinfo is None:
        return resolved.replace(tzinfo=reference.tzinfo)
    if reference.tzinfo is None and resolved.tzinfo is not None:
        return resolved.replace(tzinfo=None)
    return resolved


def calculate_retrievability(state: ReviewState, now: Optional[datetime] = None) -> float:
    if not state.last_reviewed_at or not state.stability or state.stability <= 0:
        return 0.0
    reference = now or utcnow()
    last_reviewed = comparable_datetime(state.last_reviewed_at, datetime.min, reference)
    elapsed_days = max(0.0, (reference - last_reviewed).total_seconds() / 86400)
    return max(0.0, min(1.0, math.exp(-elapsed_days / float(state.stability))))


def review_card(
    db: Session,
    user: User,
    card: Card,
    rating: str,
    *,
    confidence: Optional[int] = None,
    response_text: Optional[str] = None,
    latency_ms: Optional[int] = None,
    platform: str = "WEB",
    session_id: Optional[str] = None,
    client_event_id: Optional[str] = None,
    scheduler: Optional[SchedulerService] = None,
    reviewed_at: Optional[datetime] = None,
) -> Tuple[Card, ReviewState, Optional[ReviewLog], bool]:
    if rating not in {RATING_AGAIN, RATING_HARD, RATING_GOOD, RATING_EASY}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported review rating")
    if card.user_id != user.id or not card.active or card.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review card not found")

    state = ensure_review_state(db, user.id, card)
    if client_event_id:
        existing_log = (
            db.query(ReviewLog)
            .filter(ReviewLog.user_id == user.id, ReviewLog.client_event_id == client_event_id)
            .first()
        )
        if existing_log is not None:
            db.refresh(state)
            return card, state, existing_log, True

    scheduler = scheduler or SimpleSRS()
    reviewed_at = reviewed_at or utcnow()
    before = review_state_snapshot(state)
    next_state = scheduler.review(state, rating, reviewed_at)

    for field, value in next_state.items():
        setattr(state, field, value)
    state.updated_at = reviewed_at

    after = review_state_snapshot(state)
    log = ReviewLog(
        user_id=user.id,
        card_id=card.id,
        deck_id=card.wordbook_id,
        session_id=session_id,
        rating=rating,
        is_correct=rating != RATING_AGAIN,
        confidence=confidence,
        response_text=response_text,
        latency_ms=latency_ms,
        reviewed_at=reviewed_at,
        platform=platform,
        state_before_json=before,
        state_after_json=after,
        client_event_id=client_event_id,
    )
    db.add(log)
    db.flush()
    return card, state, log, False


def today_cards_query(db: Session, user: User, wordbook_id: Optional[int] = None):
    query = (
        db.query(Card, MemoryItem, ReviewState)
        .join(MemoryItem, Card.item_id == MemoryItem.id)
        .join(Wordbook, Card.wordbook_id == Wordbook.id)
        .join(ReviewState, ReviewState.card_id == Card.id)
        .filter(
            Card.user_id == user.id,
            Card.active.is_(True),
            Card.deleted_at.is_(None),
            MemoryItem.deleted_at.is_(None),
            Wordbook.deleted_at.is_(None),
            ReviewState.status != STATUS_SUSPENDED,
        )
    )
    if wordbook_id is not None:
        query = query.filter(Card.wordbook_id == wordbook_id)
    return query


def order_today_rows(rows: Iterable[Tuple[Card, MemoryItem, ReviewState]], now: Optional[datetime] = None) -> List[Tuple[Card, MemoryItem, ReviewState]]:
    now = now or utcnow()

    def sort_key(row: Tuple[Card, MemoryItem, ReviewState]):
        _card, _item, state = row
        due_at = comparable_datetime(state.due_at, datetime.max, now)
        is_due = state.due_at is not None and due_at <= now
        is_new = state.status == STATUS_NEW
        last_reviewed = comparable_datetime(state.last_reviewed_at, datetime.min, now)
        return (
            0 if is_due else 1 if not is_new else 2,
            -int(state.leech_score or 0),
            -int(state.lapses or 0),
            last_reviewed,
            due_at,
        )

    ordered = sorted(rows, key=sort_key)
    return spread_same_item_cards(ordered)


def spread_same_item_cards(rows: List[Tuple[Card, MemoryItem, ReviewState]]) -> List[Tuple[Card, MemoryItem, ReviewState]]:
    result: List[Tuple[Card, MemoryItem, ReviewState]] = []
    pending = rows[:]
    while pending:
        previous_item_id = result[-1][1].id if result else None
        pick_index = 0
        if previous_item_id is not None:
            for index, row in enumerate(pending):
                if row[1].id != previous_item_id:
                    pick_index = index
                    break
        result.append(pending.pop(pick_index))
    return result


def today_summary(db: Session, user: User, wordbook_id: Optional[int] = None, now: Optional[datetime] = None) -> Dict[str, int]:
    now = now or utcnow()
    base = today_cards_query(db, user, wordbook_id)
    due_count = base.filter(ReviewState.due_at <= now, ReviewState.status != STATUS_NEW).count()
    new_count = base.filter(ReviewState.status == STATUS_NEW).count()
    weak_count = base.filter(or_(ReviewState.leech_score >= 3, ReviewState.lapses >= 2)).count()
    total = due_count + new_count
    return {
        "dueCount": due_count,
        "newCount": new_count,
        "weakCount": weak_count,
        "estimatedMinutes": max(1, math.ceil(min(total or base.count(), 20) * 0.35)) if (total or base.count()) else 0,
    }


def sample_mastered_check_rows(
    rows: List[Tuple[Card, MemoryItem, ReviewState]], limit: int, now: Optional[datetime] = None
) -> List[Tuple[Card, MemoryItem, ReviewState]]:
    now = now or utcnow()
    if limit <= 0:
        return []
    mastered_limit = max(1, int(limit * 0.10))
    cutoff = now - timedelta(days=7)
    candidates = []
    for row in rows:
        card, _item, state = row
        if state.status != STATUS_MASTERED:
            continue
        if state.due_at and comparable_datetime(state.due_at, datetime.max, now) <= now:
            continue
        if state.last_reviewed_at and comparable_datetime(state.last_reviewed_at, datetime.max, now) >= cutoff:
            continue
        candidates.append(row)

    def mastered_key(row: Tuple[Card, MemoryItem, ReviewState]):
        card, _item, state = row
        if state.last_reviewed_at:
            return comparable_datetime(state.last_reviewed_at, datetime.max, now)
        if state.mastered_at:
            return comparable_datetime(state.mastered_at, datetime.max, now)
        return comparable_datetime(card.created_at or card.updated_at, datetime.max, now)

    return sorted(candidates, key=mastered_key)[:mastered_limit]


def review_log_item_ids_query(db: Session, user_id: int):
    return (
        db.query(Card.item_id)
        .join(ReviewLog, ReviewLog.card_id == Card.id)
        .filter(ReviewLog.user_id == user_id, ReviewLog.rating.in_([RATING_HARD, RATING_GOOD, RATING_EASY]))
    )


def reviewed_item_ids_by_state_query(db: Session, user_id: int):
    return (
        db.query(Card.item_id)
        .join(ReviewState, ReviewState.card_id == Card.id)
        .filter(ReviewState.user_id == user_id, ReviewState.status.in_([STATUS_REVIEW, STATUS_MASTERED]))
    )
