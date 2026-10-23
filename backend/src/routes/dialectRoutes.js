import { Router } from 'express';
import {
  listDialects, searchDialect, addDialectEntry, bulkImport, translate, listPending, reviewEntry, deleteEntry,
  createGroup, updateGroup, deleteGroup, listEntries, updateEntry, bulkDelete,
} from '../controllers/dialectController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const staff = authorize('admin', 'moderator');
const router = Router();
router.use(protect);
router.get('/', listDialects);
router.get('/search', searchDialect);
router.get('/pending', staff, listPending);
router.get('/entries', staff, listEntries);
router.post('/', addDialectEntry);
router.post('/translate', translate);
router.post('/bulk', staff, bulkImport);
router.post('/bulk-delete', staff, bulkDelete);
router.post('/groups', staff, createGroup);
router.patch('/groups/:id', staff, updateGroup);
router.delete('/groups/:id', staff, deleteGroup);
router.patch('/:id/review', staff, reviewEntry);
router.patch('/:id', updateEntry);      // المشرف، أو صاحب اقتراح لم يُعتمد بعد
router.delete('/:id', deleteEntry);     // المشرف، أو صاحب اقتراح لم يُعتمد بعد
export default router;
