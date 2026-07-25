# Loan Networks — AI Document Verification System

**Project documentation for internal review and handover.**

---

## Table of Contents
1. [What This Project Does](#1-what-this-project-does)
2. [System Architecture](#2-system-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Loan Networks — The Admin Website](#4-loan-networks--the-admin-website)
5. [Verify Docs — The AI Service](#5-verify-docs--the-ai-service)
6. [How the Two Codebases Communicate](#6-how-the-two-codebases-communicate)
7. [The Async Architecture](#7-the-async-architecture)
8. [Networking — Kaggle + Ngrok](#8-networking--kaggle--ngrok)
9. [Database Schema](#9-database-schema)
10. [Accuracy Testing Results](#10-accuracy-testing-results)
11. [Where Things Stand](#11-where-things-stand)
12. [In-House Deployment Roadmap](#12-in-house-deployment-roadmap)
13. [Everyday Operations Guide](#13-everyday-operations-guide)

---

## 1. What This Project Does

The Loan Networks admin dashboard lets loan-operations staff review disbursement cases, upload the borrower's loan documents (sanction letters, disbursement letters, banker confirmations), and have an AI system automatically verify whether the document's fields match what's stored in the company's database.

Before this project, staff had to open every document by hand, compare each field against the internal system's values, and manually mark the case APPROVED or CHANGES_REQUESTED. This project automates that entire review workflow.

The AI reads the uploaded document, extracts 9 key fields (customer name, bank, amounts, dates, account numbers, etc.), compares them against the "expected" values already in the database, and returns one of three verdicts:

- **APPROVED** — all fields match, the case is auto-approved.
- **CHANGES_REQUESTED** — one or more fields don't match, with a specific plain-English explanation of what's wrong.
- **NEEDS_REVIEW** — the document's amount fields are genuinely ambiguous (digits and words disagree in a way the system can't resolve), and a human needs to look at it.

The verdict is written directly to the database. **There is no human confirmation step** — this was a deliberate design choice, accepted as a known risk, to save staff time. The upside: what used to take 3-5 minutes per document per staff member now happens automatically in about 4-5 minutes without any human involvement.

---

## 2. System Architecture

There are **two separate codebases**, hosted in two separate GitHub repositories:

| Codebase | Repo | Purpose | Runs on |
|---|---|---|---|
| **Loan Networks** | `github.com/Ridanshi/loan_networks` | The admin website + backend + database logic | Any laptop/server with Node.js |
| **Verify Docs** | `github.com/Ridanshi/verify_docs` | The AI vision-language model service | A machine with an NVIDIA GPU (currently a Kaggle notebook) |

They communicate over HTTPS. Kept separate on purpose so the AI service is reusable across projects and doesn't get coupled to any specific database schema.

### High-level flow

```
Ops staff's browser
        │
        │  Click "Verify Document", pick a PDF
        ▼
Loan Networks frontend (React on port 5173)
        │
        │  POST /api/disbursements/42/verify-document (file upload)
        ▼
Loan Networks backend (Node/Express on port 4000)
        │
        │  1. Look up "correct" values for disbursement #42 from Postgres
        │  2. Package (expected JSON + document PDF) as multipart form
        │  3. POST to ngrok tunnel URL
        ▼
Ngrok tunnel (public HTTPS URL)
        │
        │  Forwards request to the Kaggle notebook
        ▼
Verify Docs FastAPI service (Kaggle GPU)
        │
        │  1. Enqueue as async job, return job_id immediately
        │  2. Run the AI pipeline in a background thread
        ▼
Backend polls GET /result/{job_id} every 1-3 seconds
        │
        │  When AI is done, gets verdict + comments
        ▼
Backend writes verdict directly to Postgres disbursements table
        │
        │  Response sent to browser
        ▼
Frontend re-fetches the table, ops staff sees the new status
```

---

## 3. Tech Stack

### Loan Networks (admin site)

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend framework** | React 18 | Component-based UI |
| **Frontend build tool** | Vite | Fast dev server + production bundling |
| **Frontend styling** | Tailwind CSS | Utility-first CSS classes |
| **Frontend routing** | React Router | Client-side URL routing |
| **Backend runtime** | Node.js 22 | Server-side JavaScript |
| **Backend framework** | Express | HTTP routing and middleware |
| **Backend language** | TypeScript | Type-safe JavaScript, catches bugs at compile time |
| **Backend hot-reload** | tsx watch | Restarts server on `.ts` file changes during development |
| **File upload handling** | Multer | Handles multipart/form-data uploads |
| **Environment config** | dotenv | Loads `.env` file at startup for secrets/config |
| **HTTP client** | Node's built-in fetch (undici) | For calling the AI service over HTTPS |
| **CORS middleware** | cors | Lets frontend on :5173 call backend on :4000 during dev |

### Database

| Component | Technology |
|---|---|
| Database engine | PostgreSQL 15+ |
| Driver | node-postgres (pg) |
| Currently pointed at | `verify_docs_staging` — a local clone of production, used for safe testing |
| Original source | RDS production instance |

### Verify Docs (AI service)

| Layer | Technology | Purpose |
|---|---|---|
| **Language** | Python 3.10+ | Standard for ML workloads |
| **Web framework** | FastAPI | Async HTTP server, JSON API |
| **ASGI server** | Uvicorn | Runs the FastAPI app |
| **Vision model** | Qwen2.5-VL-7B (or 32B) | Reads document images, extracts fields |
| **Model runtime** | HuggingFace Transformers 4.49 | Loads and runs the model |
| **Quantization** | bitsandbytes 4-bit | Fits big models in limited GPU memory |
| **PDF rendering** | PyMuPDF (fitz) | Renders PDF pages to images |
| **Image processing** | Pillow (PIL) | Deskew, sharpen, contrast adjustment |
| **Fuzzy string matching** | rapidfuzz | Handles name/bank variations |
| **Date parsing** | python-dateutil | Standardizes date formats |

### Networking (between the two)

| Component | Purpose |
|---|---|
| Ngrok tunnel (`pyngrok`) | Gives the Kaggle notebook a public HTTPS URL |
| ngrok-skip-browser-warning header | Bypasses free-tier interstitial page |

---

## 4. Loan Networks — The Admin Website

### Folder structure

```
D:\Loan Networks\
├── backend/
│   ├── src/
│   │   ├── server.ts                     Express app entry point
│   │   ├── config/db.ts                  Postgres pool + DATE-column bugfix
│   │   ├── controllers/                  Request handlers
│   │   │   ├── dataController.ts         Generic list/get for all data types
│   │   │   ├── disbursementController.ts Create-new-disbursement endpoint
│   │   │   └── verifyController.ts       Verify-document endpoint
│   │   ├── routes/                       URL-to-controller mapping
│   │   ├── services/                     Business logic + SQL
│   │   │   ├── dataService.ts
│   │   │   ├── disbursementService.ts    New-disbursement (multi-table transaction)
│   │   │   ├── verifyService.ts          ★ Verify-document orchestrator
│   │   │   └── ...
│   │   └── scripts/                      Utility scripts (schema analysis, etc.)
│   ├── .env                              DB creds, VERIFY_SERVICE_URL (gitignored)
│   └── package.json
│
├── frontend/
│   └── src/
│       ├── main.jsx                      React entry
│       ├── App.jsx                       Router + layout
│       ├── components/
│       │   ├── DataTable.jsx             Generic sortable/filterable table
│       │   ├── VerifyDocumentButton.jsx  ★ Upload + verify button
│       │   ├── AddDisbursementModal.jsx  Create-disbursement modal
│       │   ├── StatusTabs.jsx            Status filter tabs
│       │   ├── Sidebar.jsx / SearchBox.jsx / Pagination.jsx
│       ├── pages/
│       │   ├── DataPage.jsx              ★ Main list page (used for all data types)
│       │   ├── Dashboard.jsx / etc.
│       └── services/api.js               All backend API calls
│
├── docs/                                 Planning notes
└── PROJECT_DOCUMENTATION.md              This file
```

### What each backend service does

**`verifyService.ts`** — the heart of the verification feature. Three main functions:

- `buildExpectedFields(disbursementId)` — runs a SQL query joining `disbursements`, `applications`, `leads`, `lending_partners`, and `loan_types` to gather the "correct" values for a case. Amounts are stored in paise (₹1 = 100 paise), so divides by 100. Uses `LEFT JOIN` on `loan_types` so rows with NULL loan_type_id aren't dropped.
- `callVerifyService(expected, fileBuffer, filename)` — submits to the AI service, then polls the result endpoint every 3 seconds until done. Uses the async job pattern to survive free-tier tunnel timeouts.
- `applyVerdict(disbursementId, result)` — writes the verdict to Postgres. Always clears the OTHER verdicts' fields (e.g. clears `rejected_reason` and `notes` when marking APPROVED) to prevent stale text from a previous verification lingering.

**`disbursementService.ts`** — new feature added this session. Lets ops staff create a fresh disbursement case directly from the website. Wraps three inserts (leads → applications → disbursements) in a Postgres transaction so partial failures don't leave orphaned rows.

**`dataService.ts`** — generic list/search/filter for all the data types (leads, applications, disbursements, DSA records, BT journeys). Used by the main data-browsing page.

### What each frontend component does

- **`DataPage.jsx`** — the main list page. Used for Disbursements, Leads, Applications, etc. Shows sortable table, tabs (Pending / Approved / Changes Requested / Needs Review), search, pagination.
- **`DataTable.jsx`** — the actual table. Extended in this project to support:
  - An "Actions" column (for the Verify button)
  - Click-to-expand cells for long text (like AI-generated mismatch comments)
- **`VerifyDocumentButton.jsx`** — the upload-and-verify button. Opens file picker, POSTs the file, shows "Verifying..." until backend responds, then triggers a table refresh.
- **`AddDisbursementModal.jsx`** — popup form for creating a new disbursement case.

### Bugs fixed in this project

- **PostgreSQL DATE column timezone shift**: Postgres DATE was being parsed into a JS Date at midnight local time, then `.toISOString()` shifted it back a day in IST. Fixed by registering a custom type parser in `db.ts` that returns DATE columns as plain strings.
- **Missing rows in disbursement list**: Used `INNER JOIN` on `loan_types`, which silently dropped rows where `loan_type_id` was NULL. Changed to `LEFT JOIN` + `COALESCE(lt.display_name, a.loan_type)` fallback.
- **Comment overflow crash**: `rejected_reason` and `notes` are `varchar(255)`. Long AI-generated multi-mismatch comments exceeded that, failing the UPDATE. Added `truncateComments()` to trim to 254 chars + ellipsis.
- **Stale verdict fields**: If a document was re-verified and the new verdict was different, old text (e.g. an old rejection reason) stayed in the database. Fixed so each verdict-write clears the fields belonging to the other verdicts.
- **Ngrok interstitial page**: Free-tier ngrok returns an HTML browser-warning page instead of proxying requests, unless the caller sends the `ngrok-skip-browser-warning: true` header. Added to all outbound fetch calls.

---

## 5. Verify Docs — The AI Service

Lives in a separate Python codebase (`github.com/Ridanshi/verify_docs`). No database code — the AI service is fully stateless from the DB perspective. The caller (the Loan Networks backend) supplies the "expected" values along with the document; the AI service just extracts + compares + returns a verdict.

### File structure (relevant files only)

```
Verify Docs/
├── api.py                  ★ FastAPI wrapper — the HTTP entry point
├── preprocessor.py         Turns PDF/JPG/PNG → clean PIL image
├── extractor.py            ★ Prompts the model, extracts 9 fields
├── comparator.py           ★ Compares extracted vs expected, decides verdict
├── normalizer.py           Standardizes amounts, dates, text
├── config.py               Model ID, thresholds, LAN patterns per lender
├── kaggle_launch.py        Kaggle-side launcher (starts uvicorn + ngrok)
├── tests/
│   ├── test_api.py
│   ├── test_comparator.py
│   ├── test_normalizer.py
│   ├── test_preprocessor.py
│   └── test_database.py
├── synthetic/
│   ├── generate.py                       150-doc synthetic benchmark
│   ├── generate_amount_stress.py         10-doc digit-drop stress test
│   └── generate_field_swap_stress.py     15-doc field-mislabel stress test
├── eval.py
├── eval_amount_stress.py
├── eval_field_swap_stress.py
└── requirements.txt
```

### The pipeline — what happens to a document, step by step

| # | File | What it does |
|---|---|---|
| 1 | `preprocessor.py` | PDFs → PyMuPDF renders page 1 at 200 DPI. Photos → PIL opens the image. Both get resized to max 1120px on the longest side. Photos also get deskewed and sharpened. |
| 2 | `extractor.py` | Builds a detailed prompt describing all 9 fields (with field-anchor labels like "look after 'Dear' or 'Customer Name'"). Sends image + prompt to Qwen2.5-VL. Model returns JSON with the 9 fields. |
| 3 | `extractor.py` | **Second high-resolution pass** on the amount fields only (`refine_amount_fields`). Uses a 2000px version of the image and a focused amount-only prompt. Catches digit-drop errors from pass #1. |
| 4 | `normalizer.py` | Converts "Rs.63.50 lakhs" → `6350000.0`. Converts any date format → `YYYY-MM-DD`. Normalizes company name variants (Ltd = Limited = Ltd. = Pvt Ltd). |
| 5 | `comparator.py` | Cross-checks amount digits against amount-in-words. If they agree, use words (authoritative). If they differ by a 10× or 100× factor, words recover the dropped zeros. If genuinely ambiguous, return NEEDS_REVIEW. |
| 6 | `comparator.py` | Field-by-field comparison against expected values, using the right method per field: fuzzy match for names (85% threshold), exact for account numbers, digit-comparison for amounts, ISO-date match for dates. |
| 7 | `comparator.py` | Verdict decision: APPROVED (all match), CHANGES_REQUESTED (mismatches, with plain-English comments), NEEDS_REVIEW (ambiguous amount). |

### The model: Qwen2.5-VL

**7B version** (current): fits comfortably on Kaggle's single T4 GPU (~14 GB VRAM). Faster (2-3 min cold start, 30-60s per doc after that). Slightly lower accuracy on hard cases.

**32B version** (was tried earlier): higher accuracy on digit-heavy and field-swap tests, but sits at the memory edge of Kaggle's T4 x2 free tier — kernels die mid-session unpredictably. Requires `transformers==4.49.0` pin and dual-GPU max-memory map. Swappable back on hardware with ≥24 GB VRAM.

### Why 4-bit quantization

Kaggle's free tier gives you two T4 GPUs (~14.5 GB each). Loading Qwen2.5-VL-32B at full precision (fp16) needs ~64 GB. Even 8-bit needs ~32 GB. Neither fits. **4-bit quantization** via bitsandbytes cuts memory to about a quarter of fp16 — the 32B model loads at ~9.3 GB, which fits on one T4 with headroom. For 7B, 4-bit isn't strictly needed but keeps loading fast and leaves room for the image tensors.

---

## 6. How the Two Codebases Communicate

### The API surface

The Verify Docs service exposes **two HTTP endpoints**:

**`POST /verify`** — submit a document for verification.
```
Body: multipart/form-data
  - expected: JSON string with the 9 expected field values
  - document: file (PDF, JPG, PNG, TIFF)

Response (returns immediately, in <1 second):
  { "job_id": "abc123...", "status": "running" }
```

**`GET /result/{job_id}`** — poll for the outcome.
```
Response while running:
  { "job_id": "abc123...", "status": "running" }

Response when done:
  { "job_id": "abc123...", "status": "done", "result": {
      "verdict": "APPROVED" | "CHANGES_REQUESTED" | "NEEDS_REVIEW",
      "comments": ["...one line per mismatch..."],
      "extracted": { ...the 9 fields the model read... }
  }}

Response on failure:
  { "job_id": "abc123...", "status": "error", "error": "..." }
```

### The wire format for POST /verify

When the backend uploads, HTTP wraps everything in multipart/form-data:

```
POST /verify HTTP/1.1
Host: <ngrok-url>.ngrok-free.dev
Content-Type: multipart/form-data; boundary=----BOUNDARY123
ngrok-skip-browser-warning: true
Content-Length: 179728

------BOUNDARY123
Content-Disposition: form-data; name="expected"

{"customer_name":"Zainab Khan","bank_name":"Mahindra Finance",
 "application_id":"APP12345","sanction_amount":500000,
 "disbursement_amount":500000,"disbursement_date":"2026-01-31",
 "branch":"Andheri","loan_type":"Home Loan",
 "loan_account_number":"LAPSEC468628563"}
------BOUNDARY123
Content-Disposition: form-data; name="document"; filename="loan.pdf"
Content-Type: application/pdf

%PDF-1.4
<... binary PDF bytes ...>
------BOUNDARY123--
```

The AI **model never sees the "expected" values**. Only the FastAPI Python code sees them, and only long enough to pass to `comparator.py` after the model finishes. The model only receives: the image + the extraction prompt.

---

## 7. The Async Architecture

### Why it was needed

The Qwen2.5-VL pipeline takes **2-5 minutes** per verification on Kaggle's free T4 GPU. Free-tier HTTP tunnels impose their own request timeouts:

- Ngrok free tier: ~60 seconds
- Cloudflare Tunnel free tier: ~100 seconds

A traditional "one long HTTP request that holds the connection open until inference is done" approach would fail every time — the tunnel kills the request well before the model finishes.

### The solution

The `/verify` endpoint doesn't do the inference itself. It:

1. Accepts the file upload
2. Saves it to a temp file on the Kaggle disk
3. Generates a job ID (UUID)
4. Spawns a background thread to actually run the pipeline
5. Returns `{ "job_id": "...", "status": "running" }` immediately (well under 1 second)

The backend then polls `GET /result/{job_id}` every 3 seconds. Each poll is a tiny (<100 byte) HTTP request that finishes in <1 second. When the background thread finishes, it stores the result in an in-memory dict keyed by job ID. The next poll returns the result.

### Result

Every individual HTTP request finishes in well under 1 second. No tunnel timeout can kill anything. The 2-5 minute wait is entirely spent on the Kaggle side, invisible to the tunnel.

### Diagram

```
Backend                       Ngrok                Kaggle FastAPI            Kaggle background thread
   │                            │                       │                             │
   │ POST /verify (file) ────>  │ ─────────────────>    │                             │
   │                            │                       │ Save file, create job_id    │
   │                            │                       │ Spawn thread ─────────────> │
   │  <── job_id (< 1s) ────────│  <────────────────────│                             │ Run preprocess
   │                            │                       │                             │ Run model
   │                            │                       │                             │ (2-5 min)
   │                            │                       │                             │
   │ (sleep 3s)                 │                       │                             │
   │                            │                       │                             │
   │ GET /result/{id} ───────>  │ ─────────────────>    │                             │
   │  <── still running ────────│  <────────────────────│                             │
   │                            │                       │                             │
   │ (sleep 3s)                 │                       │                             │
   │ ... repeat ...             │                       │                             │
   │                            │                       │                             │ Store result in dict
   │ GET /result/{id} ───────>  │ ─────────────────>    │                             │
   │  <── done + verdict ───────│  <────────────────────│                             │
   │                            │                       │                             │
   │ Write to Postgres          │                       │                             │
   │ Response to browser        │                       │                             │
```

---

## 8. Networking — Kaggle + Ngrok

### The problem

The Kaggle notebook running FastAPI has no public IP. Nothing outside Kaggle can reach `localhost:8000` on that machine directly. To let the backend on your laptop reach the AI service, we need a **tunnel**.

### Ngrok's role

Ngrok is a service that hands out temporary public URLs and forwards traffic from them to a local port on your machine. The Kaggle side does:

```python
from pyngrok import ngrok, conf
conf.get_default().auth_token = "3C8lSKGici..."
tunnel = ngrok.connect(8000, "http")
print(f"PUBLIC URL: {tunnel.public_url}")
```

Ngrok's servers assign a random subdomain (like `enjoyable-porridge-stench.ngrok-free.dev`), open a persistent TLS connection back to the Kaggle machine, and start routing requests through it.

### Trust model

Ngrok doesn't verify what's on the other side of the tunnel. It only verifies **the authtoken** — a long string that identifies your ngrok account. Anyone with the authtoken can create tunnels billed to that account. Ngrok trusts YOU, not Kaggle.

### The `ngrok-skip-browser-warning` header

Ngrok free tier shows an HTML "you're visiting an ngrok site" warning page to any request without a certain header. This breaks HTTP APIs because the backend gets HTML back instead of JSON. Fixed by adding `ngrok-skip-browser-warning: true` to every outbound fetch from the backend.

### The URL rotation problem

Every time the Kaggle kernel restarts or the ngrok cell is re-run, ngrok assigns a **new random URL**. The old URL dies. Your `backend/.env` still points at the old URL, so the backend fails with "fetch failed" until you manually update `.env` and restart the backend.

This is by design in ngrok's free tier — they want you to upgrade to Personal ($8/mo) which gives you 3 reserved permanent URLs.

### Backend-side handling of the URL

```env
# backend/.env
VERIFY_SERVICE_URL=https://enjoyable-porridge-stench.ngrok-free.dev
```

`dotenv` loads this at Node process startup. The value gets baked into `process.env.VERIFY_SERVICE_URL`. Changing `.env` while the backend is running has NO effect — you must restart the backend for it to pick up the new URL.

---

## 9. Database Schema

Relevant tables in `verify_docs_staging` (a local clone of production):

```
┌─────────────────┐       ┌──────────────────────┐       ┌──────────────────────────────┐
│  leads          │       │  applications        │       │  disbursements               │
│─────────────────│       │──────────────────────│       │──────────────────────────────│
│  id (PK)        │◄──────│  lead_id (FK)        │◄──────│  application_id (FK)         │
│  name           │  1:N  │  id (PK)             │  1:N  │  id (PK)                     │
│  loan_type_id   │       │  branch_name         │       │  disbursement_amount (paise) │
└─────────────────┘       │  bank_application_id │       │  disbursement_date           │
                          │  sanctioned_amount   │       │  loan_account_number         │
                          │  lending_partner_id  │       │  status ★                    │
                          │  loan_type           │       │  approved_datetime ★         │
                          └──────────────────────┘       │  rejected_reason ★           │
                                                        │  notes ★                     │
                                                        └──────────────────────────────┘
                                                                    │
                                                                    │ 1:N
                                                                    ▼
                                                        ┌──────────────────────────────┐
                                                        │  disbursement_documents      │
                                                        │──────────────────────────────│
                                                        │  disbursement_id (FK)        │
                                                        │  filename                    │
                                                        │  mime_type                   │
                                                        │  file_data (bytea)           │
                                                        │  verdict                     │
                                                        │  comments                    │
                                                        │  created_at                  │
                                                        └──────────────────────────────┘

┌──────────────────┐       ┌──────────────────┐
│  lending_partners│       │  loan_types      │
│──────────────────│       │──────────────────│
│  id (PK)         │       │  id (PK)         │
│  name            │       │  display_name    │
└──────────────────┘       └──────────────────┘
```

Fields marked ★ are the ones the AI verify feature writes to:

- **`status`** — enum: `pending`, `approved`, `changes_requested`, `needs_review`
- **`approved_datetime`** — set only when status = `approved`
- **`rejected_reason`** — mismatch details when status = `changes_requested` (varchar 255)
- **`notes`** — AI comments when status = `needs_review` (varchar 255)

The **`disbursement_documents`** table stores the uploaded file itself (as bytea) so ops can view the doc again later.

**Amount storage note**: `sanctioned_amount` and `disbursement_amount` are stored in **paise** (₹1 = 100 paise). The backend divides by 100 before sending to the AI service, since the AI is comparing to whole-rupee values on the document.

---

## 10. Accuracy Testing Results

Three purpose-built test batches (in addition to the general 150-doc benchmark) were used to isolate and verify specific failure modes.

### Test 1 — Amount digit-drop (10 docs)

**The problem**: The model sometimes read ₹50,00,000 as ₹5,00,000 (dropped a zero). This wrongly flagged genuinely-correct docs as NEEDS_REVIEW.

**The fixes**:
1. Added a **second high-resolution pass** on amount fields only — `refine_amount_fields()` in `extractor.py`. Uses a 2000px image (vs 1120px for main pass) and a focused amount-only prompt.
2. Added **digit-vs-words cross-check** in `comparator.py` — Indian loan docs print amounts twice, once in digits and once spelled out. If the two disagree by an obvious factor of 10 or 100, the spelled-out version wins.

**Test batch**: `synthetic/generate_amount_stress.py` — 10 documents with digit-only amounts (no word backup) ranging from ₹5 lakh to ₹5 crore.

**Result**: **10/10 correct, 0 false NEEDS_REVIEW**. Confirmed via actual Kaggle run.

### Test 2 — Customer/Bank field mix-up (15 docs)

**The problem**: The model would put the bank's name into the customer_name field. E.g. mismatch comment said "Customer Name mismatch: document shows 'Mahindra Finance'", when Mahindra Finance is actually the bank.

**The fixes**:
1. **Sharpened prompt field descriptions** — made it explicit which field is which:
   ```
   customer_name — Full name of the loan applicant/borrower.
                   Usually appears after "Dear", "To", "Borrower Name",
                   or "Customer Name".

   bank_name     — Name of the lending institution (the company issuing
                   this letter), e.g. "ABC Finance Ltd", "XYZ Housing
                   Finance". This is the organisation's name, NOT a
                   street address, city, or branch name.
   ```
   Four techniques stacked: different semantic roles (person vs organisation), explicit label anchors ("look after Dear/To/..."), negative constraints ("NOT a street address"), and example formats.

2. **Company-name normalization** in `normalizer.py` — added `_COMPANY_SUFFIX_PATTERNS` that treat "Ltd", "Ltd.", "Limited", "Pvt Ltd", "Private Limited" as equivalent before fuzzy comparison. This is a **general fix** — applies to bank_name, customer_name, branch, loan_type across every lender.

**Test batch**: `synthetic/generate_field_swap_stress.py` — 15 documents, 5 each from Mahindra / Aadhar / HDFC.

**Result**: **0/15 mix-ups across two independent test rounds**. Confirmed via actual Kaggle runs.

### Test 3 — Aadhar template unlabeled date

**The problem**: Aadhar test documents kept failing verification not because of any AI bug, but because the synthetic template printed the disbursement date without a "Disbursement Date:" label. The AI correctly (but unhelpfully) returned null because it couldn't tell which date on the page was the disbursement date.

**The fix**: added the explicit "Disbursement Date:" label to `synthetic/generate.py`'s `build_aadhar_pdf()`.

**Result**: All 5 aadhar test docs went from `disbursement_date: None` to correctly extracted. Confirmed.

### Test 4 (partially fixed) — Single-digit ID misreads

**The problem**: Occasional single-digit misread on `loan_account_number` or `application_id` (e.g. digit 8 read as 6). Confusable digit pairs: 6/8, 1/7, 0/8, 3/8, 5/6.

**Fixes attempted**:
1. **Sharpened prompt wording** — added explicit anti-error instructions: "Read character by character, do not skip/add/transpose a single digit. Watch commonly confused digit pairs (6/8, 1/7, 0/8, 3/8, 5/6). Count total digit length twice before answering." **Kept — this reduced but didn't eliminate misreads.**
2. **Higher base resolution for the main pass** (2000px instead of 1120px). **Tried, caused 100% CUDA OOM failure on Kaggle T4, reverted.**

**Current state**: ~1/15 residual failure rate on ID fields. Not eliminated. A resolution-based fix would work on real hardware with more VRAM — Kaggle's T4 is the limit here, not the technique.

### Testing philosophy

- Every claim was verified with an actual Kaggle run, never assumed from reading code.
- Purpose-built small test batches were used to isolate one failure mode at a time.
- Every fix was checked to be **general** (works for any document, any lender) rather than a per-file patch. Anything that looked like a narrow patch was rejected or reworked.
- When a test failed for a reason OTHER than the one being investigated, the real cause was diagnosed from actual comparator output (`comments` field in `field_swap_stress_results.json`), not guessed from the printed column values.

---

## 11. Where Things Stand

### Working and verified

- End-to-end verification flow: upload → AI reads document → compares to database → verdict written back automatically → UI updates
- Amount digit-drop issue: **fixed and confirmed** (10/10 on dedicated test)
- Customer/bank name mix-up: **fixed and confirmed** (0/15 mix-ups across two rounds)
- Company-name formatting variations (Ltd/Limited/Pvt Ltd): **fixed generally**, not per-lender
- Aadhar template unlabeled date: **fixed**
- Add-Disbursement feature: lets ops staff create a new case directly from the website
- Uploaded document storage: file bytes stored in `disbursement_documents`, viewable later
- Async architecture: survives free-tier tunnel timeouts, tested and working
- Database DATE timezone bug: fixed via custom type parser
- Comment overflow crash: fixed via truncation
- Stale verdict field lingering: fixed by clearing other verdicts' fields on each write
- Missing rows from strict join: fixed via LEFT JOIN + COALESCE

### Known limitations still open

- **~1/15 residual failure rate on ID-field digit misreads** — reduced by prompt sharpening, not fully eliminated. Higher-resolution fix requires more GPU memory than Kaggle's T4 has.
- **Free-tier ngrok URL rotation** — every Kaggle restart requires manually updating `backend/.env` with a new URL. Solved by Ngrok Personal ($8/mo) or moving off the tunnel setup entirely.
- **Kaggle session instability** — kernels occasionally die mid-session for unclear reasons. Not fixable on free tier. Solved by moving off Kaggle (Modal, RunPod, own hardware).
- **No auth on the AI service** — anyone who guesses the ngrok URL can call `/verify`. Fine for testing, needs an auth header for production.
- **AI verify has no human-in-the-loop step** — accepted risk per project decision.

---

## 12. In-House Deployment Roadmap

The current Kaggle + ngrok setup is fine for development and testing. For a real production deployment used by multiple ops staff, three steps needed:

### Move 1 — Get the AI service off Kaggle

Pick based on team size and structure:

**Option A — Own hardware in the office (best for co-located team of 5-30)**
- Buy a ₹35-45k workstation with RTX 3060 12GB or RTX 4060.
- Keep it on your office LAN with a static internal IP.
- Install Docker + the `verify_docs` FastAPI as a container.
- Ops laptops hit `http://verify-service.internal:8000` over LAN.
- Zero recurring cost beyond electricity.

**Option B — Rented dedicated GPU server (best for distributed team)**
- Hetzner GPU dedicated (~₹15,000/month) with a static public IP.
- Point `verify.yourcompany.com` at it via DNS.
- Ops laptops anywhere hit the same HTTPS URL.
- No tunnel, no ngrok, no Kaggle.

**Option C — Serverless GPU (best for bursty/unpredictable load)**
- Modal.com — deploy `verify_docs` as a Modal function.
- ~₹2-3 per verification, permanent HTTPS URL, only charged during inference.
- Cheapest if usage is <200 docs/day.

### Move 2 — Make the service production-grade

- **Persistent job queue** (Redis or a Postgres table) instead of in-memory dict — jobs survive server restarts.
- **Multiple worker processes** — handle 2-5 concurrent verifications instead of one at a time.
- **HTTPS + auth token** — shared secret header the backend sends and the AI service checks. Prevents anyone with the URL from calling `/verify`.
- **Logging + monitoring** — Uptime Kuma or Sentry for alerts when the service is down.

### Move 3 — Wire it into the main app permanently

- Set `VERIFY_SERVICE_URL` once in the backend's production environment (Docker Compose, systemd, whatever the deployment target is).
- Remove the `ngrok-skip-browser-warning` header from `verifyService.ts` since it's no longer tunneled.
- Add health checks — backend periodically pings AI service `/docs`, alerts on failures.

### End state

```
Ops laptop (anywhere)
        │  HTTPS + auth header
        ▼
Loan Networks backend (on a company server)
        │  HTTPS + auth header
        ▼
AI service (RTX 3060 in office / Hetzner rental / Modal)
        │
        ▼
Verdict → Postgres → visible on all laptops
```

No ngrok, no Kaggle, no tunnels. Same codebase you have today — the deployment target is the only change.

---

## 13. Everyday Operations Guide

### Starting a local dev session

**On your laptop, two terminals:**

Terminal 1 — backend:
```bash
cd D:\Loan Networks\backend
npm run dev
```
Should print `API server running on http://localhost:4000`.

Terminal 2 — frontend:
```bash
cd D:\Loan Networks\frontend
npm run dev
```
Should print `Local: http://localhost:5173/`.

Open http://localhost:5173 in your browser.

### Starting the AI service on Kaggle

1. Open your Kaggle notebook.
2. **Settings menu → Accelerator → GPU T4 x2**. (Confirm the checkmark is next to it.)
3. Run cells in order:

**Cell 1 — clone + install:**
```bash
!rm -rf verify_docs && git clone https://github.com/Ridanshi/verify_docs.git
%cd verify_docs
!pip install -r requirements.txt pyngrok -q
```

**Cell 2 — launch FastAPI + open ngrok tunnel:**
```python
import subprocess, time
from pyngrok import ngrok, conf

conf.get_default().auth_token = "YOUR_NGROK_AUTHTOKEN_HERE"

subprocess.Popen(
    ["python", "-m", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"],
    stdout=open("/tmp/api.log", "w"),
    stderr=subprocess.STDOUT,
)
time.sleep(5)

tunnel = ngrok.connect(8000, "http")
print("PUBLIC URL:", tunnel.public_url)
```

**Cell 3 — watch model load:**
```bash
!tail -f /tmp/api.log
```
Wait for `Application startup complete. Uvicorn running on http://0.0.0.0:8000`.

### Updating the backend to point at the new URL

Every time Kaggle restarts, the ngrok URL changes. To point the backend at the new URL:

1. Copy the URL from Cell 2's output.
2. Edit `D:\Loan Networks\backend\.env`:
   ```
   VERIFY_SERVICE_URL=https://the-new-url.ngrok-free.dev
   ```
3. Restart backend: Ctrl+C in the backend terminal, then `npm run dev` again.

### Environment configuration

`D:\Loan Networks\backend\.env`:
```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/verify_docs_staging
PORT=4000
VERIFY_SERVICE_URL=https://<current-ngrok-url>.ngrok-free.dev
```

Never commit `.env` to git — it contains credentials.

### Database

Currently pointed at `verify_docs_staging` — a local clone of production, for safe testing. To point at production, change `DATABASE_URL` in `.env` and restart the backend.

### Ports summary

| Service | Port | Access |
|---|---|---|
| Frontend dev server | 5173 | http://localhost:5173 |
| Backend API server | 4000 | http://localhost:4000 |
| PostgreSQL | 5432 | localhost |
| AI service (on Kaggle) | 8000 (inside Kaggle) → tunneled via ngrok | HTTPS URL from ngrok |

### Common issues and fixes

**"fetch failed" on Verify Document click**
- Kaggle kernel died — restart it.
- Ngrok tunnel URL changed — update `.env`, restart backend.
- Backend hasn't picked up new `.env` — restart backend (dotenv loads once at startup).

**"Verifying..." spinner forever (>5 min)**
- Model still loading on Kaggle — check `!tail -30 /tmp/api.log` for progress.
- Kaggle kernel died mid-inference — restart the whole Kaggle setup.

**"EADDRINUSE" on backend start**
- Another backend process is still holding port 4000. Kill it:
  ```powershell
  Get-NetTCPConnection -LocalPort 4000 -State Listen |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force }
  ```

**Backend log shows "SocketError: other side closed"**
- Ngrok tunnel died or Kaggle uvicorn crashed. Restart Kaggle setup, update `.env`, restart backend.

---

*End of documentation.*
