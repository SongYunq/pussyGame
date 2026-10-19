import http from 'http';
import fs from 'fs';
import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config/index.js';
import { getDb } from './db/database.js';
import { authenticateHttp, requireAdmin } from './middlewares/authMiddleware.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { AuthController } from './controllers/authController.js';
import { UserController } from './controllers/userController.js';
import { AdminController } from './controllers/adminController.js';
import { AlgorithmController } from './controllers/algorithmController.js';
import { setupSocketHandler } from './socket/socketHandler.js';

function asyncHandler(handler: (req: Request, res: Response) => void | Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve().then(() => handler(req, res)).catch(next);
  };
}

export function createApp() {
  // 1. 初始化数据库
  getDb();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // 2. 注册 REST API 路由
  const apiRouter = express.Router();

  // 鉴权模块
  apiRouter.post('/auth/login', asyncHandler(AuthController.login));
  apiRouter.get('/auth/me', authenticateHttp, asyncHandler(AuthController.getMe));

  // 用户与个人流水模块
  apiRouter.put('/user/profile', authenticateHttp, asyncHandler(UserController.updateProfile));
  apiRouter.get('/user/ledger', authenticateHttp, asyncHandler(UserController.getLedger));

  // 管理员后台专区
  apiRouter.post('/admin/users', authenticateHttp, requireAdmin, asyncHandler(AdminController.createUser));
  apiRouter.get('/admin/users', authenticateHttp, requireAdmin, asyncHandler(AdminController.listUsers));
  apiRouter.post('/admin/users/:id/chips', authenticateHttp, requireAdmin, asyncHandler(AdminController.modifyChips));
  apiRouter.post('/admin/users/:id/reset-password', authenticateHttp, requireAdmin, asyncHandler(AdminController.resetPassword));
  apiRouter.get('/admin/audit-logs', authenticateHttp, requireAdmin, asyncHandler(AdminController.getAuditLogs));
  apiRouter.get('/admin/algorithm/config', authenticateHttp, requireAdmin, asyncHandler(AlgorithmController.getConfig));
  apiRouter.post('/admin/algorithm/config', authenticateHttp, requireAdmin, asyncHandler(AlgorithmController.saveConfig));
  apiRouter.post('/admin/algorithm/simulate', authenticateHttp, requireAdmin, asyncHandler(AlgorithmController.simulate));

  app.use('/api', apiRouter, (_req: Request, res: Response) => {
    res.status(404).json({ code: 404, message: '接口不存在', data: null });
  });

  // 3. 生产单端口静态托管 (若 client/dist 存在则直接提供静态前端)
  if (fs.existsSync(config.clientDistPath)) {
    console.log(`[Server] 检测到前端静态构建文件，已启用静态托管: ${config.clientDistPath}`);
    app.use(express.static(config.clientDistPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(config.clientDistPath, 'index.html'));
    });
  } else {
    app.get('/', (req: Request, res: Response) => {
      res.json({
        status: 'online',
        message: '炸金花游戏后端服务运行正常 (Node.js + Express + Socket.io + SQLite)',
        apiDocumentation: '/docs/api_specification.md',
        time: new Date().toISOString(),
      });
    });
  }

  // 全局异常处理
  app.use(errorHandler);

  return app;
}

export function startServer() {
  const app = createApp();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  setupSocketHandler(io);

  server.listen(config.port, config.host, () => {
    console.log(`=======================================================`);
    console.log(`🎉 炸金花游戏后端服务已成功启动！`);
    console.log(`📡 服务监听端口: http://localhost:${config.port}`);
    console.log(`🛡️ 数据库路径: ${config.dbPath}`);
    console.log(`👑 默认管理员账号: ${config.defaultAdmin.username}`);
    console.log(`=======================================================`);
  });

  return { app, server, io };
}

// 直接运行当前脚本时启动服务
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
