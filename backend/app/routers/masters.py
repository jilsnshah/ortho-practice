"""Cities and treatment types: simple named master records."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import CurrentUser, DbSession, duplicate, get_owned_or_404
from app.models import Case, City, Clinic, RateCardEntry, TreatmentType, User
from app.naming import name_key
from app.schemas import CityIn, CityOut, TreatmentTypeIn, TreatmentTypeOut, TreatmentTypeUpdate

router = APIRouter(prefix="/api", tags=["masters"])


def _check_unique(db: Session, model, user: User, name: str, exclude_id: int | None = None) -> str:
    key = name_key(name)
    if not key:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"field": "name", "message": "Name is required"})
    stmt = select(model).where(model.owner_id == user.id, model.name_key == key)
    if exclude_id is not None:
        stmt = stmt.where(model.id != exclude_id)
    existing = db.scalar(stmt)
    if existing is not None:
        label = "City" if model is City else "Treatment type"
        raise duplicate(f'{label} "{existing.name}" already exists', existing.id, existing.name)
    return key


# ---- cities --------------------------------------------------------------


@router.get("/cities", response_model=list[CityOut])
def list_cities(db: DbSession, user: CurrentUser):
    return db.scalars(select(City).where(City.owner_id == user.id).order_by(City.name)).all()


@router.post("/cities", response_model=CityOut, status_code=status.HTTP_201_CREATED)
def create_city(body: CityIn, db: DbSession, user: CurrentUser):
    key = _check_unique(db, City, user, body.name)
    city = City(owner_id=user.id, name=body.name, name_key=key)
    db.add(city)
    db.commit()
    return city


@router.patch("/cities/{city_id}", response_model=CityOut)
def rename_city(city_id: int, body: CityIn, db: DbSession, user: CurrentUser):
    city = get_owned_or_404(db, City, city_id, user)
    city.name_key = _check_unique(db, City, user, body.name, exclude_id=city.id)
    city.name = body.name
    db.commit()
    return city


@router.delete("/cities/{city_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_city(city_id: int, db: DbSession, user: CurrentUser):
    city = get_owned_or_404(db, City, city_id, user)
    if db.scalar(select(Clinic.id).where(Clinic.city_id == city.id).limit(1)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, {"message": "City has clinics; move or delete them first"})
    db.delete(city)
    db.commit()


# ---- treatment types -----------------------------------------------------


@router.get("/treatment-types", response_model=list[TreatmentTypeOut])
def list_treatment_types(db: DbSession, user: CurrentUser, include_archived: bool = False):
    stmt = select(TreatmentType).where(TreatmentType.owner_id == user.id)
    if not include_archived:
        stmt = stmt.where(TreatmentType.is_archived.is_(False))
    return db.scalars(stmt.order_by(TreatmentType.name)).all()


@router.post("/treatment-types", response_model=TreatmentTypeOut, status_code=status.HTTP_201_CREATED)
def create_treatment_type(body: TreatmentTypeIn, db: DbSession, user: CurrentUser):
    key = _check_unique(db, TreatmentType, user, body.name)
    tt = TreatmentType(owner_id=user.id, name=body.name, name_key=key)
    db.add(tt)
    db.commit()
    return tt


@router.patch("/treatment-types/{tt_id}", response_model=TreatmentTypeOut)
def update_treatment_type(tt_id: int, body: TreatmentTypeUpdate, db: DbSession, user: CurrentUser):
    tt = get_owned_or_404(db, TreatmentType, tt_id, user)
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        tt.name_key = _check_unique(db, TreatmentType, user, data["name"] or "", exclude_id=tt.id)
        tt.name = data["name"]
    if data.get("is_archived") is not None:
        tt.is_archived = data["is_archived"]
    db.commit()
    return tt


@router.delete("/treatment-types/{tt_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_treatment_type(tt_id: int, db: DbSession, user: CurrentUser):
    tt = get_owned_or_404(db, TreatmentType, tt_id, user)
    in_use = db.scalar(select(Case.id).where(Case.treatment_type_id == tt.id).limit(1)) or db.scalar(
        select(RateCardEntry.id).where(RateCardEntry.treatment_type_id == tt.id).limit(1)
    )
    if in_use:
        raise HTTPException(
            status.HTTP_409_CONFLICT, {"message": "Treatment type is used by cases or rate cards; archive it instead"}
        )
    db.delete(tt)
    db.commit()
