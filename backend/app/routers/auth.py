from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select

from app.config import get_settings
from app.deps import CurrentUser, DbSession
from app.models import User
from app.schemas import LoginIn, PasswordChangeIn, UserOut
from app.security import SESSION_COOKIE, hash_password, make_session_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, response: Response, db: DbSession):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.strip().lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    settings = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        make_session_token(user.id),
        max_age=settings.session_max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: PasswordChangeIn, user: CurrentUser, db: DbSession):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, {"field": "current_password", "message": "Current password is wrong"}
        )
    user.password_hash = hash_password(body.new_password)
    db.commit()
