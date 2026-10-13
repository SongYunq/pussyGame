import { Request, Response } from 'express';
import { UserModel } from '../models/userModel.js';
import { LedgerModel } from '../models/ledgerModel.js';
import { RoomManager } from '../game/RoomManager.js';

export class AdminController {
  static async createUser(req: Request, res: Response): Promise<void> {
    const { username, password, nickname, avatar, initialChips } = req.body;
    if (!username || !password || !nickname) {
      res.status(400).json({
        code: 400,
        message: '用户名、密码和昵称不能为空',
        data: null,
      });
      return;
    }

    try {
      const existing = UserModel.findByUsername(username.trim());
      if (existing) {
        res.status(400).json({
          code: 400,
          message: '用户名已存在',
          data: null,
        });
        return;
      }

      const chips = typeof initialChips === 'number' && initialChips >= 0 ? initialChips : 0;
      const created = UserModel.createUser(
        username.trim(),
        password,
        nickname.trim(),
        avatar || 'avatar_1.png',
        chips
      );

      res.json({
        code: 200,
        message: '账号创建成功',
        data: created,
      });
    } catch (err: any) {
      res.status(500).json({
        code: 500,
        message: err.message || '创建账号失败',
        data: null,
      });
    }
  }

  static async listUsers(req: Request, res: Response): Promise<void> {
    try {
      const allUsers = UserModel.getAllUsers();
      // 获取用户实时在线与所在房间状态
      const userListWithStatus = allUsers.map((u) => {
        const status = RoomManager.getUserOnlineStatus(u.id);
        return {
          id: u.id,
          username: u.username,
          nickname: u.nickname,
          avatar: u.avatar,
          balance: u.balance,
          isOnline: status.isOnline,
          currentRoomId: status.currentRoomId,
          createdAt: u.created_at,
        };
      });

      res.json({
        code: 200,
        message: 'ok',
        data: userListWithStatus,
      });
    } catch (err: any) {
      res.status(500).json({
        code: 500,
        message: err.message || '获取用户列表失败',
        data: null,
      });
    }
  }

  static async modifyChips(req: Request, res: Response): Promise<void> {
    const userId = parseInt(req.params.id, 10);
    const { amount, reason } = req.body;

    if (isNaN(userId) || typeof amount !== 'number' || amount === 0) {
      res.status(400).json({
        code: 400,
        message: '用户ID或变动筹码数额无效（不能为0）',
        data: null,
      });
      return;
    }

    try {
      const type = amount > 0 ? 'recharge' : 'deduct';
      const desc = reason || `管理员手动${amount > 0 ? '充值' : '扣减'} ${Math.abs(amount)} 筹码`;
      const result = UserModel.changeBalance(userId, amount, type, desc);

      res.json({
        code: 200,
        message: '筹码操作成功',
        data: {
          userId,
          balance: result.balance,
        },
      });
    } catch (err: any) {
      res.status(400).json({
        code: 400,
        message: err.message || '筹码变动失败',
        data: null,
      });
    }
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    const userId = parseInt(req.params.id, 10);
    const { newPassword } = req.body;

    if (isNaN(userId) || !newPassword) {
      res.status(400).json({
        code: 400,
        message: '用户ID与新密码不能为空',
        data: null,
      });
      return;
    }

    try {
      UserModel.resetPassword(userId, newPassword);
      res.json({
        code: 200,
        message: '密码重置成功',
        data: null,
      });
    } catch (err: any) {
      res.status(400).json({
        code: 400,
        message: err.message || '密码重置失败',
        data: null,
      });
    }
  }

  static async getAuditLogs(req: Request, res: Response): Promise<void> {
    const page = parseInt(req.query.page as string || '1', 10);
    const pageSize = parseInt(req.query.pageSize as string || '50', 10);

    try {
      const logs = LedgerModel.getAuditLogs(page, pageSize);
      res.json({
        code: 200,
        message: 'ok',
        data: logs,
      });
    } catch (err: any) {
      res.status(500).json({
        code: 500,
        message: err.message || '获取审计日志失败',
        data: null,
      });
    }
  }
}
