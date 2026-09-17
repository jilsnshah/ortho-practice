# Ortho Practice

Mobile-first practice companion for an orthodontist consulting across several clinics (Stage 1 of the product plan): clinics and rate cards, a case ledger with auto-computed profit, an appointment agenda, progress photos with a presentation mode, and an earnings dashboard.

- `backend/`: Python 3.12, FastAPI, SQLAlchemy 2, Alembic. SQLite by default; set `ORTHO_DATABASE_URL` for Postgres.
- `frontend/`: React, TypeScript, Vite, TanStack Query.

## Run locally

Prerequisites: [uv](https://docs.astral.sh/uv/) and Node 20+.

```sh
# backend
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.cli create-user --email you@example.com --name "Dr. Your Name"
uv run uvicorn app.main:app --reload --port 8000

# frontend (second terminal); proxies /api to :8000
cd frontend
npm install
npm run dev -- --host   # open the printed LAN URL on your phone
```

Production-style, single process: run `npm run build` in `frontend/`. FastAPI then serves `frontend/dist` at `/`:

```sh
cd backend && ORTHO_SECRET_KEY=... ORTHO_COOKIE_SECURE=true uv run uvicorn app.main:app --host 0.0.0.0
```

See `backend/.env.example` for all settings. Photos are stored under `ORTHO_UPLOAD_DIR` (default `backend/data/uploads`). Back up that directory together with the database.

## Tests

```sh
cd backend && uv run pytest     # API, integrity rules, migration-vs-models check
cd frontend && npm run build && npm run lint
```

## Data model rules

Every real-world thing has its own table and integer id: `cities`, `clinics`, `doctors` (plus a `clinic_doctors` link table), `treatment_types`, `rate_card_entries`, `patients`, `cases`, `appointments`, `photos`. Relationships are foreign keys only; no table stores another record's name.

How the rules are enforced:

| Layer | Mechanism |
|---|---|
| Database | FK constraints on every relationship (SQLite `PRAGMA foreign_keys=ON` on each connection). `RESTRICT` on master records, so a clinic with cases can't be deleted; archive it instead. |
| Database | Unique constraints on normalized keys: `(owner, name_key)` for cities, doctors and treatment types; `(owner, city, name_key, branch_key)` for clinics; `(clinic, treatment_type)` for rate cards. |
| Normalization | `app/naming.py` lowercases, strips punctuation and accents, and drops "Dr"/"Doctor" prefixes, so "Dr. Sharma", "Dr Sharma" and "sharma" produce the same key. |
| API | Each referenced id must exist and belong to the signed-in orthodontist (otherwise 422 on that field). Duplicates return 409 with the existing record. A case or appointment doctor must be linked to its clinic. Nothing is created implicitly. |
| UI | Every relationship field is an `EntitySelect`: search existing records, or use the explicit "+ Add new" form (prefilled with what you typed). On a duplicate, the form offers "Use existing …" rather than a second copy. |

Patients are the one soft case, since two real people can share a name. A same-name patient (with a matching or missing phone number) returns 409 with the candidates, and the user must either pick one or confirm "different person".

Money is stored as whole rupees (integers). Profit is never stored; it is always `fee_amount − material_cost`.

## How the rate card works

On a new case, picking the clinic and treatment fills quote, fee and material from that clinic's rate card. If you change the amounts, the form shows the difference and offers to update the rate card. If the clinic has no rate for that treatment yet, it offers to save the amounts as the default. This way the rate card fills itself in during normal use.

## Stage 2 readiness

- Every record has `owner_id`, and `users.role` exists with a check constraint (`orthodontist` for now). Adding clinic accounts starts with a new role.
- Clinics are currently private to each orthodontist. For the marketplace, you'll need a shared clinic identity that multiple orthodontists (and the clinic's own login) can reference, with each orthodontist's rate card hanging off that relationship. The unique keys make it possible to match existing per-owner clinics when merging.
- Appointments already store `clinic_id` / `doctor_id` / `case_id`, which is the core of a consultation request. The request/accept flow needs a new `consultation_requests` table.

## Known gaps

- No rate limiting on login, and there is no password reset (use `app.cli set-password` on the server).
- Appointment times are naive local time. That's fine for one practice timezone, but not for cross-timezone Stage 2.
- There is no import from the existing Excel sheets yet.
- HEIC photos rely on the phone converting them to JPEG on upload (iOS Safari does this).
