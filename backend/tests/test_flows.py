import io
from datetime import date

from PIL import Image

from tests.conftest import PASSWORD


def _case(client, seed, **overrides):
    body = {
        "patient_id": seed["patient"]["id"],
        "clinic_id": seed["clinic"]["id"],
        "treatment_type_id": seed["treatment_type"]["id"],
        "started_on": "2026-09-01",
        **overrides,
    }
    res = client.post("/api/cases", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_bootstrap_creates_only_the_first_account(monkeypatch):
    from fastapi.testclient import TestClient

    from app.bootstrap import ensure_bootstrap_user
    from app.config import get_settings
    from app.main import app

    settings = get_settings()
    monkeypatch.setattr(settings, "bootstrap_email", "first@example.com")
    monkeypatch.setattr(settings, "bootstrap_password", "bootstrap-password")
    monkeypatch.setattr(settings, "bootstrap_name", "Dr. First")

    ensure_bootstrap_user()
    client = TestClient(app)
    login = {"email": "first@example.com", "password": "bootstrap-password"}
    assert client.post("/api/auth/login", json=login).status_code == 200

    # A second run must not add another account or reset the password.
    client.post("/api/auth/password", json={"current_password": "bootstrap-password", "new_password": "changed-by-user"})
    monkeypatch.setattr(settings, "bootstrap_email", "second@example.com")
    ensure_bootstrap_user()
    assert client.post("/api/auth/login", json=login).status_code == 401
    assert client.post("/api/auth/login", json={"email": "second@example.com", "password": "bootstrap-password"}).status_code == 401


def test_login_logout(client):
    assert client.get("/api/auth/me").json()["email"] == "ortho@example.com"
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", json={"email": "ortho@example.com", "password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "ORTHO@example.com", "password": PASSWORD}).status_code == 200


def test_change_password(client):
    wrong = client.post("/api/auth/password", json={"current_password": "nope", "new_password": "another-long-pass"})
    assert wrong.status_code == 422
    ok = client.post("/api/auth/password", json={"current_password": PASSWORD, "new_password": "another-long-pass"})
    assert ok.status_code == 204
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": "ortho@example.com", "password": PASSWORD}).status_code == 401
    assert (
        client.post("/api/auth/login", json={"email": "ortho@example.com", "password": "another-long-pass"}).status_code
        == 200
    )


def test_case_amounts_fill_from_rate_card_and_profit_is_computed(client, seed):
    case = _case(client, seed)
    assert (case["quote_amount"], case["fee_amount"], case["material_cost"]) == (45000, 30000, 8000)
    assert case["profit"] == 22000
    assert case["clinic"]["city"]["name"] == "Pune"


def test_explicit_amounts_override_rate_card(client, seed):
    case = _case(client, seed, fee_amount=28000)
    assert case["fee_amount"] == 28000 and case["material_cost"] == 8000 and case["profit"] == 20000


def test_rate_lookup(client, seed):
    clinic_id, tt_id = seed["clinic"]["id"], seed["treatment_type"]["id"]
    assert client.get(f"/api/clinics/{clinic_id}/rate-card/by-treatment/{tt_id}").json()["fee_amount"] == 30000
    other = client.post("/api/treatment-types", json={"name": "Aligners"}).json()
    assert client.get(f"/api/clinics/{clinic_id}/rate-card/by-treatment/{other['id']}").json() is None


def test_case_without_treatment_is_incomplete(client, seed):
    _case(client, seed, treatment_type_id=None, status="consultation")
    _case(client, seed)
    res = client.get("/api/cases", params={"incomplete": True}).json()
    assert res["total"] == 1 and res["items"][0]["treatment_type"] is None


def test_case_search_and_sums_across_clinics(client, seed):
    mumbai = client.post("/api/cities", json={"name": "Mumbai"}).json()
    clinic2 = client.post("/api/clinics", json={"name": "Smile Studio", "city_id": mumbai["id"]}).json()
    other_patient = client.post("/api/patients", json={"name": "Rohan Mehta"}).json()
    _case(client, seed)
    _case(client, seed, clinic_id=clinic2["id"], patient_id=other_patient["id"], fee_amount=20000, material_cost=5000)

    everything = client.get("/api/cases").json()
    assert everything["sums"] == {
        "count": 2,
        "quote_amount": 45000,
        "fee_amount": 50000,
        "material_cost": 13000,
        "profit": 37000,
    }
    assert [c["patient"]["name"] for c in client.get("/api/cases", params={"q": "rohan"}).json()["items"]] == [
        "Rohan Mehta"
    ]
    assert client.get("/api/cases", params={"q": "smile"}).json()["total"] == 1
    assert client.get("/api/cases", params={"city_id": seed["city"]["id"]}).json()["total"] == 1


def test_update_case_validates_doctor_against_new_clinic(client, seed):
    case = _case(client, seed, doctor_id=seed["doctor"]["id"])
    clinic2 = client.post("/api/clinics", json={"name": "Other Clinic", "city_id": seed["city"]["id"]}).json()
    assert client.patch(f"/api/cases/{case['id']}", json={"clinic_id": clinic2["id"]}).status_code == 422
    ok = client.patch(f"/api/cases/{case['id']}", json={"clinic_id": clinic2["id"], "doctor_id": None})
    assert ok.status_code == 200 and ok.json()["doctor"] is None


