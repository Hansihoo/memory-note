import logging
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_cors_origins, is_database_configured
from .database import get_db, init_db
from .deps import get_current_user, get_user_word, get_user_wordbook
from .google_auth import verify_google_id_token
from .logging_config import configure_logging, debug_log
from .models import (
    AuthToken,
    Card,
    ClassAssignment,
    ClassMember,
    CourseEnrollment,
    CourseLesson,
    CourseLessonItem,
    CoursePack,
    CourseUnit,
    LearningEvent,
    MemoryItem,
    Product,
    ReviewLog,
    ReviewState,
    StudyGroup,
    StudyGroupMember,
    StudyGroupWordbook,
    SyncEvent,
    TeacherClass,
    UserEntitlement,
    User,
    Word,
    Wordbook,
)
from .review import (
    CARD_TYPE_KEY_TO_VALUE,
    RATING_AGAIN,
    RATING_EASY,
    RATING_GOOD,
    RATING_HARD,
    STATUS_MASTERED,
    STATUS_NEW,
    STATUS_REVIEW,
    STATUS_SUSPENDED,
    RATING_BY_LEGACY_RESULT,
    backfill_review_models,
    calculate_retrievability,
    comparable_datetime,
    deactivate_memory_item_for_word,
    ensure_memory_item_for_word,
    find_card_for_word,
    order_today_rows,
    recommendation_reason,
    recommendation_score,
    review_card,
    sample_mastered_check_rows,
    spread_same_item_cards,
    today_cards_query,
    today_summary,
)
from .schemas import (
    AuthRequest,
    AnalyticsSummary,
    ClassAssignmentCreate,
    ClassAssignmentProgress,
    ClassAssignmentResponse,
    ClassCreate,
    ClassInviteRequest,
    ClassMemberResponse,
    ClassMembershipUpdate,
    ClassResponse,
    CardQualityAnalytics,
    ContentQualityAnalytics,
    CourseAccessResponse,
    CourseStartResponse,
    CardReviewRequest,
    CardReviewResponse,
    CardStatus,
    CardType,
    DailyQuestResponse,
    DailyQuestSummary,
    GoogleAuthRequest,
    MemorizedWordSummary,
    MessageResponse,
    ProfileSummary,
    ReviewAnalytics,
    ReviewRating,
    StudyGroupCreate,
    StudyGroupInviteRequest,
    StudyGroupMemberResponse,
    StudyGroupMembershipUpdate,
    StudyGroupProgressResponse,
    StudyGroupResponse,
    StudyGroupWordbookLinkRequest,
    StudyGroupWordbookResponse,
    StudyRequest,
    StudyResponse,
    TodayStudyCard,
    TodayStudyResponse,
    TodayStudySummary,
    TeacherClassDashboardResponse,
    SyncApplied,
    SyncChange,
    SyncConflict,
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse,
    TokenResponse,
    UserResponse,
    UserSettingsResponse,
    UserSettingsUpdate,
    WordBatchRequest,
    WordBatchResponse,
    WordCreate,
    WordResponse,
    WordUpdate,
    WordbookCreate,
    WordbookResponse,
    WordbookStudySummary,
    WordbookUpdate,
)
from .security import hash_password, hash_token, issue_token, utcnow, verify_password


logger = logging.getLogger(__name__)

GROUP_ROLE_OWNER = "OWNER"
GROUP_ROLE_MEMBER = "MEMBER"
GROUP_STATUS_ACTIVE = "ACTIVE"
GROUP_STATUS_PENDING = "PENDING"
GROUP_STATUS_DECLINED = "DECLINED"
CLASS_ROLE_TEACHER = "TEACHER"
CLASS_ROLE_STUDENT = "STUDENT"
COURSE_ACCESS_FREE = "FREE"
COURSE_ACCESS_PAID = "PAID"
PRODUCT_TYPE_COURSE_PACK = "COURSE_PACK"
PRODUCT_STATUS_DRAFT = "DRAFT"
PRODUCT_STATUS_ACTIVE = "ACTIVE"
PRODUCT_STATUS_ARCHIVED = "ARCHIVED"
ENTITLEMENT_STATUS_ACTIVE = "ACTIVE"
ENTITLEMENT_STATUS_REVOKED = "REVOKED"
ENTITLEMENT_STATUS_EXPIRED = "EXPIRED"
ENTITLEMENT_SOURCE_MANUAL = "MANUAL"
ENTITLEMENT_SOURCE_PURCHASE = "PURCHASE"
ENTITLEMENT_SOURCE_CLASS_LICENSE = "CLASS_LICENSE"
DEFAULT_DAILY_QUEST_TARGET_COUNT = 25
MAX_DAILY_QUEST_TARGET_COUNT = 100


