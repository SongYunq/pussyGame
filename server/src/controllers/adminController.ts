import { Request, Response } from 'express';
import { UserModel } from '../models/userModel.js';
import { LedgerModel } from '../models/ledgerModel.js';
import { RoomManager } from '../game/RoomManager.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { isPassword, isRequestBody, isTrimmedText, parsePagination, parsePositiveInteger } from '../utils/inputValidation.js';

export class AdminController {
  static async createUser(req: AuthRequest, res: Response): Promise<void> {
    if (!isRequestBody(req.body) || !isTrimmedText(req.body.username, 64) ||
        !isPassword(req.body.password) || !isTrimmedText(req.body.nickname, 40) ||
        (req.body.avatar !== undefined && !isTrimmedText(req.body.avatar, 256)) ||
        (req.body.initialChips !== undefined &&
          (typeof req.body.initialChips !== 'number' || !Number.isFinite(req.body.initialChips) ||
            req.body.initialChips < 0 || req.body.initialChips > Number.MAX_SAFE_INTEGER))) {
      res.status(400).json({
        code: 400,
        message: '账号资料无效：密码须至少6字符且最多72字节，初始筹码须为安全范围内的非负有限数',
        data: null,
      });
      return;
    }
    const { username, password, nickname, avatar, initialChips } = req.body;

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

      const chips = typeof initialChips === 'number' ? initialChips : 0;
      const created = UserModel.createUser(
        username.trim(),
        password,
        nickname.trim(),
        typeof avatar === 'string' ? avatar.trim() : 'avatar_1.png',
        chips,
        'player',
        req.user!.userId
      );

      res.json({
        code: 200,
        message: '账号创建成功',
        data: created,
      });
    } catch (err: any) {
      res.status(500).json({
        code: 500,
        message: '创建账号失败',
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
          role: u.role,
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
        message: '获取用户列表失败',
        data: null,
      });
    }
  }

  static async modifyChips(req: AuthRequest, res: Response): Promise<void> {
    const userId = parsePositiveInteger(req.params.id);

    if (userId === null || !isRequestBody(req.body) ||
        typeof req.body.amount !== 'number' || !Number.isFinite(req.body.amount) ||
        Math.abs(req.body.amount) > Number.MAX_SAFE_INTEGER || req.body.amount === 0 ||
        (req.body.reason !== undefined &&
          (typeof req.body.reason !== 'string' || req.body.reason.length > 500 || /[\u0000-\u001f\u007f]/u.test(req.body.reason)))) {
      res.status(400).json({
        code: 400,
        message: '用户ID、变动筹码或原因无效，筹码须为安全范围内的非零有限数',
        data: null,
      });
      return;
    }
    const { amount, reason } = req.body;

    try {
      const type = amount > 0 ? 'recharge' : 'deduct';
      const desc = typeof reason === 'string' && reason.trim() ? reason.trim() : `管理员手动${amount > 0 ? '充值' : '扣减'} ${Math.abs(amount)} 筹码`;
      const result = UserModel.changeBalance(userId, amount, type, desc, { operatorId: req.user!.userId });
      RoomManager.refreshUser(userId);

      res.json({
        code: 200,
        message: '筹码操作成功',
        data: {
          userId,
          balance: result.balance,
        },
      });
    } catch (err: any) {
      if (!(err instanceof Error) || ![
        '用户不存在', '筹码余额不足', '余额变动参数无效', '余额超出可支持的数值范围',
      ].includes(err.message)) throw err;
      res.status(400).json({
        code: 400,
        message: err.message || '筹码变动失败',
        data: null,
      });
    }
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    const userId = parsePositiveInteger(req.params.id);

    if (userId === null || !isRequestBody(req.body) || !isPassword(req.body.newPassword)) {
      res.status(400).json({
        code: 400,
        message: '用户ID或新密码无效，密码须至少6字符且最多72字节',
        data: null,
      });
      return;
    }
    const { newPassword } = req.body;

    try {
      UserModel.resetPassword(userId, newPassword);
      RoomManager.disconnectUser(userId);
      res.json({
        code: 200,
        message: '密码重置成功',
        data: null,
      });
    } catch (err: any) {
      if (!(err instanceof Error) || !['用户不存在', '新密码格式无效'].includes(err.message)) throw err;
      res.status(400).json({
        code: 400,
        message: err.message || '密码重置失败',
        data: null,
      });
    }
  }

  static async getAuditLogs(req: Request, res: Response): Promise<void> {
    const pagination = parsePagination(req.query.page, req.query.pageSize, 50);
    if (!pagination) {
      res.status(400).json({ code: 400, message: '分页参数无效，pageSize 必须为 1–100 的整数', data: null });
      return;
    }

    try {
      const logs = LedgerModel.getAuditLogs(pagination.page, pagination.pageSize);
      res.json({
        code: 200,
        message: 'ok',
        data: logs,
      });
    } catch (err: any) {
      res.status(500).json({
        code: 500,
        message: '获取审计日志失败',
        data: null,
      });
    }
  }
}
