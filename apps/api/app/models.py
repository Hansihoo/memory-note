from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from .database import Base
from .security import utcnow


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(80), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)
    google_sub = Column(String(255), unique=True, nullable=True, index=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    display_name = Column(String(160), nullable=True)
    avatar_url = Column(Text, nullable=True)
    auth_provider = Column(String(32), default="password", nullable=False)
    sync_revision = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    tokens = relationship("AuthToken", back_populates="user", cascade="all, delete-orphan")
    wordbooks = relationship("Wordbook", back_populates="user", cascade="all, delete-orphan")
    memory_items = relationship("MemoryItem", back_populates="user", cascade="all, delete-orphan")
    cards = relationship("Card", back_populates="user", cascade="all, delete-orphan")
    review_logs = relationship("ReviewLog", back_populates="user", cascade="all, delete-orphan")
    learning_events = relationship("LearningEvent", back_populates="user", cascade="all, delete-orphan")
    sync_events = relationship("SyncEvent", back_populates="user", cascade="all, delete-orphan")


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="tokens")


class Wordbook(Base):
    __tablename__ = "wordbooks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    sync_revision = Column(Integer, default=0, nullable=False)

    user = relationship("User", back_populates="wordbooks")
    words = relationship("Word", back_populates="wordbook", cascade="all, delete-orphan")
    memory_items = relationship("MemoryItem", back_populates="wordbook", cascade="all, delete-orphan")
    cards = relationship("Card", back_populates="wordbook", cascade="all, delete-orphan")
    review_logs = relationship("ReviewLog", back_populates="wordbook", cascade="all, delete-orphan")
    learning_events = relationship("LearningEvent", back_populates="wordbook", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_wordbook_user_name"),)


class Word(Base):
    __tablename__ = "words"

    id = Column(Integer, primary_key=True, index=True)
    wordbook_id = Column(Integer, ForeignKey("wordbooks.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(Text, nullable=False)
    value = Column(Text, nullable=False)
    memory_item_id = Column(Integer, ForeignKey("memory_items.id"), nullable=True, index=True)
    last_viewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    sync_revision = Column(Integer, default=0, nullable=False)

    wordbook = relationship("Wordbook", back_populates="words")
    memory_item = relationship("MemoryItem", back_populates="legacy_words", foreign_keys=[memory_item_id])
    learning_events = relationship("LearningEvent", back_populates="word", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("wordbook_id", "key", name="uq_word_wordbook_key"),)


class MemoryItem(Base):
    __tablename__ = "memory_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    wordbook_id = Column(Integer, ForeignKey("wordbooks.id", ondelete="CASCADE"), nullable=False, index=True)
    legacy_word_id = Column(Integer, nullable=True, index=True)
    key = Column(Text, nullable=False)
    value = Column(Text, nullable=False)
    item_type = Column(String(32), default="WORD", nullable=False, index=True)
    tags = Column(JSON, nullable=True)
    memo = Column(Text, nullable=True)
    example_sentence = Column(Text, nullable=True)
    source = Column(String(80), default="manual", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="memory_items")
    wordbook = relationship("Wordbook", back_populates="memory_items")
    legacy_words = relationship("Word", back_populates="memory_item", foreign_keys=[Word.memory_item_id])
    cards = relationship("Card", back_populates="memory_item", cascade="all, delete-orphan")


class Card(Base):
    __tablename__ = "cards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    wordbook_id = Column(Integer, ForeignKey("wordbooks.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("memory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    card_type = Column(String(40), nullable=False, index=True)
    prompt = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    hint = Column(Text, nullable=True)
    explanation = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="cards")
    wordbook = relationship("Wordbook", back_populates="cards")
    memory_item = relationship("MemoryItem", back_populates="cards")
    review_state = relationship("ReviewState", back_populates="card", cascade="all, delete-orphan", uselist=False)
    review_logs = relationship("ReviewLog", back_populates="card")

    __table_args__ = (UniqueConstraint("item_id", "card_type", name="uq_card_item_type"),)


class ReviewState(Base):
    __tablename__ = "review_states"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    card_id = Column(Integer, ForeignKey("cards.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    status = Column(String(24), default="NEW", nullable=False, index=True)
    due_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reps = Column(Integer, default=0, nullable=False)
    lapses = Column(Integer, default=0, nullable=False)
    streak = Column(Integer, default=0, nullable=False)
    interval_days = Column(Float, default=0, nullable=False)
    ease_factor = Column(Float, default=2.5, nullable=False)
    difficulty = Column(Float, default=0.3, nullable=False)
    stability = Column(Float, default=0, nullable=False)
    leech_score = Column(Integer, default=0, nullable=False, index=True)
    mastered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    card = relationship("Card", back_populates="review_state")


class ReviewLog(Base):
    __tablename__ = "review_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    card_id = Column(Integer, ForeignKey("cards.id", ondelete="RESTRICT"), nullable=False, index=True)
    deck_id = Column(Integer, ForeignKey("wordbooks.id", ondelete="RESTRICT"), nullable=False, index=True)
    session_id = Column(String(80), nullable=True, index=True)
    rating = Column(String(16), nullable=False, index=True)
    is_correct = Column(Boolean, nullable=False)
    confidence = Column(Integer, nullable=True)
    response_text = Column(Text, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    platform = Column(String(24), default="API", nullable=False, index=True)
    state_before_json = Column(JSON, nullable=True)
    state_after_json = Column(JSON, nullable=True)
    client_event_id = Column(String(120), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="review_logs")
    wordbook = relationship("Wordbook", back_populates="review_logs")
    card = relationship("Card", back_populates="review_logs")

    __table_args__ = (UniqueConstraint("user_id", "client_event_id", name="uq_review_log_user_client_event"),)


class LearningEvent(Base):
    __tablename__ = "learning_events"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    wordbook_id = Column(Integer, ForeignKey("wordbooks.id", ondelete="CASCADE"), nullable=False, index=True)
    word_id = Column(Integer, ForeignKey("words.id", ondelete="CASCADE"), nullable=False, index=True)
    result = Column(String(16), nullable=False)
    studied_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    user = relationship("User", back_populates="learning_events")
    wordbook = relationship("Wordbook", back_populates="learning_events")
    word = relationship("Word", back_populates="learning_events")


class SyncEvent(Base):
    __tablename__ = "sync_events"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    revision = Column(Integer, nullable=False, index=True)
    entity_type = Column(String(32), nullable=False)
    entity_id = Column(Integer, nullable=False)
    action = Column(String(32), nullable=False)
    changed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    user = relationship("User", back_populates="sync_events")

    __table_args__ = (UniqueConstraint("user_id", "revision", name="uq_sync_event_user_revision"),)
