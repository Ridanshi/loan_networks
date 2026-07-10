# Auto Document Verification — Design Spec

Date: 2026-07-11

## Problem

Ops reviewers manually open every disbursement document, compare it against
system values, and click Approve / Reject / Changes Requested on the
Disbursements page. `Ridanshi/verify_docs` (a separate Python project) already
does this comparison — a VLM extracts fields from an uploaded document, a
comparator reconciles them against expected values, and returns `APPROVED`,
`CHANGES_REQUESTED`, or `NEEDS_REVIEW` with field-level comments. Today that
tool only runs standalone inside its own Gradio UI, manually, with expected
values either typed by hand or looked up from a separate `verify_docs_staging`
test database.

This spec wires that verdict into the actual Loan Networks Admin Dashboard
(`D:\Loan Networks`), with **no human confirmation step** — the verdict writes
the case status directly.

**Update (2026-07-11, post-implementation):** originally targeted the real
`loannetwork_production` RDS database — that decision was reversed after
implementation. The backend now points at a local Postgres clone,
`verify_docs_staging` (same relational shape, seeded via `seed_db.py`,
matches the `disbursements`/`applications`/`leads`/`lending_partners` table
counts shown in the project's own screenshots — 8/53/53/53 rows). This
required two follow-up fixes not in the original plan: `db.ts`'s SSL was
hardcoded on for every connection (RDS requires it, local Postgres doesn't
support it) — now conditional on hostname; and the `loan_type` join was an
`INNER JOIN loan_types`, which silently dropped any row whose seeded
`leads.loan_type_id` was `NULL` (real bug, not a staging-only quirk) — now a
`LEFT JOIN` with `COALESCE(lt.display_name, a.loan_type)`, the latter being a
plain text column this staging clone has that production doesn't. See
`backend/.env` and `backend/src/config/db.ts` / `verifyService.ts`.

## Explicit accepted risk

The VLM's accuracy has only been measured (`eval.py`) against 150 synthetic
documents across 3 lender templates — not against real scanned/photographed
documents. Writing verdicts directly to the target database with no human
check means a wrong extraction can move a real disbursement to `approved` or
`changes_requested` with no one in the loop. This was raised and explicitly
accepted by the project owner for this test phase. Real accuracy data from
this rollout is what will justify (or roll back) keeping it fully automatic.

## Architecture

```
Disbursements page (React)
  [Verify Document] button per row, Pending on Ops tab
        │  multipart upload (file)
        ▼
Express: POST /api/disbursements/:id/verify-document
        │
        │  1. JOIN disbursements+applications+leads+lending_partners+loan_types
        │     by :id → build "expected" dict
        │  2. forward file + expected dict to Python service
        ▼
Python (Kaggle, GPU): POST /verify  [new api.py, FastAPI]
        │  preprocessor.load_image → extractor.extract_fields
        │  → comparator.compare_fields(extracted, expected)
        ▼
        returns { verdict, comments, extracted }
        │
Express receives verdict
        │  3. UPDATE disbursements SET status=..., rejected_reason/notes=...
        ▼
Frontend row updates in place; new "Needs Review" tab shows needs_review rows
```

Two services, one DB-writer (Express). The Python service is a stateless
extraction+comparison function — no database code, no new comparison logic.
This matches its existing framing in `verify_docs`'s own README ("standalone
tool... intended for the company to test before integration").

## Component 1 — `api.py` (new file, `verify_docs` repo)

FastAPI wrapper around the existing pipeline. No DB access at all — that
distinguishes it from `db_lookup.py`, which stays unused by this integration.

```python
from fastapi import FastAPI, UploadFile, Form
import json, tempfile, os

from preprocessor import load_image
from extractor import extract_fields
from comparator import compare_fields

app = FastAPI()

@app.post("/verify")
async def verify(expected: str = Form(...), document: UploadFile = None):
    expected_dict = json.loads(expected)  # {customer_name, bank_name, application_id,
                                           #  sanction_amount, disbursement_amount,
                                           #  loan_type, branch, disbursement_date,
                                           #  loan_account_number}

    suffix = os.path.splitext(document.filename)[1]
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await document.read())
        tmp_path = tmp.name

    try:
        image = load_image(tmp_path)          # PDF/JPG/PNG/TIFF -> PIL Image
        extracted = extract_fields(image)       # VLM call -> dict
        result = compare_fields(extracted, expected_dict)
    finally:
        os.unlink(tmp_path)

    return {
        "verdict": result.status,               # APPROVED / CHANGES_REQUESTED / NEEDS_REVIEW
        "comments": result.comments,             # list[str]
        "extracted": result.extracted,           # dict
    }
```

Confirmed real signatures (not guessed):
- `preprocessor.load_image(file_path: str) -> Image.Image`
- `extractor.extract_fields(image: Image.Image) -> dict`
- `comparator.compare_fields(extracted: dict, expected: dict) -> ComparisonResult`
  (`.status`, `.comments`, `.extracted`)

Verdict logic itself (already implemented in `comparator.py`, unchanged by
this work):

| Verdict | Trigger |
|---|---|
| `APPROVED` | Valid doc (≥3 fields extracted) AND every non-empty expected field matches (fuzzy ≥80 for name/bank/branch/loan_type, exact-or-endswith for LAN/application_id, amount reconciled within ₹0.01, date exact after normalization) |
| `CHANGES_REQUESTED` | Invalid doc, OR any hard field mismatch (wins over amount ambiguity), OR amount digits+words agree with each other but disagree with expected |
| `NEEDS_REVIEW` | Only when no hard mismatch exists elsewhere AND amount is ambiguous: digit/word conflict with neither matching expected, or an unconfirmed 10×/100×/1000× digit error with no words to check |

## Component 2 — Express: `POST /api/disbursements/:id/verify-document`

New file, e.g. `backend/src/routes/verifyRoutes.ts`, mounted alongside the
existing generic `dataRoutes.ts` (which stays read-only and untouched).

**Step A — build `expected` dict**, joining tables confirmed to exist in the
target database with these exact shapes. Current version (updated post-switch
to `verify_docs_staging` — see `backend/src/services/verifyService.ts` for the
live source of truth):

```sql
SELECT
    l.name                                   AS customer_name,
    lp.name                                   AS bank_name,
    a.bank_application_id                     AS application_id,
    (a.sanctioned_amount   / 100.0)::numeric  AS sanction_amount,
    (d.disbursement_amount / 100.0)::numeric  AS disbursement_amount,
    d.disbursement_date,
    a.branch_name                             AS branch,
    COALESCE(lt.display_name, a.loan_type)    AS loan_type,
    d.loan_account_number
FROM disbursements d
JOIN applications      a  ON d.application_id     = a.id
JOIN leads             l  ON a.lead_id            = l.id
JOIN lending_partners  lp ON a.lending_partner_id = lp.id
LEFT JOIN loan_types   lt ON l.loan_type_id       = lt.id
WHERE d.id = $1
```

Notes, all verified against the live schema (not assumed):
- Amounts are stored in **paise**; divide by 100, matching the convention
  already used in `db_lookup.py` for the same comparison.
- `loan_type` prefers `loan_types.display_name` via `leads.loan_type_id`,
  falling back to `applications.loan_type` (a plain text column this staging
  clone has that production doesn't) — **not** `leads.sub_loan_type`, which
  holds free-text junk in current data (e.g. `"GGHHH"` on disbursement 592).
- The `loan_types` join is **`LEFT JOIN`**, not `JOIN` — some seeded test
  leads have `loan_type_id IS NULL` (confirmed: disbursement id 3, the
  "Zainab Medicals" case), and an inner join silently dropped those rows
  entirely, making `buildExpectedFields()` return `null` for a real,
  existing disbursement. `loan_type` ending up `''` is harmless: the
  comparator treats an empty expected field as "not checked," not a mismatch.
- `applications` in `loannetwork_production` (the original target) has no
  `loan_type` column at all — if this ever points back at production, drop
  the `a.loan_type` fallback or the query won't compile there.

**Step B — call Python service**: `POST ${VERIFY_SERVICE_URL}/verify`,
multipart body: `expected` (JSON string) + `document` (file). New env var
`VERIFY_SERVICE_URL` in `backend/.env` (the ngrok URL from the Kaggle-hosted
`api.py`).

**Step C — write result back**, no schema migration needed (all target
columns already exist and are nullable, no CHECK constraint on `status`):

| Verdict | `status` | Also sets |
|---|---|---|
| `APPROVED` | `'approved'` | `approved_datetime = now()` |
| `CHANGES_REQUESTED` | `'changes_requested'` | `rejected_reason = comments.join('\n')` |
| `NEEDS_REVIEW` | `'needs_review'` (new value — confirmed no CHECK constraint blocks it) | `notes = comments.join('\n')` |

`action_by_id` is left `NULL` for automated writes (column is nullable, FK
permits NULL).

**Error handling**: if the Python call fails or times out (network, model
error, malformed response), Express makes **no** write to `disbursements` and
returns a 502 with the error message — the row is left exactly as it was.

## Component 3 — Frontend

- `DataPage`/Disbursements row (Pending on Ops tab): add a "Verify Document"
  button opening a file picker, `POST`s to the new endpoint, replaces the row
  in place with the response (or shows an error toast on failure) — no full
  page reload.
- New tab: **Needs Review**, filtering `status = 'needs_review'`, added to
  `tabsByPage.disbursements` in `dataService.ts` and to the tab list passed to
  the disbursements route in `frontend/src/main.jsx:49` (alongside
  `pending_ops`, `changes_requested`, etc.) — otherwise `needs_review` rows
  would match no existing tab and become invisible.

## Deployment note (Kaggle)

`kaggle_setup.py` already provisions a Kaggle GPU notebook for this repo, but
it installs a local ephemeral Postgres and seeds `verify_docs_staging` — not
needed here since `api.py` has no DB code at all. For this integration:
1. Run `api.py` on Kaggle (skip the Postgres/seed steps in `kaggle_setup.py`).
2. Expose it publicly with `pyngrok` (Gradio's `app.py` already relies on
   `share=True` for the same reason — Kaggle has no public port otherwise;
   FastAPI has no built-in equivalent, so `pyngrok` is the direct substitute).
3. Set `VERIFY_SERVICE_URL` in `backend/.env` to the resulting ngrok URL.

## Testing

Manual: pick a real Pending-on-Ops row (e.g. the Zainab Medicals case
mentioned by the project owner), upload a document that's known to mismatch
one field, click Verify, confirm it lands in Changes Requested with the
correct field flagged in the comment. Repeat with a clean matching document
(expect Approved) and a document with an ambiguous amount (expect Needs
Review, visible under the new tab).

No new automated tests are proposed here — `verify_docs` already has 43 unit
tests over the comparison logic itself (`pytest`, untouched by this work);
this integration only adds a thin transport layer around it.
