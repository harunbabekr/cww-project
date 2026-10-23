import mongoose from 'mongoose';
import DialectDictionary from '../models/DialectDictionary.js';
import DialectGroup from '../models/DialectGroup.js';
import { AppError } from '../middlewares/errorHandler.js';
import { escapeRegex } from '../utils/token.js';
import { normalizePhrase } from '../utils/arabic.js';
import { translateDialect } from '../services/dialectService.js';
import { clearGlossaryCache } from '../services/glossaryService.js';
import { isSupportedLanguage } from '../utils/languages.js';

const isStaff = (u) => ['admin', 'moderator'].includes(u.role);
const CATEGORIES = ['tribal', 'sudanese_arabic', 'other_arabic'];

// GET /dialects → المجموعات مع عدد المصطلحات المعتمدة (حتى الفارغة لتشجيع المساهمة)
export const listDialects = async (req, res) => {
  const [groups, counts] = await Promise.all([
    DialectGroup.find(isStaff(req.user) && req.query.all === '1' ? {} : { active: true }).sort({ order: 1, name: 1 }).lean(),
    DialectDictionary.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: '$dialect', count: { $sum: 1 }, language: { $first: '$language' } } }]),
  ]);
  const cnt = new Map(counts.map((c) => [c._id, c]));
  const list = groups.map((g) => ({ ...g, count: cnt.get(g.name)?.count || 0 }));
  // مجموعات قديمة لها مصطلحات بلا سجل مجموعة
  for (const c of counts) if (!groups.some((g) => g.name === c._id)) list.push({ name: c._id, category: 'other_arabic', code: c.language, mtLanguage: c.language === 'ar' ? 'ar' : '', count: c.count });
  res.json({ success: true, dialects: list });
};

// GET /dialects/search?q=&dialect=
export const searchDialect = async (req, res) => {
  const { q, dialect } = req.query;
  const filter = { $or: [{ status: 'approved' }, { status: 'pending', submittedBy: req.user._id }] };
  if (dialect) filter.dialect = String(dialect);
  if (q) {
    const raw = escapeRegex(String(q).slice(0, 60));
    const n = escapeRegex(normalizePhrase(String(q).slice(0, 60)));
    filter.$and = [{ $or: [{ word: new RegExp(raw, 'i') }, { norm: new RegExp(n || raw) }, { variantNorms: new RegExp(n || raw) }, { standardMeaning: new RegExp(raw, 'i') }] }];
  }
  const entries = await DialectDictionary.find(filter).sort({ status: 1, word: 1 }).limit(100).lean();
  res.json({ success: true, entries });
};

async function requireGroup(name) {
  const g = await DialectGroup.findOne({ name, active: true }).lean();
  if (!g) throw new AppError('اختر مجموعة لهجة موجودة', 400);
  return g;
}

// POST /dialects { word, dialect, standardMeaning, variants?, examples? }
export const addDialectEntry = async (req, res) => {
  const { word, dialect, standardMeaning, examples, variants } = req.body;
  if (!word?.trim() || !dialect?.trim() || !standardMeaning?.trim()) throw new AppError('الكلمة والمجموعة والمعنى مطلوبة', 400);
  const group = await requireGroup(dialect.trim());

  if (!isStaff(req.user)) {
    const recent = await DialectDictionary.countDocuments({ submittedBy: req.user._id, createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } });
    if (recent >= 30) throw new AppError('بلغت الحد اليومي للاقتراحات (30)', 429);
  }
  const staff = isStaff(req.user);
  const entry = await DialectDictionary.create({
    word: word.trim(), dialect: group.name, standardMeaning: standardMeaning.trim(),
    language: group.mtLanguage || (group.category === 'tribal' ? group.code || 'und' : 'ar'),
    variants: Array.isArray(variants) ? variants.map((v) => String(v).trim()).filter(Boolean).slice(0, 8) : [],
    examples: Array.isArray(examples) ? examples.map((e) => String(e).trim()).filter(Boolean).slice(0, 5) : [],
    submittedBy: req.user._id, status: staff ? 'approved' : 'pending', reviewedBy: staff ? req.user._id : undefined,
  });
  if (staff) clearGlossaryCache();
  res.status(201).json({ success: true, entry, message: staff ? 'تمت الإضافة' : 'تم إرسال اقتراحك للمراجعة، شكراً لمساهمتك' });
};

