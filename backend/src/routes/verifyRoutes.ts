import { Router } from 'express';
import multer from 'multer';
import { verifyDocumentController } from '../controllers/verifyController.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = Router();

router.post('/disbursements/:id/verify-document', upload.single('document'), verifyDocumentController);

export default router;
