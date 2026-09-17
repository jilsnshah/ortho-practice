"""The Alembic migration must produce the same schema as the models."""

import os
import tempfile
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext

from app.db import Base, make_engine

BACKEND = Path(__file__).resolve().parent.parent


def test_migrations_match_models(monkeypatch):
    db_path = Path(tempfile.mkdtemp()) / "migrate.db"
    url = f"sqlite:///{db_path}"
    monkeypatch.setattr("app.config.get_settings", lambda: type("S", (), {"database_url": url})())
    monkeypatch.setitem(os.environ, "ORTHO_DATABASE_URL", url)

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    cfg.attributes["configure_logger"] = False
    command.upgrade(cfg, "head")

    engine = make_engine(url)
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == []
