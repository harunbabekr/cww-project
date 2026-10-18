import User from '../models/User.js';
import DialectDictionary from '../models/DialectDictionary.js';
import ContactTicket from '../models/ContactTicket.js';
import VideoContent from '../models/VideoContent.js';
import Rating from '../models/Rating.js';
import { AppError } from '../middlewares/errorHandler.js';
import { escapeRegex } from '../utils/token.js';

export const stats = async (req, res) => {
  const [users, pendingDialects, openTickets, videos, ratings] = await Promise.all([
    User.countDocuments({ isVerified: true }),
    DialectDictionary.countDocuments({ status: 'pending' }),
    ContactTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
    VideoContent.countDocuments(),
    Rating.countDocuments(),
  ]);
  res.json({ success: true, stats: { users, pendingDialects, openTickets, videos, ratings } });
};

export const listUsers = async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = q ? { $or: ['name', 'email', 'fullPhone'].map((f) => ({ [f]: new RegExp(escapeRegex(q.slice(0, 50)), 'i') })) } : {};
  const users = await User.find({ isVerified: true, ...filter }).sort({ createdAt: -1 }).limit(50).select('name email fullPhone role isActive createdAt');
  res.json({ success: true, users });
};

export const updateUser = async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw new AppError('لا يمكنك تعديل حسابك من هنا', 400);
  const patch = {};
  if (req.body.role) {
    if (!['user', 'moderator', 'admin'].includes(req.body.role)) throw new AppError('دور غير صالح', 400);
    patch.role = req.body.role;
  }
  if (typeof req.body.isActive === 'boolean') patch.isActive = req.body.isActive;
  const user = await User.findByIdAndUpdate(req.params.id, patch, { new: true }).select('name email fullPhone role isActive');
  if (!user) throw new AppError('المستخدم غير موجود', 404);
  res.json({ success: true, user });
};
