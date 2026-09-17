"""Parsing the practice's Excel ledger."""

from openpyxl import Workbook
from openpyxl.styles import Font

from app.sheet_import import parse_workbook, subtotal_mismatches, treatment_spellings

ROWS = [
    ("Clinic / Patient Name", "Braces", "Patient Quote", "Dr. Karishma", "Material Cost", "Actual Profit"),
    ("Avdhoot - Science City",),
    ("Shriya ", "Metal Braces", 40000, 28000, 500),
    ("Krish", "Metal Braces", 40000, 28000, 500),
    ("Urvi", "Self - Ligating Metal Braces", 65000, 45500, 2000),
    # One case priced off the clinic's usual rate; the rate card keeps the common one.
    ("Meet", "Metal Braces", 50000, 35000, 15000),
    (None, None, 195000, 136500, 18000, 118500),
    ("Dr. Harsh Verma - Althan",),
    ("Aniket", "self-ligating  metal braces", 75000, 52500, 13000),
    ("Jiya",),  # consultation logged, nothing decided yet
    ("Mohika", "Invisalign", None, 20000, None),
    (None, None, 75000, 72500, 13000, 50000),  # the sheet's profit is wrong here
]


#: Bold marks a clinic heading in the real sheet; "Jiya" is a patient with nothing filled in.
BOLD = {"Clinic / Patient Name", "Avdhoot - Science City", "Dr. Harsh Verma - Althan"}


def _workbook(tmp_path, rows=ROWS, title="Ahmedabad"):
    wb = Workbook()
    ws = wb.active
    ws.title = title
    for row in rows:
        ws.append(row)
    for index, row in enumerate(rows, start=1):
        cell = ws.cell(row=index, column=1)
        if cell.value in BOLD:
            cell.font = Font(bold=True)
    path = tmp_path / "sheet.xlsx"
    wb.save(path)
    return path


def test_parses_cities_clinics_and_patients(tmp_path):
    [city] = parse_workbook(_workbook(tmp_path))
    assert city.name == "Ahmedabad"
    assert [c.label for c in city.clinics] == ["Avdhoot – Science City", "Dr. Harsh Verma – Althan"]

    avdhoot, althan = city.clinics
    assert (avdhoot.name, avdhoot.branch, avdhoot.doctor) == ("Avdhoot", "Science City", None)
    # A clinic named after its doctor yields the doctor as a record of their own.
    assert (althan.name, althan.branch, althan.doctor) == ("Dr. Harsh Verma", "Althan", "Dr. Harsh Verma")

    assert [r.patient for r in avdhoot.rows] == ["Shriya", "Krish", "Urvi", "Meet"]
    assert avdhoot.rows[0].ref == "Ahmedabad!A3"
    assert avdhoot.totals() == (195000, 136500, 18000)


def test_rate_card_takes_each_treatment_s_usual_amounts(tmp_path):
    [city] = parse_workbook(_workbook(tmp_path))
    rates = city.clinics[0].rate_card()
    assert rates["Metal Braces"] == (40000, 28000, 500)  # not Meet's one-off
    assert rates["Self - Ligating Metal Braces"] == (65000, 45500, 2000)


def test_unpriced_rows_are_kept_as_consultations(tmp_path):
    [city] = parse_workbook(_workbook(tmp_path))
    rows = {r.patient: r for r in city.clinics[1].rows}
    assert rows["Jiya"].treatment is None and not rows["Jiya"].is_priced
    assert "no treatment recorded" in rows["Jiya"].warnings
    # A fee with no quote is kept as entered, and flagged.
    assert (rows["Mohika"].fee_amount, rows["Mohika"].quote_amount) == (20000, 0)
    assert "no patient quote recorded" in rows["Mohika"].warnings


def test_spelling_variants_are_one_treatment(tmp_path):
    cities = parse_workbook(_workbook(tmp_path))
    spellings = treatment_spellings(cities)
    assert spellings["self ligating metal braces"] == "Self - Ligating Metal Braces"
    assert len(spellings) == 3  # metal, self-ligating metal, invisalign


def test_reports_where_the_sheet_s_own_subtotal_disagrees(tmp_path):
    cities = parse_workbook(_workbook(tmp_path))
    problems = subtotal_mismatches(cities)
    assert len(problems) == 1
    assert "profit sums to 59,500, sheet says 50,000" in problems[0]
