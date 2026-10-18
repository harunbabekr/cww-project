import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { AppError } from './errorHandler.js';

export const protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('غير مصرح لك بالوصول، لا يوجد رمز توثيق', 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
  } catch (error) {
    throw new AppError(
      error.name === 'TokenExpiredError' ? 'انتهت صلاحية الجلسة، سجّل الدخول مجدداً' : 'رمز التوثيق غير صالح',
      401
    );
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) throw new AppError('المستخدم غير موجود أو معطّل', 401);
  if ((decoded.v ?? 0) !== (user.tokenVersion ?? 0)) throw new AppError('انتهت الجلسة، سجّل الدخول مجدداً', 401);

  req.user = user;
  next();
};

export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new AppError('ليس لديك الصلاحية الكافية', 403);
  next();
};
