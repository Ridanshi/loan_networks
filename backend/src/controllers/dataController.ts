import type { Request, Response, NextFunction } from 'express';
import { getDashboardSummary, getDisbursementsList, getPageData } from '../services/dataService.js';
import { type PageKey, tableConfigs } from '../services/tableConfig.js';

export async function dashboardController(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getDashboardSummary());
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function listController(req: Request, res: Response, next: NextFunction) {
  try {
    const pageKey = req.params.page as PageKey;

    if (!tableConfigs[pageKey]) {
      res.status(404).json({ message: `Unknown page: ${pageKey}` });
      return;
    }

    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.limit || req.query.pageSize || 20), 1), 100);
    const listOptions = {
      search: String(req.query.search || ''),
      tab: req.query.tab ? String(req.query.tab) : req.query.status ? String(req.query.status) : undefined,
      page,
      pageSize
    };

    const data =
      pageKey === 'disbursements' ? await getDisbursementsList(listOptions) : await getPageData(pageKey, listOptions);

    res.json(data);
  } catch (error) {
    console.error(error);
    next(error);
  }
}
