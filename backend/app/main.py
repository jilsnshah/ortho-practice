import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError

from app.bootstrap import ensure_bootstrap_user
from app.config import get_settings
from app.routers import appointments, auth, cases, clinics, dashboard, doctors, masters, patients, photos

@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_bootstrap_user()
    yield


app = FastAPI(title="Ortho Practice", version="0.1.0", lifespan=lifespan)

if get_settings().secret_key == "dev-insecure-change-me":
    logging.getLogger("uvicorn.error").warning(
        "ORTHO_SECRET_KEY is not set; sessions are signed with an insecure development key."
    )

for module in (auth, masters, doctors, clinics, patients, cases, appointments, photos, dashboard):
    app.include_router(module.router)


@app.exception_handler(IntegrityError)
def integrity_error(_request: Request, exc: IntegrityError):
    # Backstop for races the explicit checks can't see: the database constraint wins.
    message = str(exc.orig).lower()
    if "foreign key" in message:
        detail = "Referenced record does not exist. Create it first."
    elif "unique" in message or "duplicate" in message:
        detail = "A record with this name already exists."
    else:
        detail = "The change violates a data constraint."
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": {"message": detail}})


@app.get("/api/health")
def health():
    return {"ok": True}


_dist = get_settings().frontend_dist
if _dist.is_dir():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        candidate = (_dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(_dist.resolve()):
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")
