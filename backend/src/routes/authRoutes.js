import { Router } from 'express';
import { register, verifyCode, login, forgotPassword, resetPassword, getMe } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();
router.post('/register', register);
router.post('/verify', verifyCode);
router.post('/login', login);
router.post('/forgot', forgotPassword);
router.post('/reset', resetPassword);
router.get('/me', protect, getMe);
export default router;
