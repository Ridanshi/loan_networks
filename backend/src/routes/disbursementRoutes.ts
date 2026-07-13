import { Router } from 'express';
import { createDisbursementController } from '../controllers/disbursementController.js';

const router = Router();

router.post('/disbursements', createDisbursementController);

export default router;
