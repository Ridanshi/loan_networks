import { Router } from 'express';
import { dashboardController, listController } from '../controllers/dataController.js';
import { allDsaController, btJourneysController } from '../controllers/productController.js';

const router = Router();

router.get('/dashboard', dashboardController);
router.get('/all-dsa/overview', allDsaController);
router.get('/bt-journeys/overview', btJourneysController);
router.get('/:page', listController);

export default router;
