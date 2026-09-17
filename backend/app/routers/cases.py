from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession, get_owned_or_404, resolve_ref
from app.models import Appointment, Case, Clinic, ClinicDoctor, Doctor, Patient, RateCardEntry, TreatmentType, User
from app.naming import name_key
from app.schemas import CaseIn, CaseList, CaseOut, CaseStatus, CaseUpdate, MoneyTotals

router = APIRouter(prefix="/api/cases", tags=["cases"])

AMOUNT_FIELDS = ("quote_amount", "fee_amount", "material_cost")


def validate_doctor_at_clinic(db: Session, doctor_id: int | None, clinic_id: int) -> None:
    if doctor_id is None:
        return
    if db.get(ClinicDoctor, (clinic_id, doctor_id)) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            {"field": "doctor_id", "message": "This doctor is not linked to the selected clinic. Link them first."},
        )


def rate_for(db: Session, clinic_id: int, treatment_type_id: int | None) -> RateCardEntry | None:
    if treatment_type_id is None:
        return None
    return db.scalar(
        select(RateCardEntry).where(
            RateCardEntry.clinic_id == clinic_id, RateCardEntry.treatment_type_id == treatment_type_id
        )
    )


def _filtered(
    stmt: Select,
    user: User,
    q: str | None,
    clinic_id: int | None,
    city_id: int | None,
    patient_id: int | None,
    treatment_type_id: int | None,
    doctor_id: int | None,
    statuses: list[str] | None,
) -> Select:
    stmt = stmt.where(Case.owner_id == user.id)
    if q and (key := name_key(q)):
        stmt = stmt.where(
            or_(
                Case.patient_id.in_(
                    select(Patient.id).where(Patient.owner_id == user.id, Patient.name_key.contains(key, autoescape=True))
                ),
                Case.clinic_id.in_(
                    select(Clinic.id).where(Clinic.owner_id == user.id, Clinic.name_key.contains(key, autoescape=True))
                ),
            )
        )
    if clinic_id is not None:
        stmt = stmt.where(Case.clinic_id == clinic_id)
    if city_id is not None:
        stmt = stmt.where(Case.clinic_id.in_(select(Clinic.id).where(Clinic.city_id == city_id)))
    if patient_id is not None:
        stmt = stmt.where(Case.patient_id == patient_id)
    if treatment_type_id is not None:
        stmt = stmt.where(Case.treatment_type_id == treatment_type_id)
    if doctor_id is not None:
        stmt = stmt.where(Case.doctor_id == doctor_id)
    if statuses:
        stmt = stmt.where(Case.status.in_(statuses))
    return stmt


@router.get("", response_model=CaseList)
def list_cases(
    db: DbSession,
    user: CurrentUser,
    q: str | None = None,
    clinic_id: int | None = None,
    city_id: int | None = None,
    patient_id: int | None = None,
    treatment_type_id: int | None = None,
    doctor_id: int | None = None,
    status_: Annotated[list[CaseStatus] | None, Query(alias="status")] = None,
    incomplete: bool = False,
    limit: int = 100,
    offset: int = 0,
):
    args = (user, q, clinic_id, city_id, patient_id, treatment_type_id, doctor_id, status_)
    items_stmt = _filtered(select(Case), *args)
    sums_stmt = _filtered(
        select(
            func.count(Case.id),
            func.coalesce(func.sum(Case.quote_amount), 0),
            func.coalesce(func.sum(Case.fee_amount), 0),
            func.coalesce(func.sum(Case.material_cost), 0),
        ),
        *args,
    )
    if incomplete:
        # Logged but not yet priced — the blank rows from the spreadsheet.
        cond = (Case.status != "discontinued") & ((Case.treatment_type_id.is_(None)) | (Case.fee_amount == 0))
        items_stmt, sums_stmt = items_stmt.where(cond), sums_stmt.where(cond)

    count, quote, fee, material = db.execute(sums_stmt).one()
    items = db.scalars(
        items_stmt.order_by(Case.started_on.desc(), Case.id.desc()).limit(min(limit, 500)).offset(offset)
    ).all()
    return CaseList(
        items=items,
        total=count,
        sums=MoneyTotals(count=count, quote_amount=quote, fee_amount=fee, material_cost=material, profit=fee - material),
    )


@router.post("", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
def create_case(body: CaseIn, db: DbSession, user: CurrentUser):
    resolve_ref(db, Patient, body.patient_id, user, "patient_id")
    resolve_ref(db, Clinic, body.clinic_id, user, "clinic_id")
    resolve_ref(db, TreatmentType, body.treatment_type_id, user, "treatment_type_id")
    resolve_ref(db, Doctor, body.doctor_id, user, "doctor_id")
    validate_doctor_at_clinic(db, body.doctor_id, body.clinic_id)

    data = body.model_dump()
    rate = rate_for(db, body.clinic_id, body.treatment_type_id)
    for field in AMOUNT_FIELDS:
        if data[field] is None:
            data[field] = getattr(rate, field) if rate else 0

    case = Case(owner_id=user.id, **data)
    db.add(case)
    db.commit()
    return case


@router.get("/{case_id}", response_model=CaseOut)
def get_case(case_id: int, db: DbSession, user: CurrentUser):
    return get_owned_or_404(db, Case, case_id, user)


@router.patch("/{case_id}", response_model=CaseOut)
def update_case(case_id: int, body: CaseUpdate, db: DbSession, user: CurrentUser):
    case = get_owned_or_404(db, Case, case_id, user)
    data = body.model_dump(exclude_unset=True)

    for field in ("patient_id", "clinic_id", "status", "started_on", *AMOUNT_FIELDS):
        if field in data and data[field] is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, {"field": field, "message": f"{field} cannot be empty"}
            )
    refs = {"patient_id": Patient, "clinic_id": Clinic, "treatment_type_id": TreatmentType, "doctor_id": Doctor}
    for field, model in refs.items():
        if field in data:
            resolve_ref(db, model, data[field], user, field)

    for field, value in data.items():
        setattr(case, field, value)
    validate_doctor_at_clinic(db, case.doctor_id, case.clinic_id)
    db.commit()
    db.refresh(case)
    return case


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case(case_id: int, db: DbSession, user: CurrentUser):
    case = get_owned_or_404(db, Case, case_id, user)
    if db.scalar(select(Appointment.id).where(Appointment.case_id == case.id).limit(1)) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, {"message": "Case has appointments; delete or reassign them first"}
        )
    # Photos and their image bytes go with the case via ON DELETE CASCADE.
    db.delete(case)
    db.commit()
