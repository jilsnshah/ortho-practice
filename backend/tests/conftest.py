import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="ortho-test-"))
os.environ["ORTHO_DATABASE_URL"] = os.environ.get("ORTHO_TEST_DATABASE_URL", f"sqlite:///{_tmp / 'test.db'}")
os.environ["ORTHO_SECRET_KEY"] = "test-secret"
os.environ["ORTHO_FRONTEND_DIST"] = str(_tmp / "no-frontend")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import models  # noqa: E402,F401
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402

PASSWORD = "correct-horse-battery"


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


def _make_user(email: str) -> None:
    with SessionLocal() as db:
        db.add(User(email=email, full_name=email.split("@")[0], password_hash=hash_password(PASSWORD)))
        db.commit()


def _login(email: str) -> TestClient:
    client = TestClient(app)
    res = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return client


@pytest.fixture
def client() -> TestClient:
    _make_user("ortho@example.com")
    return _login("ortho@example.com")


@pytest.fixture
def other_client() -> TestClient:
    _make_user("other@example.com")
    return _login("other@example.com")


@pytest.fixture
def seed(client):
    """One city, clinic, doctor (linked), treatment type, rate card entry and patient."""
    city = client.post("/api/cities", json={"name": "Pune"}).json()
    clinic = client.post("/api/clinics", json={"name": "Avdhoot Clinic", "branch": "Kothrud", "city_id": city["id"]}).json()
    doctor = client.post("/api/doctors", json={"name": "Dr. Sharma", "clinic_ids": [clinic["id"]]}).json()
    tt = client.post("/api/treatment-types", json={"name": "Metal braces"}).json()
    rate = client.post(
        f"/api/clinics/{clinic['id']}/rate-card",
        json={"treatment_type_id": tt["id"], "quote_amount": 45000, "fee_amount": 30000, "material_cost": 8000},
    ).json()
    patient = client.post("/api/patients", json={"name": "Asha Patil", "phone": "98220 12345"}).json()
    return {"city": city, "clinic": clinic, "doctor": doctor, "treatment_type": tt, "rate": rate, "patient": patient}
