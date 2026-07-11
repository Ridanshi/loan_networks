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

// rejected_reason and notes are both varchar(255) — a multi-field mismatch
// comment easily exceeds that, which fails the UPDATE outright.
const COMMENT_COLUMN_MAX_LENGTH = 255;

function truncateComments(comments: string): string {
  if (comments.length <= COMMENT_COLUMN_MAX_LENGTH) {
    return comments;
  }

  return `${comments.slice(0, COMMENT_COLUMN_MAX_LENGTH - 1)}…`;
}

export async function applyVerdict(disbursementId: number, result: VerifyResult): Promise<void> {
  const comments = truncateComments(result.comments.join('\n'));

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
