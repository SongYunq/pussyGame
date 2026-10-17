import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { UserModel } from '../models/userModel.js';
import { LedgerModel } from '../models/ledgerModel.js';
import { RoomManager } from '../game/RoomManager.js';
import { isRequestBody, isTrimmedText, parsePagination } from '../utils/inputValidation.js';

export class UserController {
  static async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ code: 401, message: '未登录', data: null });
      return;
    }

    if (!isRequestBody(req.body) ||
        (req.body.nickname === undefined && req.body.avatar === undefined) ||
        (req.body.nickname !== undefined && !isTrimmedText(req.body.nickname, 40)) ||
        (req.body.avatar !== undefined && !isTrimmedText(req.body.avatar, 256))) {
      res.status(400).json({ code: 400, message: '昵称或头像格式无效', data: null });
      return;
    }
    const nickname = typeof req.body.nickname === 'string' ? req.body.nickname.trim() : undefined;
    const avatar = typeof req.body.avatar === 'string' ? req.body.avatar.trim() : undefined;
    try {
      const updated = UserModel.updateProfile(req.user.userId, nickname, avatar);
      RoomManager.refreshUser(req.user.userId);
      res.json({
        code: 200,
        message: '个人资料更新成功',
        data: updated,
      });
    } catch (err: any) {
      if (!(err instanceof Error) || !['用户不存在', '昵称或头像无效'].includes(err.message)) throw err;
      res.status(400).json({
        code: 400,
        message: err.message || '更新失败',
        data: null,
      });
    }
  }

  static async getLedger(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ code: 401, message: '未登录', data: null });
      return;
    }

    const pagination = parsePagination(req.query.page, req.query.pageSize, 20);
    if (!pagination) {
      res.status(400).json({ code: 400, message: '分页参数无效，pageSize 必须为 1–100 的整数', data: null });
      return;
    }

    const result = LedgerModel.getUserLedger(req.user.userId, pagination.page, pagination.pageSize);
    res.json({
      code: 200,
      message: 'ok',
      data: result,
    });
  }
}
