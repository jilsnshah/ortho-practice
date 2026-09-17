from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from app.deps import CurrentUser, DbSession, get_owned_or_404
from app.models import Appointment, Case, Patient
from app.naming import name_key, phone_key
from app.schemas import PatientIn, PatientOut, PatientUpdate

router = APIRouter(prefix="/api/patients", tags=["patients"])


@router.get("", response_model=list[PatientOut])
def list_patients(db: DbSession, user: CurrentUser, q: str | None = None, limit: int = 50):
    stmt = select(Patient).where(Patient.owner_id == user.id)
    if q:
        conditions = []
        if key := name_key(q):
            conditions.append(Patient.name_key.contains(key, autoescape=True))
        if len(digits := phone_key(q)) >= 4:
            conditions.append(Patient.phone_key.contains(digits, autoescape=True))
        if conditions:
            stmt = stmt.where(or_(*conditions))
    return db.scalars(stmt.order_by(Patient.name).limit(min(limit, 200))).all()


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def create_patient(body: PatientIn, db: DbSession, user: CurrentUser):
    key, pkey = name_key(body.name), phone_key(body.phone)
    if not body.allow_duplicate:
        stmt = select(Patient).where(Patient.owner_id == user.id, Patient.name_key == key)
        if pkey:
            # Same name with a *different* known phone is a different person.
            stmt = stmt.where(or_(Patient.phone_key == pkey, Patient.phone_key == ""))
        matches = db.scalars(stmt.limit(5)).all()
        if matches:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                {
                    "message": f'A patient named "{matches[0].name}" already exists. Use the existing record, '
                    "or confirm this is a different person.",
                    "existing": {"id": matches[0].id, "name": matches[0].name},
                    "candidates": [PatientOut.model_validate(m).model_dump() for m in matches],
                    "confirmable": True,
                },
            )
    patient = Patient(owner_id=user.id, name=body.name, name_key=key, phone=body.phone, phone_key=pkey, notes=body.notes)
    db.add(patient)
    db.commit()
    return patient


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: int, db: DbSession, user: CurrentUser):
    return get_owned_or_404(db, Patient, patient_id, user)


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient(patient_id: int, body: PatientUpdate, db: DbSession, user: CurrentUser):
    patient = get_owned_or_404(db, Patient, patient_id, user)
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        if not data["name"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"field": "name", "message": "Name is required"})
        patient.name, patient.name_key = data["name"], name_key(data["name"])
    if "phone" in data:
        patient.phone, patient.phone_key = data["phone"], phone_key(data["phone"])
    if "notes" in data:
        patient.notes = data["notes"]
    db.commit()
    return patient


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(patient_id: int, db: DbSession, user: CurrentUser):
    patient = get_owned_or_404(db, Patient, patient_id, user)
    in_use = db.scalar(select(Case.id).where(Case.patient_id == patient.id).limit(1)) or db.scalar(
        select(Appointment.id).where(Appointment.patient_id == patient.id).limit(1)
    )
    if in_use:
        raise HTTPException(status.HTTP_409_CONFLICT, {"message": "Patient has cases or appointments"})
    db.delete(patient)
    db.commit()
