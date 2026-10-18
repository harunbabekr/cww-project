import { Router } from 'express';
import {
  listDialects, searchDialect, addDialectEntry, bulkImport, translate, listPending, reviewEntry, deleteEntry,
  createGroup, updateGroup, deleteGroup,
} from '../controllers/dialectController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const staff = authorize('admin', 'moderator');
const router = Router();
router.use(protect);
router.get('/', listDialects);
router.get('/search', searchDialect);
router.get('/pending', staff, listPending);
router.post('/', addDialectEntry);
router.post('/translate', translate);
router.post('/bulk', staff, bulkImport);
router.post('/groups', staff, createGroup);
router.patch('/groups/:id', staff, updateGroup);
router.delete('/groups/:id', staff, deleteGroup);
router.patch('/:id/review', staff, reviewEntry);
router.delete('/:id', staff, deleteEntry);
export default router;
