import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { JwtPayload } from '../types/index.js';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function authenticateHttp(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      code: 401,
      message: '未登录或 Token 已过期',
      data: null,
    });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({
      code: 401,
      message: '凭据无效或已过期，请重新登录',
      data: null,
    });
    return;
  }

  req.user = payload;
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({
      code: 403,
      message: '权限不足，仅管理员可调用此接口',
      data: null,
    });
    return;
  }
  next();
}