// POST /dialects/bulk { dialect, text }  (للمشرفين) — كل سطر: كلمة | المعنى   (أو Tab أو =)
export const bulkImport = async (req, res) => {
  const group = await requireGroup(String(req.body.dialect || '').trim());
  const lines = String(req.body.text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 2000);
  let added = 0, skipped = 0;
  const errors = [];
  for (const [i, line] of lines.entries()) {
    const parts = line.split(/\t|\||=|؛|;/).map((x) => x.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) { errors.push(`السطر ${i + 1}: صيغة غير صحيحة`); continue; }
    const variants = parts[2] ? parts[2].split(/[,،]/).map((x) => x.trim()).filter(Boolean) : [];
    try {
      await DialectDictionary.create({
        word: parts[0], standardMeaning: parts[1], variants, dialect: group.name,
        language: group.mtLanguage || (group.category === 'tribal' ? group.code || 'und' : 'ar'),
        status: 'approved', submittedBy: req.user._id, reviewedBy: req.user._id,
      });
      added += 1;
    } catch (e) { if (e.code === 11000) skipped += 1; else errors.push(`السطر ${i + 1}: ${e.message}`); }
  }
  clearGlossaryCache();
  res.json({ success: true, added, skipped, errors: errors.slice(0, 10) });
};

// POST /dialects/translate { text, dialect, to, toDialect }
export const translate = async (req, res) => {
  const { text, dialect, to = 'ar', toDialect } = req.body;
  if (!dialect) throw new AppError('اختر اللهجة أو الرطانة', 400);
  if (to && (!isSupportedLanguage(to) || to === 'auto')) throw new AppError('لغة الهدف غير صالحة', 400);
  res.json({ success: true, data: await translateDialect({ text, dialect, to, toDialect, style: req.user.settings?.translationStyle }) });
};

// ---- للمشرفين ----
export const listPending = async (req, res) => {
  const entries = await DialectDictionary.find({ status: 'pending' }).populate('submittedBy', 'name email').sort({ createdAt: 1 }).limit(150);
  res.json({ success: true, entries });
};

export const reviewEntry = async (req, res) => {
  const { status, note, standardMeaning } = req.body;
  if (!['approved', 'rejected'].includes(status)) throw new AppError('الحالة غير صالحة', 400);
  const patch = { status, reviewedBy: req.user._id, reviewNote: note };
  if (standardMeaning?.trim()) patch.standardMeaning = standardMeaning.trim();
  const entry = await DialectDictionary.findByIdAndUpdate(req.params.id, patch, { new: true });
  if (!entry) throw new AppError('المصطلح غير موجود', 404);
  clearGlossaryCache();
  res.json({ success: true, entry });
};

const listOf = (v, max) => (Array.isArray(v) ? v : String(v ?? '').split(/[,،\n]/)).map((x) => String(x).trim()).filter(Boolean).slice(0, max);

// صلاحية التعديل/الحذف: المشرف دائماً، وصاحب الاقتراح ما دام لم يُعتمد بعد
async function loadEditable(req) {
  const entry = await DialectDictionary.findById(req.params.id);
  if (!entry) throw new AppError('المصطلح غير موجود', 404);
  const owner = String(entry.submittedBy) === String(req.user._id) && entry.status !== 'approved';
  if (!isStaff(req.user) && !owner) throw new AppError('لا تملك صلاحية تعديل هذا المصطلح', 403);
  return entry;
}

