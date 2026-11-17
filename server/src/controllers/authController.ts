import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { UserModel } from '../models/userModel.js';
import { signToken } from '../utils/jwt.js';
import { isPassword, isRequestBody, isTrimmedText } from '../utils/inputValidation.js';
import { SlidingWindowLimiter } from '../utils/rateLimiter.js';

// 同一“用户名 + 来源 IP”15 分钟内最多 10 次失败登录，成功后清零。
const LOGIN_FAILURE_LIMIT = 10;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const loginFailures = new SlidingWindowLimiter(LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_MS);
// 用户不存在时也执行一次等价的 bcrypt 比对，避免通过响应耗时枚举用户名。
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

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
    const limiterKey = `${username.trim()}|${req.ip ?? ''}`;
    const retryAfterMs = loginFailures.retryAfterMs(limiterKey);
    if (retryAfterMs > 0) {
      res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      res.status(429).json({
        code: 429,
        message: `登录失败次数过多，请 ${Math.ceil(retryAfterMs / 60000)} 分钟后再试`,
        data: null,
      });
      return;
    }

    const user = UserModel.findByUsername(username.trim());
    // 异步比对不阻塞事件循环；用户不存在时与假哈希比对，保持耗时一致。
    const isMatch = await bcrypt.compare(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user || !isMatch) {
      loginFailures.tryConsume(limiterKey);
      res.status(400).json({
        code: 400,
        message: '用户名或密码错误',
        data: null,
      });
      return;
    }
    loginFailures.reset(limiterKey);

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
