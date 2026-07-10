import type { NextFunction, Request, Response } from 'express';
import { getBtJourneys } from '../services/btJourneyService.js';
import { getDsaOverview } from '../services/dsaService.js';

export async function allDsaController(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);

    res.json(
      await getDsaOverview({
        page,
        limit,
        search: String(req.query.search || ''),
        tab: req.query.tab ? String(req.query.tab) : undefined,
        type: req.query.type ? String(req.query.type) : undefined,
        cityId: req.query.cityId ? String(req.query.cityId) : undefined
      })
    );
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function btJourneysController(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);

    res.json(
      await getBtJourneys({
        page,
        limit,
        search: String(req.query.search || '')
      })
    );
  } catch (error) {
    console.error(error);
    next(error);
  }
}
