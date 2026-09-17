from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_prefix="ORTHO_", extra="ignore")

    database_url: str = f"sqlite:///{BACKEND_DIR / 'data' / 'ortho.db'}"
    # Must be overridden in any real deployment (ORTHO_SECRET_KEY).
    secret_key: str = "dev-insecure-change-me"
    session_max_age_seconds: int = 60 * 60 * 24 * 30
    # Set true when served over HTTPS.
    cookie_secure: bool = False
    max_upload_bytes: int = 25 * 1024 * 1024
    # Built frontend (frontend/dist); served by FastAPI when present.
    frontend_dist: Path = BACKEND_DIR.parent / "frontend" / "dist"

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, url: str) -> str:
        # Hosts (Render, Heroku) hand out postgres:// URLs; SQLAlchemy needs the driver named.
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url.removeprefix(prefix)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
