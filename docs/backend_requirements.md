# 炸金花联机游戏 —— 后端架构设计与技术实现规范白皮书 (Backend Architecture & Implementation Specification)

> **文档定位与说明**：本文档基于当前后端完整工程源码（[`server/`](file:///Users/prina/Downloads/pussyGame/server/)）进行全面复盘、系统梳理与标准规范化更新。内容涵盖 Node.js + Express + Socket.io + SQLite 架构体系、无作弊防泄密权威裁判引擎、纯内存房间状态机、原子账本经济体系、管理员多维管控中枢、生产单端口静态托管、Docker 容器化部署及自动化测试验证体系。第九节“爆金币赏金击杀流”仅为创想存档，尚未实现，短期内不计划开发，不属于当前或近期交付范围。
> 相关协议与设计参考：[api_specification.md](file:///Users/prina/Downloads/pussyGame/docs/api_specification.md)、[frontend_requirements.md](file:///Users/prina/Downloads/pussyGame/docs/frontend_requirements.md)。
> 最近审查与验证：2026-10-18。静态审查后已按用户要求补写并运行测试：14 个文件、291 项全部通过，双端构建与 6 项生产产物冒烟检查通过。修复、验证范围与上线前未完成项见 [数据库与服务审查记录](database_service_review.md)。
> 发牌算法规则、自然概率基线及后续变更同步要求统一见：[dealing_algorithm_requirements.md](dealing_algorithm_requirements.md)。

---

## 目录
1. [系统整体架构与工程定位](#一-系统整体架构与工程定位)
2. [数据库设计与原子账本系统 (SQLite + WAL)](#二-数据库设计与原子账本系统-sqlite--wal)
3. [核心裁判与发牌算法](#三-核心裁判与发牌算法)
4. [纯内存房间状态机设计 (Room & RoomManager)](#四-纯内存房间状态机设计-room--roommanager)
5. [WebSocket (Socket.io) 实时网关规范](#五-websocket-socketio-实时网关规范)
6. [RESTful HTTP API 与管理后台中枢](#六-restful-http-api-与管理后台中枢)
7. [单端口生产部署与容器化架构](#七-单端口生产部署与容器化架构)
8. [自动化测试与质量保障体系](#八-自动化测试与质量保障体系)
9. [规则进阶探索与扩展设计：爆金币赏金击杀流 (Bounty Mode)](#九-规则进阶探索与扩展设计爆金币赏金击杀流-bounty-mode)

---

## 一、 系统整体架构与工程定位

### 1.1 技术底座与选型理念
* **服务端运行环境**：Node.js 22 LTS（TypeScript 5.7 / ES Modules 模式）；
* **Web 与路由服务**：Express 4.21（挂载 RESTful API、统一错误拦截与单端口静态资源托管）；
* **实时全双工网关**：Socket.io 4.8（基于 WebSocket + HTTP Polling 自动降级，承载毫秒级房间流转信令）；
* **嵌入式存储引擎**：`better-sqlite3` 11.8（单文件轻量持久化，启用 WAL 高并发预写日志，微秒级查询响应，零独立外部 DB 服务运维负担）；
* **密码与凭证安全**：`bcryptjs`（Salt 轮数 10，单向哈希加密密码）+ `jsonwebtoken`（无状态 JWT 凭据，7 天有效期）；
* **自动化测试矩阵**：Vitest 2.1 + Supertest 7.2 + Socket.io-client 4.8（涵盖算法单测、状态机单测、API 鉴权测试与真实双客户端 E2E 对局模拟）。

### 1.2 核心职责与设计原则
```
                         ┌──────────────────────────────────────────────┐
                         │              客户端 (浏览器 / 移动端 H5)       │
                         └───────┬──────────────────────────────▲───────┘
                                 │ HTTP API 请求                │ WebSocket 双向信令
                                 ▼                              │ (带 JWT 握手校验)
┌───────────────────────────────────────────────────────────────┴────────────────────────────────┐
│ 服务端核心架构 (Node.js + Express + Socket.io)                                                  │
│                                                                                                │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌────────────────────────────────┐  │
│  │     RESTful API 控制器  │  │   WebSocket 网关分发器   │  │       纯内存房间状态机         │  │
│  │   - AuthController      │  │   - roomEvents (大厅桌位)│  │   - RoomManager (多房调度)     │  │
│  │   - UserController      │  │   - gameEvents (牌局动作)│  │   - Room (8槽位/倒计时/结算)   │  │
│  │   - AdminController     │  │   - chatEvents (表情短语)│  │   - 单 Socket 独立防作弊脱敏   │  │
│  └────────────┬────────────┘  └────────────┬────────────┘  └───────────────▲────────────────┘  │
│               │                            │                               │                   │
│               ▼                            └───────────────────────────────┼───────────────────┘
│  ┌─────────────────────────┐                                               │                   │
│  │   数据模型与原子事务    │                                 ┌─────────────┴─────────────────┐ │
│  │   - UserModel           │                                 │     独立核心裁判引擎          │ │
│  │   - LedgerModel         │                                 │   - Card / Deck (洗牌发牌)    │ │
│  └────────────┬────────────┘                                 │   - GameReferee (7大牌型/PK)  │ │
│               │                                              └───────────────────────────────┘ │
└───────────────┼────────────────────────────────────────────────────────────────────────────────┘
                ▼
┌───────────────────────────────┐
│ SQLite 数据库 (game.db, WAL)   │
│ - users: 账户与钱包余额       │
│ - ledgers: 变动流水审计账本   │
└───────────────────────────────┘
```

1. **绝对权威防作弊（Zero-Trust Client）**：
   - 所有的扑克牌洗牌、发牌、点数大小判定、下注倍数、轮换倒计时均在服务端内存中由 [`GameReferee`](file:///Users/prina/Downloads/pussyGame/server/src/game/GameReferee.ts) 与 [`Room`](file:///Users/prina/Downloads/pussyGame/server/src/game/Room.ts) 严格决断；
   - 客户端只能上报操作意图（如 `game:look`, `game:bet`, `game:compare`），服务端严密校验合法性；
   - **单连接单独脱敏**：服务端快照仅允许连接所属玩家查看本人手牌，以及其本局直接比牌击败且仍在座位上的输者手牌；其余为 `null`，观战者视角全员为 `null`。
2. **账户与流水的原子写入（SQLite Transactions）**：
   - 玩家入座直接使用钱包账户余额，所有底注、跟注、加注、比牌扣除与胜利奖金派发，均在 SQLite `db.transaction()` 中原子完成；
   - 每笔余额变化与对应流水在同一事务中提交；底注批扣和终局多笔派奖另有外层事务。该保证不覆盖内存牌局的进程崩溃恢复，详见第 2.6 节；
3. **管理后台与自主经济闭环**：
   - 针对熟人私局场景，无需开放公网恶意注册；由超级管理员在管理后台统一定制发放账号、设置初始筹码、实时充减、重置密码与追溯全服流水；
4. **单端口一站式部署**：
   - 后端服务同时监听同一端口（默认 3000），通过中间件就地托管前端构建产物 `client/dist`，实现开箱即用的单一服务容器化交付。

### 1.3 服务端工程物理文件拓扑
```
server/
├── data/                       # SQLite 数据文件持久化目录 (自动创建 game.db)
├── src/
│   ├── config/
│   │   └── index.ts            # 全局配置中心 (端口、JWT密钥、路径、默认管理员)
│   ├── db/
│   │   └── database.ts         # SQLite 单连接、WAL模式、增量迁移与管理员初始发号
│   ├── types/
│   │   └── index.ts            # 全局 TypeScript 接口契约定义
│   ├── utils/
│   │   └── jwt.ts              # JWT 签名与验签工具封装
│   ├── models/
│   │   ├── userModel.ts        # 用户 CRUD、原子修改余额事务 (changeBalance)
│   │   └── ledgerModel.ts      # 个人流水账本与全局管理员审计流水查询
│   ├── middlewares/
│   │   ├── authMiddleware.ts   # HTTP 请求 JWT 鉴权与管理员角色拦截中间件
│   │   └── errorHandler.ts     # 全局统一异常捕获并格式化 JSON 响应
│   ├── controllers/
│   │   ├── authController.ts   # 用户登录 /auth/login, 个人信息 /auth/me
│   │   ├── userController.ts   # 资料修改 /user/profile, 个人账本 /user/ledger
│   │   └── adminController.ts  # 管理后台接口 (发号/列表/充减币/重置密码/审计)
│   ├── game/
│   │   ├── Card.ts             # 扑克定义 (Card, Deck, Fisher-Yates 洗牌)
│   │   ├── GameReferee.ts      # 核心裁判引擎 (7大牌型判定、比牌PK、20轮决胜)
│   │   ├── Room.ts             # 8人桌位状态机、下注流转、比牌结算、脱敏广播
│   │   └── RoomManager.ts      # 4位房号分配、多房间实例映射、用户在线/房间追踪
│   ├── socket/
│   │   ├── socketHandler.ts    # Socket.io 握手鉴权中间件与生命周期分发
│   │   ├── roomEvents.ts       # 房间信令 (创建、加入、入座、起立、准备)
│   │   ├── gameEvents.ts       # 牌局动作 (看牌、下注、弃牌、PK比牌)
│   │   └── chatEvents.ts       # 快捷社交互动 (表情广播、短语广播)
│   └── index.ts                # Express + Socket.io + 静态托管一体化启动入口
├── tests/                      # 自动化测试套件
│   ├── referee.test.ts         # 裁判算法 15 项基准单测
│   ├── room.test.ts            # 房间状态机流转单测
│   ├── api.test.ts             # RESTful API 鉴权与流水单测
│   └── socket_e2e.ts           # 真实双客户端 Socket 对局端到端集成测试
├── Dockerfile                  # Node 22 Alpine 生产镜像打包
└── tsconfig.json               # TypeScript 严格编译配置
```

---

## 二、 数据库设计与原子账本系统 (SQLite + WAL)

数据库持久化文件位于 [`server/data/game.db`](file:///Users/prina/Downloads/pussyGame/server/data/game.db)，服务首次启动时由 [`server/src/db/database.ts`](file:///Users/prina/Downloads/pussyGame/server/src/db/database.ts) 执行 `initTables` 与 `initDefaultAdmin` 自动完成初始化。

### 2.1 已持久化的实体与约束

当前只有三张业务表；房间、座位、底池、手牌及在线状态没有落库。

| 表 | 字段与用途 |
| :--- | :--- |
| `users` | `id` 主键；`username` 唯一且非空；`password_hash`、`nickname` 非空；`avatar`；`balance`；`role`；`auth_version`；`created_at`、`updated_at` |
| `ledgers` | `id` 主键；`user_id` 外键；`type`；`amount`；`balance_after`；`description`；`operator_id` 可空用户外键；`room_id` 可空文本；`created_at` |
| `game_settings` | `key` 主键；`value` JSON 文本；`updated_at`；当前条目为 `dealing_config_v1` |

新库的余额和流水金额采用 `NUMERIC` 类型。旧库原有 `INTEGER` 列不重建；SQLite 的类型亲和性允许其中保存实际玩法产生的小数，不能据此声称整数精确记账。闷牌半注和多人平分保持现有行为，最小筹码单位及尾差分配政策仍待确定。

数据库触发器同时覆盖新旧库后续写入：余额必须为非负数值且不超过 `Number.MAX_SAFE_INTEGER`，角色限 `player/admin`，凭据版本为非负整数；流水金额非零且类型与正负方向相符，结余非负。流水禁止普通 `UPDATE/DELETE`，应用只能追加；数据库文件的持有者仍可改结构，这不是防篡改存证。

索引包括用户名、流水用户编号、创建时间，以及适配个人流水倒序分页的 `(user_id, id DESC)`。`username UNIQUE` 已有唯一索引；保留原有显式索引以兼容旧库。

### 2.2 余额与流水的事务边界

[UserModel](../server/src/models/userModel.ts) 的 `changeBalance(userId, amount, type, description, context?)` 在同一事务中读取余额、校验、更新 `users`、插入 `ledgers`；失败时整体回滚。它校验用户编号、有限金额、安全数量级、金额方向和结果余额，不允许零变动或计算后余额完全不变。

- `recharge/game_win` 必须为正，`deduct/ante/bet` 必须为负。
- `context.operatorId` 由管理员控制器从已鉴权身份传入，客户端不能指定经办人；`context.roomId` 由房间服务传入。
- 开号初始筹码与其充值流水原子创建；初始值为零时不产生资金流水。
- 全部开局底注位于同一外层事务，多人派奖同样位于同一外层事务，成功后才更新对应内存金额。
- 管理员调账和资料修改完成后，通过 `RoomManager.refreshUser` 刷新所在房间快照；下注、全押及比牌还会读取数据库最新余额。

同步驱动让当前单进程内的数据库操作顺序执行；WAL 不是业务级重复请求保护，也不能协调多进程各自独立的房间内存。当前架构只支持一个游戏服务实例；管理员充减没有业务请求幂等键，重复提交仍会重复入账。

### 2.3 资金审计与提现边界

个人流水仅查询本人；管理员全局流水额外返回 `operatorId`、`operatorUsername`、`roomId`。旧流水无法可靠还原经办人和房间，新增字段保留 `null`；系统初始化资金同样以 `operatorId: null` 表示系统操作。时间为 SQLite `CURRENT_TIMESTAMP` 生成的 UTC 文本，通常格式为 `YYYY-MM-DD HH:MM:SS`。

`room_id` 不是牌局编号。同一房间多局仍缺少结构化关联，当前没有完整的牌局对账能力。开号零余额、改密、规则配置变更等非资金操作也尚无专门的管理员操作审计表。

目前“充值/提现扣除”仅指管理员记录线下资金结算：正数记 `recharge`，负数记 `deduct`。没有线上支付订单、提现申请、冻结资金、付款回执或失败退款服务，不能把现有筹码流水称为线上收付款系统。

### 2.4 初始化、迁移与默认管理员

[database.ts](../server/src/db/database.ts) 在开启 WAL 和外键后，以同一事务完成建表、增量迁移和默认管理员的账户/初始流水创建，全部成功后才发布单例连接；失败关闭连接，不保留半初始化状态。

`PRAGMA user_version = 1` 标识本次结构版本。旧库通过 `ALTER TABLE` 添加 `users.auth_version`、`ledgers.operator_id/room_id`，保留历史数据并安装同样的写入约束；未来版本高于当前服务支持范围时拒绝启动。本次审查未打开或迁移既有 `server/data/game.db`，迁移代码仅会在后续服务启动时执行，也未自动修正历史数据。

默认管理员按 `ADMIN_USER` 用户名是否已存在决定是否创建，初始筹码为 1,000,000。同名账号若为普通玩家，初始化明确失败并回滚，不自动提权或覆盖账号。`ADMIN_PASS` 只在首次创建时用于密码哈希，修改环境变量不会重置既有账号密码。生产必须显式设置安全的 `JWT_SECRET/ADMIN_PASS`，不再使用仓库公开密钥和 `admin123`，启动日志不输出密码。

### 2.5 发牌配置持久化

`AlgorithmModel` 在条目不存在时提供默认配置；保存完整校验后以单条更新写入 `game_settings`。开局读取配置，后续保存只影响下一局。当前未保存配置修订历史或经办人。

### 2.6 尚未实现的在途资金恢复

**高优先级缺口**：账户及流水持久化，但开局扣款后至终局派奖前，底池和牌局状态只在内存。进程退出、容器重启或升级会清空房间，已投入筹码不会自动恢复或退款。备份数据库、启用 WAL 或原子更新单笔流水都不能解决这一问题。

后续需要唯一牌局编号、每笔投入的牌局归属、可持久化的结算状态和重复执行保护；还需明确中断局采用恢复还是原子退款。本轮未擅自新增该产品规则，也未实现上述恢复链路。

## 三、 核心裁判与发牌算法

### 3.1 共用规则与双牌库

联机服务端与本地演示均使用 [shared/poker.ts](../server/src/shared/poker.ts) 和 [shared/dealing.ts](../server/src/shared/dealing.ts)。`GameReferee`、`Deck` 保留适配入口。

- 标准牌 52 张，点数 2～A；短牌 28 张，仅 8～A。无大小王，每人三张，全桌无重复。
- 标准牌／短牌默认比例 20／80；标准牌随机／冤家／保底为 30／40／30，短牌随机／冤家为 70／30。
- 先生成完整合法手牌，再在外层数据库事务中扣除全部底注，任一失败则全部回滚；有效人数不足两人不扣款、不开始。
- 冤家及精确牌型保底先占牌，随机手牌从余牌产生，再随机排列全部手牌组。具体规则见根目录 [dealing_rules.md](../dealing_rules.md)。

### 3.2 牌型与花色比较

等级为豹子 6、顺金 5、金花 4、顺子 3、对子 2、散牌 1；标准牌特殊 235 平时为散牌，仅与豹子直接比较时逆袭。

标准牌 A-2-3 映射 `[3, 2, 1]`，短牌 A-8-9 映射 `[9, 8, 7]`；Q-K-A 最大。房间的 `deckKind` 贯穿开局、比牌、强制摊牌及亮牌标签。

同点数时关键牌花色按黑桃 > 红桃 > 梅花 > 方块比较。对子取对子两张的最大花色；顺子取有效最高点数，低 A 顺子分别取 3、9；其他牌型取最大点数牌的最大花色。完全无法区分才由主动比牌者判负。

### 3.3 循环克制与派奖

强制摊牌同时存在豹子、特殊 235 和其他牌型时，全部仍存活玩家平分底池；仅有豹子和 235 时正常比较，不平分。

`splitPot` 生成各人份额，最后一份接收浮点尾差，保持总额一致。所有 `game_win` 余额与流水更新位于同一外层事务中；全部成功后才更新内存和广播。单人获胜更新庄家，平分保持原庄家。

### 3.4 配置与真实模拟

管理员接口由 `AlgorithmController`、`AlgorithmModel` 提供。旧的倍率及个人幸运配置已被版本 1 的双牌库、模式比例、冤家组合比例和按人数保底方案取代。

`simulateDeals` 使用正式发牌函数实际采样，支持 1～5,000 局及 2～8 人，每 25 局让出执行时间；预览配置不入库。完整字段、约束、选牌上限及公平边界见 [发牌算法规范](dealing_algorithm_requirements.md)。

---

## 四、 纯内存房间状态机设计 (Room & RoomManager)

房间全量对局状态机封装在 [`server/src/game/Room.ts`](file:///Users/prina/Downloads/pussyGame/server/src/game/Room.ts) 中，由 [`server/src/game/RoomManager.ts`](file:///Users/prina/Downloads/pussyGame/server/src/game/RoomManager.ts) 全局管理调度。

### 4.1 房间生命周期与状态流转
```
┌────────────────────────────────────────────────────────┐
│ 1. 等待就绪阶段 (gameStatus: 'waiting')                │
│    - 玩家加入观战 / 选座入座 (seats[0..7])             │
│    - 满足条件: 在座人数 ≥ 2 且全部勾选 isReady: true   │
└──────────────────────────┬─────────────────────────────┘
                           │ 生成合法手牌、原子扣注、私发
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. 牌局对决阶段 (gameStatus: 'playing')                │
│    - 轮流出资 (支持限时或无限制，限时才超时弃牌)       │
│    - 玩家动作: 看牌 (look) / 跟注 (call) / 加注(raise) │
│    - 发起 PK 比牌 (compare, 第 2 轮起)                 │
│    - 弃牌 (fold, 手动或超时)                           │
│    - 终局判定: 仅剩 1 名存活者 或 满 20 轮强制比牌    │
└──────────────────────────┬─────────────────────────────┘
                           │ 判定唯一胜者，全池入账
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. 终局结算阶段 (gameStatus: 'settling')               │
│    - 将 totalPot 奖池全额原子入账至胜者 SQLite 钱包    │
│    - 广播胜负结算战报 (展示 4 秒)                      │
│    - 胜者继承为下一局庄家 (dealerSeatIndex)            │
└──────────────────────────┬─────────────────────────────┘
                           │ 4 秒定时器到期，执行 resetToWaiting
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. 自动重置与筹码下限校验                             │
│    - 从 SQLite 刷新最新余额                            │
│    - 余额 < 10 * baseAnte 者强制起立回退至观战席       │
│    - 房间回到 'waiting' 阶段                           │
└────────────────────────────────────────────────────────┘
```

房间没有房主字段或房主开始事件。至少两名在座玩家且全员准备时自动开局，管理员角色也不绕过准备条件。创建者仅自动进入观战席；“只有房主能开局”属于尚未采用的另一套产品规则。

同账号至多归属一个房间，创建或加入另一房间前清理旧房的座位/观战身份及全部连接订阅；局中切房的离座动作按弃牌处理，不能留下两个房间的有效身份。仅最后一个连接断开时移除观战身份；座位继续保留以支持重连。等待中的离线座位目前没有自动过期回收策略。

结算只接受 `playing` 状态，`settling` 时不能继续弃牌触发派奖；房间删除清理定时器且不允许直接删除进行中的房间。空房可回收，4 位房号耗尽明确报错。

### 4.2 8 人桌位模型与桌位状态机 (`TableSeat`)
每个房间拥有固定的 `seats[8]` 数组（槽位索引 0~7），每个槽位包含如下状态：
```typescript
export type PlayerTableStatus =
  | 'empty'     // 空座位
  | 'sitting'   // 已入座，未准备
  | 'ready'     // 已准备，等待开局
  | 'active'    // 牌局进行中，存活在局
  | 'folded'    // 本局主动或超时弃牌出局
  | 'lost';     // 比牌对决失败被淘汰
```

### 4.3 庄家定位与出牌回合流转
1. **初始庄家**：开局默认为 0 号座位；首轮由庄家顺时针下一位存活玩家开始出牌；
2. **回合轮换 (`advanceTurn`)**：
   - 过滤所有状态为 `active` 的存活座位，按座位号升序排布；
   - 寻找当前操作者顺时针方向的下一位存活者；
   - 记录本轮尚未行动的存活玩家；这些玩家全部完成行动后，`currentRound` 轮数加 1，不能只按座位号跨越 7→0 判断；
   - 若 `currentRound > 20`，立即中断轮换，直接触发 `maxRoundShowdown()`。

### 4.4 下注与加注计算规则
* **当前单注基准（`currentBet`）**：
  * **开局底注**：所有玩家仍按 `baseAnte` 原额扣除，不受明暗牌倍率影响；
  * **未看牌（闷牌）**：下注额 = `currentBet * 0.5`；
  * **已看牌（明注）**：下注额 = `currentBet`；
  * **加注（Raise）**：玩家传入新的加注档位（必须大于当前 `currentBet`），更新 `currentBet` 为新值并扣除对应倍数筹码；
  * **全押（All-in）**：扣除玩家当前全部余额 `balance`，按 `balance / (hasLooked ? 1 : 0.5)` 折算单注。若折算值大于当前 `currentBet`，则抬高单注基准；
* **下注特效广播**：每局首次单次下注金额 $\ge 5000$ 标记为 `specialEffect: 'gold'`（全屏大金盛典与女声播报），All-in 标记为 `specialEffect: 'allin'`（全押特效）。

### 4.5 绝密比牌 (PK 对决) 机制
1. **触发门槛**：轮到自己出牌、对局处于第 2 轮及以后、比牌对象必须同处于 `active` 存活状态；
2. **比牌扣费**：发起方需支付比牌费用，金额为：
   $$\text{PK Cost} = \text{currentBet} \times 2 \times (\text{发起方已看牌} ? 1 : 0.5)$$
   即发起方一次跟注金额的 2 倍：闷牌为单注基准的 1 倍，明牌为 2 倍。
3. **胜者私密查看**：实际胜者可查看输者三张牌，防守获胜也适用；`game:compare_result` 遍历房间内的鉴权连接分别发送，只有胜者的连接包含 `loserCards`，其他接收者仅有公共胜负与费用。禁止把含私密牌面的对象广播到整个房间。
   - `Room.comparisonWins` 按用户编号记录本局直接击败的玩家；不改变任何人的 `hasLooked`，不继承输者此前获得的查看权限。
   - 后续快照、断线重连恢复及同账号多连接均按该记录授权；重置及成功开始新局时清空。未实际比牌、弃牌、无效请求或扣款失败不能授予查看权限。
   - 比牌输者手牌不加入公共 `game:over.revealedCards`；终局原有亮牌规则保持不变。
4. **失败者处理**：失败者状态标记为 `lost`，失去后续操作权；
5. **胜者检查**：若淘汰后场上仅剩 1 名存活玩家，立即收官派奖。

### 4.6 倒计时控制器与断线超时防挂机
* 创建房间时 `turnSeconds` 默认为 20 秒；非零值继续限制在 10～60 秒，`0` 为独立的“无限制”设置，由 `RoomManager.createRoom` 原样保留。
* 限时房间：每次轮到玩家操作，根据 `turnSeconds` 生成 `turnDeadline = Date.now() + turnSeconds * 1000` 并挂载 `setTimeout`；到期未操作时执行 `fold(userId, 'timeout')`。
* 无限制房间：`Room.startTurnTimer` 清理旧定时器后直接返回，`turnDeadline` 始终为 `null`，不注册自动弃牌任务；开局、每次轮换及下一局均遵守该设置。
* 刷新或重连不会重置限时房间的截止时间；无限制房间重连时仍广播 `turnSeconds: 0`、`turnDeadline: null`，保留座位和手牌，等待玩家手动操作，不因断线自动弃牌。
* 无限制只取消回合时间限制，不改变手动弃牌、比牌、20 轮强制摊牌或结算后 4 秒重置等规则。

### 4.7 防作弊全量状态脱敏算法 (`getMaskedState`)
为了杜绝通过浏览器控制台、抓包工具或插件窃取他人底牌作弊，服务端坚决实行**服务端定向脱敏分发**（参考 [`Room.getMaskedState`](file:///Users/prina/Downloads/pussyGame/server/src/game/Room.ts) 与 [`Room.broadcastState`](file:///Users/prina/Downloads/pussyGame/server/src/game/Room.ts)）：
```typescript
public getMaskedState(forUserId?: number): RoomState {
  const maskedSeats = this.seats.map((seat) => {
    if (!seat) return null;
    const isSelf = forUserId !== undefined && seat.user?.id === forUserId;
    return {
      ...seat,
      user: seat.user ? { ...seat.user } : null,
      // 仅本人及本局直接比牌胜者获准查看对应手牌。
      cards: isSelf || (forUserId !== undefined && seat.status === 'lost' && seat.user !== null
        && this.comparisonWins.get(forUserId)?.has(seat.user.id) === true)
        ? seat.cards?.map(card => ({ ...card })) ?? null : null,
    };
  });
  // ... 返回脱敏后的房间状态快照
}
```

---

## 五、 WebSocket (Socket.io) 实时网关规范

WebSocket 网关是驱动全桌实时通信的神经中枢，统一在 [`server/src/socket/`](file:///Users/prina/Downloads/pussyGame/server/src/socket/) 下组织。

### 5.1 握手鉴权与房间恢复
* **连接拦截**：客户端建立 Socket 连接时必须在 `auth.token` 中附带有效 JWT。中间件调用 [`verifyToken`](file:///Users/prina/Downloads/pussyGame/server/src/utils/jwt.ts) 限定 HS256 并校验载荷、有效期和 `authVersion`，查询当前数据库用户身份后绑定至 Socket 实例；验签或凭据版本不符直接拒绝握手，每个入站事件还会再次检查；
* **断线重连无缝恢复**：用户重新连入时，[`socketHandler.ts`](file:///Users/prina/Downloads/pussyGame/server/src/socket/socketHandler.ts) 检索其历史所在的房间：
  1. 自动调用 `socket.join("room:" + roomId)`；
  2. 立即单发一份该玩家合法的 `room:state` 脱敏快照，前端瞬间恢复桌面状态与手牌，零卡顿感。

HTTP 同样按数据库当前角色鉴权。重置密码会原子递增 `users.auth_version`，撤销该账号已有令牌并主动断开其全部在线连接。此次升级前没有版本字段的旧令牌也会失效，需要重新登录。

### 5.2 房间与大厅信令矩阵
| 客户端上行事件 | 参数负载 | 业务响应 / 广播下行 | 功能说明 |
| :--- | :--- | :--- | :--- |
| `room:create` | `{ roomName, baseAnte, turnSeconds }` | Ack 回调 `{ code: 200, roomId }` + 广播 | 创建新房间并自动加入观战 |
| `room:join` | `{ roomId }` | Ack 回调 `{ code: 200, roomId }` + 定向快照 | 进入指定房间观战席 |
| `room:sit` | `{ seatIndex: 0~7 }` | Ack 回调 + 广播 `room:state` | 选定空位入座（校验筹码 $\ge 10 \times 底注$） |
| `room:stand` | 无 | Ack 回调 + 广播 `room:state` | 主动离座退回观战席（局中离座视同弃牌） |
| `room:ready` | `{ isReady: boolean }` | Ack 回调 + 广播 `room:state` | 准备/取消准备（全员准备自动发牌开局） |

### 5.3 牌局动作信令矩阵
| 客户端上行事件 | 参数负载 | 业务响应 / 广播下行 | 功能说明 |
| :--- | :--- | :--- | :--- |
| `game:look` | 无 | Ack `{ code: 200, cards }` + 广播 `game:player_looked` | 查看自己的底牌，状态变更为明牌 |
| `game:bet` | `{ actionType, chipOption, amount }` | Ack 回调 + 广播 `game:player_bet` | 跟注、加注或 All-in |
| `game:fold` | 无 | Ack 回调 + 广播 `game:player_folded` | 主动弃牌出局 |
| `game:compare` | `{ targetPlayerId }` | Ack 回调 + 广播 `game:compare_result` | 发起绝密双人比牌 PK 对决 |

### 5.4 社交互动信令
* `chat:emoji`：表情 ID 须为非空字符串且不超过 64 字符，合法时房间内广播 `chat:emoji_broadcast`，畸形消息忽略；
* `chat:phrase`：短语 ID 为非负安全整数、文本非空且不超过 200 字符，合法时房间内广播 `chat:phrase_broadcast`，畸形消息忽略。

---

## 六、 RESTful HTTP API 与管理后台中枢

RESTful 接口遵循统一规范包裹对象：`{ code, message, data }`。完整细节见 [api_specification.md](file:///Users/prina/Downloads/pussyGame/docs/api_specification.md)。

### 6.1 接口路由大纲
```
/api
├── /auth
│   ├── POST /login                 # 玩家/管理员账密登录 (返回 Token 与个人信息)
│   └── GET  /me                    # 获取当前登录人详细信息 (需 Bearer Token)
├── /user
│   ├── PUT  /profile               # 修改个人昵称与头像标识
│   └── GET  /ledger                # 分页拉取个人筹码变动流水账本
└── /admin (需管理员权限 requireAdmin)
    ├── POST /users                 # 为朋友开通新账号与分配初始筹码
    ├── GET  /users                 # 检索全量用户 (附加实时在线与所在房间号)
    ├── POST /users/:id/chips       # 手动为用户充值或扣减筹码 (原子入账流水)
    ├── POST /users/:id/reset-password # 强制重置指定用户密码
    ├── GET  /audit-logs            # 分页拉取全服全局筹码审计流水
    ├── GET  /algorithm/config      # 读取新发牌配置
    ├── POST /algorithm/config      # 校验并保存，下一局生效
    └── POST /algorithm/simulate    # 使用草稿执行真实发牌模拟
```

### 6.2 实时在线与所在房间追踪实现
在 [`AdminController.listUsers`](file:///Users/prina/Downloads/pussyGame/server/src/controllers/adminController.ts) 中，服务端将 SQLite 用户列表与 [`RoomManager.getUserOnlineStatus(userId)`](file:///Users/prina/Downloads/pussyGame/server/src/game/RoomManager.ts) 实时结合，动态透传：
* `isOnline`: 当前玩家是否有活跃的 WebSocket 连接；
* `currentRoomId`: 当前玩家正在哪一个房间中对局或观战。管理员在后台对全服动态一目了然。

---

## 七、 单端口生产部署与容器化架构

### 7.1 单端口 Express + WebSocket + 静态资源融合
在 [`server/src/index.ts`](file:///Users/prina/Downloads/pussyGame/server/src/index.ts) 中：
```typescript
if (fs.existsSync(config.clientDistPath)) {
  app.use(express.static(config.clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(config.clientDistPath, 'index.html'));
  });
}
```
* **生产运行流**：前端执行 `npm run build` 生成静态文件至 `client/dist`，启动后端服务时，Express 自动托管静态资源，HTTP 接口、Socket.io 网关与前端页面全部收敛至唯一的 3000 端口（可通过 `PORT` 环境变量自定义）。

### 7.2 Docker 容器化配置

[Dockerfile](../Dockerfile) 基于 `node:22-alpine`，使用两端锁文件安装依赖并构建前后端，保持前端引用 `server/src/shared` 的目录关系。运行镜像包含 `server/dist`、生产依赖及 `/app/client/dist`。本轮仅静态核对配方，没有实际构建镜像。

[.dockerignore](../.dockerignore) 排除宿主机依赖、构建产物、环境变量文件、数据库及其 WAL/SHM 文件，防止复制宿主机原生模块或玩家数据进镜像。

[docker-compose.yml](../docker-compose.yml) 通过环境注入 `JWT_SECRET` 和 `ADMIN_PASS`，缺失时直接报错；静态目录和数据库路径均为绝对路径。`./server/data:/app/server/data` 是实际采用的目录挂载，保存账户、流水及全局配置。保留数据库不等于恢复中断牌局，见第 2.6 节。

## 八、 自动化测试与质量保障体系

2026-10-18 已执行统一检查 `npm run test:release`：双端构建成功，14 个测试文件共 291 项全部通过，生产产物冒烟检查 6/6 通过。以下为测试覆盖说明；临时旧库迁移已验证，实际玩家数据库未打开或迁移，Docker 容器镜像尚未构建验证。

### 8.1 裁判引擎全覆盖单测 (`tests/referee.test.ts`)
* **15/15 项全部通过**：
  1. 豹子、顺金、金花、顺子、对子、散牌判定；
  2. A-2-3 最小顺子判定与比点逻辑；
  3. 特殊 235 逆袭豹子；
  4. 无豹子时 235 作为普通单张；
  5. 同点数先比关键牌花色，仍相同时主动方判负；
  6. 20 轮满轮多人擂台裁决。

### 8.2 房间状态机流转单测 (`tests/room.test.ts`)
* **6/6 项全部通过**：
  1. 两人准备自动扣除底注并进入 playing 状态；
  2. 筹码不足 10 倍底注拦截入座；
  3. 看牌状态切换为明注（下注 1 倍，闷牌下注 0.5 倍）；
  4. 绝密 PK 比牌、胜负淘汰与奖池累加；
  5. 仅剩一人存活时自动结算派奖与庄家更替；
  6. 开局脱敏：除本人外手牌强制为 null；比牌后的查看另按直接胜者权限执行。

* 下注倍率专项测试见 `tests/betting.test.ts`：覆盖底注原额扣除、明牌 1 倍与闷牌 0.5 倍跟注、加注后的跟注、全押基准折算、比牌费用、余额与流水一致性，以及扣款失败时保留原单注基准。
* 前端金额回归测试见 `tests/frontend-betting.test.ts`：覆盖模拟对局扣款、动作事件金额、比牌弹窗费用、按钮余额门槛与高额下注特效判定。
* 思考时间测试见 [turn-timer.test.ts](../server/tests/turn-timer.test.ts)：模拟等待 24 小时，验证无限制房间不自动弃牌、开局及轮换没有截止时间、下一局保留设置，且限时超时弃牌与结算重置仍正常执行。
* [frontend-betting.test.ts](../server/tests/frontend-betting.test.ts) 同时验证大厅创建设置进入模拟控制器并跨开局／操作保持，以及牌桌“无限制”显示。
* [compare-privacy.test.ts](../server/tests/compare-privacy.test.ts) 验证发起方／被挑战方获胜授权、观战隔离、权限不继承、无效比牌、新局清空及快照副本独立；前端测试覆盖私密牌面、非胜者隐藏、模拟对局和比牌后终局弹窗顺序。

### 8.3 RESTful API 完整鉴权与账本单测 (`tests/api.test.ts`)
* **12 项测试**：
  1. 登录成功获取 Token 与错误拦截；
  2. 凭证受保护接口与管理员鉴权拦截；
  3. 管理员发号、改密、充扣筹码与原子流水记录；
  4. 用户个人资料更新与个人账本分页拉取。

### 8.4 新发牌测试与联机验证

`tests/dealing.test.ts` 覆盖五个分支、2～8 人唯一牌、精确保底、全部冤家组合、座位随机、双端裁判一致和真实模拟；`tests/dealing-room.test.ts` 覆盖下一局生效、脱敏、扣款回滚与循环平分流水。

`tests/dealing-socket.test.ts` 自动创建临时本机服务，以两个独立鉴权客户端完成准备、私发保底牌、比牌和派奖广播。`tests/api.test.ts` 增加配置权限、持久化、错误配置拒绝及模拟草稿隔离验证。测试使用独立内存数据库，不写入既有玩家数据。

[dealing-socket.test.ts](../server/tests/dealing-socket.test.ts) 还验证真实 `room:create` 收到 `turnSeconds: 0` 后，创建、开局、下注轮换和断线重连下发的房间状态均保持 `turnSeconds: 0`、`turnDeadline: null`。

该联机套件同时使用四名在局玩家、一名观战者及胜者额外窗口，验证比牌事件和快照的私密牌面隔离、连胜权限不传递、重连恢复及终局战报不泄漏输者手牌。

原 `tests/socket_e2e.ts` 仍是需要外部服务和指定账号的手动联调脚本；自动测试使用新脚本，不依赖该账号或固定端口。

### 8.5 数据库与服务审查回归

| 测试文件 | 项数 | 主要覆盖 |
| :--- | ---: | :--- |
| [database-integrity.test.ts](../server/tests/database-integrity.test.ts) | 39 | 旧库迁移与重开、失败初始化回滚、触发器和外键约束、内外层事务回滚、小数金额、经办人与房间归属、流水仅追加及分页 |
| [auth-validation.test.ts](../server/tests/auth-validation.test.ts) | 84 | 输入边界、账号与权限隔离、令牌生命周期与改密撤销、资金经办人、敏感字段及存储异常脱敏、生产配置安全边界 |
| [room-regressions.test.ts](../server/tests/room-regressions.test.ts) | 34 | 完整轮次、重复动作与重复派奖、最新钱包、金额范围、底注回滚、房间参数及公开投影 |
| [socket-regressions.test.ts](../server/tests/socket-regressions.test.ts) | 9 | 全窗口切房、多连接断线、重连、私密手牌、改密主动断连、逐事件鉴权及畸形消息 |

其余原有测试合计 125 项，包括修正完整轮次前提后的 `dealing-room.test.ts`，同时验证底池 `45÷3` 和 `50÷3` 的多人循环克制平分、扣款及流水。新增四个文件共 166 项，合计 291 项，无跳过项。

`npm test` 固定测试凭据与 `DB_PATH=:memory:`；测试配置将 Vite 环境文件目录指向临时空目录，业务配置在 `NODE_ENV=test` 时跳过 `.env`。迁移测试另用自动关闭和删除的系统临时数据库，接口及联机测试监听临时本机端口，不依赖现有服务或玩家账号。

[production-smoke.ts](../server/tests/production-smoke.ts) 由 `npm --prefix server run test:smoke` 执行，要求先构建。它从系统临时工作目录启动真实 `server/dist/index.js`，显式传入随机测试凭据、临时数据库和前端产物路径，检查不安全配置拒绝启动、页面与脚本托管、页面路由回退与 API 404、登录/开号/扣款/经办人审计、日志保密以及重启后的账户/余额/流水保留和不重复初始化；正常完成、失败或收到终止信号时关闭子进程并清理临时数据。

资料更新、资金调整和改密仅将已知业务错误返回 400；未预期存储错误交给统一错误处理返回脱敏 500，不能向客户端回显数据库路径或 SQL 细节。测试通过不改变 [在途资金恢复缺口](#26-尚未实现的在途资金恢复) 及前端尚未接入真实服务的边界。

---

## 九、 规则进阶探索与扩展设计：爆金币赏金击杀流 (Bounty Mode)

> **状态与实施约束（2026-10-18 用户确认）**：本节仅记录创想，尚未实现，短期内不计划开发，也未纳入近期开发或验收范围。以下规则、数值和参数示例均不代表已确认的实施需求或现有能力。除非用户后续明确要求启动该玩法，否则维护、审查、补齐功能和文档同步均不得被视为实施授权；不得据此新增模式参数、数据库字段、接口、页面或赏金结算逻辑。现有经典玩法继续按已实现规则维护。

在规则研讨中，针对炸金花“**比牌需支付一次跟注金额的 2 倍，但比赢只能淘汰一个对手，剩下的公共大奖池反而容易被后手未参与消耗的第三方坐收渔翁之利**”的经典痛点，设计了全新的“**爆金币赏金击杀流**”创新玩法。

### 9.1 创想中的规则与结算公式（未实现、未排期）
假设对局中有 A、B、C、D 四名玩家：
1. **3 倍挑战资格**：
   - 轮到玩家 C 出牌时，C 可支付当前单注的 **3 倍** 作为挑战金（已看牌则乘 2 即 6 倍），向任意在局玩家 B 发起单挑；
2. **挑战失败（C < B）**：
   - C 当场出局淘汰；
   - C 支付的 3 倍挑战金及此前下注的全部筹码，**全部留存在公共底池**，归属最终独霸全场的总冠军；
3. **挑战成功（C > B 击杀爆金币）**：
   - 被挑战者 B 当场出局淘汰；
   - **当场提现爆金币（50%）**：B 本局累计已投入总下注的 **50%**，立即从桌上爆出，**当场原子打入胜者 C 的个人钱包（落袋为安）**；
   - **悬赏滚雪球（50%）**：B 累计总下注的剩余 **50%**，转化为 C 头顶的“悬赏金”（叠加入 C 的个人累计池中）；
   - **后续击杀传递**：后续若有玩家 D 单独开死 C，D 同样可将 C 头顶累积总筹码的 50% 当场提现落袋；
4. **弃牌与自然终局**：
   - 若玩家主动弃牌（Fold），不属于被比牌击杀，其已下注筹码 100% 留存公共底池，不触发 50% 提现；
   - 若 C 最终战至最后成为唯一存活者，C 头顶累积的所有悬赏金连同公共底池全额入账 C 的钱包。

### 9.2 场景契合度与博弈风险平衡
* **使用场景定性**：本游戏定位为好友/宿舍内部局（线下 1 元 = 10,000 游戏币，纯娱乐局），无公网黑产刷币或团队合伙套现顾虑；
* **极度刺激的风险对冲**：B 能累积庞大下注，说明 C 同样已经投入了等量的大量筹码。C 选择支付 3 倍巨额开牌费，同样要承担比牌失败自身全部本金沉底的巨大风险；一旦比赢则能当场“爆金币回血”，极大提升了对局攻防刺激感，彻底破除“谁开谁吃亏”的僵局。

### 9.3 概念参数示意（非现有工程预留）
以下代码仅用于说明创想中的模式参数，不是当前源码声明。实际 `RoomOptions` 没有 `mode` 字段，服务端也没有实现或预留该玩法的模式切换、赏金账户及结算链路：
```typescript
export interface RoomOptions {
  roomId: string;
  roomName: string;
  baseAnte: number;
  turnSeconds: number;
  mode?: 'classic' | 'bounty'; // 经典通吃流 vs 爆金币赏金击杀流
}
```
* 用户后续明确要求启动后，再另行评审规则、资金守恒、账本事务、协议和页面影响；本节不构成开发排期或实现承诺，不应据此提前添加实现或扩展字段。
