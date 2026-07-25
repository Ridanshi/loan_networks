# Auto Document Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `verify_docs`'s document-verification pipeline into the Loan Networks Admin Dashboard so uploading a document on the Disbursements page automatically writes an APPROVED / CHANGES_REQUESTED / NEEDS_REVIEW verdict to the real `loannetwork_production` database, with no human confirmation step.

**Architecture:** Two services. `verify_docs` (Python, runs on a Kaggle GPU) gets a new `api.py` — a thin FastAPI wrapper around its existing `preprocessor`/`extractor`/`comparator` pipeline, with zero database code. The Loan Networks Express backend becomes the single database-writer: it joins `disbursements`+`applications`+`leads`+`lending_partners`+`loan_types` to build the "expected" values, calls the Python `/verify` endpoint, and writes the verdict back. The React frontend adds a per-row "Verify Document" upload button and a new "Needs Review" tab.

**Tech Stack:** FastAPI + uvicorn + pytest (Python side, added to the existing `verify_docs` repo), Express + node-postgres + multer (Node backend, added to existing `D:\Loan Networks\backend`), React (existing `D:\Loan Networks\frontend`, Vite + Tailwind).

## Global Constraints

- Verdicts write directly to `loannetwork_production` with **no human confirmation step** — explicitly accepted risk, see spec §"Explicit accepted risk" (`docs/superpowers/specs/2026-07-11-auto-document-verification-design.md`).
- Amounts in `loannetwork_production` are stored in **paise** — always divide by 100 before sending to the comparator, matching the convention already used in `verify_docs/db_lookup.py`.
- `loan_type` must be read via `loan_types.display_name` (joined through `leads.loan_type_id`) — **not** `leads.sub_loan_type`, which holds unrelated free-text test data in current rows.
- No database migration: `status`, `rejected_reason`, `notes`, `approved_datetime`, `action_by_id` all already exist on `disbursements`, are nullable, and have no CHECK constraint blocking a new `'needs_review'` status value (confirmed against the live schema).
- `action_by_id` is left `NULL` for automated writes (column is nullable, FK to `employees` permits NULL).
- **Test strategy differs by codebase, deliberately:** `verify_docs` already has 43 pytest unit tests and a clear TDD precedent — the new `api.py` task follows strict TDD (write failing test, watch it fail, implement, watch it pass). `D:\Loan Networks` (backend + frontend) has **zero existing test infrastructure** (no test runner in either `package.json`) — introducing a whole new test framework for one feature would be scope creep the codebase's own conventions don't support. Those tasks instead specify exact manual verification commands (`curl`, browser steps) with expected output, in place of automated test steps. This is a deliberate deviation from strict TDD, not an oversight.
- `D:\Loan Networks` is not currently a git repository — Task 5 initializes one so subsequent tasks can commit, per this plan's frequent-commit discipline.

---

## Part A — `verify_docs` (Python, GitHub repo `Ridanshi/verify_docs`)

### Task 1: Clone the repo locally

**Files:**
- Create (via clone): `C:\Users\Ridan\OneDrive\문서\Verify Docs\` (currently empty — this is the folder path already referenced for this project)

- [ ] **Step 1: Clone**

```bash
git clone https://github.com/Ridanshi/verify_docs.git "C:/Users/Ridan/OneDrive/문서/Verify Docs"
```

Expected: repo cloned, `git -C "C:/Users/Ridan/OneDrive/문서/Verify Docs" log -1 --oneline` shows the latest commit on `master`.

- [ ] **Step 2: Confirm the files this plan depends on are present**

```bash
ls "C:/Users/Ridan/OneDrive/문서/Verify Docs"
```

Expected: `app.py`, `comparator.py`, `config.py`, `db_lookup.py`, `extractor.py`, `normalizer.py`, `preprocessor.py`, `requirements.txt`, `tests/` all present.

No commit for this task — nothing changed yet beyond the clone itself.

---

### Task 2: Add FastAPI dependencies

**Files:**
- Modify: `requirements.txt`

**Interfaces:**
- Produces: `fastapi`, `uvicorn`, `python-multipart` importable in the venv for Task 3.

- [ ] **Step 1: Add the three new lines**

Append to the end of `requirements.txt`:

```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
python-multipart>=0.0.9 # required by FastAPI to parse multipart form/file uploads
```

- [ ] **Step 2: Install**

```bash
cd "C:/Users/Ridan/OneDrive/문서/Verify Docs"
pip install -r requirements.txt
```

Expected: no errors; `python -c "import fastapi, uvicorn"` exits 0.

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "Add FastAPI dependencies for the /verify HTTP endpoint"
```

