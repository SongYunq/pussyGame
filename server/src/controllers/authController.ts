import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { UserModel } from '../models/userModel.js';
import { signToken } from '../utils/jwt.js';
import { isPassword, isRequestBody, isTrimmedText } from '../utils/inputValidation.js';

export class AuthController {
  static async login(req: AuthRequest, res: Response): Promise<void> {
    if (!isRequestBody(req.body) || !isTrimmedText(req.body.username, 64) || !isPassword(req.body.password, 1)) {
      res.status(400).json({
        code: 400,
        message: '用户名或密码格式无效',
        data: null,
      });
      return;
    }

    const { username, password } = req.body;
    const user = UserModel.findByUsername(username.trim());
    if (!user) {
      res.status(400).json({
        code: 400,
        message: '用户名或密码错误',
        data: null,
      });
      return;
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      res.status(400).json({
        code: 400,
        message: '用户名或密码错误',
        data: null,
      });
      return;
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      authVersion: user.auth_version,
    });

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar,
          balance: user.balance,
          role: user.role,
        },
      },
    });
  }

  static async getMe(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({
        code: 401,
        message: '未登录',
        data: null,
      });
      return;
    }

    const user = UserModel.findById(req.user.userId);
    if (!user) {
      res.status(404).json({
        code: 404,
        message: '用户不存在',
        data: null,
      });
      return;
    }

    res.json({
      code: 200,
      message: 'ok',
      data: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        balance: user.balance,
        role: user.role,
      },
    });
  }
}
