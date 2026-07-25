import { query } from '../config/db.js';

// The Python service is async: /verify enqueues + returns a job_id fast,
// /result/{job_id} reports status. We poll here instead of holding one long
// HTTP request open — free-tier tunnels (ngrok ~60s, Cloudflare ~100s) cap
// single requests well below the 2-14 min the VLM pipeline can take, so a
// single-shot call would fail on any tunnel that isn't paid. Every request
// this file makes now finishes in well under a second.
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_DURATION_MS = 30 * 60 * 1000;
const TUNNEL_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

type SubmitResponse = { job_id: string; status: 'running' };
type PollResponse =
  | { job_id: string; status: 'running' }
  | { job_id: string; status: 'done'; result: VerifyResult }
  | { job_id: string; status: 'error'; error: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Amounts are stored in paise — divide by 100 here, matching the same
// convention already used in verify_docs/db_lookup.py.
// loan_type prefers loan_types.display_name via leads.loan_type_id, falling
// back to applications.loan_type (a plain text column this staging DB has —
// production doesn't) since loan_type_id is NULL on some seeded test leads.
// LEFT JOIN (not JOIN) on loan_types so a missing FK doesn't drop the whole row.
const EXPECTED_FIELDS_SQL = `
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
    disbursement_date: new Date(row.disbursement_date).toISOString().slice(0, 10),
    loan_type: row.loan_type ?? ''
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
  formData.append('document', new Blob([new Uint8Array(fileBuffer)]), filename);

  const submitResponse = await fetch(`${verifyServiceUrl}/verify`, {
    method: 'POST',
    headers: TUNNEL_HEADERS,
    body: formData
  });

  if (!submitResponse.ok) {
    const text = await submitResponse.text();
    throw new Error(`verify_docs submit returned ${submitResponse.status}: ${text}`);
  }

  const { job_id } = (await submitResponse.json()) as SubmitResponse;

  const deadline = Date.now() + MAX_POLL_DURATION_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const pollResponse = await fetch(`${verifyServiceUrl}/result/${job_id}`, {
      headers: TUNNEL_HEADERS
    });

    if (!pollResponse.ok) {
      const text = await pollResponse.text();
      throw new Error(`verify_docs poll returned ${pollResponse.status}: ${text}`);
    }

    const body = (await pollResponse.json()) as PollResponse;

    if (body.status === 'done') {
      return body.result;
    }
    if (body.status === 'error') {
      throw new Error(`verify_docs pipeline error: ${body.error}`);
    }
    // status === 'running' → loop and poll again
  }

  throw new Error(`verify_docs job ${job_id} did not complete within ${MAX_POLL_DURATION_MS / 60_000} minutes`);
}

// rejected_reason and notes are both varchar(255) — a multi-field mismatch
// comment easily exceeds that, which fails the UPDATE outright.
const COMMENT_COLUMN_MAX_LENGTH = 255;

function truncateComments(comments: string): string {
  if (comments.length <= COMMENT_COLUMN_MAX_LENGTH) {
    return comments;
  }

  return `${comments.slice(0, COMMENT_COLUMN_MAX_LENGTH - 1)}…`;
}

export async function saveDocument(
  disbursementId: number,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  result: VerifyResult
): Promise<void> {
  await query(
    `INSERT INTO disbursement_documents (disbursement_id, filename, mime_type, file_data, verdict, comments)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [disbursementId, filename, mimeType, fileBuffer, result.verdict, result.comments.join('\n')]
  );
}

export type StoredDocument = {
  filename: string;
  mime_type: string;
  file_data: Buffer;
};

export async function getLatestDocument(disbursementId: number): Promise<StoredDocument | null> {
  const result = await query<StoredDocument>(
    `SELECT filename, mime_type, file_data
     FROM disbursement_documents
     WHERE disbursement_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [disbursementId]
  );

  return result.rows[0] ?? null;
}

export async function applyVerdict(disbursementId: number, result: VerifyResult): Promise<void> {
  const comments = truncateComments(result.comments.join('\n'));

  // Each verdict owns clearing the other verdicts' fields too — otherwise a
  // stale rejected_reason/notes from a prior run lingers after a re-verify
  // flips the status to something that field no longer applies to.
  if (result.verdict === 'APPROVED') {
    await query(
      'UPDATE disbursements SET status = $1, approved_datetime = now(), rejected_reason = NULL, notes = NULL WHERE id = $2',
      ['approved', disbursementId]
    );
  } else if (result.verdict === 'CHANGES_REQUESTED') {
    await query(
      'UPDATE disbursements SET status = $1, rejected_reason = $2, notes = NULL, approved_datetime = NULL WHERE id = $3',
      ['changes_requested', comments, disbursementId]
    );
  } else {
    await query(
      'UPDATE disbursements SET status = $1, notes = $2, rejected_reason = NULL, approved_datetime = NULL WHERE id = $3',
      ['needs_review', comments, disbursementId]
    );
  }
}
