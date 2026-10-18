import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { preview, accept } from '../controllers/inviteController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();
router.use(rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
router.get('/:code', preview);
router.post('/:code/accept', protect, accept);
export default router;
