from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, constr


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


class WordUpdate(BaseModel):
    key: Optional[constr(strip_whitespace=True, min_length=1)] = None
    value: Optional[constr(strip_whitespace=True, min_length=1)] = None
    last_viewed_at: Optional[datetime] = Field(None, alias="lastViewedAt")


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


class WordBatchItem(WordCreate):
    id: Optional[int] = None


class WordBatchRequest(BaseModel):
    words: List[WordBatchItem]


class WordBatchResponse(ApiModel):
    words: List[WordResponse]


class StudyRequest(BaseModel):
    result: constr(strip_whitespace=True, regex="^(known|unknown)$")


class StudyResponse(ApiModel):
    word: WordResponse
    event_id: int = Field(alias="eventId")
    result: str
    studied_at: datetime = Field(alias="studiedAt")


class WordbookStudySummary(ApiModel):
    wordbook_id: int = Field(alias="wordbookId")
    name: str
    studied_count: int = Field(alias="studiedCount")
    known_count: int = Field(alias="knownCount")
    unknown_count: int = Field(alias="unknownCount")
    last_studied_at: Optional[datetime] = Field(None, alias="lastStudiedAt")


class ProfileSummary(ApiModel):
    cumulative_learning_days: int = Field(alias="cumulativeLearningDays")
    today_studied_count: int = Field(alias="todayStudiedCount")
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
