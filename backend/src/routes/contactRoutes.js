import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { listContacts, addContact, addMany, matchContacts, updateContact, removeContact } from '../controllers/contactController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();
const matchLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

router.use(protect);
router.get('/', listContacts);
router.post('/', addContact);
router.post('/bulk', addMany);
router.post('/match', matchLimiter, matchContacts);
router.patch('/:id', updateContact);
router.delete('/:id', removeContact);
export default router;
