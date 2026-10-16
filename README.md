# 炸金花 (Golden Flower) - 网页多人联机对战游戏

本项目是一款专为朋友熟人聚会打造的高性能、极速流畅的网页版多人联机炸金花游戏。

---

## 🌟 核心特性与架构

* **前端 (Client)**：React 18 + Vite + Tailwind CSS + Lucide Icons
  * 3D 拟真翻牌动效与卡牌物理手感 (GPU 硬件加速)
  * 动态 2~8 人自适应环形牌桌排布 (当前玩家居于第一人称底座视角)
  * 专属加注动效 (+10 ~ +1000 快捷筹码抛投，5000+ 金光特效，All-in 全场震颤动效)
  * 绝密比牌决斗 (PK 烈焰对撞，绝密悬念不公开底牌)
  * 拟真 Web Audio API 声音系统 (发牌擦音、筹码金属声、胜利音效)
  * 独立 Mock 调试机制

* **后端 (Server)**：Node.js + Express + Socket.io + SQLite (`better-sqlite3`)
  * 服务端权威裁判逻辑 (52张无王，经典大众规则：不同花色 235 遇豹子逆袭，同牌型发起者负)
  * 独立经济系统 (SQLite 用户表与筹码流水明细，账号余额直通在桌下注)
  * 房主/管理员后台 (`/admin`)：发号、充减筹码、重置密码与全局流水审计
  * 单服务单端口生产部署 (Express 统一托管前端构建产物与 WebSocket)

---

## 📖 设计规范与文档索引

* [前端专属设计需求与交互规范](docs/frontend_requirements.md)
* [后端专属设计需求与架构规范](docs/backend_requirements.md)
* [前后端通信协议规范 (API & WebSocket Spec)](docs/api_specification.md)