// GET /dialects/entries?dialect=&q=&status=&page=&limit=   (للمشرفين) — كل المصطلحات مع ترقيم صفحات
export const listEntries = async (req, res) => {
  const { dialect, q, status } = req.query;
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter = {};
  if (dialect) filter.dialect = String(dialect);
  if (['approved', 'pending', 'rejected'].includes(status)) filter.status = status;
  if (q) {
    const raw = escapeRegex(String(q).slice(0, 60));
    const n = escapeRegex(normalizePhrase(String(q).slice(0, 60)));
    filter.$or = [{ word: new RegExp(raw, 'i') }, { norm: new RegExp(n || raw) }, { variantNorms: new RegExp(n || raw) }, { standardMeaning: new RegExp(raw, 'i') }];
  }
  const [entries, total] = await Promise.all([
    DialectDictionary.find(filter).populate('submittedBy', 'name').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    DialectDictionary.countDocuments(filter),
  ]);
  res.json({ success: true, entries, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
};

// PATCH /dialects/:id { word?, standardMeaning?, variants?, examples?, dialect?*, status?* }  (*للمشرفين فقط)
export const updateEntry = async (req, res) => {
  const entry = await loadEditable(req);
  const b = req.body;
  const staff = isStaff(req.user);

  if (typeof b.word === 'string') { if (!b.word.trim()) throw new AppError('الكلمة مطلوبة', 400); entry.word = b.word.trim(); }
  if (typeof b.standardMeaning === 'string') { if (!b.standardMeaning.trim()) throw new AppError('المعنى مطلوب', 400); entry.standardMeaning = b.standardMeaning.trim(); }
  if (b.variants !== undefined) entry.variants = listOf(b.variants, 8);
  if (b.examples !== undefined) entry.examples = listOf(b.examples, 5);
  if (staff && typeof b.dialect === 'string' && b.dialect.trim() && b.dialect.trim() !== entry.dialect) {
    const g = await requireGroup(b.dialect.trim());
    entry.dialect = g.name;
    entry.language = g.mtLanguage || (g.category === 'tribal' ? g.code || 'und' : 'ar');
  }
  if (staff && ['pending', 'approved', 'rejected'].includes(b.status)) { entry.status = b.status; entry.reviewedBy = req.user._id; }
  // تعديل صاحب الاقتراح لا يُنقص مراجعته: يبقى بانتظار المراجعة
  if (!staff) entry.status = 'pending';

  try { await entry.save(); } catch (e) {
    if (e.code === 11000) throw new AppError('هذه الكلمة موجودة بالفعل في المجموعة نفسها', 409);
    throw e;
  }
  clearGlossaryCache();
  res.json({ success: true, entry });
};

export const deleteEntry = async (req, res) => {
  const entry = await loadEditable(req);
  await entry.deleteOne();
  clearGlossaryCache();
  res.json({ success: true });
};

// POST /dialects/bulk-delete { ids: [] }  (للمشرفين) — حذف عدة مصطلحات معاً (تنظيف استيراد خاطئ)
export const bulkDelete = async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter((x) => mongoose.isValidObjectId(x)).slice(0, 500);
  if (!ids.length) throw new AppError('لم يُحدَّد أي مصطلح', 400);
  const r = await DialectDictionary.deleteMany({ _id: { $in: ids } });
  clearGlossaryCache();
  res.json({ success: true, deleted: r.deletedCount });
};

// ---- إدارة المجموعات ----
const groupBody = (b) => {
  const g = {};
  for (const k of ['name', 'nameEn', 'code', 'region', 'description']) if (typeof b[k] === 'string') g[k] = b[k].trim();
  if (CATEGORIES.includes(b.category)) g.category = b.category;
  if (typeof b.mtLanguage === 'string') g.mtLanguage = isSupportedLanguage(b.mtLanguage) && b.mtLanguage !== 'auto' ? b.mtLanguage : '';
  if (Number.isFinite(Number(b.order))) g.order = Number(b.order);
  if (typeof b.active === 'boolean') g.active = b.active;
  return g;
};

export const createGroup = async (req, res) => {
  const body = groupBody(req.body);
  if (!body.name) throw new AppError('اسم المجموعة مطلوب', 400);
  const group = await DialectGroup.create(body);
  res.status(201).json({ success: true, group });
};

export const updateGroup = async (req, res) => {
  const old = await DialectGroup.findById(req.params.id);
  if (!old) throw new AppError('المجموعة غير موجودة', 404);
  const body = groupBody(req.body);
  if (body.name !== undefined && !body.name) throw new AppError('اسم المجموعة مطلوب', 400);
  if (body.name && body.name !== old.name && (await DialectGroup.exists({ name: body.name }))) throw new AppError('يوجد مجموعة بهذا الاسم', 409);

  const group = await DialectGroup.findByIdAndUpdate(req.params.id, body, { new: true });
  // المصطلحات مرتبطة باسم المجموعة: عند إعادة التسمية ننقلها كي لا تصبح يتيمة
  const patch = {};
  if (body.name && body.name !== old.name) patch.dialect = body.name;
  if (body.mtLanguage !== undefined || body.code !== undefined || body.category !== undefined) {
    patch.language = group.mtLanguage || (group.category === 'tribal' ? group.code || 'und' : 'ar');
  }
  if (Object.keys(patch).length) await DialectDictionary.updateMany({ dialect: old.name }, { $set: patch });
  clearGlossaryCache();
  res.json({ success: true, group });
};

export const deleteGroup = async (req, res) => {
  const group = await DialectGroup.findById(req.params.id);
  if (!group) throw new AppError('المجموعة غير موجودة', 404);
  const has = await DialectDictionary.countDocuments({ dialect: group.name });
  if (has && req.query.cascade !== '1') throw new AppError(`المجموعة فيها ${has} مصطلح. عطّلها بدلاً من حذفها، أو احذفها مع مصطلحاتها.`, 409);
  if (has && req.user.role !== 'admin') throw new AppError('حذف مجموعة مع مصطلحاتها للمدير فقط', 403);
  if (has) await DialectDictionary.deleteMany({ dialect: group.name });
  await group.deleteOne();
  clearGlossaryCache();
  res.json({ success: true, deleted: has });
};