---

### Task 3: `api.py` — FastAPI wrapper around the existing pipeline (TDD)

**Files:**
- Create: `api.py`
- Test: `tests/test_api.py`

**Interfaces:**
- Consumes: `preprocessor.load_image(file_path: str) -> Image.Image`, `extractor.extract_fields(image: Image.Image) -> dict`, `comparator.compare_fields(extracted: dict, expected: dict) -> ComparisonResult` (`.status: str`, `.comments: list[str]`, `.extracted: dict`) — all pre-existing, unmodified.
- Produces: `app` (FastAPI instance) with `POST /verify` accepting multipart form fields `expected` (JSON string) and `document` (file), returning `{"verdict": str, "comments": list[str], "extracted": dict}`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_api.py`:

```python
import io
import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from api import app
from comparator import ComparisonResult

client = TestClient(app)

VALID_EXPECTED = {
    "customer_name": "Jane Doe",
    "bank_name": "HDFC",
    "application_id": "APP123",
    "sanction_amount": 500000,
    "disbursement_amount": 500000,
    "loan_type": "Home Loan",
    "branch": "Andheri",
    "disbursement_date": "2026-01-31",
    "loan_account_number": "HL1234567890",
}


@patch("api.compare_fields")
@patch("api.extract_fields")
@patch("api.load_image")
def test_verify_returns_approved_verdict(mock_load_image, mock_extract_fields, mock_compare_fields):
    mock_load_image.return_value = "fake-image-object"
    mock_extract_fields.return_value = {"customer_name": "Jane Doe"}
    mock_compare_fields.return_value = ComparisonResult(
        status="APPROVED", comments=[], extracted={"customer_name": "Jane Doe"}
    )

    response = client.post(
        "/verify",
        data={"expected": json.dumps(VALID_EXPECTED)},
        files={"document": ("doc.pdf", io.BytesIO(b"%PDF-1.4 dummy"), "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "verdict": "APPROVED",
        "comments": [],
        "extracted": {"customer_name": "Jane Doe"},
    }
    mock_load_image.assert_called_once()
    mock_extract_fields.assert_called_once_with("fake-image-object")
    mock_compare_fields.assert_called_once_with({"customer_name": "Jane Doe"}, VALID_EXPECTED)


def test_verify_requires_document_file():
    response = client.post("/verify", data={"expected": json.dumps(VALID_EXPECTED)})

    assert response.status_code == 422  # FastAPI's own validation — no file provided
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "C:/Users/Ridan/OneDrive/문서/Verify Docs"
pytest tests/test_api.py -v
```

Expected: `ModuleNotFoundError: No module named 'api'` (or collection error) — `api.py` doesn't exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `api.py`:

```python
# api.py — FastAPI wrapper around the existing verify_docs pipeline.
#
# No database code here. This endpoint receives the "expected" values as a
# JSON string (built by the caller — e.g. the Loan Networks backend, which
# already has the case's real values) plus a document, and returns a verdict.
# The comparison logic itself lives entirely in comparator.py, unchanged.

import json
import os
import tempfile

from fastapi import FastAPI, File, Form, UploadFile

from preprocessor import load_image
from extractor import extract_fields
from comparator import compare_fields

app = FastAPI()


@app.post("/verify")
async def verify(expected: str = Form(...), document: UploadFile = File(...)):
    expected_dict = json.loads(expected)

    suffix = os.path.splitext(document.filename or "")[1]
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await document.read())
        tmp_path = tmp.name

    try:
        image = load_image(tmp_path)
        extracted = extract_fields(image)
        result = compare_fields(extracted, expected_dict)
    finally:
        os.unlink(tmp_path)

    return {
        "verdict": result.status,
        "comments": result.comments,
        "extracted": result.extracted,
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pytest tests/test_api.py -v
```

Expected: both tests `PASS`.

- [ ] **Step 5: Run the full existing test suite to confirm nothing broke**

```bash
pytest -v
```

Expected: all tests pass (the 43 pre-existing tests plus the 2 new ones).

- [ ] **Step 6: Commit**

```bash
git add api.py tests/test_api.py
git commit -m "Add FastAPI /verify endpoint wrapping the existing extraction+comparison pipeline"
```

---

### Task 4: Kaggle launch script (deployment tooling, no automated test)

**Files:**
- Create: `kaggle_launch.py`

**Interfaces:**
- Consumes: `api.py`'s `app` (Task 3).
- Produces: a running `uvicorn` server on port 8000 tunneled through `pyngrok`, printing the public URL to stdout.

This is an ops/launcher script, not application logic — verified by manual run on Kaggle (Task 14), not by pytest. `kaggle_setup.py` is left untouched: it provisions a local ephemeral Postgres for the Gradio `app.py`/`db_lookup.py` flow, which this integration does not use.

- [ ] **Step 1: Add `pyngrok` to requirements.txt**

Append:

```
pyngrok>=7.1.0
```

- [ ] **Step 2: Write the launcher**

Create `kaggle_launch.py`:

```python
"""
kaggle_launch.py — starts api.py on Kaggle and exposes it publicly.

Kaggle notebooks have no reachable public port by default (this is why
app.py's Gradio launch uses share=True). FastAPI has no equivalent built in,
so this script opens an ngrok tunnel to the same effect.

Usage on Kaggle (after pip install -r requirements.txt):
    python kaggle_launch.py
"""

import uvicorn
from pyngrok import ngrok

PORT = 8000

if __name__ == "__main__":
    public_url = ngrok.connect(PORT, "http")
    print(f"\n{'=' * 60}")
    print(f"  verify_docs API is public at: {public_url}")
    print(f"  Set VERIFY_SERVICE_URL={public_url} in the Loan Networks backend/.env")
    print(f"{'=' * 60}\n")

    uvicorn.run("api:app", host="0.0.0.0", port=PORT)
```

- [ ] **Step 3: Install and sanity-check locally (tunnel itself requires an ngrok account token on first use, so this step only confirms the script imports and argument-parses correctly, not that the tunnel opens)**

```bash
pip install -r requirements.txt
python -c "import kaggle_launch"
```

Expected: no import errors.

- [ ] **Step 4: Commit**

```bash
git add requirements.txt kaggle_launch.py
git commit -m "Add Kaggle launch script exposing the FastAPI service via ngrok"
```

---

## Part B — Loan Networks (`D:\Loan Networks`)

### Task 5: Initialize git

**Files:**
- Create: `D:\Loan Networks\.git\` (via `git init`)

`D:\Loan Networks` currently has no git repository, so none of the following tasks can be committed without this.

- [ ] **Step 1: Init and baseline-commit the current state**

```bash
cd "D:/Loan Networks"
git init
git add -A
git commit -m "Baseline commit before auto-document-verification feature work"
```

Expected: `git log --oneline` shows one commit; `git status` shows a clean tree.

---

### Task 6: Add the "Needs Review" tab filter (backend)

**Files:**
- Modify: `backend/src/services/dataService.ts:6-14`

**Interfaces:**
- Produces: `tabsByPage.disbursements.needs_review` — filters `status = 'needs_review'`, consumed by `getPageData()` (unmodified) when `?tab=needs_review` is requested.

- [ ] **Step 1: Add the tab entry**

In `backend/src/services/dataService.ts`, change:

```typescript
  disbursements: {
    pending_ops: { column: 'pending_approval_role', operator: '=', value: 'operations' },
    pending_finance: { column: 'pending_approval_role', operator: 'in', value: ['finance', 'finance_manager'] },
    changes_requested: { column: 'status', operator: '=', value: 'changes_requested' },
    approved: { column: 'status', operator: '=', value: 'approved' },
    acknowledged: { column: 'acknowledgement_status', operator: '=', value: 'acknowledged' },
    rejected: { column: 'status', operator: '=', value: 'rejected' },
    paid: { column: 'primary_payout_status', operator: '=', value: 'paid' }
  },
```

to:

```typescript
  disbursements: {
    pending_ops: { column: 'pending_approval_role', operator: '=', value: 'operations' },
    pending_finance: { column: 'pending_approval_role', operator: 'in', value: ['finance', 'finance_manager'] },
    changes_requested: { column: 'status', operator: '=', value: 'changes_requested' },
    approved: { column: 'status', operator: '=', value: 'approved' },
    acknowledged: { column: 'acknowledgement_status', operator: '=', value: 'acknowledged' },
    rejected: { column: 'status', operator: '=', value: 'rejected' },
    paid: { column: 'primary_payout_status', operator: '=', value: 'paid' },
    needs_review: { column: 'status', operator: '=', value: 'needs_review' }
  },
```

- [ ] **Step 2: Manual verify**

With the backend dev server running (`npm run dev --prefix backend`):

```bash
curl "http://localhost:4000/api/disbursements?tab=needs_review"
```

Expected: `200 OK`, `{"label":"Disbursements", ..., "rows":[], "total":0, ...}` (empty today — no rows have this status yet, which is correct; Task 8 is what will ever produce one).

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/dataService.ts
git commit -m "Add needs_review tab filter for disbursements"
```

---

### Task 7: `verifyService.ts` — expected-fields join, Python call, DB write-back

**Files:**
- Create: `backend/src/services/verifyService.ts`
- Modify: `backend/package.json` (add `multer`, `@types/multer`)

**Interfaces:**
- Consumes: `query<T>(text: string, params: unknown[]) -> Promise<{rows: T[]}>` from `backend/src/config/db.ts` (existing, unmodified).
- Produces:
  - `ExpectedFields` type: `{ customer_name: string; bank_name: string; application_id: string; sanction_amount: number; disbursement_amount: number; disbursement_date: string; branch: string; loan_type: string; loan_account_number: string; }`
  - `VerifyResult` type: `{ verdict: 'APPROVED' | 'CHANGES_REQUESTED' | 'NEEDS_REVIEW'; comments: string[]; extracted: Record<string, unknown>; }`
  - `buildExpectedFields(disbursementId: number): Promise<ExpectedFields | null>`
  - `callVerifyService(expected: ExpectedFields, fileBuffer: Buffer, filename: string): Promise<VerifyResult>`
  - `applyVerdict(disbursementId: number, result: VerifyResult): Promise<void>`
  — all consumed by Task 8's `verifyController.ts`.

- [ ] **Step 1: Add `multer`**

```bash
cd "D:/Loan Networks/backend"
npm install multer
npm install --save-dev @types/multer
```

Expected: `backend/package.json` `dependencies` now includes `multer`, `devDependencies` includes `@types/multer`.

- [ ] **Step 2: Write `verifyService.ts`**

Create `backend/src/services/verifyService.ts`:

```typescript
import { query } from '../config/db.js';

export type ExpectedFields = {
  customer_name: string;
  bank_name: string;
  application_id: string;
  sanction_amount: number;
  disbursement_amount: number;
  disbursement_date: string;
  branch: string;
  loan_type: string;
  loan_account_number: string;
};

export type VerifyResult = {
  verdict: 'APPROVED' | 'CHANGES_REQUESTED' | 'NEEDS_REVIEW';
  comments: string[];
  extracted: Record<string, unknown>;
};

type ExpectedFieldsRow = Omit<ExpectedFields, 'disbursement_date' | 'sanction_amount' | 'disbursement_amount'> & {
  disbursement_date: Date;
  sanction_amount: string;
  disbursement_amount: string;
};

// Amounts are stored in paise in loannetwork_production — divide by 100 here,
// matching the same convention already used in verify_docs/db_lookup.py.
// loan_type comes from loan_types.display_name via leads.loan_type_id —
// NOT leads.sub_loan_type, which holds unrelated free-text test data today.
const EXPECTED_FIELDS_SQL = `
  SELECT
      l.name                                   AS customer_name,
      lp.name                                   AS bank_name,
      a.bank_application_id                     AS application_id,
      (a.sanctioned_amount   / 100.0)::numeric  AS sanction_amount,
      (d.disbursement_amount / 100.0)::numeric  AS disbursement_amount,
      d.disbursement_date,
      a.branch_name                             AS branch,
      lt.display_name                           AS loan_type,
      d.loan_account_number
  FROM disbursements d
  JOIN applications     a  ON d.application_id     = a.id
  JOIN leads            l  ON a.lead_id            = l.id
  JOIN lending_partners lp ON a.lending_partner_id = lp.id
  JOIN loan_types        lt ON l.loan_type_id       = lt.id
  WHERE d.id = $1
`;

export async function buildExpectedFields(disbursementId: number): Promise<ExpectedFields | null> {
  const result = await query<ExpectedFieldsRow>(EXPECTED_FIELDS_SQL, [disbursementId]);
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    sanction_amount: Number(row.sanction_amount),
    disbursement_amount: Number(row.disbursement_amount),
    disbursement_date: new Date(row.disbursement_date).toISOString().slice(0, 10)
  };
}

export async function callVerifyService(
  expected: ExpectedFields,
  fileBuffer: Buffer,
  filename: string
): Promise<VerifyResult> {
  const verifyServiceUrl = process.env.VERIFY_SERVICE_URL;
  if (!verifyServiceUrl) {
    throw new Error('VERIFY_SERVICE_URL is not set. Add it to backend/.env.');
  }

  const formData = new FormData();
  formData.append('expected', JSON.stringify(expected));
  formData.append('document', new Blob([fileBuffer]), filename);

  const response = await fetch(`${verifyServiceUrl}/verify`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`verify_docs service returned ${response.status}: ${text}`);
  }

  return (await response.json()) as VerifyResult;
}

export async function applyVerdict(disbursementId: number, result: VerifyResult): Promise<void> {
  const comments = result.comments.join('\n');

  if (result.verdict === 'APPROVED') {
    await query('UPDATE disbursements SET status = $1, approved_datetime = now() WHERE id = $2', [
      'approved',
      disbursementId
    ]);
  } else if (result.verdict === 'CHANGES_REQUESTED') {
    await query('UPDATE disbursements SET status = $1, rejected_reason = $2 WHERE id = $3', [
      'changes_requested',
      comments,
      disbursementId
    ]);
  } else {
    await query('UPDATE disbursements SET status = $1, notes = $2 WHERE id = $3', [
      'needs_review',
      comments,
      disbursementId
    ]);
  }
}
```

- [ ] **Step 3: Manual verify `buildExpectedFields` against the real DB**

`tsx` has no `-e` eval flag (that's a plain-`node`-only flag) — write a one-off script instead, run it, then delete it:

```bash
cd "D:/Loan Networks/backend"
cat > src/scripts/verifyExpectedFieldsCheck.ts <<'EOF'
import { buildExpectedFields } from '../services/verifyService.js';

buildExpectedFields(592)
  .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
  .catch((e) => { console.error('ERR', e.message); process.exit(1); });
EOF
npx tsx src/scripts/verifyExpectedFieldsCheck.ts
rm src/scripts/verifyExpectedFieldsCheck.ts
```

Expected output shape (real values for disbursement 592, confirmed during design):

```json
{
  "customer_name": "NILESH ANANT HUMBRE",
  "bank_name": "Bank Of India",
  "application_id": "BOIBRBCBSA2",
  "sanction_amount": 10200000,
  "disbursement_amount": 998899,
  "disbursement_date": "2026-07-07",
  "branch": "Borivali",
  "loan_type": "Home loan",
  "loan_account_number": "98767787889"
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/verifyService.ts
git commit -m "Add verifyService: expected-fields join, verify_docs call, verdict write-back"
```

---

### Task 8: `verifyController.ts` + `verifyRoutes.ts` — wire the HTTP endpoint

**Files:**
- Create: `backend/src/controllers/verifyController.ts`
- Create: `backend/src/routes/verifyRoutes.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `buildExpectedFields`, `callVerifyService`, `applyVerdict` from Task 7's `verifyService.ts`.
- Produces: `POST /api/disbursements/:id/verify-document` (multipart, field name `document`), returns the `VerifyResult` JSON on success.

- [ ] **Step 1: Write the controller**

Create `backend/src/controllers/verifyController.ts`:

```typescript
import type { NextFunction, Request, Response } from 'express';
import { applyVerdict, buildExpectedFields, callVerifyService } from '../services/verifyService.js';

export async function verifyDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    const disbursementId = Number(req.params.id);
    if (!Number.isInteger(disbursementId)) {
      res.status(400).json({ message: `Invalid disbursement id: ${req.params.id}` });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: 'No document file uploaded. Send it as multipart field "document".' });
      return;
    }

    const expected = await buildExpectedFields(disbursementId);
    if (!expected) {
      res.status(404).json({ message: `No disbursement found with id ${disbursementId}` });
      return;
    }

    const result = await callVerifyService(expected, req.file.buffer, req.file.originalname);
    await applyVerdict(disbursementId, result);

    res.json(result);
  } catch (error) {
    console.error(error);
    next(error);
  }
}
```

- [ ] **Step 2: Write the route**

Create `backend/src/routes/verifyRoutes.ts`:

```typescript
import { Router } from 'express';
import multer from 'multer';
import { verifyDocumentController } from '../controllers/verifyController.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = Router();

