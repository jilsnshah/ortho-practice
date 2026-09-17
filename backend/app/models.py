"""Schema.

Every real-world thing (city, clinic, doctor, treatment type, patient, case) is a
row in its own table with an integer id. Relationships are foreign keys to that
id — never a copied name. Master tables carry a normalized ``*_key`` column with
a unique constraint so the same doctor/clinic cannot be inserted twice under a
slightly different spelling.

Money is stored as whole currency units (integers) to avoid float drift.
Profit is never stored: it is always ``fee_amount - material_cost``.
"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

CASE_STATUSES = ("consultation", "active", "completed", "discontinued")
APPOINTMENT_STATUSES = ("scheduled", "completed", "cancelled", "no_show")
USER_ROLES = ("orthodontist",)  # Stage 2 adds "clinic".


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(_in("role", USER_ROLES), name="role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="orthodontist")


class City(TimestampMixin, Base):
    __tablename__ = "cities"
    __table_args__ = (UniqueConstraint("owner_id", "name_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    name_key: Mapped[str] = mapped_column(String(120), nullable=False)


class Clinic(TimestampMixin, Base):
    __tablename__ = "clinics"
    # Branch is part of identity: "Smile Dental – Kothrud" and "Smile Dental – Baner" are different clinics.
    __table_args__ = (UniqueConstraint("owner_id", "city_id", "name_key", "branch_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id", ondelete="RESTRICT"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    name_key: Mapped[str] = mapped_column(String(200), nullable=False)
    branch: Mapped[str | None] = mapped_column(String(200))
    # '' rather than NULL so the unique constraint applies when there is no branch.
    branch_key: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    address: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(40))
    notes: Mapped[str | None] = mapped_column(Text)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    city: Mapped[City] = relationship(lazy="joined")
    doctor_links: Mapped[list["ClinicDoctor"]] = relationship(
        back_populates="clinic", cascade="all, delete-orphan", passive_deletes=True
    )
    rate_card: Mapped[list["RateCardEntry"]] = relationship(
        back_populates="clinic", cascade="all, delete-orphan", passive_deletes=True
    )


class Doctor(TimestampMixin, Base):
    """A clinic-side doctor the orthodontist works with."""

    __tablename__ = "doctors"
    __table_args__ = (UniqueConstraint("owner_id", "name_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    name_key: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    clinic_links: Mapped[list["ClinicDoctor"]] = relationship(
        back_populates="doctor", cascade="all, delete-orphan", passive_deletes=True
    )


class ClinicDoctor(Base):
    """A doctor can practise at several clinics; a clinic has several doctors."""

    __tablename__ = "clinic_doctors"

    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"), primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id", ondelete="CASCADE"), primary_key=True)

    clinic: Mapped[Clinic] = relationship(back_populates="doctor_links")
    doctor: Mapped[Doctor] = relationship(back_populates="clinic_links")


class TreatmentType(TimestampMixin, Base):
    __tablename__ = "treatment_types"
    __table_args__ = (UniqueConstraint("owner_id", "name_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    name_key: Mapped[str] = mapped_column(String(200), nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class RateCardEntry(TimestampMixin, Base):
    """Per-clinic default pricing for one treatment type."""

    __tablename__ = "rate_card_entries"
    __table_args__ = (
        UniqueConstraint("clinic_id", "treatment_type_id"),
        CheckConstraint("quote_amount >= 0 AND fee_amount >= 0 AND material_cost >= 0", name="non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False, index=True)
    treatment_type_id: Mapped[int] = mapped_column(
        ForeignKey("treatment_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    quote_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fee_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    material_cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    clinic: Mapped[Clinic] = relationship(back_populates="rate_card")
    treatment_type: Mapped[TreatmentType] = relationship(lazy="joined")


class Patient(TimestampMixin, Base):
    """Patients are not hard-unique by name (two real people can share one);
    creation checks for likely duplicates and requires explicit confirmation."""

    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    name_key: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    phone_key: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    notes: Mapped[str | None] = mapped_column(Text)


class Case(TimestampMixin, Base):
    __tablename__ = "cases"
    __table_args__ = (
        CheckConstraint(_in("status", CASE_STATUSES), name="status"),
        CheckConstraint("quote_amount >= 0 AND fee_amount >= 0 AND material_cost >= 0", name="non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False, index=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=False, index=True)
    # Nullable: a consultation can be logged before the treatment plan is decided.
    treatment_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("treatment_types.id", ondelete="RESTRICT"), index=True
    )
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey("doctors.id", ondelete="RESTRICT"), index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    started_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    quote_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fee_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    material_cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text)

    patient: Mapped[Patient] = relationship(lazy="joined")
    clinic: Mapped[Clinic] = relationship(lazy="joined")
    treatment_type: Mapped[TreatmentType | None] = relationship(lazy="joined")
    doctor: Mapped[Doctor | None] = relationship(lazy="joined")

    @property
    def profit(self) -> int:
        return self.fee_amount - self.material_cost


class Appointment(TimestampMixin, Base):
    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint(_in("status", APPOINTMENT_STATUSES), name="status"),
        CheckConstraint("duration_minutes > 0", name="duration_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinics.id", ondelete="RESTRICT"), nullable=False, index=True)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id", ondelete="RESTRICT"), index=True)
    patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.id", ondelete="RESTRICT"), index=True)
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey("doctors.id", ondelete="RESTRICT"), index=True)
    # Clinic-local wall-clock time; the practice operates in one timezone.
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")
    notes: Mapped[str | None] = mapped_column(Text)

    clinic: Mapped[Clinic] = relationship(lazy="joined")
    case: Mapped[Case | None] = relationship(lazy="joined")
    patient: Mapped[Patient | None] = relationship(lazy="joined")
    doctor: Mapped[Doctor | None] = relationship(lazy="joined")


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True)
    taken_on: Mapped[date] = mapped_column(Date, nullable=False)
    stage_label: Mapped[str | None] = mapped_column(String(120))
    caption: Mapped[str | None] = mapped_column(Text)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class PhotoFile(Base):
    """Image bytes, kept apart from Photo so listing a gallery never loads them.

    Stored in the database (not on disk) so the app runs on hosts without a
    persistent filesystem, and backups of the database include the photos.
    """

    __tablename__ = "photo_files"

    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id", ondelete="CASCADE"), primary_key=True)
    full_jpeg: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    thumb_jpeg: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
