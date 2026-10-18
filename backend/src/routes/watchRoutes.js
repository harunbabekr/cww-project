import { Router } from 'express';
import { listVideos, getVideo, getTrack, createVideo, deleteVideo, requestDubbing, getJobs, requestTranslation, getStatus } from '../controllers/watchController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const staff = authorize('admin', 'moderator');
const router = Router();
router.use(protect);
router.get('/', listVideos);
router.post('/', staff, createVideo);
router.get('/:id', getVideo);
router.get('/:id/track/:lang', getTrack);
router.get('/:id/status', getStatus);
router.post('/:id/request', requestTranslation);
router.get('/:id/jobs', staff, getJobs);
router.post('/:id/dub', staff, requestDubbing);
router.delete('/:id', staff, deleteVideo);
export default router;
