from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.deps import CurrentUser, DbSession, duplicate, get_owned_or_404, resolve_ref
from app.models import Appointment, Case, City, Clinic, ClinicDoctor, Doctor, RateCardEntry, TreatmentType, User
from app.naming import name_key
from app.schemas import (
    ClinicDetail,
    ClinicIn,
    ClinicOut,
    ClinicUpdate,
    DoctorLinkIn,
    RateCardEntryIn,
    RateCardEntryOut,
    RateCardEntryUpdate,
    Ref,
)

router = APIRouter(prefix="/api/clinics", tags=["clinics"])


def _check_unique(db: Session, user: User, city_id: int, name: str, branch: str | None, exclude_id: int | None = None):
    key, bkey = name_key(name), name_key(branch)
    if not key:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"field": "name", "message": "Name is required"})
    stmt = select(Clinic).where(
        Clinic.owner_id == user.id, Clinic.city_id == city_id, Clinic.name_key == key, Clinic.branch_key == bkey
    )
    if exclude_id is not None:
        stmt = stmt.where(Clinic.id != exclude_id)
    existing = db.scalar(stmt)
    if existing is not None:
        label = existing.name + (f" – {existing.branch}" if existing.branch else "")
        raise duplicate(f'Clinic "{label}" already exists in {existing.city.name}', existing.id, label)
    return key, bkey


def _detail(db: Session, clinic_id: int, user: User) -> ClinicDetail:
    get_owned_or_404(db, Clinic, clinic_id, user)
    clinic = db.scalar(
        select(Clinic)
        .options(
            selectinload(Clinic.doctor_links).joinedload(ClinicDoctor.doctor),
            selectinload(Clinic.rate_card).joinedload(RateCardEntry.treatment_type),
        )
        .where(Clinic.id == clinic_id)
    )
    base = ClinicOut.model_validate(clinic).model_dump()
    return ClinicDetail(
        **base,
        doctors=sorted((Ref.model_validate(link.doctor) for link in clinic.doctor_links), key=lambda d: d.name),
        rate_card=sorted((_entry_out(e) for e in clinic.rate_card), key=lambda e: e.treatment_type.name),
    )


@router.get("", response_model=list[ClinicOut])
def list_clinics(db: DbSession, user: CurrentUser, city_id: int | None = None, include_archived: bool = False):
    stmt = select(Clinic).join(City).where(Clinic.owner_id == user.id)
    if city_id is not None:
        stmt = stmt.where(Clinic.city_id == city_id)
    if not include_archived:
        stmt = stmt.where(Clinic.is_archived.is_(False))
    return db.scalars(stmt.order_by(City.name, Clinic.name, Clinic.branch)).all()


@router.post("", response_model=ClinicDetail, status_code=status.HTTP_201_CREATED)
def create_clinic(body: ClinicIn, db: DbSession, user: CurrentUser):
    resolve_ref(db, City, body.city_id, user, "city_id")
    key, bkey = _check_unique(db, user, body.city_id, body.name, body.branch)
    clinic = Clinic(
        owner_id=user.id,
        city_id=body.city_id,
        name=body.name,
        name_key=key,
        branch=body.branch,
        branch_key=bkey,
        address=body.address,
        phone=body.phone,
        notes=body.notes,
    )
    db.add(clinic)
    db.commit()
    return _detail(db, clinic.id, user)


@router.get("/{clinic_id}", response_model=ClinicDetail)
def get_clinic(clinic_id: int, db: DbSession, user: CurrentUser):
    return _detail(db, clinic_id, user)


@router.patch("/{clinic_id}", response_model=ClinicDetail)
def update_clinic(clinic_id: int, body: ClinicUpdate, db: DbSession, user: CurrentUser):
    clinic = get_owned_or_404(db, Clinic, clinic_id, user)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and not data["name"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"field": "name", "message": "Name is required"})
    if data.get("city_id") is not None:
        resolve_ref(db, City, data["city_id"], user, "city_id")
    city_id = data.get("city_id") or clinic.city_id
    name = data.get("name", clinic.name)
    branch = data["branch"] if "branch" in data else clinic.branch
    clinic.name_key, clinic.branch_key = _check_unique(db, user, city_id, name, branch, exclude_id=clinic.id)
    clinic.city_id, clinic.name, clinic.branch = city_id, name, branch
    for field in ("address", "phone", "notes"):
        if field in data:
            setattr(clinic, field, data[field])
    if data.get("is_archived") is not None:
        clinic.is_archived = data["is_archived"]
    db.commit()
    db.expire(clinic)
    return _detail(db, clinic.id, user)


