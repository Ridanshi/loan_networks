import type { NextFunction, Request, Response } from 'express';
import { createDisbursement } from '../services/disbursementService.js';

const REQUIRED_FIELDS = [
  'customerName',
  'lendingPartnerId',
  'branchName',
  'bankApplicationId',
  'sanctionAmountRupees',
  'loanAccountNumber',
  'disbursementAmountRupees',
  'disbursementDate'
] as const;

export async function createDisbursementController(req: Request, res: Response, next: NextFunction) {
  try {
    const missing = REQUIRED_FIELDS.filter((field) => req.body[field] === undefined || req.body[field] === '');
    if (missing.length > 0) {
      res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` });
      return;
    }

    const { disbursementId } = await createDisbursement({
      customerName: String(req.body.customerName),
      lendingPartnerId: Number(req.body.lendingPartnerId),
      branchName: String(req.body.branchName),
      bankApplicationId: String(req.body.bankApplicationId),
      sanctionAmountRupees: Number(req.body.sanctionAmountRupees),
      loanAccountNumber: String(req.body.loanAccountNumber),
      disbursementAmountRupees: Number(req.body.disbursementAmountRupees),
      disbursementDate: String(req.body.disbursementDate)
    });

    res.status(201).json({ disbursementId });
  } catch (error) {
    console.error(error);
    next(error);
  }
}
