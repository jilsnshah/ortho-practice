from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.deps import CurrentUser, DbSession, duplicate, get_owned_or_404, resolve_ref
from app.models import Appointment, Case, Clinic, ClinicDoctor, Doctor, User
from app.naming import doctor_key
from app.schemas import DoctorIn, DoctorOut, DoctorUpdate

router = APIRouter(prefix="/api/doctors", tags=["doctors"])


def doctor_out(doctor: Doctor) -> DoctorOut:
    return DoctorOut(
        id=doctor.id,
        name=doctor.name,
        phone=doctor.phone,
        email=doctor.email,
        notes=doctor.notes,
        is_archived=doctor.is_archived,
        clinic_ids=sorted(link.clinic_id for link in doctor.clinic_links),
    )


def _unique_key(db: Session, user: User, name: str, exclude_id: int | None = None) -> str:
    key = doctor_key(name)
    if not key:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"field": "name", "message": "Name is required"})
    stmt = select(Doctor).where(Doctor.owner_id == user.id, Doctor.name_key == key)
    if exclude_id is not None:
        stmt = stmt.where(Doctor.id != exclude_id)
    existing = db.scalar(stmt)
    if existing is not None:
        raise duplicate(f'Doctor "{existing.name}" already exists', existing.id, existing.name)
    return key


def _set_clinics(db: Session, user: User, doctor: Doctor, clinic_ids: list[int]) -> None:
    for cid in set(clinic_ids):
        resolve_ref(db, Clinic, cid, user, "clinic_ids")
    doctor.clinic_links = [ClinicDoctor(clinic_id=cid) for cid in sorted(set(clinic_ids))]


def _load(db: Session, doctor_id: int, user: User) -> Doctor:
    get_owned_or_404(db, Doctor, doctor_id, user)
    return db.scalar(select(Doctor).options(selectinload(Doctor.clinic_links)).where(Doctor.id == doctor_id))


@router.get("", response_model=list[DoctorOut])
def list_doctors(db: DbSession, user: CurrentUser, clinic_id: int | None = None, include_archived: bool = False):
    stmt = select(Doctor).options(selectinload(Doctor.clinic_links)).where(Doctor.owner_id == user.id)
    if clinic_id is not None:
        stmt = stmt.join(ClinicDoctor).where(ClinicDoctor.clinic_id == clinic_id)
    if not include_archived:
        stmt = stmt.where(Doctor.is_archived.is_(False))
    return [doctor_out(d) for d in db.scalars(stmt.order_by(Doctor.name)).all()]


@router.post("", response_model=DoctorOut, status_code=status.HTTP_201_CREATED)
def create_doctor(body: DoctorIn, db: DbSession, user: CurrentUser):
    doctor = Doctor(
        owner_id=user.id,
        name=body.name,
        name_key=_unique_key(db, user, body.name),
        phone=body.phone,
        email=body.email,
        notes=body.notes,
    )
    _set_clinics(db, user, doctor, body.clinic_ids)
    db.add(doctor)
    db.commit()
    return doctor_out(_load(db, doctor.id, user))


@router.get("/{doctor_id}", response_model=DoctorOut)
def get_doctor(doctor_id: int, db: DbSession, user: CurrentUser):
    return doctor_out(_load(db, doctor_id, user))


@router.patch("/{doctor_id}", response_model=DoctorOut)
def update_doctor(doctor_id: int, body: DoctorUpdate, db: DbSession, user: CurrentUser):
    doctor = _load(db, doctor_id, user)
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        doctor.name_key = _unique_key(db, user, data["name"] or "", exclude_id=doctor.id)
        doctor.name = data["name"]
    for field in ("phone", "email", "notes"):
        if field in data:
            setattr(doctor, field, data[field])
    if data.get("is_archived") is not None:
        doctor.is_archived = data["is_archived"]
    if data.get("clinic_ids") is not None:
        _set_clinics(db, user, doctor, data["clinic_ids"])
    db.commit()
    return doctor_out(_load(db, doctor.id, user))


@router.delete("/{doctor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_doctor(doctor_id: int, db: DbSession, user: CurrentUser):
    doctor = _load(db, doctor_id, user)
    in_use = db.scalar(select(Case.id).where(Case.doctor_id == doctor.id).limit(1)) or db.scalar(
        select(Appointment.id).where(Appointment.doctor_id == doctor.id).limit(1)
    )
    if in_use:
        raise HTTPException(
            status.HTTP_409_CONFLICT, {"message": "Doctor is referenced by cases or appointments; archive instead"}
        )
    db.delete(doctor)
    db.commit()
