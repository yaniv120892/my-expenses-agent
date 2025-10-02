import { Router } from 'express';
import { ExtractionController } from '../controllers/extractionController';

const router = Router();
const extractionController = new ExtractionController();

router.post('/extract', extractionController.extractData.bind(extractionController));
router.get('/health', extractionController.healthCheck.bind(extractionController));

export default router;
