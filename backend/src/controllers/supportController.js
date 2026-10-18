import ContactTicket from '../models/ContactTicket.js';
import Rating from '../models/Rating.js';
import { AppError } from '../middlewares/errorHandler.js';
import translationService from '../services/translationService.js';
import { notifyUser } from '../services/pushService.js';
import { isSupportedLanguage } from '../utils/languages.js';

const safeTranslate = async (text, from, to) => {
  if (from === to) return text;
  try { return (await translationService.translateText(text, from, to)).translated; } catch { return undefined; }
};

// POST /support/tickets { subject, message, language }
export const submitTicket = async (req, res) => {
  const { subject, message, language = req.user.settings.speakLanguage } = req.body;
  if (!subject?.trim() || !message?.trim()) throw new AppError('الموضوع والرسالة مطلوبان', 400);
  if (!isSupportedLanguage(language) || language === 'auto') throw new AppError('لغة غير مدعومة', 400);

  const ticket = await ContactTicket.create({
    user: req.user._id, name: req.user.name, email: req.user.email,
    subject: subject.trim(), message: message.trim(), language,
    messageAr: await safeTranslate(message.trim(), language, 'ar'),
  });
  res.status(201).json({ success: true, message: 'تم استلام رسالتك بنجاح', id: ticket._id });
};

export const listMyTickets = async (req, res) => {
  const tickets = await ContactTicket.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30);
  res.json({ success: true, tickets });
};

export const listAllTickets = async (req, res) => {
  const filter = req.query.status ? { status: String(req.query.status) } : {};
  const tickets = await ContactTicket.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, tickets });
};

// PATCH /support/tickets/:id { status?, reply? }  — رد المشرف بالعربية يُترجم للغة المستخدم
export const updateTicket = async (req, res) => {
  const ticket = await ContactTicket.findById(req.params.id);
  if (!ticket) throw new AppError('الرسالة غير موجودة', 404);

  if (req.body.status) {
    if (!['open', 'in_progress', 'resolved', 'closed'].includes(req.body.status)) throw new AppError('حالة غير صالحة', 400);
    ticket.status = req.body.status;
  }
  if (req.body.reply?.trim()) {
    ticket.reply = req.body.reply.trim();
    ticket.replyTranslated = await safeTranslate(ticket.reply, 'ar', ticket.language);
    ticket.repliedAt = new Date();
    if (ticket.status === 'open') ticket.status = 'in_progress';
    if (ticket.user) notifyUser(ticket.user, { type: 'support', title: 'رد من إدارة CWW', body: (ticket.replyTranslated || ticket.reply).slice(0, 120), url: '/support' });
  }
  await ticket.save();
  res.json({ success: true, ticket });
};

export const rateApp = async (req, res) => {
  const stars = Number(req.body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new AppError('التقييم من 1 إلى 5', 400);
  const rating = await Rating.findOneAndUpdate({ user: req.user._id }, { stars, comment: req.body.comment }, { upsert: true, new: true, setDefaultsOnInsert: true });
  res.json({ success: true, rating });
};

export const getMyRating = async (req, res) => res.json({ success: true, rating: await Rating.findOne({ user: req.user._id }) });

export const ratingSummary = async (req, res) => {
  const [agg] = await Rating.aggregate([{ $group: { _id: null, avg: { $avg: '$stars' }, count: { $sum: 1 } } }]);
  res.json({ success: true, average: agg ? Number(agg.avg.toFixed(2)) : 0, count: agg?.count || 0 });
};