def create_app() -> FastAPI:
    configure_logging()
    api = FastAPI(title="Memory Assistant API", version="0.1.0")
    api.add_middleware(
        CORSMiddleware,
        allow_origins=get_cors_origins(),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.on_event("startup")
    def on_startup() -> None:
        if not is_database_configured():
            logger.warning("database_startup_init_skipped reason=missing_DATABASE_URL")
            return

        try:
            init_db()
        except Exception:
            logger.exception("database_startup_init_failed")

    @api.exception_handler(Exception)
    async def log_unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_request_error method=%s path=%s", request.method, request.url.path)
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": "Internal server error"})

    register_routes(api)
    return api


def wordbook_response(db: Session, wordbook: Wordbook) -> WordbookResponse:
    count = db.query(func.count(Word.id)).filter(Word.wordbook_id == wordbook.id, Word.deleted_at.is_(None)).scalar() or 0
    return WordbookResponse.from_orm(wordbook).copy(update={"word_count": count})


def word_response(word: Word) -> WordResponse:
    item_type = word.memory_item.item_type if word.memory_item is not None else "WORD"
    example_sentence = word.memory_item.example_sentence if word.memory_item is not None else None
    tags = word.memory_item.tags if word.memory_item is not None else None
    cloze_text = word.memory_item.cloze_text if word.memory_item is not None else None
    return WordResponse.from_orm(word).copy(update={"item_type": item_type, "example_sentence": example_sentence, "tags": tags, "cloze_text": cloze_text})


def issue_user_token(db: Session, user: User) -> TokenResponse:
    token, token_hash = issue_token()
    db.add(AuthToken(user_id=user.id, token_hash=token_hash))
    db.commit()
    db.refresh(user)
    return TokenResponse(token=token, user=UserResponse.from_orm(user))


def next_revision(db: Session, user: User) -> int:
    user.sync_revision = (user.sync_revision or 0) + 1
    db.flush()
    return int(user.sync_revision)


def record_sync_event(db: Session, user: User, entity_type: str, entity_id: int, action: str, revision: int) -> None:
    db.add(SyncEvent(user_id=user.id, revision=revision, entity_type=entity_type, entity_id=entity_id, action=action))


def mark_wordbook_changed(db: Session, user: User, wordbook: Wordbook, action: str) -> None:
    now = utcnow()
    wordbook.updated_at = now
    revision = next_revision(db, user)
    wordbook.sync_revision = revision
    record_sync_event(db, user, "wordbook", int(wordbook.id), action, revision)


def mark_word_changed(db: Session, user: User, word: Word, action: str) -> None:
    now = utcnow()
    word.updated_at = now
    revision = next_revision(db, user)
    word.sync_revision = revision
    record_sync_event(db, user, "word", int(word.id), action, revision)


def soft_delete_wordbook(db: Session, user: User, wordbook: Wordbook) -> None:
    now = utcnow()
    wordbook.deleted_at = now
    wordbook.name = f"{wordbook.name}__deleted__{wordbook.id}"
    mark_wordbook_changed(db, user, wordbook, "delete")


def soft_delete_word(db: Session, user: User, word: Word) -> None:
    now = utcnow()
    word.deleted_at = now
    word.key = f"{word.key}__deleted__{word.id}"
    deactivate_memory_item_for_word(db, user, word)
    mark_word_changed(db, user, word, "delete")


def wordbook_dict(db: Session, wordbook: Wordbook) -> Dict[str, Any]:
    return wordbook_response(db, wordbook).dict(by_alias=True)


def word_dict(word: Word) -> Dict[str, Any]:
    return word_response(word).dict(by_alias=True)


def today_card_response(card: Card, item: MemoryItem, state: ReviewState) -> TodayStudyCard:
    return TodayStudyCard(
        card_id=card.id,
        memory_item_id=item.id,
        legacy_word_id=item.legacy_word_id,
        wordbook_id=card.wordbook_id,
        card_type=CardType(card.card_type),
        prompt=card.prompt,
        answer=card.answer,
        status=CardStatus(state.status),
        due_at=state.due_at,
        lapses=state.lapses or 0,
        leech_score=state.leech_score or 0,
        retrievability=calculate_retrievability(state),
        recommendation_reason=recommendation_reason(state),
        recommendation_score=recommendation_score(state),
    )


def build_today_study_response(
    db: Session,
    current_user: User,
    wordbook_id: Optional[int],
    limit: int,
) -> TodayStudyResponse:
    max_limit = max(1, min(limit, 100))
    rows = today_cards_query(db, current_user, wordbook_id).all()
    ordered_base = order_today_rows(rows)
    sampled_mastered = sample_mastered_check_rows(rows, max_limit)
    sampled_ids = {row[0].id for row in sampled_mastered}
    base_without_sampled = [row for row in ordered_base if row[0].id not in sampled_ids]
    merged = spread_same_item_cards(base_without_sampled + sampled_mastered)
    ordered_rows = merged[:max_limit]
    summary = today_summary(db, current_user, wordbook_id)
    return TodayStudyResponse(
        summary=TodayStudySummary(
            due_count=summary["dueCount"],
            new_count=summary["newCount"],
            weak_count=summary["weakCount"],
            estimated_minutes=summary["estimatedMinutes"],
            mastered_check_count=len([row for row in ordered_rows if row[0].id in sampled_ids]),
        ),
        cards=[today_card_response(card, item, state) for card, item, state in ordered_rows],
    )


def card_review_response(card: Card, state: ReviewState, rating: str, review_log: Optional[ReviewLog], deduplicated: bool) -> CardReviewResponse:
    item = card.memory_item
    return CardReviewResponse(
        card_id=card.id,
        memory_item_id=card.item_id,
        legacy_word_id=item.legacy_word_id if item else None,
        wordbook_id=card.wordbook_id,
        rating=ReviewRating(rating),
        status=CardStatus(state.status),
        due_at=state.due_at,
        last_reviewed_at=state.last_reviewed_at,
        interval_days=state.interval_days or 0,
        lapses=state.lapses or 0,
        streak=state.streak or 0,
        leech_score=state.leech_score or 0,
        review_log_id=review_log.id if review_log is not None else None,
        deduplicated=deduplicated,
    )


def study_group_member_response(member: StudyGroupMember) -> StudyGroupMemberResponse:
    return StudyGroupMemberResponse(
        user_id=member.user_id,
        username=member.user.username,
        role=member.role,
        status=member.status,
        joined_at=member.joined_at,
    )


def get_study_group_membership(
    db: Session,
    user: User,
    group_id: int,
    statuses: Optional[List[str]] = None,
) -> Tuple[StudyGroup, StudyGroupMember]:
    query = (
        db.query(StudyGroup, StudyGroupMember)
        .join(StudyGroupMember, StudyGroupMember.group_id == StudyGroup.id)
        .filter(
            StudyGroup.id == group_id,
            StudyGroup.deleted_at.is_(None),
            StudyGroupMember.user_id == user.id,
        )
    )
    if statuses is not None:
        query = query.filter(StudyGroupMember.status.in_(statuses))
    row = query.first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Study group not found")
    group, membership = row
    return group, membership


def require_active_group_member(db: Session, user: User, group_id: int) -> Tuple[StudyGroup, StudyGroupMember]:
    return get_study_group_membership(db, user, group_id, [GROUP_STATUS_ACTIVE])


def require_group_owner(db: Session, user: User, group_id: int) -> Tuple[StudyGroup, StudyGroupMember]:
    group, membership = require_active_group_member(db, user, group_id)
    if membership.role != GROUP_ROLE_OWNER or group.owner_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Study group owner permission required")
    return group, membership


def active_group_member_ids(db: Session, group_id: int) -> Set[int]:
    rows = (
        db.query(StudyGroupMember.user_id)
        .filter(StudyGroupMember.group_id == group_id, StudyGroupMember.status == GROUP_STATUS_ACTIVE)
        .all()
    )
    return {int(row[0]) for row in rows}


def linked_group_wordbook_ids(db: Session, group_id: int, user_ids: Optional[Set[int]] = None) -> List[int]:
    query = (
        db.query(StudyGroupWordbook.wordbook_id)
        .join(Wordbook, Wordbook.id == StudyGroupWordbook.wordbook_id)
        .filter(
            StudyGroupWordbook.group_id == group_id,
            Wordbook.deleted_at.is_(None),
            Wordbook.user_id == StudyGroupWordbook.added_by_user_id,
        )
    )
    if user_ids is not None:
        if not user_ids:
            return []
        query = query.filter(StudyGroupWordbook.added_by_user_id.in_(user_ids))
    return [int(row[0]) for row in query.all()]


def study_group_response(db: Session, group: StudyGroup, membership: StudyGroupMember) -> StudyGroupResponse:
    member_count = (
        db.query(func.count(StudyGroupMember.id))
        .filter(StudyGroupMember.group_id == group.id, StudyGroupMember.status == GROUP_STATUS_ACTIVE)
        .scalar()
        or 0
    )
    linked_count = len(linked_group_wordbook_ids(db, group.id, active_group_member_ids(db, group.id)))
    return StudyGroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        owner_user_id=group.owner_user_id,
        my_role=membership.role,
        my_status=membership.status,
        member_count=member_count,
        linked_wordbook_count=linked_count,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


def group_progress_response(db: Session, group: StudyGroup, now: Optional[datetime] = None) -> StudyGroupProgressResponse:
    now = now or utcnow()
    member_ids = active_group_member_ids(db, group.id)
    wordbook_ids = linked_group_wordbook_ids(db, group.id, member_ids)
    if not member_ids or not wordbook_ids:
        return StudyGroupProgressResponse(
            group_id=group.id,
            active_member_count=len(member_ids),
            linked_wordbook_count=0,
            due_count=0,
            new_count=0,
            weak_count=0,
            mastered_count=0,
            review_count_30d=0,
            correct_count_30d=0,
            recall_rate_30d=0,
        )

    base = (
        db.query(Card, MemoryItem, ReviewState)
        .join(MemoryItem, Card.item_id == MemoryItem.id)
        .join(ReviewState, ReviewState.card_id == Card.id)
        .filter(
            Card.user_id.in_(member_ids),
            Card.wordbook_id.in_(wordbook_ids),
            Card.active.is_(True),
            Card.deleted_at.is_(None),
            MemoryItem.deleted_at.is_(None),
            ReviewState.status != STATUS_SUSPENDED,
        )
    )
    due_count = base.filter(ReviewState.due_at <= now, ReviewState.status != STATUS_NEW).count()
    new_count = base.filter(ReviewState.status == STATUS_NEW).count()
    weak_count = base.filter(or_(ReviewState.leech_score >= 3, ReviewState.lapses >= 2)).count()
    mastered_count = (
        base.filter(ReviewState.status == STATUS_MASTERED)
        .with_entities(func.count(func.distinct(MemoryItem.id)))
        .scalar()
        or 0
    )

    cutoff = now - timedelta(days=30)
    reviews = db.query(ReviewLog).filter(
        ReviewLog.user_id.in_(member_ids),
        ReviewLog.deck_id.in_(wordbook_ids),
        ReviewLog.reviewed_at >= cutoff,
    )
    review_count = reviews.count()
    correct_count = reviews.filter(ReviewLog.rating.in_([RATING_HARD, RATING_GOOD, RATING_EASY])).count()
    recall_rate = correct_count / review_count if review_count else 0
    return StudyGroupProgressResponse(
        group_id=group.id,
        active_member_count=len(member_ids),
        linked_wordbook_count=len(wordbook_ids),
        due_count=due_count,
        new_count=new_count,
        weak_count=weak_count,
        mastered_count=mastered_count,
        review_count_30d=review_count,
        correct_count_30d=correct_count,
        recall_rate_30d=recall_rate,
    )


def class_member_response(member: ClassMember) -> ClassMemberResponse:
    return ClassMemberResponse(
        user_id=member.user_id,
        username=member.user.username,
        role=member.role,
        status=member.status,
        joined_at=member.joined_at,
    )


def get_class_membership(
    db: Session,
    user: User,
    class_id: int,
    statuses: Optional[List[str]] = None,
) -> Tuple[TeacherClass, ClassMember]:
    query = (
        db.query(TeacherClass, ClassMember)
        .join(ClassMember, ClassMember.class_id == TeacherClass.id)
        .filter(
            TeacherClass.id == class_id,
            TeacherClass.deleted_at.is_(None),
            ClassMember.user_id == user.id,
        )
    )
    if statuses is not None:
        query = query.filter(ClassMember.status.in_(statuses))
    row = query.first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    classroom, membership = row
    return classroom, membership


def require_active_class_member(db: Session, user: User, class_id: int) -> Tuple[TeacherClass, ClassMember]:
    return get_class_membership(db, user, class_id, [GROUP_STATUS_ACTIVE])


def require_class_teacher(db: Session, user: User, class_id: int) -> Tuple[TeacherClass, ClassMember]:
    classroom, membership = require_active_class_member(db, user, class_id)
    if membership.role != CLASS_ROLE_TEACHER or classroom.teacher_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Class teacher permission required")
    return classroom, membership


def active_class_student_ids(db: Session, class_id: int) -> Set[int]:
    rows = (
        db.query(ClassMember.user_id)
        .filter(
            ClassMember.class_id == class_id,
            ClassMember.role == CLASS_ROLE_STUDENT,
            ClassMember.status == GROUP_STATUS_ACTIVE,
        )
        .all()
    )
    return {int(row[0]) for row in rows}


def class_response(db: Session, classroom: TeacherClass, membership: ClassMember) -> ClassResponse:
    student_count = (
        db.query(func.count(ClassMember.id))
        .filter(
            ClassMember.class_id == classroom.id,
            ClassMember.role == CLASS_ROLE_STUDENT,
            ClassMember.status == GROUP_STATUS_ACTIVE,
        )
        .scalar()
        or 0
    )
    assignment_count = (
        db.query(func.count(ClassAssignment.id))
        .filter(ClassAssignment.class_id == classroom.id, ClassAssignment.deleted_at.is_(None))
        .scalar()
        or 0
    )
    return ClassResponse(
        id=classroom.id,
        name=classroom.name,
        description=classroom.description,
        teacher_user_id=classroom.teacher_user_id,
        my_role=membership.role,
        my_status=membership.status,
        student_count=student_count,
        assignment_count=assignment_count,
        created_at=classroom.created_at,
        updated_at=classroom.updated_at,
    )


def class_assignment_response(assignment: ClassAssignment) -> ClassAssignmentResponse:
    return ClassAssignmentResponse(
        id=assignment.id,
        class_id=assignment.class_id,
        wordbook_id=assignment.wordbook_id,
        title=assignment.title,
        description=assignment.description,
        due_at=assignment.due_at,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
    )


def teacher_class_dashboard_response(
    db: Session,
    classroom: TeacherClass,
    now: Optional[datetime] = None,
) -> TeacherClassDashboardResponse:
    now = now or utcnow()
    student_ids = active_class_student_ids(db, classroom.id)
    assignments = (
        db.query(ClassAssignment)
        .filter(ClassAssignment.class_id == classroom.id, ClassAssignment.deleted_at.is_(None))
        .order_by(ClassAssignment.created_at.asc())
        .all()
    )
    progress_rows: List[ClassAssignmentProgress] = []
    cutoff = now - timedelta(days=30)
    for assignment in assignments:
        review_count = 0
        correct_count = 0
        if student_ids:
            reviews = db.query(ReviewLog).filter(
                ReviewLog.user_id.in_(student_ids),
                ReviewLog.deck_id == assignment.wordbook_id,
                ReviewLog.reviewed_at >= cutoff,
            )
            review_count = reviews.count()
            correct_count = reviews.filter(ReviewLog.rating.in_([RATING_HARD, RATING_GOOD, RATING_EASY])).count()
        recall_rate = correct_count / review_count if review_count else 0
        progress_rows.append(
            ClassAssignmentProgress(
                assignment_id=assignment.id,
                title=assignment.title,
                assigned_count=len(student_ids),
                review_count_30d=review_count,
                correct_count_30d=correct_count,
                recall_rate_30d=recall_rate,
            )
        )
    return TeacherClassDashboardResponse(
        class_id=classroom.id,
        active_student_count=len(student_ids),
        assignment_count=len(assignments),
        assignments=progress_rows,
    )


def get_course_pack_or_404(db: Session, course_pack_id: int) -> CoursePack:
    pack = db.query(CoursePack).filter(CoursePack.id == course_pack_id).first()
    if pack is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course pack not found")
    return pack


def course_product_ids(db: Session, course_pack_id: int) -> List[int]:
    rows = (
        db.query(Product.id)
        .filter(
            Product.product_type == PRODUCT_TYPE_COURSE_PACK,
            Product.course_pack_id == course_pack_id,
            Product.status == PRODUCT_STATUS_ACTIVE,
        )
        .all()
    )
    return [int(row[0]) for row in rows]


def is_paid_course_pack(db: Session, pack: CoursePack) -> bool:
    if pack.access_type == COURSE_ACCESS_PAID:
        return True
    return bool(course_product_ids(db, pack.id))


def active_course_entitlement(
    db: Session,
    user: User,
    pack: CoursePack,
    now: Optional[datetime] = None,
) -> Optional[UserEntitlement]:
    now = now or utcnow()
    product_ids = course_product_ids(db, pack.id)
    scope_filters = [UserEntitlement.course_pack_id == pack.id]
    if product_ids:
        scope_filters.append(UserEntitlement.product_id.in_(product_ids))
    return (
        db.query(UserEntitlement)
        .filter(
            UserEntitlement.user_id == user.id,
            UserEntitlement.status == ENTITLEMENT_STATUS_ACTIVE,
            UserEntitlement.revoked_at.is_(None),
            or_(UserEntitlement.starts_at.is_(None), UserEntitlement.starts_at <= now),
            or_(UserEntitlement.expires_at.is_(None), UserEntitlement.expires_at > now),
            or_(*scope_filters),
        )
        .order_by(UserEntitlement.updated_at.desc())
        .first()
    )


def latest_course_entitlement_status(db: Session, user: User, pack: CoursePack) -> Optional[str]:
    product_ids = course_product_ids(db, pack.id)
    scope_filters = [UserEntitlement.course_pack_id == pack.id]
    if product_ids:
        scope_filters.append(UserEntitlement.product_id.in_(product_ids))
    row = (
        db.query(UserEntitlement)
        .filter(UserEntitlement.user_id == user.id, or_(*scope_filters))
        .order_by(UserEntitlement.updated_at.desc())
        .first()
    )
    return row.status if row is not None else None


def course_access_response(db: Session, user: User, pack: CoursePack) -> CourseAccessResponse:
    paid = is_paid_course_pack(db, pack)
    entitlement = active_course_entitlement(db, user, pack)
    access_type = COURSE_ACCESS_PAID if paid else COURSE_ACCESS_FREE
    return CourseAccessResponse(
        course_pack_id=pack.id,
        access_type=access_type,
        has_access=(not paid) or entitlement is not None,
        entitlement_status=entitlement.status if entitlement is not None else latest_course_entitlement_status(db, user, pack),
    )


def require_course_access(db: Session, user: User, pack: CoursePack) -> None:
    access = course_access_response(db, user, pack)
    if not access.has_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Course entitlement required")


def create_course_product(
    db: Session,
    pack: CoursePack,
    name: Optional[str] = None,
    status_value: str = PRODUCT_STATUS_ACTIVE,
) -> Product:
    product = Product(
        product_type=PRODUCT_TYPE_COURSE_PACK,
        status=status_value,
        course_pack_id=pack.id,
        name=name or pack.title,
    )
    db.add(product)
    db.flush()
    return product


def grant_course_entitlement(
    db: Session,
    user: User,
    pack: CoursePack,
    source: str = ENTITLEMENT_SOURCE_MANUAL,
    status_value: str = ENTITLEMENT_STATUS_ACTIVE,
    product: Optional[Product] = None,
    expires_at: Optional[datetime] = None,
) -> UserEntitlement:
    entitlement = UserEntitlement(
        user_id=user.id,
        product_id=product.id if product is not None else None,
        course_pack_id=pack.id,
        status=status_value,
        source=source,
        expires_at=expires_at,
    )
    db.add(entitlement)
    db.flush()
    return entitlement


def revoke_course_entitlement(db: Session, entitlement: UserEntitlement, revoked_at: Optional[datetime] = None) -> UserEntitlement:
    entitlement.status = ENTITLEMENT_STATUS_REVOKED
    entitlement.revoked_at = revoked_at or utcnow()
    entitlement.updated_at = entitlement.revoked_at
    db.flush()
    return entitlement


def unique_course_wordbook_name(db: Session, user: User, pack: CoursePack) -> str:
    base_name = f"{pack.title} Course"
    candidate = base_name[:160]
    suffix = 2
    while (
        db.query(Wordbook)
        .filter(Wordbook.user_id == user.id, Wordbook.name == candidate, Wordbook.deleted_at.is_(None))
        .first()
        is not None
    ):
        suffix_text = f" {suffix}"
        candidate = f"{base_name[: 160 - len(suffix_text)]}{suffix_text}"
        suffix += 1
    return candidate


def course_lesson_items(db: Session, pack: CoursePack) -> List[CourseLessonItem]:
    return (
        db.query(CourseLessonItem)
        .join(CourseLesson, CourseLessonItem.course_lesson_id == CourseLesson.id)
        .join(CourseUnit, CourseLesson.course_unit_id == CourseUnit.id)
        .filter(CourseUnit.course_pack_id == pack.id)
        .order_by(CourseUnit.position.asc(), CourseLesson.position.asc(), CourseLessonItem.position.asc())
        .all()
    )


def start_course_for_user(db: Session, user: User, pack: CoursePack) -> CourseStartResponse:
    require_course_access(db, user, pack)
    existing = (
        db.query(CourseEnrollment)
        .filter(CourseEnrollment.user_id == user.id, CourseEnrollment.course_pack_id == pack.id)
        .first()
    )
    if existing is not None:
        word_count = db.query(func.count(Word.id)).filter(Word.wordbook_id == existing.wordbook_id, Word.deleted_at.is_(None)).scalar() or 0
        return CourseStartResponse(
            course_pack_id=pack.id,
            enrollment_id=existing.id,
            wordbook_id=existing.wordbook_id,
            created=False,
            word_count=word_count,
        )

    wordbook = Wordbook(user_id=user.id, name=unique_course_wordbook_name(db, user, pack), description=pack.description)
    db.add(wordbook)
    db.flush()
    mark_wordbook_changed(db, user, wordbook, "create")

    created_words = 0
    for item in course_lesson_items(db, pack):
        word = Word(wordbook_id=wordbook.id, key=item.key, value=item.value)
        db.add(word)
        db.flush()
        ensure_memory_item_for_word(
            db,
            user,
            word,
            item.item_type,
            example_sentence=item.example_sentence,
            update_example_sentence=True,
            tags=normalize_tags(item.tags),
            update_tags=True,
            cloze_text=item.cloze_text,
            update_cloze_text=True,
        )
        mark_word_changed(db, user, word, "create")
        created_words += 1

    enrollment = CourseEnrollment(user_id=user.id, course_pack_id=pack.id, wordbook_id=wordbook.id)
    db.add(enrollment)
    db.flush()
    return CourseStartResponse(
        course_pack_id=pack.id,
        enrollment_id=enrollment.id,
        wordbook_id=wordbook.id,
        created=True,
        word_count=created_words,
    )


def review_analytics_response(
    db: Session,
    user: User,
    wordbook_id: Optional[int] = None,
    window_days: int = 30,
    now: Optional[datetime] = None,
) -> ReviewAnalytics:
    now = now or utcnow()
    cutoff = now - timedelta(days=window_days)
    query = db.query(ReviewLog).filter(ReviewLog.user_id == user.id, ReviewLog.reviewed_at >= cutoff)
    if wordbook_id is not None:
        query = query.filter(ReviewLog.deck_id == wordbook_id)
    review_count = query.count()
    correct_count = query.filter(ReviewLog.rating.in_([RATING_HARD, RATING_GOOD, RATING_EASY])).count()
    again_count = query.filter(ReviewLog.rating == RATING_AGAIN).count()
    return ReviewAnalytics(
        window_days=window_days,
        review_count=review_count,
        correct_count=correct_count,
        again_count=again_count,
        recall_rate=correct_count / review_count if review_count else 0,
    )


def card_quality_analytics_response(
    db: Session,
    user: User,
    wordbook_id: Optional[int] = None,
    window_days: int = 30,
    now: Optional[datetime] = None,
) -> CardQualityAnalytics:
    now = now or utcnow()
    rows_query = today_cards_query(db, user, wordbook_id)
    rows = rows_query.all()
    active_card_ids = {row[0].id for row in rows}
    weak_count = len([row for row in rows if (row[2].leech_score or 0) >= 3 or (row[2].lapses or 0) >= 2])
    leech_count = len([row for row in rows if (row[2].leech_score or 0) >= 3])
    avg_retrievability = sum(calculate_retrievability(row[2], now) for row in rows) / len(rows) if rows else 0

    cutoff = now - timedelta(days=window_days)
    review_query = db.query(ReviewLog).filter(ReviewLog.user_id == user.id, ReviewLog.reviewed_at >= cutoff)
    if wordbook_id is not None:
        review_query = review_query.filter(ReviewLog.deck_id == wordbook_id)
    by_card: Dict[int, Dict[str, int]] = {}
    for log in review_query.all():
        if log.card_id not in active_card_ids:
            continue
        bucket = by_card.setdefault(log.card_id, {"total": 0, "correct": 0})
        bucket["total"] += 1
        if log.rating in {RATING_HARD, RATING_GOOD, RATING_EASY}:
            bucket["correct"] += 1
    low_recall_count = len(
        [
            card_id
            for card_id, bucket in by_card.items()
            if card_id in active_card_ids and bucket["total"] >= 2 and bucket["correct"] / bucket["total"] < 0.6
        ]
    )
    return CardQualityAnalytics(
        active_card_count=len(rows),
        weak_card_count=weak_count,
        leech_card_count=leech_count,
        low_recall_card_count=low_recall_count,
        average_retrievability=avg_retrievability,
    )


def content_quality_analytics_response(db: Session, user: User, wordbook_id: Optional[int] = None) -> ContentQualityAnalytics:
    query = (
        db.query(MemoryItem)
        .join(Wordbook, Wordbook.id == MemoryItem.wordbook_id)
        .filter(MemoryItem.user_id == user.id, MemoryItem.deleted_at.is_(None), Wordbook.deleted_at.is_(None))
    )
    if wordbook_id is not None:
        query = query.filter(MemoryItem.wordbook_id == wordbook_id)
    items = query.all()
    missing_examples = len(
        [item for item in items if item.item_type == "WORD" and not (item.example_sentence or "").strip()]
    )
    tagged_count = len([item for item in items if item.tags])
    sentence_ready_count = len([item for item in items if (item.example_sentence or "").strip() or (item.cloze_text or "").strip()])
    return ContentQualityAnalytics(
        active_item_count=len(items),
        missing_example_sentence_count=missing_examples,
        tagged_item_count=tagged_count,
        sentence_ready_item_count=sentence_ready_count,
    )


def analytics_summary_response(db: Session, user: User, wordbook_id: Optional[int] = None) -> AnalyticsSummary:
    return AnalyticsSummary(
        review=review_analytics_response(db, user, wordbook_id),
        card_quality=card_quality_analytics_response(db, user, wordbook_id),
        content_quality=content_quality_analytics_response(db, user, wordbook_id),
    )


def sync_legacy_word_after_review(db: Session, user: User, card: Card, rating: str, reviewed_at: datetime, create_learning_event: bool) -> Optional[Word]:
    item = card.memory_item
    if item is None or item.legacy_word_id is None:
        return None

    word = db.query(Word).filter(Word.id == item.legacy_word_id, Word.deleted_at.is_(None)).first()
    if word is None:
        return None

    word.last_viewed_at = reviewed_at
    mark_word_changed(db, user, word, "update")
    if create_learning_event:
        db.add(
            LearningEvent(
                user_id=user.id,
                wordbook_id=word.wordbook_id,
                word_id=word.id,
                result="unknown" if rating == RATING_AGAIN else "known",
                studied_at=reviewed_at,
            )
        )
    return word


def sync_conflict(entity_type: str, change: SyncChange, reason: str, server_entity: Optional[Dict[str, Any]]) -> SyncConflict:
    return SyncConflict(
        entity_type=entity_type,
        entity_id=change.entity_id,
        client_id=change.client_id,
        reason=reason,
        server_entity=server_entity,
    )


def _payload_text(payload: Dict[str, Any], key: str) -> str:
    value = payload.get(key)
    return str(value).strip() if value is not None else ""


def _payload_optional_text(payload: Dict[str, Any], *keys: str) -> Optional[str]:
    for key in keys:
        if key in payload:
            value = payload.get(key)
            if value is None:
                return None
            text = str(value).strip()
            return text or None
    return None


def normalize_tags(tags: Optional[List[str]]) -> Optional[List[str]]:
    if tags is None:
        return None
    normalized = [tag.strip() for tag in tags if tag and tag.strip()]
    return normalized or None


def _payload_tags(payload: Dict[str, Any], *keys: str) -> Optional[List[str]]:
    for key in keys:
        if key not in payload:
            continue
        value = payload.get(key)
        if value is None:
            return None
        if isinstance(value, list):
            return normalize_tags([str(tag) for tag in value])
        return normalize_tags(re.split(r"[,;]", str(value)))
    return None


def _payload_datetime(payload: Dict[str, Any], key: str) -> Optional[datetime]:
    value = payload.get(key)
    if value in {None, ""}:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return None


def find_wordbook_for_sync(db: Session, user: User, wordbook_id: Optional[int]) -> Optional[Wordbook]:
    if wordbook_id is None:
        return None
    return db.query(Wordbook).filter(Wordbook.id == wordbook_id, Wordbook.user_id == user.id).first()


def find_word_for_sync(db: Session, user: User, word_id: Optional[int]) -> Optional[Word]:
    if word_id is None:
        return None
    return db.query(Word).join(Wordbook).filter(Word.id == word_id, Wordbook.user_id == user.id).first()


def apply_wordbook_change(
    db: Session,
    user: User,
    change: SyncChange,
    applied: List[SyncApplied],
    conflicts: List[SyncConflict],
) -> None:
    if change.operation == "create":
        name = _payload_text(change.payload, "name")
        if not name:
            conflicts.append(sync_conflict("wordbook", change, "Missing wordbook name", None))
            return
        row = Wordbook(user_id=user.id, name=name, description=change.payload.get("description"))
        db.add(row)
        db.flush()
        mark_wordbook_changed(db, user, row, "create")
        applied.append(
            SyncApplied(entity_type="wordbook", entity_id=row.id, client_id=change.client_id, sync_revision=row.sync_revision)
        )
        return

    existing_wordbook = find_wordbook_for_sync(db, user, change.entity_id)
    if existing_wordbook is None:
        conflicts.append(sync_conflict("wordbook", change, "Wordbook not found", None))
        return
    if change.base_revision < existing_wordbook.sync_revision:
        conflicts.append(sync_conflict("wordbook", change, "Server has newer data", wordbook_dict(db, existing_wordbook)))
        return

    if change.operation == "delete":
        if existing_wordbook.deleted_at is None:
            soft_delete_wordbook(db, user, existing_wordbook)
        applied.append(
            SyncApplied(entity_type="wordbook", entity_id=existing_wordbook.id, client_id=change.client_id, sync_revision=existing_wordbook.sync_revision)
        )
        return

    name = _payload_text(change.payload, "name")
    if name:
        existing_wordbook.name = name
    if "description" in change.payload:
        existing_wordbook.description = change.payload.get("description")
    mark_wordbook_changed(db, user, existing_wordbook, "update")
    applied.append(SyncApplied(entity_type="wordbook", entity_id=existing_wordbook.id, client_id=change.client_id, sync_revision=existing_wordbook.sync_revision))


def apply_word_change(
    db: Session,
    user: User,
    change: SyncChange,
    applied: List[SyncApplied],
    conflicts: List[SyncConflict],
) -> None:
    if change.operation == "create":
        wordbook_id = change.payload.get("wordbookId") or change.payload.get("wordbook_id")
        wordbook = find_wordbook_for_sync(db, user, int(wordbook_id) if wordbook_id is not None else None)
        if wordbook is None or wordbook.deleted_at is not None:
            conflicts.append(sync_conflict("word", change, "Wordbook not found", None))
            return
        key = _payload_text(change.payload, "key")
        value = _payload_text(change.payload, "value")
        if not key or not value:
            conflicts.append(sync_conflict("word", change, "Missing word key or value", None))
            return
        row = Word(wordbook_id=wordbook.id, key=key, value=value, last_viewed_at=_payload_datetime(change.payload, "lastViewedAt"))
        db.add(row)
        db.flush()
        ensure_memory_item_for_word(
            db,
            user,
            row,
            str(change.payload.get("itemType") or change.payload.get("item_type") or "WORD"),
            example_sentence=_payload_optional_text(change.payload, "exampleSentence", "example_sentence"),
            update_example_sentence=True,
            tags=_payload_tags(change.payload, "tags"),
            update_tags=True,
            cloze_text=_payload_optional_text(change.payload, "cloze", "clozeText", "cloze_text"),
            update_cloze_text=True,
        )
        mark_word_changed(db, user, row, "create")
        applied.append(SyncApplied(entity_type="word", entity_id=row.id, client_id=change.client_id, sync_revision=row.sync_revision))
        return

    existing_word = find_word_for_sync(db, user, change.entity_id)
    if existing_word is None:
        conflicts.append(sync_conflict("word", change, "Word not found", None))
        return
    if change.base_revision < existing_word.sync_revision:
        conflicts.append(sync_conflict("word", change, "Server has newer data", word_dict(existing_word)))
        return

    if change.operation == "delete":
        if existing_word.deleted_at is None:
            soft_delete_word(db, user, existing_word)
        applied.append(SyncApplied(entity_type="word", entity_id=existing_word.id, client_id=change.client_id, sync_revision=existing_word.sync_revision))
        return

    key = _payload_text(change.payload, "key")
    value = _payload_text(change.payload, "value")
    if key:
        existing_word.key = key
    if value:
        existing_word.value = value
    if "lastViewedAt" in change.payload:
        existing_word.last_viewed_at = _payload_datetime(change.payload, "lastViewedAt")
    update_example_sentence = "exampleSentence" in change.payload or "example_sentence" in change.payload
    update_tags = "tags" in change.payload
    update_cloze_text = "cloze" in change.payload or "clozeText" in change.payload or "cloze_text" in change.payload
    ensure_memory_item_for_word(
        db,
        user,
        existing_word,
        str(change.payload.get("itemType") or change.payload.get("item_type") or (existing_word.memory_item.item_type if existing_word.memory_item else "WORD")),
        example_sentence=_payload_optional_text(change.payload, "exampleSentence", "example_sentence"),
        update_example_sentence=update_example_sentence,
        tags=_payload_tags(change.payload, "tags"),
        update_tags=update_tags,
        cloze_text=_payload_optional_text(change.payload, "cloze", "clozeText", "cloze_text"),
        update_cloze_text=update_cloze_text,
    )
    mark_word_changed(db, user, existing_word, "update")
    applied.append(SyncApplied(entity_type="word", entity_id=existing_word.id, client_id=change.client_id, sync_revision=existing_word.sync_revision))


def register_routes(api: FastAPI) -> None:
    @api.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @api.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
    def register(payload: AuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
        username = payload.username.lower()
        user = User(username=username, password_hash=hash_password(payload.password), auth_provider="password")
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

        debug_log("DEBUG_AUTH", logger, "registered_user", user_id=user.id)
        return issue_user_token(db, user)

    @api.post("/auth/login", response_model=TokenResponse)
    def login(payload: AuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
        user = db.query(User).filter(User.username == payload.username.lower()).first()
        if user is None or not user.password_hash or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        debug_log("DEBUG_AUTH", logger, "login_success", user_id=user.id)
        return issue_user_token(db, user)

    @api.post("/auth/google", response_model=TokenResponse)
    def google_login(payload: GoogleAuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
        identity = verify_google_id_token(payload.id_token)
        user = db.query(User).filter(User.google_sub == identity.subject).first()
        if user is None and identity.email:
            user = db.query(User).filter(User.email == identity.email).first()

        if user is None:
            base_username = identity.email.split("@", 1)[0] or f"google-{identity.subject[:12]}"
            username = base_username.lower()
            suffix = 1
            while db.query(User).filter(User.username == username).first() is not None:
                suffix += 1
                username = f"{base_username.lower()}-{suffix}"
            user = User(
                username=username,
                google_sub=identity.subject,
                email=identity.email,
                display_name=identity.display_name,
                avatar_url=identity.avatar_url,
                auth_provider="google",
            )
            db.add(user)
            db.flush()
        else:
            user.google_sub = identity.subject
            user.email = identity.email
            user.display_name = identity.display_name
            user.avatar_url = identity.avatar_url
            user.auth_provider = "google" if not user.password_hash else user.auth_provider

        debug_log("DEBUG_AUTH", logger, "google_login_success", user_id=user.id)
        return issue_user_token(db, user)

    @api.post("/auth/logout", response_model=MessageResponse)
    def logout(
        authorization: str = Header("", alias="Authorization"),
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> MessageResponse:
        return logout_current_token(authorization, current_user, db)

    @api.get("/me", response_model=UserResponse)
    def me(current_user: User = Depends(get_current_user)) -> UserResponse:
        return UserResponse.from_orm(current_user)

    @api.get("/me/settings", response_model=UserSettingsResponse)
    def me_settings(current_user: User = Depends(get_current_user)) -> UserSettingsResponse:
        return UserSettingsResponse(fun_events_enabled=current_user.fun_events_enabled)

    @api.patch("/me/settings", response_model=UserSettingsResponse)
    def update_me_settings(
        payload: UserSettingsUpdate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> UserSettingsResponse:
        if payload.fun_events_enabled is not None:
            current_user.fun_events_enabled = payload.fun_events_enabled
        db.commit()
        db.refresh(current_user)
        return UserSettingsResponse(fun_events_enabled=current_user.fun_events_enabled)

    @api.get("/course-packs/{course_pack_id}/access", response_model=CourseAccessResponse)
    def course_pack_access(
        course_pack_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> CourseAccessResponse:
        pack = get_course_pack_or_404(db, course_pack_id)
        return course_access_response(db, current_user, pack)

    @api.post("/course-packs/{course_pack_id}/start", response_model=CourseStartResponse, status_code=status.HTTP_201_CREATED)
    def start_course_pack(
        course_pack_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> CourseStartResponse:
        pack = get_course_pack_or_404(db, course_pack_id)
        try:
            response = start_course_for_user(db, current_user, pack)
            db.commit()
            return response
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Course could not be started")

    @api.get("/analytics/summary", response_model=AnalyticsSummary)
    def analytics_summary(
        wordbookId: Optional[int] = None,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> AnalyticsSummary:
        if wordbookId is not None:
            get_user_wordbook(db, current_user, wordbookId)
        backfill_review_models(db, current_user)
        db.flush()
        return analytics_summary_response(db, current_user, wordbookId)

    @api.get("/wordbooks", response_model=List[WordbookResponse])
    def list_wordbooks(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> List[WordbookResponse]:
        rows = (
            db.query(Wordbook)
            .filter(Wordbook.user_id == current_user.id, Wordbook.deleted_at.is_(None))
            .order_by(Wordbook.updated_at.desc())
            .all()
        )
        return [wordbook_response(db, row) for row in rows]

    @api.post("/wordbooks", response_model=WordbookResponse, status_code=status.HTTP_201_CREATED)
    def create_wordbook(
        payload: WordbookCreate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> WordbookResponse:
        row = Wordbook(user_id=current_user.id, name=payload.name, description=payload.description)
        db.add(row)
        try:
            db.flush()
            mark_wordbook_changed(db, current_user, row, "create")
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Wordbook name already exists")
        db.refresh(row)
        return wordbook_response(db, row)

    @api.get("/wordbooks/{wordbook_id}", response_model=WordbookResponse)
    def read_wordbook(
        wordbook_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> WordbookResponse:
        return wordbook_response(db, get_user_wordbook(db, current_user, wordbook_id))

    @api.patch("/wordbooks/{wordbook_id}", response_model=WordbookResponse)
    def update_wordbook(
        wordbook_id: int,
        payload: WordbookUpdate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> WordbookResponse:
        row = get_user_wordbook(db, current_user, wordbook_id)
        for field, value in payload.dict(exclude_unset=True).items():
            setattr(row, field, value)
        try:
            mark_wordbook_changed(db, current_user, row, "update")
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Wordbook name already exists")
        db.refresh(row)
        return wordbook_response(db, row)

    @api.delete("/wordbooks/{wordbook_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_wordbook(
        wordbook_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> Response:
        row = get_user_wordbook(db, current_user, wordbook_id)
        soft_delete_wordbook(db, current_user, row)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @api.post("/study-groups", response_model=StudyGroupResponse, status_code=status.HTTP_201_CREATED)
    def create_study_group(
        payload: StudyGroupCreate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> StudyGroupResponse:
        now = utcnow()
        group = StudyGroup(owner_user_id=current_user.id, name=payload.name, description=payload.description)
        db.add(group)
        try:
            db.flush()
            membership = StudyGroupMember(
                group_id=group.id,
                user_id=current_user.id,
                role=GROUP_ROLE_OWNER,
                status=GROUP_STATUS_ACTIVE,
                joined_at=now,
            )
            db.add(membership)
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Study group name already exists")
        db.refresh(group)
        db.refresh(membership)
        return study_group_response(db, group, membership)

    @api.get("/study-groups", response_model=List[StudyGroupResponse])
    def list_study_groups(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> List[StudyGroupResponse]:
        rows = (
            db.query(StudyGroup, StudyGroupMember)
            .join(StudyGroupMember, StudyGroupMember.group_id == StudyGroup.id)
            .filter(
                StudyGroup.deleted_at.is_(None),
                StudyGroupMember.user_id == current_user.id,
                StudyGroupMember.status.in_([GROUP_STATUS_ACTIVE, GROUP_STATUS_PENDING]),
            )
            .order_by(StudyGroup.updated_at.desc())
            .all()
        )
        return [study_group_response(db, group, membership) for group, membership in rows]

    @api.get("/study-groups/{group_id}", response_model=StudyGroupResponse)
    def read_study_group(
        group_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> StudyGroupResponse:
        group, membership = get_study_group_membership(db, current_user, group_id, [GROUP_STATUS_ACTIVE, GROUP_STATUS_PENDING])
        return study_group_response(db, group, membership)

    @api.post("/study-groups/{group_id}/members", response_model=StudyGroupMemberResponse, status_code=status.HTTP_201_CREATED)
    def invite_study_group_member(
        group_id: int,
        payload: StudyGroupInviteRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> StudyGroupMemberResponse:
        require_group_owner(db, current_user, group_id)
        target = db.query(User).filter(func.lower(User.username) == payload.username.lower()).first()
        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        existing = (
            db.query(StudyGroupMember)
            .filter(StudyGroupMember.group_id == group_id, StudyGroupMember.user_id == target.id)
            .first()
        )
        if existing is not None:
            if existing.status == GROUP_STATUS_DECLINED:
                existing.status = GROUP_STATUS_PENDING
                existing.updated_at = utcnow()
                db.commit()
                db.refresh(existing)
            return study_group_member_response(existing)

        membership = StudyGroupMember(
            group_id=group_id,
            user_id=target.id,
            role=GROUP_ROLE_MEMBER,
            status=GROUP_STATUS_PENDING,
        )
        db.add(membership)
        db.commit()
        db.refresh(membership)
        return study_group_member_response(membership)

    @api.patch("/study-groups/{group_id}/members/me", response_model=StudyGroupMemberResponse)
    def update_my_study_group_membership(
        group_id: int,
        payload: StudyGroupMembershipUpdate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> StudyGroupMemberResponse:
        _group, membership = get_study_group_membership(
            db,
            current_user,
            group_id,
            [GROUP_STATUS_ACTIVE, GROUP_STATUS_PENDING, GROUP_STATUS_DECLINED],
        )
        if membership.role == GROUP_ROLE_OWNER and payload.status != GROUP_STATUS_ACTIVE:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group owner cannot decline membership")
        membership.status = payload.status
        membership.updated_at = utcnow()
        if payload.status == GROUP_STATUS_ACTIVE and membership.joined_at is None:
            membership.joined_at = utcnow()
        db.commit()
        db.refresh(membership)
        return study_group_member_response(membership)

    @api.delete("/study-groups/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
    def remove_study_group_member(
        group_id: int,
        user_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> Response:
        group, _membership = require_group_owner(db, current_user, group_id)
        if user_id == group.owner_user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group owner cannot be removed")
        row = db.query(StudyGroupMember).filter(StudyGroupMember.group_id == group_id, StudyGroupMember.user_id == user_id).first()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Study group member not found")
        db.delete(row)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @api.post("/study-groups/{group_id}/wordbooks", response_model=StudyGroupWordbookResponse, status_code=status.HTTP_201_CREATED)
    def link_study_group_wordbook(
        group_id: int,
        payload: StudyGroupWordbookLinkRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> StudyGroupWordbookResponse:
        require_active_group_member(db, current_user, group_id)
        wordbook = get_user_wordbook(db, current_user, payload.wordbook_id)
        existing = (
            db.query(StudyGroupWordbook)
            .filter(StudyGroupWordbook.group_id == group_id, StudyGroupWordbook.wordbook_id == wordbook.id)
            .first()
        )
        if existing is not None:
            return StudyGroupWordbookResponse(
                wordbook_id=wordbook.id,
                name=wordbook.name,
                owner_user_id=wordbook.user_id,
                added_by_user_id=existing.added_by_user_id,
                created_at=existing.created_at,
            )
        link = StudyGroupWordbook(group_id=group_id, wordbook_id=wordbook.id, added_by_user_id=current_user.id)
        db.add(link)
        db.commit()
        db.refresh(link)
        return StudyGroupWordbookResponse(
            wordbook_id=wordbook.id,
            name=wordbook.name,
            owner_user_id=wordbook.user_id,
            added_by_user_id=link.added_by_user_id,
            created_at=link.created_at,
        )

    @api.get("/study-groups/{group_id}/progress", response_model=StudyGroupProgressResponse)
    def study_group_progress(
        group_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> StudyGroupProgressResponse:
        group, _membership = require_active_group_member(db, current_user, group_id)
        return group_progress_response(db, group)

    @api.get("/study-groups/{group_id}/weak-cards", response_model=TodayStudyResponse)
    def study_group_weak_cards(
        group_id: int,
        limit: int = 20,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> TodayStudyResponse:
        require_active_group_member(db, current_user, group_id)
        wordbook_ids = linked_group_wordbook_ids(db, group_id, {current_user.id})
        if not wordbook_ids:
            return TodayStudyResponse(
                summary=TodayStudySummary(due_count=0, new_count=0, weak_count=0, estimated_minutes=0),
                cards=[],
            )
        backfill_review_models(db, current_user)
        db.flush()
        weak_since = utcnow() - timedelta(days=7)
        weak_card_ids = {
            row.card_id
            for row in db.query(ReviewLog.card_id)
            .filter(
                ReviewLog.user_id == current_user.id,
                ReviewLog.deck_id.in_(wordbook_ids),
                ReviewLog.rating == RATING_AGAIN,
                ReviewLog.reviewed_at >= weak_since,
            )
            .all()
        }
        rows = today_cards_query(db, current_user).filter(Card.wordbook_id.in_(wordbook_ids)).all()
        weak_rows = [
            row
            for row in rows
            if (row[2].lapses or 0) > 0
            or (row[2].leech_score or 0) > 0
            or row[0].id in weak_card_ids
        ]
        ordered_rows = order_today_rows(weak_rows)[: max(1, min(limit, 100))]
        now = utcnow()
        due_count = len(
            [
                row
                for row in rows
                if comparable_datetime(row[2].due_at, datetime.max, now) <= now and row[2].status != STATUS_NEW
            ]
        )
        new_count = len([row for row in rows if row[2].status == STATUS_NEW])
        weak_count = len(weak_rows)
        return TodayStudyResponse(
            summary=TodayStudySummary(
                due_count=due_count,
                new_count=new_count,
                weak_count=weak_count,
                estimated_minutes=max(1, min(len(ordered_rows), 20)) if ordered_rows else 0,
            ),
            cards=[today_card_response(card, item, state) for card, item, state in ordered_rows],
        )

    @api.post("/classes", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
    def create_class(
        payload: ClassCreate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> ClassResponse:
        now = utcnow()
        classroom = TeacherClass(teacher_user_id=current_user.id, name=payload.name, description=payload.description)
        db.add(classroom)
        try:
            db.flush()
            membership = ClassMember(
                class_id=classroom.id,
                user_id=current_user.id,
                role=CLASS_ROLE_TEACHER,
                status=GROUP_STATUS_ACTIVE,
                joined_at=now,
            )
            db.add(membership)
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Class name already exists")
        db.refresh(classroom)
        db.refresh(membership)
        return class_response(db, classroom, membership)

    @api.get("/classes", response_model=List[ClassResponse])
    def list_classes(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> List[ClassResponse]:
        rows = (
            db.query(TeacherClass, ClassMember)
            .join(ClassMember, ClassMember.class_id == TeacherClass.id)
            .filter(
                TeacherClass.deleted_at.is_(None),
                ClassMember.user_id == current_user.id,
                ClassMember.status.in_([GROUP_STATUS_ACTIVE, GROUP_STATUS_PENDING]),
            )
            .order_by(TeacherClass.updated_at.desc())
            .all()
        )
        return [class_response(db, classroom, membership) for classroom, membership in rows]

    @api.get("/classes/{class_id}", response_model=ClassResponse)
    def read_class(
        class_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> ClassResponse:
        classroom, membership = get_class_membership(db, current_user, class_id, [GROUP_STATUS_ACTIVE, GROUP_STATUS_PENDING])
        return class_response(db, classroom, membership)

    @api.post("/classes/{class_id}/members", response_model=ClassMemberResponse, status_code=status.HTTP_201_CREATED)
    def invite_class_member(
        class_id: int,
        payload: ClassInviteRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> ClassMemberResponse:
        classroom, _membership = require_class_teacher(db, current_user, class_id)
        target = db.query(User).filter(func.lower(User.username) == payload.username.lower()).first()
        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        existing = db.query(ClassMember).filter(ClassMember.class_id == class_id, ClassMember.user_id == target.id).first()
        if existing is not None:
            if existing.status == GROUP_STATUS_DECLINED:
                existing.status = GROUP_STATUS_PENDING
                existing.updated_at = utcnow()
                classroom.updated_at = utcnow()
                db.commit()
                db.refresh(existing)
            return class_member_response(existing)
        membership = ClassMember(
            class_id=class_id,
            user_id=target.id,
            role=CLASS_ROLE_STUDENT,
            status=GROUP_STATUS_PENDING,
        )
        classroom.updated_at = utcnow()
        db.add(membership)
        db.commit()
        db.refresh(membership)
        return class_member_response(membership)

    @api.patch("/classes/{class_id}/members/me", response_model=ClassMemberResponse)
    def update_my_class_membership(
        class_id: int,
        payload: ClassMembershipUpdate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> ClassMemberResponse:
        _classroom, membership = get_class_membership(
            db,
            current_user,
            class_id,
            [GROUP_STATUS_ACTIVE, GROUP_STATUS_PENDING, GROUP_STATUS_DECLINED],
        )
        if membership.role == CLASS_ROLE_TEACHER and payload.status != GROUP_STATUS_ACTIVE:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Class teacher cannot decline membership")
        membership.status = payload.status
        membership.updated_at = utcnow()
        if payload.status == GROUP_STATUS_ACTIVE and membership.joined_at is None:
            membership.joined_at = utcnow()
        db.commit()
        db.refresh(membership)
        return class_member_response(membership)

    @api.post("/classes/{class_id}/assignments", response_model=ClassAssignmentResponse, status_code=status.HTTP_201_CREATED)
    def create_class_assignment(
        class_id: int,
        payload: ClassAssignmentCreate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> ClassAssignmentResponse:
        classroom, _membership = require_class_teacher(db, current_user, class_id)
        wordbook = get_user_wordbook(db, current_user, payload.wordbook_id)
        assignment = ClassAssignment(
            class_id=class_id,
            wordbook_id=wordbook.id,
            created_by_user_id=current_user.id,
            title=payload.title or wordbook.name,
            description=payload.description,
            due_at=payload.due_at,
        )
        classroom.updated_at = utcnow()
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        return class_assignment_response(assignment)

    @api.get("/classes/{class_id}/assignments", response_model=List[ClassAssignmentResponse])
    def list_class_assignments(
        class_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> List[ClassAssignmentResponse]:
        require_active_class_member(db, current_user, class_id)
        rows = (
            db.query(ClassAssignment)
            .filter(ClassAssignment.class_id == class_id, ClassAssignment.deleted_at.is_(None))
            .order_by(ClassAssignment.created_at.asc())
            .all()
        )
        return [class_assignment_response(row) for row in rows]

    @api.get("/classes/{class_id}/dashboard", response_model=TeacherClassDashboardResponse)
    def teacher_class_dashboard(
        class_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> TeacherClassDashboardResponse:
        classroom, _membership = require_class_teacher(db, current_user, class_id)
        return teacher_class_dashboard_response(db, classroom)

    @api.get("/wordbooks/{wordbook_id}/words", response_model=List[WordResponse])
    def list_words(
        wordbook_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> List[WordResponse]:
        get_user_wordbook(db, current_user, wordbook_id)
        rows = db.query(Word).filter(Word.wordbook_id == wordbook_id, Word.deleted_at.is_(None)).order_by(Word.id.asc()).all()
        return [word_response(row) for row in rows]

    @api.post("/wordbooks/{wordbook_id}/words", response_model=WordResponse, status_code=status.HTTP_201_CREATED)
    def create_word(
        wordbook_id: int,
        payload: WordCreate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> WordResponse:
        get_user_wordbook(db, current_user, wordbook_id)
        row = Word(wordbook_id=wordbook_id, key=payload.key, value=payload.value, last_viewed_at=payload.last_viewed_at)
        db.add(row)
        try:
            db.flush()
            ensure_memory_item_for_word(
                db,
                current_user,
                row,
                payload.item_type or "WORD",
                example_sentence=payload.example_sentence,
                update_example_sentence=True,
                tags=normalize_tags(payload.tags),
                update_tags=True,
                cloze_text=payload.cloze_text,
                update_cloze_text=True,
            )
            mark_word_changed(db, current_user, row, "create")
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Word key already exists in wordbook")
        db.refresh(row)
        debug_log("DEBUG_IMPORT", logger, "created_word", word_id=row.id, wordbook_id=wordbook_id)
        return word_response(row)

    @api.post("/wordbooks/{wordbook_id}/words/batch", response_model=WordBatchResponse)
    def batch_upsert_words(
        wordbook_id: int,
        payload: WordBatchRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> WordBatchResponse:
        get_user_wordbook(db, current_user, wordbook_id)
        changed = []
        for item in payload.words:
            row = None
            if item.id is not None:
                row = db.query(Word).filter(Word.id == item.id, Word.wordbook_id == wordbook_id, Word.deleted_at.is_(None)).first()
                if row is None:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Word not found: {item.id}")
            else:
                row = db.query(Word).filter(Word.wordbook_id == wordbook_id, Word.key == item.key, Word.deleted_at.is_(None)).first()

            if row is None:
                row = Word(wordbook_id=wordbook_id, key=item.key, value=item.value, last_viewed_at=item.last_viewed_at)
                db.add(row)
                db.flush()
                ensure_memory_item_for_word(
                    db,
                    current_user,
                    row,
                    item.item_type or "WORD",
                    example_sentence=item.example_sentence,
                    update_example_sentence=True,
                    tags=normalize_tags(item.tags),
                    update_tags=True,
                    cloze_text=item.cloze_text,
                    update_cloze_text=True,
                )
                mark_word_changed(db, current_user, row, "create")
            else:
                row.key = item.key
                row.value = item.value
                row.last_viewed_at = item.last_viewed_at
                ensure_memory_item_for_word(
                    db,
                    current_user,
                    row,
                    item.item_type or (row.memory_item.item_type if row.memory_item else "WORD"),
                    example_sentence=item.example_sentence,
                    update_example_sentence="example_sentence" in item.__fields_set__,
                    tags=normalize_tags(item.tags),
                    update_tags="tags" in item.__fields_set__,
                    cloze_text=item.cloze_text,
                    update_cloze_text="cloze_text" in item.__fields_set__,
                )
                mark_word_changed(db, current_user, row, "update")
            changed.append(row)

        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Duplicate word key in wordbook")

        for row in changed:
            db.refresh(row)
        debug_log("DEBUG_IMPORT", logger, "batch_upsert_words", wordbook_id=wordbook_id, count=len(changed))
        return WordBatchResponse(words=[word_response(row) for row in changed])

    @api.get("/words/{word_id}", response_model=WordResponse)
    def read_word(
        word_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> WordResponse:
        return word_response(get_user_word(db, current_user, word_id))

    @api.patch("/words/{word_id}", response_model=WordResponse)
    def update_word(
        word_id: int,
        payload: WordUpdate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> WordResponse:
        row = get_user_word(db, current_user, word_id)
        item_type = payload.item_type
        update_example_sentence = "example_sentence" in payload.__fields_set__
        update_tags = "tags" in payload.__fields_set__
        update_cloze_text = "cloze_text" in payload.__fields_set__
        for field, value in payload.dict(by_alias=False, exclude_unset=True).items():
            if field in {"item_type", "example_sentence", "tags", "cloze_text"}:
                continue
            setattr(row, field, value)
        try:
            ensure_memory_item_for_word(
                db,
                current_user,
                row,
                item_type or (row.memory_item.item_type if row.memory_item else "WORD"),
                example_sentence=payload.example_sentence,
                update_example_sentence=update_example_sentence,
                tags=normalize_tags(payload.tags),
                update_tags=update_tags,
                cloze_text=payload.cloze_text,
                update_cloze_text=update_cloze_text,
            )
            mark_word_changed(db, current_user, row, "update")
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Word key already exists in wordbook")
        db.refresh(row)
        return word_response(row)

    @api.delete("/words/{word_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_word(
        word_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> Response:
        row = get_user_word(db, current_user, word_id)
        soft_delete_word(db, current_user, row)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @api.get("/study/today", response_model=TodayStudyResponse)
    def study_today(
        wordbookId: Optional[int] = None,
        limit: int = 20,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> TodayStudyResponse:
        if wordbookId is not None:
            get_user_wordbook(db, current_user, wordbookId)
        backfill_review_models(db, current_user)
        db.flush()
        return build_today_study_response(db, current_user, wordbookId, limit)

    @api.get("/study/daily-quest", response_model=DailyQuestResponse)
    def study_daily_quest(
        wordbookId: Optional[int] = None,
        limit: int = DEFAULT_DAILY_QUEST_TARGET_COUNT,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> DailyQuestResponse:
        if wordbookId is not None:
            get_user_wordbook(db, current_user, wordbookId)
        backfill_review_models(db, current_user)
        db.flush()
        target_count = max(1, min(limit, MAX_DAILY_QUEST_TARGET_COUNT))
        today_response = build_today_study_response(db, current_user, wordbookId, target_count)
        quest_date = utcnow().date().isoformat()
        today_studied_count = profile_studied_today(db, current_user.id, quest_date)
        quest_review_count = profile_quest_review_count_today(db, current_user.id, quest_date)
        completed_count = min(quest_review_count, target_count)
        memorized_words = merged_memorized_word_summaries(db, current_user.id)
        return DailyQuestResponse(
            summary=DailyQuestSummary(
                quest_date=quest_date,
                target_count=target_count,
                completed_count=completed_count,
                remaining_count=max(0, target_count - completed_count),
                daily_quest_completed=completed_count >= target_count,
                daily_quest_completed_count=profile_daily_quest_completed_count(db, current_user.id),
                quest_day_count=profile_study_days(db, current_user.id),
                memorized_word_count=len(memorized_words),
                mastered_count=profile_mastered_count(db, current_user.id),
                today_studied_count=today_studied_count,
                estimated_minutes=max(3, today_response.summary.estimated_minutes),
            ),
            cards=today_response.cards,
            memorized_words=memorized_words,
        )

    @api.post("/study/cards/{card_id}/review", response_model=CardReviewResponse)
    def review_study_card(
        card_id: int,
        payload: CardReviewRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> CardReviewResponse:
        card = db.query(Card).filter(Card.id == card_id, Card.user_id == current_user.id).first()
        if card is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review card not found")

        card, state, log, deduplicated = review_card(
            db,
            current_user,
            card,
            payload.rating.value,
            confidence=payload.confidence,
            response_text=payload.response_text,
            latency_ms=payload.latency_ms,
            platform=payload.platform.value if payload.platform else "WEB",
            session_id=payload.session_id,
            client_event_id=payload.client_event_id,
        )
        if not deduplicated:
            sync_legacy_word_after_review(db, current_user, card, payload.rating.value, state.last_reviewed_at or utcnow(), True)
        db.commit()
        db.refresh(state)
        if log is not None:
            db.refresh(log)
        debug_log("DEBUG_PROGRESS", logger, "card_review_recorded", user_id=current_user.id, card_id=card.id)
        return card_review_response(card, state, payload.rating.value, log, deduplicated)

    @api.get("/study/mistakes", response_model=TodayStudyResponse)
    def study_mistakes(
        wordbookId: Optional[int] = None,
        limit: int = 20,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> TodayStudyResponse:
        if wordbookId is not None:
            get_user_wordbook(db, current_user, wordbookId)
        backfill_review_models(db, current_user)
        db.flush()
        weak_since = utcnow() - timedelta(days=7)
        weak_card_ids = {
            row.card_id
            for row in db.query(ReviewLog.card_id)
            .filter(
                ReviewLog.user_id == current_user.id,
                ReviewLog.rating == RATING_AGAIN,
                ReviewLog.reviewed_at >= weak_since,
            )
            .all()
        }
        rows = today_cards_query(db, current_user, wordbookId).all()
        rows = [
            row
            for row in rows
            if (row[2].lapses or 0) > 0
            or (row[2].leech_score or 0) > 0
            or row[0].id in weak_card_ids
        ]
        ordered_rows = order_today_rows(rows)[: max(1, min(limit, 100))]
        summary = today_summary(db, current_user, wordbookId)
        return TodayStudyResponse(
            summary=TodayStudySummary(
                due_count=summary["dueCount"],
                new_count=summary["newCount"],
                weak_count=summary["weakCount"],
                estimated_minutes=summary["estimatedMinutes"],
            ),
            cards=[today_card_response(card, item, state) for card, item, state in ordered_rows],
        )

    @api.post("/study/words/{word_id}", response_model=StudyResponse)
    def study_word(
        word_id: int,
        payload: StudyRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> StudyResponse:
        """Deprecated. Use POST /study/cards/{cardId}/review instead."""
        word = get_user_word(db, current_user, word_id)
        rating = RATING_BY_LEGACY_RESULT[payload.result]
        card = find_card_for_word(db, current_user, word, payload.card_type.value if payload.card_type else CARD_TYPE_KEY_TO_VALUE)
        card, state, log, deduplicated = review_card(
            db,
            current_user,
            card,
            rating,
            confidence=payload.confidence,
            latency_ms=payload.latency_ms,
            platform=payload.platform.value if payload.platform else "WEB",
            session_id=payload.session_id,
            client_event_id=payload.client_event_id,
        )
        if not deduplicated:
            sync_legacy_word_after_review(db, current_user, card, rating, state.last_reviewed_at or utcnow(), True)
        db.commit()
        db.refresh(word)
        db.refresh(state)
        if log is not None:
            db.refresh(log)
        debug_log("DEBUG_PROGRESS", logger, "study_recorded", user_id=current_user.id, wordbook_id=word.wordbook_id)
        return StudyResponse(
            word=word_response(word),
            event_id=log.id if log is not None else 0,
            result=payload.result,
            studied_at=state.last_reviewed_at or utcnow(),
            card_id=card.id,
            review_log_id=log.id if log is not None else None,
            due_at=state.due_at,
            status=state.status,
        )

    @api.get("/sync/pull", response_model=SyncPullResponse)
    def sync_pull(
        sinceRevision: int = 0,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> SyncPullResponse:
        wordbooks = (
            db.query(Wordbook)
            .filter(Wordbook.user_id == current_user.id, Wordbook.sync_revision > sinceRevision)
            .order_by(Wordbook.sync_revision.asc())
            .all()
        )
        words = (
            db.query(Word)
            .join(Wordbook)
            .filter(Wordbook.user_id == current_user.id, Word.sync_revision > sinceRevision)
            .order_by(Word.sync_revision.asc())
            .all()
        )
        return SyncPullResponse(
            server_revision=current_user.sync_revision or 0,
            wordbooks=[wordbook_response(db, row) for row in wordbooks],
            words=[word_response(row) for row in words],
        )

    @api.post("/sync/push", response_model=SyncPushResponse)
    def sync_push(
        payload: SyncPushRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> SyncPushResponse:
        applied: List[SyncApplied] = []
        conflicts: List[SyncConflict] = []

        for change in payload.changes:
            if change.entity_type == "wordbook":
                apply_wordbook_change(db, current_user, change, applied, conflicts)
            else:
                apply_word_change(db, current_user, change, applied, conflicts)

        if conflicts:
            db.rollback()
            return SyncPushResponse(server_revision=current_user.sync_revision or 0, applied=[], conflicts=conflicts)

        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sync push conflicts with server data")

        db.refresh(current_user)
        return SyncPushResponse(server_revision=current_user.sync_revision or 0, applied=applied, conflicts=[])

    @api.get("/profile/summary", response_model=ProfileSummary)
    def profile_summary(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> ProfileSummary:
        today = utcnow().date().isoformat()
        cumulative_days = profile_study_days(db, current_user.id)
        today_count = profile_studied_today(db, current_user.id, today)
        summaries = recent_wordbook_summaries(db, current_user.id)
        memorized_words = merged_memorized_word_summaries(db, current_user.id)
        memorized_word_count = len(memorized_words)
        long_term_stats = profile_long_term_review_stats_30d(db, current_user.id)
        return ProfileSummary(
            cumulative_learning_days=cumulative_days,
            today_studied_count=today_count,
            memorized_word_count=memorized_word_count,
            memorized_words=memorized_words,
            recent_wordbooks=summaries,
            mastered_count=profile_mastered_count(db, current_user.id),
            weak_card_count=profile_weak_card_count(db, current_user.id),
            daily_quest_completed_count=profile_daily_quest_completed_count(db, current_user.id),
            long_term_review_count_30d=long_term_stats["review_count"],
            long_term_correct_count_30d=long_term_stats["correct_count"],
            long_term_recall_rate_30d=long_term_stats["recall_rate"],
            mastered_lapse_count_30d=long_term_stats["lapse_count"],
            old_mastered_due_count=profile_old_mastered_due_count(db, current_user.id),
        )


def dedup_key(memory_item_id: Optional[int], word_id: Optional[int], card_id: Optional[int]) -> str:
    if memory_item_id is not None:
        return f"m:{memory_item_id}"
    if word_id is not None:
        return f"w:{word_id}"
    return f"c:{card_id}"


def profile_study_days(db: Session, user_id: int) -> int:
    legacy_days = {row[0] for row in db.query(func.date(LearningEvent.studied_at)).filter(LearningEvent.user_id == user_id).distinct().all() if row[0]}
    review_days = {row[0] for row in db.query(func.date(ReviewLog.reviewed_at)).filter(ReviewLog.user_id == user_id).distinct().all() if row[0]}
    return len(legacy_days | review_days)


def profile_studied_today(db: Session, user_id: int, today: str) -> int:
    legacy = {
        dedup_key(row.memory_item_id, row.word_id, None)
        for row in db.query(Word.memory_item_id.label("memory_item_id"), LearningEvent.word_id.label("word_id"))
        .join(Word, Word.id == LearningEvent.word_id)
        .filter(LearningEvent.user_id == user_id, func.date(LearningEvent.studied_at) == today)
        .distinct()
        .all()
    }
    review = {
        dedup_key(row.item_id, row.word_id, row.card_id)
        for row in db.query(Card.item_id, Word.id.label("word_id"), ReviewLog.card_id)
        .join(ReviewLog, ReviewLog.card_id == Card.id)
        .outerjoin(Word, Word.memory_item_id == Card.item_id)
        .filter(ReviewLog.user_id == user_id, func.date(ReviewLog.reviewed_at) == today)
        .all()
    }
    return len(legacy | review)


def profile_quest_review_count_today(db: Session, user_id: int, today: str) -> int:
    review_count = (
        db.query(func.count(ReviewLog.id))
        .filter(ReviewLog.user_id == user_id, func.date(ReviewLog.reviewed_at) == today)
        .scalar()
        or 0
    )
    return int(review_count)


def profile_daily_quest_completed_count(db: Session, user_id: int, target_count: int = DEFAULT_DAILY_QUEST_TARGET_COUNT) -> int:
    review_day = func.date(ReviewLog.reviewed_at)
    rows = (
        db.query(review_day.label("review_day"), func.count(ReviewLog.id).label("review_count"))
        .filter(ReviewLog.user_id == user_id)
        .group_by(review_day)
        .having(func.count(ReviewLog.id) >= target_count)
        .all()
    )
    return len(rows)


def merged_memorized_word_summaries(db: Session, user_id: int) -> List[MemorizedWordSummary]:
    legacy_rows = memorized_word_summaries(db, user_id)
    word_to_item = {
        row.id: row.memory_item_id
        for row in db.query(Word.id, Word.memory_item_id)
        .join(Wordbook, Wordbook.id == Word.wordbook_id)
        .filter(Wordbook.user_id == user_id)
        .all()
    }
    merged: Dict[str, MemorizedWordSummary] = {}
    for row in legacy_rows:
        merged[dedup_key(word_to_item.get(row.word_id), row.word_id, None)] = row
    review_rows = (
        db.query(MemoryItem.id.label("item_id"), Word.id.label("word_id"), Card.id.label("card_id"), Card.wordbook_id, Wordbook.name, Card.prompt, Card.answer)
        .join(Card, Card.item_id == MemoryItem.id)
        .join(Wordbook, Wordbook.id == Card.wordbook_id)
        .outerjoin(Word, Word.memory_item_id == MemoryItem.id)
        .outerjoin(ReviewState, ReviewState.card_id == Card.id)
        .outerjoin(ReviewLog, ReviewLog.card_id == Card.id)
        .filter(
            MemoryItem.user_id == user_id,
            Card.active.is_(True),
            Card.deleted_at.is_(None),
            or_(ReviewState.status.in_([STATUS_REVIEW, STATUS_MASTERED]), ReviewLog.rating.in_([RATING_GOOD, RATING_HARD, RATING_EASY])),
        )
        .all()
    )
    for item_id, word_id, card_id, wordbook_id, wordbook_name, prompt, answer in review_rows:
        key = dedup_key(item_id, word_id, card_id)
        if key in merged:
            continue
        merged[key] = MemorizedWordSummary(
            word_id=word_id if word_id is not None else -card_id,
            wordbook_id=wordbook_id,
            wordbook_name=wordbook_name,
            key=prompt,
            value=answer,
            known_count=1,
            last_studied_at=None,
        )
    return list(merged.values())[:50]


def profile_mastered_count(db: Session, user_id: int) -> int:
    return (
        db.query(func.count(func.distinct(Card.item_id)))
        .join(ReviewState, ReviewState.card_id == Card.id)
        .join(MemoryItem, MemoryItem.id == Card.item_id)
        .filter(
            ReviewState.user_id == user_id,
            ReviewState.status == STATUS_MASTERED,
            Card.active.is_(True),
            Card.deleted_at.is_(None),
            MemoryItem.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )


def profile_weak_card_count(db: Session, user_id: int) -> int:
    return (
        db.query(func.count(func.distinct(Card.item_id)))
        .join(ReviewState, ReviewState.card_id == Card.id)
        .filter(ReviewState.user_id == user_id, or_(ReviewState.lapses > 0, ReviewState.leech_score > 0))
        .scalar()
        or 0
    )


def profile_long_term_review_stats_30d(db: Session, user_id: int, now: Optional[datetime] = None) -> Dict[str, Any]:
    reference = now or utcnow()
    since = reference - timedelta(days=30)
    rows = (
        db.query(ReviewLog, ReviewState)
        .outerjoin(ReviewState, ReviewState.card_id == ReviewLog.card_id)
        .filter(ReviewLog.user_id == user_id, ReviewLog.reviewed_at >= since)
        .all()
    )
    long_term_logs = [log for log, state in rows if review_log_was_mastered_before(log, state)]
    review_count = len(long_term_logs)
    correct_count = sum(1 for log in long_term_logs if log.rating in {RATING_HARD, RATING_GOOD, RATING_EASY})
    lapse_count = sum(1 for log in long_term_logs if log.rating == RATING_AGAIN)
    return {
        "review_count": review_count,
        "correct_count": correct_count,
        "recall_rate": correct_count / review_count if review_count else 0.0,
        "lapse_count": lapse_count,
    }


def review_log_was_mastered_before(log: ReviewLog, state: Optional[ReviewState]) -> bool:
    before = log.state_before_json if isinstance(log.state_before_json, dict) else None
    before_status = before.get("status") if before else None
    if before_status is not None:
        return before_status == STATUS_MASTERED
    return state is not None and state.status == STATUS_MASTERED


def profile_old_mastered_due_count(db: Session, user_id: int, now: Optional[datetime] = None) -> int:
    reference = now or utcnow()
    recent_cutoff = reference - timedelta(days=7)
    rows = (
        db.query(Card, ReviewState)
        .join(MemoryItem, MemoryItem.id == Card.item_id)
        .join(ReviewState, ReviewState.card_id == Card.id)
        .filter(
            Card.user_id == user_id,
            Card.active.is_(True),
            Card.deleted_at.is_(None),
            MemoryItem.deleted_at.is_(None),
            ReviewState.status == STATUS_MASTERED,
        )
        .all()
    )
    count = 0
    for _card, state in rows:
        if state.due_at and comparable_datetime(state.due_at, datetime.max, reference) <= reference:
            continue
        if state.last_reviewed_at and comparable_datetime(state.last_reviewed_at, datetime.max, reference) >= recent_cutoff:
            continue
        count += 1
    return count


def logout_current_token(authorization: str, current_user: User, db: Session) -> MessageResponse:
    token = authorization.replace("Bearer ", "", 1).strip()
    db.query(AuthToken).filter(
        AuthToken.user_id == current_user.id,
        AuthToken.token_hash == hash_token(token),
    ).delete()
    db.commit()
    debug_log("DEBUG_AUTH", logger, "logout_success", user_id=current_user.id)
    return MessageResponse(message="Logged out")


def recent_wordbook_summaries(db: Session, user_id: int) -> List[WordbookStudySummary]:
    rows = (
        db.query(
            Wordbook.id,
            Wordbook.name,
            func.count(LearningEvent.id).label("studied_count"),
            func.sum(case((LearningEvent.result == "known", 1), else_=0)).label("known_count"),
            func.sum(case((LearningEvent.result == "unknown", 1), else_=0)).label("unknown_count"),
            func.max(LearningEvent.studied_at).label("last_studied_at"),
        )
        .join(LearningEvent, LearningEvent.wordbook_id == Wordbook.id)
        .filter(Wordbook.user_id == user_id)
        .group_by(Wordbook.id, Wordbook.name)
        .order_by(func.max(LearningEvent.studied_at).desc())
        .limit(10)
        .all()
    )
    return [
        WordbookStudySummary(
            wordbook_id=row.id,
            name=row.name,
            studied_count=row.studied_count or 0,
            known_count=row.known_count or 0,
            unknown_count=row.unknown_count or 0,
            last_studied_at=row.last_studied_at,
        )
        for row in rows
    ]


def memorized_word_total(db: Session, user_id: int) -> int:
    return (
        db.query(func.count(func.distinct(LearningEvent.word_id)))
        .join(Word, LearningEvent.word_id == Word.id)
        .join(Wordbook, LearningEvent.wordbook_id == Wordbook.id)
        .filter(
            LearningEvent.user_id == user_id,
            LearningEvent.result == "known",
            Word.deleted_at.is_(None),
            Wordbook.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )


def memorized_word_summaries(db: Session, user_id: int) -> List[MemorizedWordSummary]:
    rows = (
        db.query(
            Word.id.label("word_id"),
            Wordbook.id.label("wordbook_id"),
            Wordbook.name.label("wordbook_name"),
            Word.key,
            Word.value,
            func.count(LearningEvent.id).label("known_count"),
            func.max(LearningEvent.studied_at).label("last_studied_at"),
        )
        .join(Word, LearningEvent.word_id == Word.id)
        .join(Wordbook, LearningEvent.wordbook_id == Wordbook.id)
        .filter(
            LearningEvent.user_id == user_id,
            LearningEvent.result == "known",
            Word.deleted_at.is_(None),
            Wordbook.deleted_at.is_(None),
        )
        .group_by(Word.id, Wordbook.id, Wordbook.name, Word.key, Word.value)
        .order_by(func.max(LearningEvent.studied_at).desc())
        .limit(50)
        .all()
    )
    return [
        MemorizedWordSummary(
            word_id=row.word_id,
            wordbook_id=row.wordbook_id,
            wordbook_name=row.wordbook_name,
            key=row.key,
            value=row.value,
            known_count=row.known_count or 0,
            last_studied_at=row.last_studied_at,
        )
        for row in rows
    ]


app = create_app()
