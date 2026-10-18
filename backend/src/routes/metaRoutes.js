import { Router } from 'express';
import { features, ice } from '../controllers/metaController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();
router.get('/features', features);
router.get('/ice', protect, ice);
export default router;
