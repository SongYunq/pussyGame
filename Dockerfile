FROM node:22-alpine AS builder

WORKDIR /app

# 安装 SQLite 与 native 编译依赖
RUN apk add --no-cache python3 make g++ sqlite

# 安装依赖
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install

# 复制源码并编译
COPY server/ ./
RUN npm run build

# 生产运行阶段
FROM node:22-alpine AS runner

WORKDIR /app/server

RUN apk add --no-cache sqlite

COPY --from=builder /app/server/package*.json ./
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/src/db ./src/db

# 挂载数据卷以保证 SQLite 持久化
VOLUME ["/app/server/data"]

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]
