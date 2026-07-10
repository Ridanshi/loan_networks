# Database Analysis

## Current Workspace Finding

No PostgreSQL schema export (`schema.sql`, `.sql`, `.dump`, or `.backup`) or database credentials were present in `D:\Loan Networks` at project creation time. Because of that, the real database could not be inspected before implementation.

This dashboard does not create or assume mock tables. It includes a live database analysis script at `backend/src/scripts/analyzeDatabase.ts` that inspects PostgreSQL system catalogs after `DATABASE_URL` is configured.

Run:

```bash
npm run analyze:db
```

The generated live mapping will be written to `docs/generated-database-map.md`.

## Tables Expected From Prompt

These tables are used by the dashboard only if they exist in the configured database:

| Component | Table |
| --- | --- |
| Dashboard total projects | `projects` |
| Dashboard total builders | `builders` |
| Dashboard total bankers | `bankers` |
| Dashboard total lending partners | `lending_partners` |
| Dashboard total disbursements | `disbursements` |
| Dashboard total DSA invoices | `dsa_invoices` |
| Dashboard total collections | `collections` |
| Dashboard total payouts | `payouts` |
| Projects page | `projects` |
| Builders page | `builders` |
| Bankers page | `bankers` |
| Lending Partners page | `lending_partners` |
| Disbursements page | `disbursements` |
| DSA Invoices page | `dsa_invoices` |
| Collections page | `collections` |
| Payouts page | `payouts` |
| Commission Approvals page | `commission_approvals` |

## Queries Used By Pages

The backend verifies table and column existence against `information_schema` before running page queries.

Dashboard counts:

```sql
SELECT COUNT(*)::int AS count FROM <table>;
```

List pages:

```sql
SELECT <verified_columns>
FROM <table>
WHERE <searchable_columns>::text ILIKE $1
ORDER BY id DESC NULLS LAST
LIMIT $2 OFFSET $3;
```

Disbursement tabs:

```sql
-- pending_ops
WHERE pending_approval_role = 'operations'

-- pending_finance
WHERE pending_approval_role IN ('finance', 'finance_manager')

-- changes_requested
WHERE status = 'changes_requested'

-- approved
WHERE status = 'approved'

-- acknowledged
WHERE acknowledgment_status = 'acknowledged'

-- rejected
WHERE status = 'rejected'

-- paid
WHERE primary_payout_status = 'paid'
```

DSA invoice tabs:

```sql
-- approved
WHERE status = 'approved'

-- paid
WHERE status = 'paid'
```

## Relationships And Foreign Keys

Relationships and foreign keys must be generated from the live database because no schema export was available.

The analysis script discovers them with:

```sql
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public';
```

## Assumptions

- The application connects to PostgreSQL through `DATABASE_URL`.
- The requested business tables live in the `public` schema.
- Prompt-provided component mappings are treated as intended mappings until the live schema proves otherwise.
- Missing columns are documented by the API response metadata and omitted from result rows.
