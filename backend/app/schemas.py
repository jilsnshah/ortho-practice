from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.naming import clean_display

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
OptText = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=5000)]
Amount = Annotated[int, Field(ge=0, le=100_000_000)]
CaseStatus = Literal["consultation", "active", "completed", "discontinued"]
AppointmentStatus = Literal["scheduled", "completed", "cancelled", "no_show"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _blank_to_none(value):
    if isinstance(value, str) and not value.strip():
        return None
    return value


class _CleanName(BaseModel):
    @field_validator("name", check_fields=False)
    @classmethod
    def clean_name(cls, v):
        return clean_display(v) if isinstance(v, str) else v


# ---- auth ----------------------------------------------------------------


class LoginIn(BaseModel):
    email: str
    password: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: Annotated[str, StringConstraints(min_length=10, max_length=200)]


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: str


# ---- shared refs ---------------------------------------------------------


class Ref(ORM):
    id: int
    name: str


class ClinicRef(ORM):
    id: int
    name: str
    branch: str | None
    city: Ref


# ---- cities --------------------------------------------------------------


class CityIn(_CleanName):
    name: Name


class CityOut(ORM):
    id: int
    name: str


# ---- treatment types -----------------------------------------------------


class TreatmentTypeIn(_CleanName):
    name: Name


class TreatmentTypeUpdate(_CleanName):
    name: Name | None = None
    is_archived: bool | None = None


class TreatmentTypeOut(ORM):
    id: int
    name: str
    is_archived: bool


# ---- doctors -------------------------------------------------------------


class DoctorIn(_CleanName):
    name: Name
    phone: OptText = None
    email: OptText = None
    notes: OptText = None
    # Existing clinics to link to; every id must already exist.
    clinic_ids: list[int] = []

    blank_to_none = field_validator("phone", "email", "notes", mode="before")(_blank_to_none)


class DoctorUpdate(_CleanName):
    name: Name | None = None
    phone: OptText = None
    email: OptText = None
    notes: OptText = None
    is_archived: bool | None = None
    clinic_ids: list[int] | None = None

    blank_to_none = field_validator("phone", "email", "notes", mode="before")(_blank_to_none)


class DoctorOut(ORM):
    id: int
    name: str
    phone: str | None
    email: str | None
    notes: str | None
    is_archived: bool
    clinic_ids: list[int]


# ---- clinics & rate cards -----------------------------------------------


class ClinicIn(_CleanName):
    name: Name
    branch: OptText = None
    city_id: int
    address: OptText = None
    phone: OptText = None
    notes: OptText = None

    blank_to_none = field_validator("branch", "address", "phone", "notes", mode="before")(_blank_to_none)


class ClinicUpdate(_CleanName):
    name: Name | None = None
    branch: OptText = None
    city_id: int | None = None
    address: OptText = None
    phone: OptText = None
    notes: OptText = None
    is_archived: bool | None = None

    blank_to_none = field_validator("branch", "address", "phone", "notes", mode="before")(_blank_to_none)


class ClinicOut(ORM):
    id: int
    name: str
    branch: str | None
    city: CityOut
    address: str | None
    phone: str | None
    notes: str | None
    is_archived: bool


class RateCardEntryIn(BaseModel):
    treatment_type_id: int
    quote_amount: Amount = 0
    fee_amount: Amount = 0
    material_cost: Amount = 0


class RateCardEntryUpdate(BaseModel):
    quote_amount: Amount | None = None
    fee_amount: Amount | None = None
    material_cost: Amount | None = None


class RateCardEntryOut(ORM):
    id: int
    clinic_id: int
    treatment_type: Ref
    quote_amount: int
    fee_amount: int
    material_cost: int
    profit: int


class ClinicDetail(ClinicOut):
    doctors: list[Ref]
    rate_card: list[RateCardEntryOut]


class DoctorLinkIn(BaseModel):
    doctor_id: int


# ---- patients ------------------------------------------------------------


class PatientIn(_CleanName):
    name: Name
    phone: OptText = None
    notes: OptText = None
    # Set after the user has seen the likely-duplicate warning and confirmed.
    allow_duplicate: bool = False

    blank_to_none = field_validator("phone", "notes", mode="before")(_blank_to_none)


class PatientUpdate(_CleanName):
    name: Name | None = None
    phone: OptText = None
    notes: OptText = None

    blank_to_none = field_validator("phone", "notes", mode="before")(_blank_to_none)


class PatientOut(ORM):
    id: int
    name: str
    phone: str | None
    notes: str | None


# ---- cases ---------------------------------------------------------------


class CaseIn(BaseModel):
    patient_id: int
    clinic_id: int
    treatment_type_id: int | None = None
    doctor_id: int | None = None
    status: CaseStatus = "active"
    started_on: date
    # Omitted amounts are filled from the clinic's rate card for this treatment.
    quote_amount: Amount | None = None
    fee_amount: Amount | None = None
    material_cost: Amount | None = None
    notes: OptText = None

    blank_to_none = field_validator("notes", mode="before")(_blank_to_none)


class CaseUpdate(BaseModel):
    patient_id: int | None = None
    clinic_id: int | None = None
    treatment_type_id: int | None = None
    doctor_id: int | None = None
    status: CaseStatus | None = None
    started_on: date | None = None
    quote_amount: Amount | None = None
    fee_amount: Amount | None = None
    material_cost: Amount | None = None
    notes: OptText = None

    blank_to_none = field_validator("notes", mode="before")(_blank_to_none)


class CaseOut(ORM):
    id: int
    patient: Ref
    clinic: ClinicRef
    treatment_type: Ref | None
    doctor: Ref | None
    status: str
    started_on: date
    quote_amount: int
    fee_amount: int
    material_cost: int
    profit: int
    notes: str | None
    created_at: datetime
    updated_at: datetime


class MoneyTotals(BaseModel):
    count: int = 0
    quote_amount: int = 0
    fee_amount: int = 0
    material_cost: int = 0
    profit: int = 0


class CaseList(BaseModel):
    items: list[CaseOut]
    total: int
    sums: MoneyTotals


# ---- appointments --------------------------------------------------------


class AppointmentIn(BaseModel):
    clinic_id: int
    case_id: int | None = None
    patient_id: int | None = None
    doctor_id: int | None = None
    starts_at: datetime
    duration_minutes: Annotated[int, Field(gt=0, le=24 * 60)] = 30
    status: AppointmentStatus = "scheduled"
    notes: OptText = None

    blank_to_none = field_validator("notes", mode="before")(_blank_to_none)


class AppointmentUpdate(BaseModel):
    clinic_id: int | None = None
    case_id: int | None = None
    patient_id: int | None = None
    doctor_id: int | None = None
    starts_at: datetime | None = None
    duration_minutes: Annotated[int, Field(gt=0, le=24 * 60)] | None = None
    status: AppointmentStatus | None = None
    notes: OptText = None

    blank_to_none = field_validator("notes", mode="before")(_blank_to_none)


class CaseBrief(ORM):
    id: int
    status: str
    treatment_type: Ref | None


class AppointmentOut(ORM):
    id: int
    clinic: ClinicRef
    case: CaseBrief | None
    patient: Ref | None
    doctor: Ref | None
    starts_at: datetime
    duration_minutes: int
    status: str
    notes: str | None


# ---- photos --------------------------------------------------------------


class PhotoUpdate(BaseModel):
    taken_on: date | None = None
    stage_label: OptText = None
    caption: OptText = None

    blank_to_none = field_validator("stage_label", "caption", mode="before")(_blank_to_none)


class PhotoOut(BaseModel):
    id: int
    case_id: int
    taken_on: date
    stage_label: str | None
    caption: str | None
    width: int
    height: int
    url: str
    thumb_url: str


# ---- dashboard -----------------------------------------------------------


class GroupTotals(MoneyTotals):
    key: str
    label: str
    id: int | None = None


class Dashboard(BaseModel):
    totals: MoneyTotals
    by_clinic: list[GroupTotals]
    by_city: list[GroupTotals]
    by_treatment_type: list[GroupTotals]
    by_month: list[GroupTotals]
    incomplete_case_count: int
    appointments_today: int