def test_appointments_agenda(client, seed):
    case = _case(client, seed)
    res = client.post(
        "/api/appointments",
        json={
            "clinic_id": seed["clinic"]["id"],
            "case_id": case["id"],
            "doctor_id": seed["doctor"]["id"],
            "starts_at": "2026-09-18T10:30:00",
            "notes": "Discussed IPR with Dr. Sharma",
        },
    )
    assert res.status_code == 201, res.text
    appt = res.json()
    assert appt["patient"]["id"] == seed["patient"]["id"]  # derived from the case

    client.post("/api/appointments", json={"clinic_id": seed["clinic"]["id"], "starts_at": "2026-09-25T09:00:00"})
    week = client.get("/api/appointments", params={"from": "2026-09-14", "to": "2026-09-20"}).json()
    assert [a["id"] for a in week] == [appt["id"]]

    done = client.patch(f"/api/appointments/{appt['id']}", json={"status": "completed"}).json()
    assert done["status"] == "completed"

    # Case must belong to the appointment's clinic.
    clinic2 = client.post("/api/clinics", json={"name": "Elsewhere", "city_id": seed["city"]["id"]}).json()
    bad = client.post(
        "/api/appointments", json={"clinic_id": clinic2["id"], "case_id": case["id"], "starts_at": "2026-09-19T09:00:00"}
    )
    assert bad.status_code == 422
    assert client.delete(f"/api/cases/{case['id']}").status_code == 409


def _jpeg_bytes(color=(200, 30, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (3000, 2000), color).save(buf, "JPEG")
    return buf.getvalue()


def test_photo_upload_gallery_and_delete(client, seed, other_client):
    case = _case(client, seed)
    url = f"/api/cases/{case['id']}/photos"
    later = client.post(url, data={"taken_on": "2026-12-01", "stage_label": "Month 4"}, files={"file": ("b.jpg", _jpeg_bytes())})
    first = client.post(url, data={"taken_on": "2026-09-01", "stage_label": "Month 1"}, files={"file": ("a.jpg", _jpeg_bytes())})
    assert first.status_code == 201, first.text
    assert first.json()["width"] == 2400  # downscaled

    gallery = client.get(url).json()
    assert [p["stage_label"] for p in gallery] == ["Month 1", "Month 4"]  # chronological

    img = client.get(first.json()["url"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    assert client.get(first.json()["thumb_url"]).status_code == 200
    assert other_client.get(first.json()["url"]).status_code == 404

    bad = client.post(url, data={"taken_on": "2026-09-01"}, files={"file": ("x.jpg", b"not an image")})
    assert bad.status_code == 422

    assert client.delete(f"/api/photos/{later.json()['id']}").status_code == 204
    assert len(client.get(url).json()) == 1
    assert client.delete(f"/api/cases/{case['id']}").status_code == 204


def test_dashboard_rollups(client, seed):
    mumbai = client.post("/api/cities", json={"name": "Mumbai"}).json()
    clinic2 = client.post("/api/clinics", json={"name": "Smile Studio", "city_id": mumbai["id"]}).json()
    _case(client, seed, started_on="2026-08-10")
    _case(client, seed, started_on="2026-09-02")
    _case(client, seed, clinic_id=clinic2["id"], started_on="2026-09-05", fee_amount=10000, material_cost=1000)
    _case(client, seed, treatment_type_id=None, status="consultation", started_on="2026-09-06")
    client.post("/api/appointments", json={"clinic_id": clinic2["id"], "starts_at": f"{date.today()}T11:00:00"})

    d = client.get("/api/dashboard").json()
    assert d["totals"]["count"] == 4
    assert d["totals"]["profit"] == 22000 * 2 + 9000
    assert {g["label"]: g["profit"] for g in d["by_city"]} == {"Pune": 44000, "Mumbai": 9000}
    assert [g["key"] for g in d["by_month"]] == ["month:2026-08", "month:2026-09"]
    assert {g["label"] for g in d["by_treatment_type"]} == {"Metal braces", "Not set"}
    assert d["by_clinic"][0]["id"] == seed["clinic"]["id"]
    assert d["incomplete_case_count"] == 1
    assert d["appointments_today"] == 1

    september = client.get("/api/dashboard", params={"from": "2026-09-01", "to": "2026-09-30"}).json()
    assert september["totals"]["count"] == 3


def test_clinic_detail_rate_card_and_doctor_links(client, seed):
    clinic_id = seed["clinic"]["id"]
    detail = client.get(f"/api/clinics/{clinic_id}").json()
    assert [d["name"] for d in detail["doctors"]] == ["Dr. Sharma"]
    assert detail["rate_card"][0]["profit"] == 22000

    dup = client.post(f"/api/clinics/{clinic_id}/rate-card", json={"treatment_type_id": seed["treatment_type"]["id"]})
    assert dup.status_code == 409

    entry_id = detail["rate_card"][0]["id"]
    updated = client.patch(f"/api/clinics/{clinic_id}/rate-card/{entry_id}", json={"fee_amount": 32000}).json()
    assert updated["profit"] == 24000

    new_doc = client.post("/api/doctors", json={"name": "Dr. Kulkarni"}).json()
    detail = client.post(f"/api/clinics/{clinic_id}/doctors", json={"doctor_id": new_doc["id"]}).json()
    assert len(detail["doctors"]) == 2
    linked = client.get("/api/doctors", params={"clinic_id": clinic_id}).json()
    assert [d["name"] for d in linked] == ["Dr. Kulkarni", "Dr. Sharma"]
    assert client.post(f"/api/clinics/{clinic_id}/doctors", json={"doctor_id": 9999}).status_code == 422
