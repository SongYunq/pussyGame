import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const envDir = mkdtempSync(path.join(tmpdir(), 'zjh-vitest-env-'));
process.once('exit', () => rmSync(envDir, { recursive: true, force: true }));

export default defineConfig({
  envDir,
  test: {
    env: {
      NODE_ENV: 'test',
      DB_PATH: ':memory:',
      ADMIN_USER: 'admin',
      ADMIN_PASS: 'admin123',
      JWT_SECRET: 'isolated-vitest-secret-never-use-in-production',
      PORT: '3000',
      CLIENT_DIST_PATH: fileURLToPath(new URL('./tests/__no_static_assets__', import.meta.url)),
    },
  },
});
