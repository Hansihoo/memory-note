import logging
from typing import List

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import case, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import get_db, init_db
from .deps import get_current_user, get_user_word, get_user_wordbook
from .logging_config import configure_logging, debug_log
from .models import AuthToken, LearningEvent, User, Word, Wordbook
from .schemas import (
    AuthRequest,
    MessageResponse,
    ProfileSummary,
    StudyRequest,
    StudyResponse,
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
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
    count = db.query(func.count(Word.id)).filter(Word.wordbook_id == wordbook.id).scalar() or 0
    return WordbookResponse.from_orm(wordbook).copy(update={"word_count": count})


def register_routes(api: FastAPI) -> None:
    @api.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @api.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
    def register(payload: AuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
        username = payload.username.lower()
        user = User(username=username, password_hash=hash_password(payload.password))
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")

        token, token_hash = issue_token()
        db.add(AuthToken(user_id=user.id, token_hash=token_hash))
        db.commit()
        db.refresh(user)
        debug_log("DEBUG_AUTH", logger, "registered_user", user_id=user.id)
        return TokenResponse(token=token, user=UserResponse.from_orm(user))

    @api.post("/auth/login", response_model=TokenResponse)
    def login(payload: AuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
        user = db.query(User).filter(User.username == payload.username.lower()).first()
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        token, token_hash = issue_token()
        db.add(AuthToken(user_id=user.id, token_hash=token_hash))
        db.commit()
        db.refresh(user)
        debug_log("DEBUG_AUTH", logger, "login_success", user_id=user.id)
        return TokenResponse(token=token, user=UserResponse.from_orm(user))

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
        rows = db.query(Wordbook).filter(Wordbook.user_id == current_user.id).order_by(Wordbook.updated_at.desc()).all()
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
        row.updated_at = utcnow()
        try:
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
        db.delete(row)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @api.get("/wordbooks/{wordbook_id}/words", response_model=List[WordResponse])
    def list_words(
        wordbook_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> List[WordResponse]:
        get_user_wordbook(db, current_user, wordbook_id)
        return db.query(Word).filter(Word.wordbook_id == wordbook_id).order_by(Word.id.asc()).all()

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
                row = db.query(Word).filter(Word.id == item.id, Word.wordbook_id == wordbook_id).first()
                if row is None:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Word not found: {item.id}")
            else:
                row = db.query(Word).filter(Word.wordbook_id == wordbook_id, Word.key == item.key).first()

            if row is None:
                row = Word(wordbook_id=wordbook_id, key=item.key, value=item.value, last_viewed_at=item.last_viewed_at)
                db.add(row)
            else:
                row.key = item.key
                row.value = item.value
                row.last_viewed_at = item.last_viewed_at
                row.updated_at = utcnow()
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
        row.updated_at = utcnow()
        try:
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
        db.delete(row)
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
        word.updated_at = now
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
