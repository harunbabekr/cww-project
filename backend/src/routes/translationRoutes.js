import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { listLanguages, translateText, speechToText, textToSpeech, speechToSpeech, verify, translateMulti } from '../controllers/translationController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();
const limiter = rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: true, legacyHeaders: false });
const audioBody = express.raw({ type: () => true, limit: '10mb' });

router.get('/languages', listLanguages);
router.use(protect, limiter);
router.post('/text', translateText);
router.post('/multi', translateMulti);
router.post('/tts', textToSpeech);
router.post('/verify', verify);
router.post('/stt', audioBody, speechToText);
router.post('/speech', audioBody, speechToSpeech);
export default router;
