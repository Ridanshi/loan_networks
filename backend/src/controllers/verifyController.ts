import type { NextFunction, Request, Response } from 'express';
import { applyVerdict, buildExpectedFields, callVerifyService, getLatestDocument, saveDocument } from '../services/verifyService.js';

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
    await saveDocument(disbursementId, req.file.buffer, req.file.originalname, req.file.mimetype, result);

    res.json(result);
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function getDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    const disbursementId = Number(req.params.id);
    if (!Number.isInteger(disbursementId)) {
      res.status(400).json({ message: `Invalid disbursement id: ${req.params.id}` });
      return;
    }

    const document = await getLatestDocument(disbursementId);
    if (!document) {
      res.status(404).json({ message: `No document has been uploaded for disbursement ${disbursementId}` });
      return;
    }

    res.set('Content-Type', document.mime_type);
    res.set('Content-Disposition', `inline; filename="${document.filename}"`);
    res.send(document.file_data);
  } catch (error) {
    console.error(error);
    next(error);
  }
}
