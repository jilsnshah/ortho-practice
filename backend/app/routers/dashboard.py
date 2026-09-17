from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import Appointment, Case, City, Clinic, TreatmentType
from app.schemas import CaseStatus, Dashboard, GroupTotals, MoneyTotals

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_SUMS = (
    func.count(Case.id),
    func.coalesce(func.sum(Case.quote_amount), 0),
    func.coalesce(func.sum(Case.fee_amount), 0),
    func.coalesce(func.sum(Case.material_cost), 0),
)


def _group(key: str, label: str, row_id: int | None, count: int, quote: int, fee: int, material: int) -> GroupTotals:
    return GroupTotals(
        key=key,
        label=label,
        id=row_id,
        count=count,
        quote_amount=quote,
        fee_amount=fee,
        material_cost=material,
        profit=fee - material,
    )


@router.get("", response_model=Dashboard)
def dashboard(
    db: DbSession,
    user: CurrentUser,
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to", description="Inclusive"),
    status_: Annotated[list[CaseStatus] | None, Query(alias="status")] = None,
    today: date | None = Query(None, description="Client's local date, for the appointments-today count"),
):
    conditions = [Case.owner_id == user.id]
    if date_from is not None:
        conditions.append(Case.started_on >= date_from)
    if date_to is not None:
        conditions.append(Case.started_on <= date_to)
    if status_:
        conditions.append(Case.status.in_(status_))

    count, quote, fee, material = db.execute(select(*_SUMS).where(*conditions)).one()
    totals = MoneyTotals(count=count, quote_amount=quote, fee_amount=fee, material_cost=material, profit=fee - material)

    by_clinic = [
        _group(f"clinic:{cid}", name + (f" – {branch}" if branch else "") + f" ({city})", cid, *sums)
        for cid, name, branch, city, *sums in db.execute(
            select(Clinic.id, Clinic.name, Clinic.branch, City.name, *_SUMS)
            .select_from(Case)
            .join(Clinic, Case.clinic_id == Clinic.id)
            .join(City, Clinic.city_id == City.id)
            .where(*conditions)
            .group_by(Clinic.id, Clinic.name, Clinic.branch, City.name)
        )
    ]
    by_city = [
        _group(f"city:{cid}", name, cid, *sums)
        for cid, name, *sums in db.execute(
            select(City.id, City.name, *_SUMS)
            .select_from(Case)
            .join(Clinic, Case.clinic_id == Clinic.id)
            .join(City, Clinic.city_id == City.id)
            .where(*conditions)
            .group_by(City.id, City.name)
        )
    ]
    by_treatment_type = [
        _group(f"treatment:{tid or 'none'}", name or "Not set", tid, *sums)
        for tid, name, *sums in db.execute(
            select(TreatmentType.id, TreatmentType.name, *_SUMS)
            .select_from(Case)
            .outerjoin(TreatmentType, Case.treatment_type_id == TreatmentType.id)
            .where(*conditions)
            .group_by(TreatmentType.id, TreatmentType.name)
        )
    ]

    # Month bucketing in Python keeps this portable across SQLite and Postgres.
    months: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    for started_on, *sums in db.execute(
        select(Case.started_on, *_SUMS).where(*conditions).group_by(Case.started_on)
    ):
        bucket = months[started_on.strftime("%Y-%m")]
        for i, value in enumerate(sums):
            bucket[i] += value
    by_month = [
        _group(f"month:{m}", datetime.strptime(m, "%Y-%m").strftime("%b %Y"), None, *v)
        for m, v in sorted(months.items())
    ]

    for groups in (by_clinic, by_city, by_treatment_type):
        groups.sort(key=lambda g: g.profit, reverse=True)

    incomplete = db.scalar(
        select(func.count(Case.id)).where(
            Case.owner_id == user.id,
            Case.status != "discontinued",
            (Case.treatment_type_id.is_(None)) | (Case.fee_amount == 0),
        )
    )
    day = today or date.today()
    appointments_today = db.scalar(
        select(func.count(Appointment.id)).where(
            Appointment.owner_id == user.id,
            Appointment.status == "scheduled",
            Appointment.starts_at >= datetime.combine(day, time.min),
            Appointment.starts_at < datetime.combine(day + timedelta(days=1), time.min),
        )
    )

    return Dashboard(
        totals=totals,
        by_clinic=by_clinic,
        by_city=by_city,
        by_treatment_type=by_treatment_type,
        by_month=by_month,
        incomplete_case_count=incomplete,
        appointments_today=appointments_today,
    )
