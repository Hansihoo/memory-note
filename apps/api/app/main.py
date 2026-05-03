import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import case, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_cors_origins
from .database import get_db, init_db
from .deps import get_current_user, get_user_word, get_user_wordbook
from .google_auth import verify_google_id_token
from .logging_config import configure_logging, debug_log
from .models import AuthToken, LearningEvent, SyncEvent, User, Word, Wordbook
from .schemas import (
    AuthRequest,
    GoogleAuthRequest,
    MessageResponse,
    ProfileSummary,
    StudyRequest,
    StudyResponse,
    SyncApplied,
    SyncChange,
    SyncConflict,
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse,
    TokenResponse,
    UserResponse,
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
        init_db()

    register_routes(api)
    return api


def wordbook_response(db: Session, wordbook: Wordbook) -> WordbookResponse:
    count = db.query(func.count(Word.id)).filter(Word.wordbook_id == wordbook.id, Word.deleted_at.is_(None)).scalar() or 0
    return WordbookResponse.from_orm(wordbook).copy(update={"word_count": count})


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
    mark_word_changed(db, user, word, "delete")


def wordbook_dict(db: Session, wordbook: Wordbook) -> Dict[str, Any]:
    return wordbook_response(db, wordbook).dict(by_alias=True)


def word_dict(word: Word) -> Dict[str, Any]:
    return WordResponse.from_orm(word).dict(by_alias=True)


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

    @api.get("/wordbooks/{wordbook_id}/words", response_model=List[WordResponse])
    def list_words(
        wordbook_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> List[WordResponse]:
        get_user_wordbook(db, current_user, wordbook_id)
        return db.query(Word).filter(Word.wordbook_id == wordbook_id, Word.deleted_at.is_(None)).order_by(Word.id.asc()).all()

    @api.post("/wordbooks/{wordbook_id}/words", response_model=WordResponse, status_code=status.HTTP_201_CREATED)
    def create_word(
        wordbook_id: int,
        payload: WordCreate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> Word:
        get_user_wordbook(db, current_user, wordbook_id)
        row = Word(wordbook_id=wordbook_id, key=payload.key, value=payload.value, last_viewed_at=payload.last_viewed_at)
        db.add(row)
        try:
            db.flush()
            mark_word_changed(db, current_user, row, "create")
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Word key already exists in wordbook")
        db.refresh(row)
        debug_log("DEBUG_IMPORT", logger, "created_word", word_id=row.id, wordbook_id=wordbook_id)
        return row

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
                mark_word_changed(db, current_user, row, "create")
            else:
                row.key = item.key
                row.value = item.value
                row.last_viewed_at = item.last_viewed_at
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
        return WordBatchResponse(words=changed)

    @api.get("/words/{word_id}", response_model=WordResponse)
    def read_word(
        word_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> Word:
        return get_user_word(db, current_user, word_id)

    @api.patch("/words/{word_id}", response_model=WordResponse)
    def update_word(
        word_id: int,
        payload: WordUpdate,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> Word:
        row = get_user_word(db, current_user, word_id)
        for field, value in payload.dict(by_alias=False, exclude_unset=True).items():
            setattr(row, field, value)
        try:
            mark_word_changed(db, current_user, row, "update")
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Word key already exists in wordbook")
        db.refresh(row)
        return row

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

    @api.post("/study/words/{word_id}", response_model=StudyResponse)
    def study_word(
        word_id: int,
        payload: StudyRequest,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> StudyResponse:
        word = get_user_word(db, current_user, word_id)
        now = utcnow()
        word.last_viewed_at = now
        mark_word_changed(db, current_user, word, "update")
        event = LearningEvent(
            user_id=current_user.id,
            wordbook_id=word.wordbook_id,
            word_id=word.id,
            result=payload.result,
            studied_at=now,
        )
        db.add(event)
        db.commit()
        db.refresh(word)
        db.refresh(event)
        debug_log("DEBUG_PROGRESS", logger, "study_recorded", user_id=current_user.id, wordbook_id=word.wordbook_id)
        return StudyResponse(word=WordResponse.from_orm(word), event_id=event.id, result=event.result, studied_at=event.studied_at)

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
            words=[WordResponse.from_orm(row) for row in words],
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
        cumulative_days = (
            db.query(func.count(func.distinct(func.date(LearningEvent.studied_at))))
            .filter(LearningEvent.user_id == current_user.id)
            .scalar()
            or 0
        )
        today_count = (
            db.query(func.count(LearningEvent.id))
            .filter(LearningEvent.user_id == current_user.id, func.date(LearningEvent.studied_at) == today)
            .scalar()
            or 0
        )
        summaries = recent_wordbook_summaries(db, current_user.id)
        return ProfileSummary(
            cumulative_learning_days=cumulative_days,
            today_studied_count=today_count,
            recent_wordbooks=summaries,
        )


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


app = create_app()
