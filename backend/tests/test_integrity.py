"""The data-model rules: first-class records, FK references only, no silent duplicates."""

from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.db import SessionLocal
from app.models import Case, Clinic, Doctor, User
from app.naming import doctor_key, name_key, phone_key


def test_name_keys_normalize_spelling_variants():
    assert doctor_key("Dr. Sharma") == doctor_key("Dr Sharma") == doctor_key("sharma") == doctor_key(" DR.  SHARMA ")
    assert name_key("Avdhoot  Clinic") == name_key("avdhoot clinic.")
    assert phone_key("+91 98220-12345") == phone_key("098220 12345")


@pytest.mark.parametrize("variant", ["Dr Sharma", "sharma", "DR. SHARMA", "Doctor Sharma"])
def test_duplicate_doctor_rejected_with_existing_record(client, seed, variant):
    res = client.post("/api/doctors", json={"name": variant})
    assert res.status_code == 409
    assert res.json()["detail"]["existing"]["id"] == seed["doctor"]["id"]


def test_duplicate_clinic_same_city_and_branch_rejected(client, seed):
    res = client.post(
        "/api/clinics", json={"name": "avdhoot clinic", "branch": "KOTHRUD", "city_id": seed["city"]["id"]}
    )
    assert res.status_code == 409
    assert res.json()["detail"]["existing"]["id"] == seed["clinic"]["id"]


def test_same_clinic_name_other_branch_is_a_different_clinic(client, seed):
    res = client.post("/api/clinics", json={"name": "Avdhoot Clinic", "branch": "Baner", "city_id": seed["city"]["id"]})
    assert res.status_code == 201


def test_duplicate_city_and_treatment_type_rejected(client, seed):
    assert client.post("/api/cities", json={"name": " pune "}).status_code == 409
    assert client.post("/api/treatment-types", json={"name": "metal  braces"}).status_code == 409


def test_rename_into_existing_name_rejected(client, seed):
    other = client.post("/api/doctors", json={"name": "Dr. Kulkarni"}).json()
    res = client.patch(f"/api/doctors/{other['id']}", json={"name": "Dr Sharma"})
    assert res.status_code == 409


def test_case_cannot_reference_missing_records(client, seed):
    body = {"patient_id": seed["patient"]["id"], "clinic_id": 9999, "started_on": "2026-09-01"}
    res = client.post("/api/cases", json=body)
    assert res.status_code == 422
    assert res.json()["detail"]["field"] == "clinic_id"


def test_clinic_requires_existing_city(client):
    res = client.post("/api/clinics", json={"name": "Nowhere Dental", "city_id": 12345})
    assert res.status_code == 422


def test_names_are_not_accepted_in_place_of_ids(client, seed):
    body = {"patient_id": seed["patient"]["id"], "clinic_id": "Avdhoot Clinic", "started_on": "2026-09-01"}
    assert client.post("/api/cases", json=body).status_code == 422


def test_database_enforces_foreign_keys_directly():
    with SessionLocal() as db:
        user = User(email="fk@example.com", full_name="fk", password_hash="x")
        db.add(user)
        db.commit()
        db.add(Case(owner_id=user.id, patient_id=424242, clinic_id=434343, started_on=date(2026, 1, 1)))
        with pytest.raises(IntegrityError):
            db.commit()


def test_database_enforces_unique_keys_directly():
    with SessionLocal() as db:
        user = User(email="uq@example.com", full_name="uq", password_hash="x")
        db.add(user)
        db.commit()
        db.add_all([Doctor(owner_id=user.id, name="Dr. Rao", name_key="rao"), Doctor(owner_id=user.id, name="Rao", name_key="rao")])
        with pytest.raises(IntegrityError):
            db.commit()


def test_database_blocks_deleting_referenced_clinic(client, seed):
    client.post(
        "/api/cases", json={"patient_id": seed["patient"]["id"], "clinic_id": seed["clinic"]["id"], "started_on": "2026-09-01"}
    )
    with SessionLocal() as db:
        db.delete(db.get(Clinic, seed["clinic"]["id"]))
        with pytest.raises(IntegrityError):
            db.commit()
    assert client.delete(f"/api/clinics/{seed['clinic']['id']}").status_code == 409


def test_doctor_must_be_linked_to_case_clinic(client, seed):
    stranger = client.post("/api/doctors", json={"name": "Dr. Joshi"}).json()
    body = {
        "patient_id": seed["patient"]["id"],
        "clinic_id": seed["clinic"]["id"],
        "doctor_id": stranger["id"],
        "started_on": "2026-09-01",
    }
    res = client.post("/api/cases", json=body)
    assert res.status_code == 422
    assert res.json()["detail"]["field"] == "doctor_id"


def test_likely_duplicate_patient_needs_confirmation(client, seed):
    res = client.post("/api/patients", json={"name": "asha  patil"})
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["confirmable"] and detail["existing"]["id"] == seed["patient"]["id"]

    # A different known phone number means a different person.
    assert client.post("/api/patients", json={"name": "Asha Patil", "phone": "90000 00000"}).status_code == 201
    assert client.post("/api/patients", json={"name": "Asha Patil", "allow_duplicate": True}).status_code == 201


def test_other_owners_records_are_invisible_and_unreferenceable(client, other_client, seed):
    assert other_client.get(f"/api/clinics/{seed['clinic']['id']}").status_code == 404
    assert other_client.get("/api/doctors").json() == []
    city = other_client.post("/api/cities", json={"name": "Pune"})
    assert city.status_code == 201  # namespaces are per orthodontist
    patient = other_client.post("/api/patients", json={"name": "Someone"}).json()
    res = other_client.post(
        "/api/cases", json={"patient_id": patient["id"], "clinic_id": seed["clinic"]["id"], "started_on": "2026-09-01"}
    )
    assert res.status_code == 422


def test_requires_login():
    from fastapi.testclient import TestClient

    from app.main import app

    assert TestClient(app).get("/api/cases").status_code == 401
