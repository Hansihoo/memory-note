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
    fun_events_enabled = Column(Boolean, default=True, nullable=False)
    sync_revision = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    tokens = relationship("AuthToken", back_populates="user", cascade="all, delete-orphan")
    wordbooks = relationship("Wordbook", back_populates="user", cascade="all, delete-orphan")
    memory_items = relationship("MemoryItem", back_populates="user", cascade="all, delete-orphan")
    cards = relationship("Card", back_populates="user", cascade="all, delete-orphan")
    review_logs = relationship("ReviewLog", back_populates="user", cascade="all, delete-orphan")
    learning_events = relationship("LearningEvent", back_populates="user", cascade="all, delete-orphan")
    study_events = relationship("StudyEvent", back_populates="user", cascade="all, delete-orphan")
    owned_study_groups = relationship("StudyGroup", back_populates="owner", cascade="all, delete-orphan")
    study_group_memberships = relationship("StudyGroupMember", back_populates="user", cascade="all, delete-orphan")
    taught_classes = relationship("TeacherClass", back_populates="teacher", cascade="all, delete-orphan")
    class_memberships = relationship("ClassMember", back_populates="user", cascade="all, delete-orphan")
    entitlements = relationship("UserEntitlement", back_populates="user", cascade="all, delete-orphan")
    course_enrollments = relationship("CourseEnrollment", back_populates="user", cascade="all, delete-orphan")
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
    study_group_links = relationship("StudyGroupWordbook", back_populates="wordbook", cascade="all, delete-orphan")
    class_assignments = relationship("ClassAssignment", back_populates="wordbook")

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
    cloze_text = Column(Text, nullable=True)
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


