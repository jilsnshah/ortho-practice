"""First-run account creation for hosts without shell access.

Creates the single initial user from ORTHO_BOOTSTRAP_* settings, and only while
the database holds no users — so it cannot overwrite or re-add an account later.
"""

import logging

from sqlalchemy import func, select

from app.config import get_settings
from app.db import SessionLocal
from app.models import User
from app.security import MIN_PASSWORD_LENGTH, hash_password

log = logging.getLogger("uvicorn.error")


def ensure_bootstrap_user() -> None:
    settings = get_settings()
    if not settings.bootstrap_email or not settings.bootstrap_password:
        return
    if len(settings.bootstrap_password) < MIN_PASSWORD_LENGTH:
        log.warning("ORTHO_BOOTSTRAP_PASSWORD is shorter than %d characters; no account created.", MIN_PASSWORD_LENGTH)
        return
    with SessionLocal() as db:
        if db.scalar(select(func.count(User.id))):
            return
        db.add(
            User(
                email=settings.bootstrap_email.strip().lower(),
                full_name=settings.bootstrap_name.strip() or "Orthodontist",
                password_hash=hash_password(settings.bootstrap_password),
            )
        )
        db.commit()
        log.warning("Created the first account for %s. Change its password after signing in.", settings.bootstrap_email)
