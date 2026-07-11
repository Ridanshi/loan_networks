import { Router } from 'express';
import multer from 'multer';
import { getDocumentController, verifyDocumentController } from '../controllers/verifyController.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = Router();

router.post('/disbursements/:id/verify-document', upload.single('document'), verifyDocumentController);
router.get('/disbursements/:id/document', getDocumentController);

export default router;
