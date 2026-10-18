import { Router } from 'express';
import { createConversation, listConversations, getMessages, sendMessage, addMembers, leaveGroup } from '../controllers/conversationController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();
router.use(protect);
router.get('/', listConversations);
router.post('/', createConversation);
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendMessage);
router.post('/:id/members', addMembers);
router.post('/:id/leave', leaveGroup);
export default router;