router.post('/disbursements/:id/verify-document', upload.single('document'), verifyDocumentController);

export default router;
```

- [ ] **Step 3: Mount it in `server.ts`**

In `backend/src/server.ts`, change:

```typescript
const [{ default: cors }, { default: express }, { default: dataRoutes }] = await Promise.all([
  import('cors'),
  import('express'),
  import('./routes/dataRoutes.js')
]);
```

to:

```typescript
const [{ default: cors }, { default: express }, { default: dataRoutes }, { default: verifyRoutes }] = await Promise.all([
  import('cors'),
  import('express'),
  import('./routes/dataRoutes.js'),
  import('./routes/verifyRoutes.js')
]);
```

and change:

```typescript
app.use('/api', dataRoutes);
```

to:

```typescript
app.use('/api', dataRoutes);
app.use('/api', verifyRoutes);
```

- [ ] **Step 4: Manual verify — error paths first (no GPU/Python service required)**

With the backend dev server restarted (`npm run dev --prefix backend`):

```bash
curl -i -X POST "http://localhost:4000/api/disbursements/592/verify-document"
```

Expected: `400 {"message":"No document file uploaded. Send it as multipart field \"document\"."}`

```bash
curl -i -X POST "http://localhost:4000/api/disbursements/999999999/verify-document" -F "document=@backend/package.json"
```

Expected: `404 {"message":"No disbursement found with id 999999999"}` (real lookup runs, no matching row).

```bash
curl -i -X POST "http://localhost:4000/api/disbursements/592/verify-document" -F "document=@backend/package.json"
```

Expected: `500`, error mentions `VERIFY_SERVICE_URL is not set` (or a connection failure if it's set but nothing is listening yet) — confirms the row was found and the call to the Python service was attempted. Confirm via `psql`/dashboard that disbursement 592's `status` is **unchanged** (still `pending_approval`) — the no-partial-write guarantee.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/verifyController.ts backend/src/routes/verifyRoutes.ts backend/src/server.ts
git commit -m "Add POST /api/disbursements/:id/verify-document endpoint"
```

