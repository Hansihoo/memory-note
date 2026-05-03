from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuthToken, User, Word, Wordbook
from .security import hash_token


def get_current_user(
    authorization: str = Header("", alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    token = authorization[len(prefix) :].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    token_row = db.query(AuthToken).filter(AuthToken.token_hash == hash_token(token)).first()
    if token_row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return token_row.user


def get_user_wordbook(db: Session, user: User, wordbook_id: int) -> Wordbook:
    wordbook = (
        db.query(Wordbook)
        .filter(Wordbook.id == wordbook_id, Wordbook.user_id == user.id, Wordbook.deleted_at.is_(None))
        .first()
    )
    if wordbook is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wordbook not found")
    return wordbook


def get_user_word(db: Session, user: User, word_id: int) -> Word:
    word = (
        db.query(Word)
        .join(Wordbook)
        .filter(Word.id == word_id, Wordbook.user_id == user.id, Wordbook.deleted_at.is_(None), Word.deleted_at.is_(None))
        .first()
    )
    if word is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Word not found")
    return word
