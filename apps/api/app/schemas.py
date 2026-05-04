from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, constr


class ReviewRating(str, Enum):
    AGAIN = "AGAIN"
    HARD = "HARD"
    GOOD = "GOOD"
    EASY = "EASY"


class CardStatus(str, Enum):
    NEW = "NEW"
    LEARNING = "LEARNING"
    REVIEW = "REVIEW"
    RELEARNING = "RELEARNING"
    MASTERED = "MASTERED"
    SUSPENDED = "SUSPENDED"


class CardType(str, Enum):
    BASIC_KEY_TO_VALUE = "BASIC_KEY_TO_VALUE"
    BASIC_VALUE_TO_KEY = "BASIC_VALUE_TO_KEY"
    CLOZE = "CLOZE"
    LISTENING = "LISTENING"
    TYPING = "TYPING"
    SITUATION_RESPONSE = "SITUATION_RESPONSE"


class StudyPlatform(str, Enum):
    WEB = "WEB"
    EXTENSION = "EXTENSION"
    MOBILE = "MOBILE"


class ApiModel(BaseModel):
    class Config:
        allow_population_by_field_name = True
        orm_mode = True


class AuthRequest(BaseModel):
    username: constr(strip_whitespace=True, min_length=3, max_length=80)
    password: constr(min_length=8, max_length=256)


class GoogleAuthRequest(BaseModel):
    id_token: constr(strip_whitespace=True, min_length=1) = Field(alias="idToken")


class TokenResponse(ApiModel):
    token: str
    token_type: str = Field("bearer", alias="tokenType")
    user: "UserResponse"


class UserResponse(ApiModel):
    id: int
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = Field(None, alias="displayName")
    avatar_url: Optional[str] = Field(None, alias="avatarUrl")
    auth_provider: str = Field(alias="authProvider")
    sync_revision: int = Field(alias="syncRevision")
    created_at: datetime = Field(alias="createdAt")


class WordbookCreate(BaseModel):
    name: constr(strip_whitespace=True, min_length=1, max_length=160)
    description: Optional[str] = None


class WordbookUpdate(BaseModel):
    name: Optional[constr(strip_whitespace=True, min_length=1, max_length=160)] = None
    description: Optional[str] = None