@router.delete("/{clinic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_clinic(clinic_id: int, db: DbSession, user: CurrentUser):
    clinic = get_owned_or_404(db, Clinic, clinic_id, user)
    in_use = db.scalar(select(Case.id).where(Case.clinic_id == clinic.id).limit(1)) or db.scalar(
        select(Appointment.id).where(Appointment.clinic_id == clinic.id).limit(1)
    )
    if in_use:
        raise HTTPException(
            status.HTTP_409_CONFLICT, {"message": "Clinic has cases or appointments; archive it instead"}
        )
    db.delete(clinic)
    db.commit()


# ---- doctor links --------------------------------------------------------


@router.post("/{clinic_id}/doctors", response_model=ClinicDetail)
def link_doctor(clinic_id: int, body: DoctorLinkIn, db: DbSession, user: CurrentUser):
    get_owned_or_404(db, Clinic, clinic_id, user)
    resolve_ref(db, Doctor, body.doctor_id, user, "doctor_id")
    if db.get(ClinicDoctor, (clinic_id, body.doctor_id)) is None:
        db.add(ClinicDoctor(clinic_id=clinic_id, doctor_id=body.doctor_id))
        db.commit()
    return _detail(db, clinic_id, user)


@router.delete("/{clinic_id}/doctors/{doctor_id}", response_model=ClinicDetail)
def unlink_doctor(clinic_id: int, doctor_id: int, db: DbSession, user: CurrentUser):
    get_owned_or_404(db, Clinic, clinic_id, user)
    link = db.get(ClinicDoctor, (clinic_id, doctor_id))
    if link is not None:
        db.delete(link)
        db.commit()
    return _detail(db, clinic_id, user)


# ---- rate card -----------------------------------------------------------


def _entry_out(entry: RateCardEntry) -> RateCardEntryOut:
    return RateCardEntryOut(
        id=entry.id,
        clinic_id=entry.clinic_id,
        treatment_type=Ref.model_validate(entry.treatment_type),
        quote_amount=entry.quote_amount,
        fee_amount=entry.fee_amount,
        material_cost=entry.material_cost,
        profit=entry.fee_amount - entry.material_cost,
    )


def _owned_entry(db: Session, clinic_id: int, entry_id: int, user: User) -> RateCardEntry:
    get_owned_or_404(db, Clinic, clinic_id, user)
    entry = db.get(RateCardEntry, entry_id)
    if entry is None or entry.clinic_id != clinic_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rate card entry not found")
    return entry


@router.get("/{clinic_id}/rate-card/by-treatment/{treatment_type_id}", response_model=RateCardEntryOut | None)
def lookup_rate(clinic_id: int, treatment_type_id: int, db: DbSession, user: CurrentUser):
    """Default amounts for a new case; null when this clinic has no rate for the treatment."""
    get_owned_or_404(db, Clinic, clinic_id, user)
    entry = db.scalar(
        select(RateCardEntry).where(
            RateCardEntry.clinic_id == clinic_id, RateCardEntry.treatment_type_id == treatment_type_id
        )
    )
    return _entry_out(entry) if entry else None


@router.post("/{clinic_id}/rate-card", response_model=RateCardEntryOut, status_code=status.HTTP_201_CREATED)
def add_rate(clinic_id: int, body: RateCardEntryIn, db: DbSession, user: CurrentUser):
    get_owned_or_404(db, Clinic, clinic_id, user)
    tt = resolve_ref(db, TreatmentType, body.treatment_type_id, user, "treatment_type_id")
    existing = db.scalar(
        select(RateCardEntry).where(RateCardEntry.clinic_id == clinic_id, RateCardEntry.treatment_type_id == tt.id)
    )
    if existing is not None:
        raise duplicate(f'This clinic already has a rate for "{tt.name}"', existing.id, tt.name)
    entry = RateCardEntry(clinic_id=clinic_id, **body.model_dump())
    db.add(entry)
    db.commit()
    return _entry_out(entry)


@router.patch("/{clinic_id}/rate-card/{entry_id}", response_model=RateCardEntryOut)
def update_rate(clinic_id: int, entry_id: int, body: RateCardEntryUpdate, db: DbSession, user: CurrentUser):
    entry = _owned_entry(db, clinic_id, entry_id, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(entry, field, value)
    db.commit()
    return _entry_out(entry)


@router.delete("/{clinic_id}/rate-card/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rate(clinic_id: int, entry_id: int, db: DbSession, user: CurrentUser):
    db.delete(_owned_entry(db, clinic_id, entry_id, user))
    db.commit()
