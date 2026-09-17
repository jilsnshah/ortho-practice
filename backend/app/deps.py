from typing import Annotated, TypeVar

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.security import SESSION_COOKIE, read_session_token

DbSession = Annotated[Session, Depends(get_db)]

T = TypeVar("T")


def current_user(request: Request, db: DbSession) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    uid = read_session_token(token) if token else None
    user = db.get(User, uid) if uid else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def get_owned_or_404(db: Session, model: type[T], obj_id: int, user: User) -> T:
    """Fetch a record addressed by URL path; other owners' records look nonexistent."""
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "owner_id") != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} not found")
    return obj


def resolve_ref(db: Session, model: type[T], obj_id: int | None, user: User, field: str) -> T | None:
    """Resolve a foreign-key id from a request body.

    The DB foreign key guarantees the row exists; this additionally guarantees it
    belongs to the caller, and turns a bad id into a 422 on the offending field
    instead of a generic integrity error.
    """
    if obj_id is None:
        return None
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "owner_id") != user.id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            {"field": field, "message": f"{model.__name__} {obj_id} does not exist. Create it first."},
        )
    return obj


def duplicate(message: str, existing_id: int, existing_name: str) -> HTTPException:
    return HTTPException(
        status.HTTP_409_CONFLICT,
        {"message": message, "existing": {"id": existing_id, "name": existing_name}},
    )