---

### Task 9: Frontend API client function

**Files:**
- Modify: `frontend/src/services/api.js`

**Interfaces:**
- Produces: `verifyDisbursementDocument(id: number, file: File): Promise<{verdict: string, comments: string[], extracted: object}>`, consumed by Task 11's `VerifyDocumentButton.jsx`.

- [ ] **Step 1: Add the function**

In `frontend/src/services/api.js`, after the existing `fetchBtJourneys` function, add:

```javascript
export async function verifyDisbursementDocument(id, file) {
  const formData = new FormData();
  formData.append('document', file);

  const response = await api.post(`/disbursements/${id}/verify-document`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return response.data;
}
```

- [ ] **Step 2: Manual verify**

`api.js` uses `import.meta.env`, which only resolves under Vite — plain `node` can't import this file directly. Use a syntax check instead (full functional verification happens in Task 13's browser test):

```bash
cd "D:/Loan Networks/frontend"
node --check src/services/api.js
grep -c "export async function verifyDisbursementDocument" src/services/api.js
```

Expected: `node --check` exits with no output (valid syntax), `grep -c` prints `1`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.js
git commit -m "Add verifyDisbursementDocument API client function"
```

---

### Task 10: `DataTable.jsx` — optional per-row actions column

**Files:**
- Modify: `frontend/src/components/DataTable.jsx`

**Interfaces:**
- Produces: new optional prop `actions?: (row: object) => ReactNode` on `DataTable`. When omitted (every existing caller today), rendering is byte-for-byte identical to before — no new column appears.

- [ ] **Step 1: Add the prop and render it conditionally**

Replace the full file `frontend/src/components/DataTable.jsx` with:

```jsx
function formatHeader(column) {
  return column
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString();
  }

  return String(value);
}

