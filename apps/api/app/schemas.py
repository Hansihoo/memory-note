from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, constr


class ApiModel(BaseModel):
    class Config:
        allow_population_by_field_name = True
        orm_mode = True


class AuthRequest(BaseModel):
    username: constr(strip_whitespace=True, min_length=3, max_length=80)
    password: constr(min_length=8, max_length=256)


class TokenResponse(ApiModel):
    token: str
    token_type: str = Field("bearer", alias="tokenType")
    user: "UserResponse"


class UserResponse(ApiModel):
    id: int
    username: str
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


TokenResponse.update_forward_refs()
