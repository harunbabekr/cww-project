import { Router } from 'express';
import { submitTicket, listMyTickets, listAllTickets, updateTicket, rateApp, getMyRating, ratingSummary } from '../controllers/supportController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = Router();
router.use(protect);
router.post('/tickets', submitTicket);
router.get('/tickets/mine', listMyTickets);
router.get('/tickets', authorize('admin', 'moderator'), listAllTickets);
router.patch('/tickets/:id', authorize('admin', 'moderator'), updateTicket);
router.put('/rating', rateApp);
router.get('/rating', getMyRating);
router.get('/rating/summary', ratingSummary);
export default router;
