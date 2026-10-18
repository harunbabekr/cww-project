import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const signToken = (id, v = 0) =>
  jwt.sign({ id, v }, process.env.JWT_SECRET, { expiresIn: '30d' });

export const generateCode = () => String(crypto.randomInt(100000, 1000000));

export const hashCode = (code) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(String(code)).digest('hex');

export const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
