import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { UserModel } from '../models/userModel.js';
import { LedgerModel } from '../models/ledgerModel.js';

export class UserController {
  static async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ code: 401, message: '未登录', data: null });
      return;
    }

    const { nickname, avatar } = req.body;
    try {
      const updated = UserModel.updateProfile(req.user.userId, nickname, avatar);
      res.json({
        code: 200,
        message: '个人资料更新成功',
        data: updated,
      });
    } catch (err: any) {
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

    const page = parseInt(req.query.page as string || '1', 10);
    const pageSize = parseInt(req.query.pageSize as string || '20', 10);

    const result = LedgerModel.getUserLedger(req.user.userId, page, pageSize);
    res.json({
      code: 200,
      message: 'ok',
      data: result,
    });
  }
}
