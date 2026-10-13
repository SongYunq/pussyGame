import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'zhajinhua-super-secret-key-2026',
  jwtExpiresIn: 7 * 24 * 60 * 60, // 7 天 (以秒为单位)
  dbPath: process.env.DB_PATH || path.resolve(process.cwd(), 'data/game.db'),
  clientDistPath:
    process.env.CLIENT_DIST_PATH ||
    (fs.existsSync(path.resolve(process.cwd(), 'client/dist'))
      ? path.resolve(process.cwd(), 'client/dist')
      : path.resolve(process.cwd(), '../client/dist')),
  defaultAdmin: {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASS || 'admin123',
    nickname: '系统管理员',
    avatar: 'avatar_1.png',
    initialChips: 1000000,
  },
};