class WordbookResponse(ApiModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    deleted_at: Optional[datetime] = Field(None, alias="deletedAt")
    sync_revision: int = Field(alias="syncRevision")
    word_count: int = Field(0, alias="wordCount")


class WordCreate(BaseModel):
    key: constr(strip_whitespace=True, min_length=1)
    value: constr(strip_whitespace=True, min_length=1)
    last_viewed_at: Optional[datetime] = Field(None, alias="lastViewedAt")
    item_type: Optional[constr(strip_whitespace=True, regex="^(WORD|QA|COMMAND|SENTENCE)$")] = Field("WORD", alias="itemType")


class WordUpdate(BaseModel):
    key: Optional[constr(strip_whitespace=True, min_length=1)] = None
    value: Optional[constr(strip_whitespace=True, min_length=1)] = None
    last_viewed_at: Optional[datetime] = Field(None, alias="lastViewedAt")
    item_type: Optional[constr(strip_whitespace=True, regex="^(WORD|QA|COMMAND|SENTENCE)$")] = Field(None, alias="itemType")


class WordResponse(ApiModel):
    id: int
    wordbook_id: int = Field(alias="wordbookId")
    key: str
    value: str
    last_viewed_at: Optional[datetime] = Field(None, alias="lastViewedAt")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    deleted_at: Optional[datetime] = Field(None, alias="deletedAt")
    sync_revision: int = Field(alias="syncRevision")
    item_type: str = Field("WORD", alias="itemType")


class WordBatchItem(WordCreate):
    id: Optional[int] = None


class WordBatchRequest(BaseModel):
    words: List[WordBatchItem]


class WordBatchResponse(ApiModel):
    words: List[WordResponse]


class StudyRequest(BaseModel):
    result: constr(strip_whitespace=True, regex="^(known|unknown)$")
    card_type: Optional[CardType] = Field(None, alias="cardType")
    confidence: Optional[int] = None
    latency_ms: Optional[int] = Field(None, alias="latencyMs")
    platform: Optional[StudyPlatform] = StudyPlatform.WEB
    session_id: Optional[str] = Field(None, alias="sessionId")
    client_event_id: Optional[str] = Field(None, alias="clientEventId")


class StudyResponse(ApiModel):
    word: WordResponse
    event_id: int = Field(alias="eventId")
    result: str
    studied_at: datetime = Field(alias="studiedAt")
    card_id: Optional[int] = Field(None, alias="cardId")
    review_log_id: Optional[int] = Field(None, alias="reviewLogId")
    due_at: Optional[datetime] = Field(None, alias="dueAt")
    status: Optional[str] = None


class TodayStudySummary(ApiModel):
    due_count: int = Field(alias="dueCount")
    new_count: int = Field(alias="newCount")
    weak_count: int = Field(alias="weakCount")
    estimated_minutes: int = Field(alias="estimatedMinutes")


class TodayStudyCard(ApiModel):
    card_id: int = Field(alias="cardId")
    memory_item_id: int = Field(alias="memoryItemId")
    legacy_word_id: Optional[int] = Field(None, alias="legacyWordId")
    wordbook_id: int = Field(alias="wordbookId")
    card_type: CardType = Field(alias="cardType")
    prompt: str
    answer: str
    status: CardStatus
    due_at: datetime = Field(alias="dueAt")
    lapses: int
    leech_score: int = Field(alias="leechScore")
    retrievability: float


class TodayStudyResponse(ApiModel):
    summary: TodayStudySummary
    cards: List[TodayStudyCard]


class CardReviewRequest(BaseModel):
    rating: ReviewRating
    confidence: Optional[int] = None
    response_text: Optional[str] = Field(None, alias="responseText")
    latency_ms: Optional[int] = Field(None, alias="latencyMs")
    platform: Optional[StudyPlatform] = StudyPlatform.WEB
    session_id: Optional[str] = Field(None, alias="sessionId")
    client_event_id: Optional[str] = Field(None, alias="clientEventId")


class CardReviewResponse(ApiModel):
    card_id: int = Field(alias="cardId")
    memory_item_id: int = Field(alias="memoryItemId")
    legacy_word_id: Optional[int] = Field(None, alias="legacyWordId")
    wordbook_id: int = Field(alias="wordbookId")
    rating: ReviewRating
    status: CardStatus
    due_at: datetime = Field(alias="dueAt")
    last_reviewed_at: Optional[datetime] = Field(None, alias="lastReviewedAt")
    interval_days: float = Field(alias="intervalDays")
    lapses: int
    streak: int
    leech_score: int = Field(alias="leechScore")
    review_log_id: Optional[int] = Field(None, alias="reviewLogId")
    deduplicated: bool = False


class WordbookStudySummary(ApiModel):
    wordbook_id: int = Field(alias="wordbookId")
    name: str
    studied_count: int = Field(alias="studiedCount")
    known_count: int = Field(alias="knownCount")
    unknown_count: int = Field(alias="unknownCount")
    last_studied_at: Optional[datetime] = Field(None, alias="lastStudiedAt")


class MemorizedWordSummary(ApiModel):
    word_id: int = Field(alias="wordId")
    wordbook_id: int = Field(alias="wordbookId")
    wordbook_name: str = Field(alias="wordbookName")
    key: str
    value: str
    known_count: int = Field(alias="knownCount")
    last_studied_at: Optional[datetime] = Field(None, alias="lastStudiedAt")


class ProfileSummary(ApiModel):
    cumulative_learning_days: int = Field(alias="cumulativeLearningDays")
    today_studied_count: int = Field(alias="todayStudiedCount")
    memorized_word_count: int = Field(alias="memorizedWordCount")
    memorized_words: List[MemorizedWordSummary] = Field(alias="memorizedWords")
    recent_wordbooks: List[WordbookStudySummary] = Field(alias="recentWordbooks")


class MessageResponse(BaseModel):
    message: str


class SyncChange(BaseModel):
    entity_type: constr(strip_whitespace=True, regex="^(wordbook|word)$") = Field(alias="entityType")
    entity_id: Optional[int] = Field(None, alias="entityId")
    client_id: Optional[str] = Field(None, alias="clientId")
    base_revision: int = Field(0, alias="baseRevision")
    operation: constr(strip_whitespace=True, regex="^(create|update|delete)$")
    payload: Dict[str, Any] = Field(default_factory=dict)


class SyncPushRequest(BaseModel):
    changes: List[SyncChange]


class SyncApplied(ApiModel):
    entity_type: str = Field(alias="entityType")
    entity_id: int = Field(alias="entityId")
    client_id: Optional[str] = Field(None, alias="clientId")
    sync_revision: int = Field(alias="syncRevision")


class SyncConflict(ApiModel):
    entity_type: str = Field(alias="entityType")
    entity_id: Optional[int] = Field(None, alias="entityId")
    client_id: Optional[str] = Field(None, alias="clientId")
    reason: str
    server_entity: Optional[Dict[str, Any]] = Field(None, alias="serverEntity")


class SyncPushResponse(ApiModel):
    server_revision: int = Field(alias="serverRevision")
    applied: List[SyncApplied]
    conflicts: List[SyncConflict]


class SyncPullResponse(ApiModel):
    server_revision: int = Field(alias="serverRevision")
    wordbooks: List[WordbookResponse]
    words: List[WordResponse]


TokenResponse.update_forward_refs()
