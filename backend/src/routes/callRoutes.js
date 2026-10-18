import { Router } from 'express';
import { history, clearHistory } from '../controllers/callController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();
router.use(protect);
router.get('/history', history);
router.delete('/history', clearHistory);
export default router;
