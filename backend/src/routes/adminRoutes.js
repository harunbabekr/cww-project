import { Router } from 'express';
import { stats, listUsers, updateUser } from '../controllers/adminController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = Router();
router.use(protect);
router.get('/stats', authorize('admin', 'moderator'), stats);
router.get('/users', authorize('admin'), listUsers);
router.patch('/users/:id', authorize('admin'), updateUser);
export default router;
