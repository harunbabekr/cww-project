import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    const { id, v } = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(id).select('name fullPhone isActive tokenVersion');
    if (!user || !user.isActive || (v ?? 0) !== (user.tokenVersion ?? 0)) return next(new Error('unauthorized'));
    socket.user = { id: String(user._id), name: user.name, phone: user.fullPhone };
    next();
  } catch {
    next(new Error('unauthorized'));
  }
};
