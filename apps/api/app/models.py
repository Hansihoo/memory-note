from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
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
    learning_events = relationship("LearningEvent", back_populates="wordbook", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_wordbook_user_name"),)


class Word(Base):
    __tablename__ = "words"

    id = Column(Integer, primary_key=True, index=True)
    wordbook_id = Column(Integer, ForeignKey("wordbooks.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(Text, nullable=False)
    value = Column(Text, nullable=False)
    last_viewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    sync_revision = Column(Integer, default=0, nullable=False)

    wordbook = relationship("Wordbook", back_populates="words")
    learning_events = relationship("LearningEvent", back_populates="word", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("wordbook_id", "key", name="uq_word_wordbook_key"),)


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
