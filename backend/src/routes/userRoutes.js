import express, { Router } from 'express';
import { updateSettings, changePassword, searchUsers, getMyInvite, uploadVoice, removeVoice, getPushKey, subscribePush, subscribeFcm, unsubscribeFcm, unsubscribePush } from '../controllers/userController.js';
import rateLimit from 'express-rate-limit';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();
router.use(protect);
router.patch('/me/settings', updateSettings);
router.patch('/me/password', changePassword);
router.get('/search', rateLimit({ windowMs: 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false }), searchUsers);
router.get('/me/invite', getMyInvite);
router.post('/me/voice', express.raw({ type: () => true, limit: '15mb' }), uploadVoice);
router.delete('/me/voice', removeVoice);
router.get('/push/key', getPushKey);
router.post('/push/subscribe', subscribePush);
router.post('/push/unsubscribe', unsubscribePush);
router.post('/push/fcm', subscribeFcm);
router.delete('/push/fcm', unsubscribeFcm);
export default router;