export default function DataTable({ columns, rows, loading, actions }) {
  if (loading) {
    return <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading data...</div>;
  }

  if (!columns.length) {
    return <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">No columns found.</div>;
  }

  const columnCount = columns.length + (actions ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-700">
                  {formatHeader(column)}
                </th>
              ))}
              {actions ? (
                <th className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-700">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={columnCount}>
                  No records found.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={String(row.id ?? index)} className="hover:bg-slate-50">
                  {columns.map((column) => (
                    <td key={column} className="max-w-xs truncate px-4 py-3 text-slate-700" title={formatValue(row[column])}>
                      {formatValue(row[column])}
                    </td>
                  ))}
                  {actions ? <td className="px-4 py-3">{actions(row)}</td> : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verify — existing pages unaffected**

With `npm run dev` running, open `http://localhost:5173/builders` (a page that does not pass `actions`) and confirm no "Actions" column appears and the table renders exactly as before.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DataTable.jsx
git commit -m "Add optional per-row actions column to DataTable"
```

---

### Task 11: `VerifyDocumentButton.jsx`

**Files:**
- Create: `frontend/src/components/VerifyDocumentButton.jsx`

**Interfaces:**
- Consumes: `verifyDisbursementDocument(id, file)` (Task 9), `getApiErrorMessage` (existing, in `frontend/src/services/api.js`).
- Produces: `<VerifyDocumentButton disbursementId={number} onVerified={(result) => void} />`, consumed by Task 12's `DataPage.jsx`.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/VerifyDocumentButton.jsx`:

```jsx
import { useState } from 'react';
import { verifyDisbursementDocument, getApiErrorMessage } from '../services/api';

export default function VerifyDocumentButton({ disbursementId, onVerified }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      const result = await verifyDisbursementDocument(disbursementId, file);
      onVerified(result);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Verification failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
        {busy ? 'Verifying...' : 'Verify Document'}
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.tiff"
          className="hidden"
          onChange={handleChange}
          disabled={busy}
        />
      </label>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/VerifyDocumentButton.jsx
git commit -m "Add VerifyDocumentButton component"
```

(Manual verification of this component happens end-to-end in Task 12's step, once it's wired into a real page.)

---

### Task 12: Wire `DataPage.jsx` to render the verify action and reload on completion

**Files:**
- Modify: `frontend/src/pages/DataPage.jsx`

**Interfaces:**
- Consumes: `VerifyDocumentButton` (Task 11).
- Produces: new optional prop `enableDocumentVerification?: boolean` on `DataPage`, consumed by Task 13's `main.jsx`. When `false`/omitted (every page except disbursements), behavior is unchanged from today.

- [ ] **Step 1: Refactor the fetch into a named, reusable function and add the prop**

Replace the full file `frontend/src/pages/DataPage.jsx` with:

```jsx
import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import SearchBox from '../components/SearchBox';
import StatusTabs from '../components/StatusTabs';
import VerifyDocumentButton from '../components/VerifyDocumentButton';
import { fetchPageData, getApiErrorMessage } from '../services/api';

const pageSize = 20;

export default function DataPage({ pageKey, title, tabs = [], enableDocumentVerification = false }) {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function loadData() {
    setLoading(true);
    setError('');

    return fetchPageData(pageKey, { page, limit: pageSize, search, tab: activeTab })
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(getApiErrorMessage(err, 'Unable to load records'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = window.setTimeout(loadData, 250);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page, pageKey, search]);

  const actions = enableDocumentVerification
    ? (row) => <VerifyDocumentButton disbursementId={row.id} onVerified={loadData} />
    : undefined;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{data ? `Table: ${data.table}` : 'PostgreSQL records'}</p>
        </div>
        <SearchBox
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
      </div>

      <StatusTabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(value) => {
          setActiveTab(value);
          setPage(1);
        }}
      />

      {error ? (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      {data?.missingColumns.length ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Missing requested columns in actual schema: {data.missingColumns.join(', ')}
        </div>
      ) : null}

      <DataTable columns={data?.columns ?? []} rows={data?.rows ?? []} loading={loading} actions={actions} />

      <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPageChange={setPage} />
    </section>
  );
}
```

- [ ] **Step 2: Manual verify — other pages unaffected**

Open `http://localhost:5173/builders` again. Confirm identical behavior to before this change (no verify button, table loads and paginates as before).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DataPage.jsx
git commit -m "Wire DataPage to optionally render the document-verification action and reload on completion"
```

---

### Task 13: Wire `main.jsx` — enable verification + add the Needs Review tab

**Files:**
- Modify: `frontend/src/main.jsx:42-59`

- [ ] **Step 1: Update the disbursements route**

Change:

```jsx
      {
        path: 'disbursements',
        element: (
          <DataPage
            pageKey="disbursements"
            title="Disbursements"
            tabs={[
              { key: 'pending_ops', label: 'Pending on Ops' },
              { key: 'pending_finance', label: 'Pending on Finance' },
              { key: 'changes_requested', label: 'Changes Requested' },
              { key: 'approved', label: 'Approved' },
              { key: 'acknowledged', label: 'Acknowledged' },
              { key: 'rejected', label: 'Rejected' },
              { key: 'paid', label: 'Paid' }
            ]}
          />
        )
      },
```

to:

```jsx
      {
        path: 'disbursements',
        element: (
          <DataPage
            pageKey="disbursements"
            title="Disbursements"
            enableDocumentVerification
            tabs={[
              { key: 'pending_ops', label: 'Pending on Ops' },
              { key: 'pending_finance', label: 'Pending on Finance' },
              { key: 'changes_requested', label: 'Changes Requested' },
              { key: 'approved', label: 'Approved' },
              { key: 'acknowledged', label: 'Acknowledged' },
              { key: 'rejected', label: 'Rejected' },
              { key: 'paid', label: 'Paid' },
              { key: 'needs_review', label: 'Needs Review' }
            ]}
          />
        )
      },
```

- [ ] **Step 2: Manual verify — full happy path (still without a real Python service, confirms wiring only)**

With both `npm run dev --prefix backend` and `npm run dev --prefix frontend` running:

1. Open `http://localhost:5173/disbursements`.
2. Confirm an "Actions" column with a "Verify Document" button appears on every row.
3. Confirm a "Needs Review" tab appears alongside the existing ones, and clicking it loads (empty) without error.
4. Click "Verify Document" on any row, pick any small file. Confirm the button shows "Verifying..." then an error message appears (expected — no `VERIFY_SERVICE_URL` is configured yet, that's Task 14). Confirm the row's `status` is unchanged after this (no partial write).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.jsx
git commit -m "Enable document verification and add Needs Review tab on the Disbursements page"
```

---

### Task 14: Deploy the Python service on Kaggle and run one real end-to-end test

This task requires an actual Kaggle GPU session and cannot be scripted — it is the manual validation that closes the loop.

**Files:** none (deployment + `backend/.env` config only)

- [ ] **Step 1: Upload/sync the `verify_docs` repo to a new Kaggle notebook**, add the GPU accelerator (T4 ×1 or ×2 per `README.md`'s GPU notes), and run:

```bash
pip install -r requirements.txt
python kaggle_launch.py
```

Expected: console prints `verify_docs API is public at: https://<random>.ngrok-free.app` (or similar) and stays running (uvicorn log lines follow).

- [ ] **Step 2: Point the backend at it**

Add to `D:\Loan Networks\backend\.env` (append, do not remove existing lines):

```
VERIFY_SERVICE_URL=https://<the-ngrok-url-from-step-1>
```

Restart the backend dev server so the new env var loads.

- [ ] **Step 3: Real end-to-end test**

Pick a real Pending-on-Ops row on `http://localhost:5173/disbursements` (e.g. the Zainab Medicals case, or disbursement 592 used throughout this plan). Click "Verify Document" and upload:

- A document that **matches** the case's real values → expect the row moves out of Pending on Ops with `status = approved` (confirm via the Approved tab or a direct query).
- A document with **one deliberately wrong field** (e.g. wrong customer name) → expect `status = changes_requested`, and `rejected_reason` contains a comment naming that field.
- If available, a document with an **ambiguous amount** (digit/word conflict) → expect `status = needs_review`, visible under the new Needs Review tab.

- [ ] **Step 4: Commit the .env change note**

`.env` itself should not be committed (already covered by `.gitignore` per the project's existing setup — confirm with `git check-ignore backend/.env` before proceeding; if it's not ignored, do not commit it, since it holds the real database password). No code changes in this task to commit beyond what Tasks 1-13 already committed.

---

## Self-Review Notes

- **Spec coverage:** every component in the spec (`api.py`, Express join+write-back, "Verify Document" button, Needs Review tab, Kaggle+ngrok deployment) maps to a task above (Tasks 3, 7-8, 9-13, 4/14 respectively).
- **Type consistency checked:** `VerifyResult` (verdict/comments/extracted) is defined once in `verifyService.ts` (Task 7) and consumed with the same field names in `verifyController.ts` (Task 8) and `VerifyDocumentButton.jsx`/`DataPage.jsx` (Tasks 11-12) — no renamed fields across tasks. `ExpectedFields` field names match exactly what Task 3's `api.py` test expects as the `expected` JSON shape.
- **No placeholders:** every step above contains complete, runnable code or an exact command with expected output — confirmed by re-reading each task.
