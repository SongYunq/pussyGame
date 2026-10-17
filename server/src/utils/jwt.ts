import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { JwtPayload } from '../types/index.js';
import { UserModel } from '../models/userModel.js';

export function signToken(payload: JwtPayload): string {
  const user = UserModel.findById(payload.userId);
  if (!user) throw new Error('用户不存在');
  return jwt.sign({
    userId: user.id,
    username: user.username,
    role: user.role,
    authVersion: user.auth_version,
  }, config.jwtSecret, { algorithm: 'HS256', expiresIn: config.jwtExpiresIn });
}

export function verifyToken(token: unknown): JwtPayload | null {
  try {
    if (typeof token !== 'string' || !token) return null;
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || decoded === null ||
        !Number.isSafeInteger(decoded.userId) || decoded.userId <= 0 ||
        typeof decoded.username !== 'string' ||
        (decoded.role !== 'player' && decoded.role !== 'admin') ||
        !Number.isSafeInteger(decoded.authVersion) || decoded.authVersion < 0 ||
        !Number.isSafeInteger(decoded.exp)) return null;

    const user = UserModel.findById(decoded.userId);
    if (!user || user.auth_version !== decoded.authVersion || user.username !== decoded.username) return null;
    return { userId: user.id, username: user.username, role: user.role, authVersion: user.auth_version };
  } catch (err) {
    return null;
  }
}
