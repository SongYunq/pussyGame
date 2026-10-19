import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import { isPassword, isTrimmedText } from '../utils/inputValidation.js';

if (process.env.NODE_ENV !== 'test') dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const configuredSecret = process.env.JWT_SECRET;
const publicSecrets = new Set([
  'zhajinhua-super-secret-key-2026',
  'zhajinhua-prod-secret-2026',
  'zhajinhua-production-super-secret-key-2026',
]);
if (isProduction && (!configuredSecret || Buffer.byteLength(configuredSecret.trim(), 'utf8') < 32 || publicSecrets.has(configuredSecret))) {
  throw new Error('生产环境必须设置至少32字节的随机 JWT_SECRET，禁止使用仓库示例密钥');
}
const adminPassword = process.env.ADMIN_PASS || (process.env.NODE_ENV === 'test' ? 'admin123' : '');
if (!isPassword(adminPassword) || (isProduction && adminPassword === 'admin123')) {
  throw new Error('必须设置 ADMIN_PASS：至少6字符、最多72字节，生产环境禁止使用默认密码');
}
const adminUsername = process.env.ADMIN_USER || 'admin';
if (!isTrimmedText(adminUsername, 64)) throw new Error('ADMIN_USER 格式无效');
const port = Number(process.env.PORT || '3000');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须为 1–65535 的整数');

export const config = {
  host: process.env.HOST || '0.0.0.0',
  port,
  jwtSecret: configuredSecret || randomBytes(32).toString('hex'),
  jwtExpiresIn: 7 * 24 * 60 * 60, // 7 天 (以秒为单位)
  dbPath: process.env.DB_PATH === ':memory:' ? ':memory:' : path.resolve(process.cwd(), process.env.DB_PATH || 'data/game.db'),
  clientDistPath:
    (process.env.CLIENT_DIST_PATH ? path.resolve(process.cwd(), process.env.CLIENT_DIST_PATH) : undefined) ||
    (fs.existsSync(path.resolve(process.cwd(), 'client/dist'))
      ? path.resolve(process.cwd(), 'client/dist')
      : path.resolve(process.cwd(), '../client/dist')),
  defaultAdmin: {
    username: adminUsername.trim(),
    password: adminPassword,
    nickname: '系统管理员',
    avatar: 'avatar_1.png',
    initialChips: 1000000,
  },
};
