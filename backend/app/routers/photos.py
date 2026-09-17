from datetime import date
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import CurrentUser, DbSession, get_owned_or_404
from app.images import InvalidImage, process_image
from app.models import Case, Photo, PhotoFile, User
from app.schemas import PhotoOut, PhotoUpdate

router = APIRouter(prefix="/api", tags=["photos"])


def photo_out(photo: Photo) -> PhotoOut:
    return PhotoOut(
        id=photo.id,
        case_id=photo.case_id,
        taken_on=photo.taken_on,
        stage_label=photo.stage_label,
        caption=photo.caption,
        width=photo.width,
        height=photo.height,
        url=f"/api/photos/{photo.id}/file",
        thumb_url=f"/api/photos/{photo.id}/thumb",
    )


@router.get("/cases/{case_id}/photos", response_model=list[PhotoOut])
def list_photos(case_id: int, db: DbSession, user: CurrentUser):
    get_owned_or_404(db, Case, case_id, user)
    photos = db.scalars(select(Photo).where(Photo.case_id == case_id).order_by(Photo.taken_on, Photo.id)).all()
    return [photo_out(p) for p in photos]


@router.post("/cases/{case_id}/photos", response_model=PhotoOut, status_code=status.HTTP_201_CREATED)
def upload_photo(
    case_id: int,
    db: DbSession,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
    taken_on: Annotated[date, Form()],
    stage_label: Annotated[str | None, Form()] = None,
    caption: Annotated[str | None, Form()] = None,
):
    get_owned_or_404(db, Case, case_id, user)
    limit = get_settings().max_upload_bytes
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Photo is larger than {limit // (1024 * 1024)} MB")
    try:
        image = process_image(data)
    except InvalidImage as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"field": "file", "message": str(exc)}) from exc

    photo = Photo(
        owner_id=user.id,
        case_id=case_id,
        taken_on=taken_on,
        stage_label=(stage_label or "").strip() or None,
        caption=(caption or "").strip() or None,
        width=image.width,
        height=image.height,
    )
    db.add(photo)
    db.flush()
    db.add(PhotoFile(photo_id=photo.id, full_jpeg=image.full_jpeg, thumb_jpeg=image.thumb_jpeg))
    db.commit()
    return photo_out(photo)


def _serve(db: Session, user: User, photo_id: int, column) -> Response:
    get_owned_or_404(db, Photo, photo_id, user)
    data = db.scalar(select(column).where(PhotoFile.photo_id == photo_id))
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo file missing")
    # Photo bytes never change for an id (edits touch metadata only), so cache them.
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=604800"})


@router.get("/photos/{photo_id}/file")
def photo_file(photo_id: int, db: DbSession, user: CurrentUser):
    return _serve(db, user, photo_id, PhotoFile.full_jpeg)


@router.get("/photos/{photo_id}/thumb")
def photo_thumb(photo_id: int, db: DbSession, user: CurrentUser):
    return _serve(db, user, photo_id, PhotoFile.thumb_jpeg)


@router.patch("/photos/{photo_id}", response_model=PhotoOut)
def update_photo(photo_id: int, body: PhotoUpdate, db: DbSession, user: CurrentUser):
    photo = get_owned_or_404(db, Photo, photo_id, user)
    data = body.model_dump(exclude_unset=True)
    if "taken_on" in data and data["taken_on"] is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, {"field": "taken_on", "message": "Date required"})
    for field, value in data.items():
        setattr(photo, field, value)
    db.commit()
    return photo_out(photo)


@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(photo_id: int, db: DbSession, user: CurrentUser):
    db.delete(get_owned_or_404(db, Photo, photo_id, user))
    db.commit()
