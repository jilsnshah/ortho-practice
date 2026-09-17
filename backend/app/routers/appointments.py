from datetime import date, datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession, get_owned_or_404, resolve_ref
from app.models import Appointment, Case, Clinic, Doctor, Patient, User
from app.routers.cases import validate_doctor_at_clinic
from app.schemas import AppointmentIn, AppointmentOut, AppointmentStatus, AppointmentUpdate

router = APIRouter(prefix="/api/appointments", tags=["appointments"])


def _unprocessable(field: str, message: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"field": field, "message": message})


def _validate(db: Session, user: User, appt: Appointment) -> None:
    resolve_ref(db, Clinic, appt.clinic_id, user, "clinic_id")
    resolve_ref(db, Patient, appt.patient_id, user, "patient_id")
    resolve_ref(db, Doctor, appt.doctor_id, user, "doctor_id")
    case = resolve_ref(db, Case, appt.case_id, user, "case_id")
    if case is not None:
        if case.clinic_id != appt.clinic_id:
            raise _unprocessable("case_id", "This case belongs to a different clinic")
        if appt.patient_id is not None and appt.patient_id != case.patient_id:
            raise _unprocessable("patient_id", "Patient does not match the selected case")
        appt.patient_id = case.patient_id
    validate_doctor_at_clinic(db, appt.doctor_id, appt.clinic_id)


@router.get("", response_model=list[AppointmentOut])
def list_appointments(
    db: DbSession,
    user: CurrentUser,
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to", description="Inclusive"),
    clinic_id: int | None = None,
    case_id: int | None = None,
    patient_id: int | None = None,
    status_: Annotated[list[AppointmentStatus] | None, Query(alias="status")] = None,
    limit: int = 500,
):
    stmt = select(Appointment).where(Appointment.owner_id == user.id)
    if date_from is not None:
        stmt = stmt.where(Appointment.starts_at >= datetime.combine(date_from, time.min))
    if date_to is not None:
        stmt = stmt.where(Appointment.starts_at < datetime.combine(date_to + timedelta(days=1), time.min))
    if clinic_id is not None:
        stmt = stmt.where(Appointment.clinic_id == clinic_id)
    if case_id is not None:
        stmt = stmt.where(Appointment.case_id == case_id)
    if patient_id is not None:
        stmt = stmt.where(Appointment.patient_id == patient_id)
    if status_:
        stmt = stmt.where(Appointment.status.in_(status_))
    return db.scalars(stmt.order_by(Appointment.starts_at).limit(min(limit, 1000))).all()


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
def create_appointment(body: AppointmentIn, db: DbSession, user: CurrentUser):
    data = body.model_dump()
    data["starts_at"] = data["starts_at"].replace(tzinfo=None, second=0, microsecond=0)
    appt = Appointment(owner_id=user.id, **data)
    _validate(db, user, appt)
    db.add(appt)
    db.commit()
    return appt


@router.get("/{appt_id}", response_model=AppointmentOut)
def get_appointment(appt_id: int, db: DbSession, user: CurrentUser):
    return get_owned_or_404(db, Appointment, appt_id, user)


@router.patch("/{appt_id}", response_model=AppointmentOut)
def update_appointment(appt_id: int, body: AppointmentUpdate, db: DbSession, user: CurrentUser):
    appt = get_owned_or_404(db, Appointment, appt_id, user)
    data = body.model_dump(exclude_unset=True)
    for field in ("clinic_id", "starts_at", "duration_minutes", "status"):
        if field in data and data[field] is None:
            raise _unprocessable(field, f"{field} cannot be empty")
    if data.get("starts_at") is not None:
        data["starts_at"] = data["starts_at"].replace(tzinfo=None, second=0, microsecond=0)
    # Detaching from a case also clears the patient it implied, unless one is given.
    if "case_id" in data and data["case_id"] is None and "patient_id" not in data and appt.case_id is not None:
        data["patient_id"] = None
    with db.no_autoflush:
        for field, value in data.items():
            setattr(appt, field, value)
        _validate(db, user, appt)
    db.commit()
    db.refresh(appt)
    return appt


@router.delete("/{appt_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(appt_id: int, db: DbSession, user: CurrentUser):
    db.delete(get_owned_or_404(db, Appointment, appt_id, user))
    db.commit()
