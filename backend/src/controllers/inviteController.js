import User from '../models/User.js';
import Contact from '../models/Contact.js';
import { AppError } from '../middlewares/errorHandler.js';
import { linkUsers, shapeContact } from '../services/contactService.js';
import { isOnline } from '../sockets/presence.js';

const findInviter = async (code) => {
  const c = String(code || '').toLowerCase().trim();
  if (!/^[a-z0-9]{6,16}$/.test(c)) return null;
  return User.findOne({ inviteCode: c, isVerified: true, isActive: true });
};

// GET /invite/:code (عام) — لعرض «فلان يدعوك» قبل التسجيل
export const preview = async (req, res) => {
  const inviter = await findInviter(req.params.code);
  if (!inviter) throw new AppError('رابط الدعوة غير صالح', 404);
  res.json({ success: true, inviter: { name: inviter.name } });
};

// POST /invite/:code/accept — يُضيف الداعي والمدعو لبعضهما
export const accept = async (req, res) => {
  const inviter = await findInviter(req.params.code);
  if (!inviter) throw new AppError('رابط الدعوة غير صالح', 404);
  if (String(inviter._id) === String(req.user._id)) throw new AppError('هذا رابط دعوتك أنت', 400);

  const { createdForOther } = await linkUsers(req.user._id, inviter._id);
  if (createdForOther) req.app.get('io')?.to(`user:${inviter._id}`).emit('contact:added', { id: String(req.user._id), name: req.user.name, phone: req.user.fullPhone });

  const doc = await Contact.findOne({ owner: req.user._id, contact: inviter._id }).populate('contact', 'name fullPhone settings');
  res.json({ success: true, contact: shapeContact(doc, isOnline) });
};
