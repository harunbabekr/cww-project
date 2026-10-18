import crypto from 'crypto';
import { AppError } from '../middlewares/errorHandler.js';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // بلا حروف ملتبسة (i, l, o, 0, 1)
export const newInviteCode = (len = 8) => Array.from(crypto.randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join('');

/** رمز دعوة ثابت لكل مستخدم يُنشأ عند أول طلب */
export async function ensureInviteCode(user) {
  if (user.inviteCode) return user.inviteCode;
  for (let i = 0; i < 6; i++) {
    try {
      user.inviteCode = newInviteCode();
      await user.save();
      return user.inviteCode;
    } catch (e) {
      if (e.code !== 11000) throw e;
      user.inviteCode = undefined;
    }
  }
  throw new AppError('تعذّر إنشاء رمز الدعوة، حاول مجدداً', 500);
}
