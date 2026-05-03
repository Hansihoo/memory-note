from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, status

from .config import get_google_client_id


@dataclass(frozen=True)
class GoogleIdentity:
    subject: str
    email: str
    display_name: str
    avatar_url: Optional[str] = None


def verify_google_id_token(id_token: str) -> GoogleIdentity:
    client_id = get_google_client_id()
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google login is not configured",
        )

    try:
        from google.auth.transport import requests as google_requests  # type: ignore[import-untyped]
        from google.oauth2 import id_token as google_id_token  # type: ignore[import-untyped]
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google auth dependency is not installed",
        ) from exc

    try:
        claims = google_id_token.verify_oauth2_token(id_token, google_requests.Request(), client_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token") from exc

    subject = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip().lower()
    if not subject or not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")

    return GoogleIdentity(
        subject=subject,
        email=email,
        display_name=str(claims.get("name") or email).strip() or email,
        avatar_url=str(claims.get("picture") or "").strip() or None,
    )
