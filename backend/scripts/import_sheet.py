"""Load the practice's Excel ledger into a running instance, through the API.

    uv run --group dev python scripts/import_sheet.py "Dr. Karishma Parikh.xlsx" --dry-run
    ORTHO_IMPORT_PASSWORD=... uv run --group dev python scripts/import_sheet.py \
        "Dr. Karishma Parikh.xlsx" --base-url https://ortho-practice.onrender.com --email you@example.com

Going through the API means the import obeys the same rules as typing the data
in: foreign keys must exist, duplicate clinics and treatment types collapse onto
the record already there, and amounts are validated.

The sheet has no dates, so every case starts on --started-on (today by default).
Each sheet row becomes its own patient: two rows named "Divya" are two people
unless you merge them afterwards, which the summary points out.
"""

import argparse
import getpass
import os
import sys
from datetime import date
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.naming import name_key  # noqa: E402
from app.sheet_import import CityBlock, parse_workbook, subtotal_mismatches, treatment_spellings  # noqa: E402


class Api:
    def __init__(self, base_url: str, email: str, password: str):
        self.client = httpx.Client(base_url=base_url.rstrip("/"), timeout=60.0, follow_redirects=True)
        res = self.client.post("/api/auth/login", json={"email": email, "password": password})
        res.raise_for_status()

    def get(self, path: str, **params):
        res = self.client.get(path, params=params)
        res.raise_for_status()
        return res.json()

    def post(self, path: str, body: dict):
        res = self.client.post(path, json=body)
        if res.status_code == 409:
            # Already there: the server hands back the record it kept.
            return res.json()["detail"]["existing"]
        res.raise_for_status()
        return res.json()


def summarize(cities: list[CityBlock]) -> None:
    total_cases = total_priced = 0
    print("\nWhat the sheet holds")
    for city in cities:
        print(f"\n{city.name}")
        for clinic in city.clinics:
            quote, fee, material = clinic.totals()
            priced = sum(1 for r in clinic.rows if r.is_priced)
            total_cases += len(clinic.rows)
            total_priced += priced
            doctor = f" · doctor {clinic.doctor}" if clinic.doctor else ""
            print(
                f"  {clinic.label:<42} {len(clinic.rows):>3} cases ({priced} priced){doctor}\n"
                f"      quote {quote:>9,}  fee {fee:>9,}  material {material:>8,}  profit {fee - material:>9,}"
                f"  ·  {len(clinic.rate_card())} rate card entries"
            )

    treatments = treatment_spellings(cities)
    print(f"\nTreatment types ({len(treatments)}): {', '.join(sorted(treatments.values()))}")
    print(f"Cases: {total_cases} ({total_priced} priced, {total_cases - total_priced} to complete later)")

    warnings = [(row.ref, row.patient, w) for city in cities for c in city.clinics for row in c.rows for w in row.warnings]
    priced_warnings = [w for w in warnings if "no treatment" not in w[2] and "no fee" not in w[2]]
    if priced_warnings:
        print("\nRows worth a second look:")
        for ref, patient, warning in priced_warnings:
            print(f"  {ref:<16} {patient:<14} {warning}")

    repeats = []
    for city in cities:
        for clinic in city.clinics:
            seen: dict[str, str] = {}
            for row in clinic.rows:
                key = name_key(row.patient)
                if key in seen:
                    repeats.append(f"  {clinic.label}: {row.patient} appears twice ({seen[key]} and {row.ref})")
                seen[key] = row.ref
    if repeats:
        print("\nSame name twice in one clinic — two people, or one row entered twice?")
        print("\n".join(repeats))

    for problem in subtotal_mismatches(cities):
        print(f"\nSubtotal mismatch: {problem}")


def load(api: Api, cities: list[CityBlock], started_on: str) -> None:
    treatments = treatment_spellings(cities)
    treatment_ids: dict[str, int] = {}
    for key, spelling in treatments.items():
        treatment_ids[key] = api.post("/api/treatment-types", {"name": spelling})["id"]
    print(f"Treatment types: {len(treatment_ids)}")

    cases = rates = 0
    for city in cities:
        city_id = api.post("/api/cities", {"name": city.name})["id"]
        for clinic in city.clinics:
            clinic_id = api.post(
                "/api/clinics", {"name": clinic.name, "branch": clinic.branch, "city_id": city_id}
            )["id"]

            if clinic.doctor:
                doctor_id = api.post("/api/doctors", {"name": clinic.doctor})["id"]
                api.post(f"/api/clinics/{clinic_id}/doctors", {"doctor_id": doctor_id})

            for treatment, (quote, fee, material) in clinic.rate_card().items():
                api.post(
                    f"/api/clinics/{clinic_id}/rate-card",
                    {
                        "treatment_type_id": treatment_ids[name_key(treatment)],
                        "quote_amount": quote,
                        "fee_amount": fee,
                        "material_cost": material,
                    },
                )
                rates += 1

            for row in clinic.rows:
                patient_id = api.post("/api/patients", {"name": row.patient, "allow_duplicate": True})["id"]
                api.post(
                    "/api/cases",
                    {
                        "patient_id": patient_id,
                        "clinic_id": clinic_id,
                        "treatment_type_id": treatment_ids[name_key(row.treatment)] if row.treatment else None,
                        # Unpriced rows are consultations that were never written up.
                        "status": "active" if row.is_priced else "consultation",
                        "started_on": started_on,
                        "quote_amount": row.quote_amount,
                        "fee_amount": row.fee_amount,
                        "material_cost": row.material_cost,
                        "notes": f"Imported from the practice sheet ({row.ref}).",
                    },
                )
                cases += 1
            print(f"  {city.name} · {clinic.label}: {len(clinic.rows)} cases")

    print(f"\nLoaded {cases} cases and {rates} rate card entries.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("workbook")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--email")
    parser.add_argument("--started-on", default=date.today().isoformat())
    parser.add_argument("--dry-run", action="store_true", help="Show what the sheet holds and write nothing")
    parser.add_argument("--allow-existing", action="store_true", help="Import even though the account already has cases")
    args = parser.parse_args()

    cities = parse_workbook(args.workbook)
    summarize(cities)
    if args.dry_run:
        print("\nDry run: nothing was written.")
        return
    if not args.email:
        sys.exit("--email is required to write (or pass --dry-run).")

    password = os.environ.get("ORTHO_IMPORT_PASSWORD") or getpass.getpass("Password: ")
    api = Api(args.base_url, args.email, password)

    existing = api.get("/api/cases", limit=1)["total"]
    if existing and not args.allow_existing:
        sys.exit(f"This account already has {existing} cases. Re-run with --allow-existing to add the sheet anyway.")

    print(f"\nWriting to {args.base_url}, cases starting {args.started_on}")
    load(api, cities, args.started_on)


if __name__ == "__main__":
    main()