class CoursePack(Base):
    __tablename__ = "course_packs"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(160), unique=True, nullable=False, index=True)
    title = Column(String(240), nullable=False)
    description = Column(Text, nullable=True)
    source = Column(String(80), default="manual", nullable=False)
    access_type = Column(String(24), default="FREE", nullable=False, index=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    units = relationship("CourseUnit", back_populates="course_pack", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="course_pack")
    entitlements = relationship("UserEntitlement", back_populates="course_pack")
    enrollments = relationship("CourseEnrollment", back_populates="course_pack")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    product_type = Column(String(40), nullable=False, index=True)
    status = Column(String(24), default="DRAFT", nullable=False, index=True)
    course_pack_id = Column(Integer, ForeignKey("course_packs.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(240), nullable=False)
    description = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    course_pack = relationship("CoursePack", back_populates="products")
    entitlements = relationship("UserEntitlement", back_populates="product")


class UserEntitlement(Base):
    __tablename__ = "user_entitlements"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    course_pack_id = Column(Integer, ForeignKey("course_packs.id", ondelete="CASCADE"), nullable=True, index=True)
    status = Column(String(24), default="ACTIVE", nullable=False, index=True)
    source = Column(String(40), default="MANUAL", nullable=False, index=True)
    starts_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", back_populates="entitlements")
    product = relationship("Product", back_populates="entitlements")
    course_pack = relationship("CoursePack", back_populates="entitlements")


class CourseEnrollment(Base):
    __tablename__ = "course_enrollments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_pack_id = Column(Integer, ForeignKey("course_packs.id", ondelete="RESTRICT"), nullable=False, index=True)
    wordbook_id = Column(Integer, ForeignKey("wordbooks.id", ondelete="RESTRICT"), nullable=False, index=True)
    status = Column(String(24), default="ACTIVE", nullable=False, index=True)
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", back_populates="course_enrollments")
    course_pack = relationship("CoursePack", back_populates="enrollments")
    wordbook = relationship("Wordbook")

    __table_args__ = (UniqueConstraint("user_id", "course_pack_id", name="uq_course_enrollment_user_pack"),)


class CourseUnit(Base):
    __tablename__ = "course_units"

    id = Column(Integer, primary_key=True, index=True)
    course_pack_id = Column(Integer, ForeignKey("course_packs.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, default=0, nullable=False)
    title = Column(String(240), nullable=False)
    description = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    course_pack = relationship("CoursePack", back_populates="units")
    lessons = relationship("CourseLesson", back_populates="unit", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("course_pack_id", "position", name="uq_course_unit_position"),)


class CourseLesson(Base):
    __tablename__ = "course_lessons"

    id = Column(Integer, primary_key=True, index=True)
    course_unit_id = Column(Integer, ForeignKey("course_units.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, default=0, nullable=False)
    title = Column(String(240), nullable=False)
    description = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    unit = relationship("CourseUnit", back_populates="lessons")
    items = relationship("CourseLessonItem", back_populates="lesson", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("course_unit_id", "position", name="uq_course_lesson_position"),)


class CourseLessonItem(Base):
    __tablename__ = "course_lesson_items"

    id = Column(Integer, primary_key=True, index=True)
    course_lesson_id = Column(Integer, ForeignKey("course_lessons.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, default=0, nullable=False)
    key = Column(Text, nullable=False)
    value = Column(Text, nullable=False)
    item_type = Column(String(32), default="WORD", nullable=False, index=True)
    example_sentence = Column(Text, nullable=True)
    cloze_text = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    lesson = relationship("CourseLesson", back_populates="items")

    __table_args__ = (UniqueConstraint("course_lesson_id", "position", name="uq_course_lesson_item_position"),)


class StudyEvent(Base):
    __tablename__ = "study_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    wordbook_id = Column(Integer, ForeignKey("wordbooks.id", ondelete="CASCADE"), nullable=False, index=True)
    card_id = Column(Integer, ForeignKey("cards.id", ondelete="CASCADE"), nullable=False, index=True)
    memory_item_id = Column(Integer, ForeignKey("memory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(40), nullable=False, index=True)
    message = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    user = relationship("User", back_populates="study_events")


class StudyGroup(Base):
    __tablename__ = "study_groups"

    id = Column(Integer, primary_key=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    owner = relationship("User", back_populates="owned_study_groups")
    members = relationship("StudyGroupMember", back_populates="group", cascade="all, delete-orphan")
    wordbook_links = relationship("StudyGroupWordbook", back_populates="group", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("owner_user_id", "name", name="uq_study_group_owner_name"),)


class StudyGroupMember(Base):
    __tablename__ = "study_group_members"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("study_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(24), default="MEMBER", nullable=False, index=True)
    status = Column(String(24), default="PENDING", nullable=False, index=True)
    joined_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    group = relationship("StudyGroup", back_populates="members")
    user = relationship("User", back_populates="study_group_memberships")

    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_study_group_member_user"),)


class StudyGroupWordbook(Base):
    __tablename__ = "study_group_wordbooks"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("study_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    wordbook_id = Column(Integer, ForeignKey("wordbooks.id", ondelete="CASCADE"), nullable=False, index=True)
    added_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    group = relationship("StudyGroup", back_populates="wordbook_links")
    wordbook = relationship("Wordbook", back_populates="study_group_links")

    __table_args__ = (UniqueConstraint("group_id", "wordbook_id", name="uq_study_group_wordbook"),)


class TeacherClass(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)
    teacher_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(160), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    teacher = relationship("User", back_populates="taught_classes")
    members = relationship("ClassMember", back_populates="classroom", cascade="all, delete-orphan")
    assignments = relationship("ClassAssignment", back_populates="classroom", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("teacher_user_id", "name", name="uq_class_teacher_name"),)


class ClassMember(Base):
    __tablename__ = "class_members"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(24), default="STUDENT", nullable=False, index=True)
    status = Column(String(24), default="PENDING", nullable=False, index=True)
    joined_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    classroom = relationship("TeacherClass", back_populates="members")
    user = relationship("User", back_populates="class_memberships")

    __table_args__ = (UniqueConstraint("class_id", "user_id", name="uq_class_member_user"),)


class ClassAssignment(Base):
    __tablename__ = "class_assignments"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    wordbook_id = Column(Integer, ForeignKey("wordbooks.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(240), nullable=False)
    description = Column(Text, nullable=True)
    due_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    classroom = relationship("TeacherClass", back_populates="assignments")
    wordbook = relationship("Wordbook", back_populates="class_assignments")


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
