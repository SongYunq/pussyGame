FROM node:22-alpine AS builder

# 安装 SQLite 与 native 编译依赖
RUN apk add --no-cache python3 make g++ sqlite

# 按锁文件安装两端依赖；.dockerignore 排除宿主机原生模块。
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci

WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci

# 前端构建会引用 server/src/shared，保留两端原有目录关系。
WORKDIR /app
COPY server/src ./server/src
COPY server/tsconfig.json ./server/tsconfig.json
COPY client/ ./client/
RUN npm --prefix client run build
RUN npm --prefix server run build
RUN npm --prefix server prune --omit=dev

# 生产运行阶段
FROM node:22-alpine AS runner

WORKDIR /app/server

RUN apk add --no-cache sqlite

COPY --from=builder /app/server/package*.json ./
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/client/dist /app/client/dist

# 挂载数据卷以保证 SQLite 持久化
VOLUME ["/app/server/data"]

ENV NODE_ENV=production
ENV PORT=3000
ENV CLIENT_DIST_PATH=/app/client/dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
