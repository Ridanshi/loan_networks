import { withTransaction } from '../config/db.js';

export type CreateDisbursementInput = {
  customerName: string;
  lendingPartnerId: number;
  branchName: string;
  bankApplicationId: string;
  sanctionAmountRupees: number;
  loanAccountNumber: string;
  disbursementAmountRupees: number;
  disbursementDate: string; // YYYY-MM-DD
};

export async function createDisbursement(input: CreateDisbursementInput): Promise<{ disbursementId: number }> {
  return withTransaction(async (client) => {
    const leadResult = await client.query<{ id: number }>(
      `INSERT INTO leads (name, status, inserted_at, updated_at)
       VALUES ($1, 'active', now(), now())
       RETURNING id`,
      [input.customerName]
    );
    const leadId = leadResult.rows[0].id;

    const applicationResult = await client.query<{ id: number }>(
      `INSERT INTO applications (
         lead_id, lending_partner_id, bank_application_id, branch_name,
         sanctioned_amount, inserted_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, now(), now())
       RETURNING id`,
      [leadId, input.lendingPartnerId, input.bankApplicationId, input.branchName, Math.round(input.sanctionAmountRupees * 100)]
    );
    const applicationId = applicationResult.rows[0].id;

    const disbursementResult = await client.query<{ id: number }>(
      `INSERT INTO disbursements (
         application_id, loan_account_number, disbursement_amount,
         disbursement_date, status, pending_approval_role, inserted_at, updated_at
       )
       VALUES ($1, $2, $3, $4, 'pending_approval', 'operations', now(), now())
       RETURNING id`,
      [applicationId, input.loanAccountNumber, Math.round(input.disbursementAmountRupees * 100), input.disbursementDate]
    );

    return { disbursementId: disbursementResult.rows[0].id };
  });
}
