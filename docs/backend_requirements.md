# 炸金花联机游戏 —— 后端架构设计与技术实现规范白皮书 (Backend Architecture & Implementation Specification)

> **文档定位与说明**：本文档基于当前后端完整工程源码（[`server/`](file:///Users/prina/Downloads/pussyGame/server/)）进行全面复盘、系统梳理与标准规范化更新。内容涵盖 Node.js + Express + Socket.io + SQLite 架构体系、无作弊防泄密权威裁判引擎、纯内存房间状态机、原子账本经济体系、管理员多维管控中枢、生产单端口静态托管、Docker 容器化部署、自动化测试验证体系，以及针对玩家规则深度研讨的“爆金币赏金击杀流”扩展设计。
> 相关协议与设计参考：[api_specification.md](file:///Users/prina/Downloads/pussyGame/docs/api_specification.md)、[frontend_requirements.md](file:///Users/prina/Downloads/pussyGame/docs/frontend_requirements.md)。
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
* **自动化测试矩阵**：Vitest 3.0 + Supertest 7.0 + Socket.io-client 4.8（涵盖算法单测、状态机单测、API 鉴权测试与真实双客户端 E2E 对局模拟）。

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
   - **单连接单独脱敏**：服务端下发全桌快照时，向 Socket A 发送的数据中，除 Socket A 自己的底牌外，其余玩家的手牌强制置为 `null`；观战者视角全员手牌为 `null`。
2. **原子金融级账本（ACID SQLite Transactions）**：
   - 玩家入座直接使用钱包账户余额，所有底注、跟注、加注、比牌扣除与胜利奖金派发，均在 SQLite `db.transaction()` 中原子完成；
   - 绝不允许“先下注成功、写库失败”的脏数据，余额非负强约束，杜绝刷币与坏账；
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
│   │   └── database.ts         # SQLite 连接池、WAL模式、建表与管理员初始发号
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

### 2.1 用户表结构 (`users`)
存放系统所有注册玩家与管理员账户实体：
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,       -- 账号名（英文字符与数字组合，全局唯一）
  password_hash TEXT NOT NULL,         -- bcrypt 哈希加密密文 (Cost: 10)
  nickname TEXT NOT NULL,              -- 显示昵称 (如 "赌怪张三")
  avatar TEXT DEFAULT 'avatar_1.png',  -- 头像标识
  balance INTEGER DEFAULT 0,           -- 钱包可用筹码余额（不可为负）
  role TEXT DEFAULT 'player',          -- 用户角色: 'player' 玩家 | 'admin' 管理员
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

### 2.2 筹码流水账本表 (`ledgers`)
记录全系统所有的筹码资产进出变动，单向追加写入，不可篡改：
```sql
CREATE TABLE IF NOT EXISTS ledgers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,            -- 关联的用户 ID
  type TEXT NOT NULL,                  -- 流水类型: 'recharge' | 'deduct' | 'ante' | 'bet' | 'game_win'
  amount INTEGER NOT NULL,             -- 变动数额 (正数为增加，负数为扣减)
  balance_after INTEGER NOT NULL,      -- 变动后即时结余
  description TEXT,                    -- 业务说明 (如 "第 8888 房间底注扣除", "发起比牌对决")
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ledgers_user_id ON ledgers(user_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_created_at ON ledgers(created_at);
```

### 2.3 原子事务控制与防刷原则 (`UserModel.changeBalance`)
在对局中，玩家的扣底注、下注、比牌消耗以及最终赢牌入账，全部封装在 SQLite 原子事务中（参考 [`UserModel.changeBalance`](file:///Users/prina/Downloads/pussyGame/server/src/models/userModel.ts)）：
```typescript
static changeBalance(
  userId: number,
  amount: number,
  type: 'recharge' | 'deduct' | 'ante' | 'bet' | 'game_win',
  description: string
): { balance: number } {
  const db = getDb();
  const transaction = db.transaction(() => {
    const user = db.prepare('SELECT id, balance FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('用户不存在');

    const newBalance = user.balance + amount;
    if (newBalance < 0) {
      throw new Error('筹码余额不足'); // 强校验：严禁产生负数余额
    }

    db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newBalance, userId);

    db.prepare(`
      INSERT INTO ledgers (user_id, type, amount, balance_after, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, type, amount, newBalance, description);

    return { balance: newBalance };
  });

  return transaction();
}
```
* **并发安全保证**：`better-sqlite3` 是同步执行的驱动库，配合 WAL 模式与 `db.transaction()`，天然形成互斥锁屏障，杜绝任何异步并发引发的重复下注或负余额问题。

### 2.4 默认管理员与开局控币机制
在 [`server/src/db/database.ts`](file:///Users/prina/Downloads/pussyGame/server/src/db/database.ts) 中，服务启动若检测到系统中无管理员，会自动插入默认管理员（账号 `admin`，初始密码 `admin123`，初始资金 `1,000,000` 筹码），并记录系统第一笔充值账本流水。后续由管理员在后台为朋友发号并分发初始筹码。

---

### 2.5 发牌配置表 (`game_settings`)

使用 `key TEXT PRIMARY KEY`、`value TEXT NOT NULL`、`updated_at DATETIME` 保存全局发牌配置，条目名为 `dealing_config_v1`。默认配置在条目不存在时提供；每次保存完整校验后使用原子更新。本局开局读取配置，后续保存只影响下一局。

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
   - 当顺时针跑完一整圈回到起点时，`currentRound` 轮数加 1；
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
3. **绝密原则**：比牌过程双方的手牌绝不对全场公开，也不向对方公开具体底牌，由裁判引擎计算后仅广播 `winnerId` 与 `loserId`；
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
      // 只有自己才能拿到非空的 cards 数组，他人一律下发 null！
      cards: isSelf ? seat.cards : null,
    };
  });
  // ... 返回脱敏后的房间状态快照
}
```

---

## 五、 WebSocket (Socket.io) 实时网关规范

WebSocket 网关是驱动全桌实时通信的神经中枢，统一在 [`server/src/socket/`](file:///Users/prina/Downloads/pussyGame/server/src/socket/) 下组织。

### 5.1 握手鉴权与房间恢复
* **连接拦截**：客户端建立 Socket 连接时必须在 `auth.token` 中附带有效 JWT。中间件调用 [`verifyToken`](file:///Users/prina/Downloads/pussyGame/server/src/utils/jwt.ts) 解析出 `userId`、`username`、`role` 并绑定至 Socket 实例，验签失败直接拒绝握手；
* **断线重连无缝恢复**：用户重新连入时，[`socketHandler.ts`](file:///Users/prina/Downloads/pussyGame/server/src/socket/socketHandler.ts) 检索其历史所在的房间：
  1. 自动调用 `socket.join("room:" + roomId)`；
  2. 立即单发一份该玩家合法的 `room:state` 脱敏快照，前端瞬间恢复桌面状态与手牌，零卡顿感。

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
* `chat:emoji`：上报表情 ID，房间内全员广播 `chat:emoji_broadcast`；
* `chat:phrase`：上报快捷短语 ID 与文本，房间内全员广播 `chat:phrase_broadcast`。

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
根目录已提供完整的容器化配方：
1. [`Dockerfile`](file:///Users/prina/Downloads/pussyGame/Dockerfile)：基于官方 `node:22-alpine` 镜像，支持 C++ 原生模块编译依赖，采用生产打包分离构建；
2. [`docker-compose.yml`](file:///Users/prina/Downloads/pussyGame/docker-compose.yml)：
   ```yaml
   services:
     pussy-game:
       build: .
       ports:
         - "3000:3000"
       environment:
         - PORT=3000
         - JWT_SECRET=zhajinhua-production-super-secret-key-2026
         - DB_PATH=/app/server/data/game.db
         - ADMIN_USER=admin
         - ADMIN_PASS=admin123
       volumes:
         - game-data:/app/server/data
   volumes:
     game-data:
   ```
   * 数据库通过数据卷 `game-data` 持久化，容器重启或重建升级不丢数据。

---

## 八、 自动化测试与质量保障体系

后端已建立高覆盖率的自动化测试套件（运行 `npm test` 自动执行全部测试）：

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
  6. 脱敏广播：除本人外手牌强制为 null。

* 下注倍率专项测试见 `tests/betting.test.ts`：覆盖底注原额扣除、明牌 1 倍与闷牌 0.5 倍跟注、加注后的跟注、全押基准折算、比牌费用、余额与流水一致性，以及扣款失败时保留原单注基准。
* 前端金额回归测试见 `tests/frontend-betting.test.ts`：覆盖模拟对局扣款、动作事件金额、比牌弹窗费用、按钮余额门槛与高额下注特效判定。
* 思考时间测试见 [turn-timer.test.ts](../server/tests/turn-timer.test.ts)：模拟等待 24 小时，验证无限制房间不自动弃牌、开局及轮换没有截止时间、下一局保留设置，且限时超时弃牌与结算重置仍正常执行。
* [frontend-betting.test.ts](../server/tests/frontend-betting.test.ts) 同时验证大厅创建设置进入模拟控制器并跨开局／操作保持，以及牌桌“无限制”显示。

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

原 `tests/socket_e2e.ts` 仍是需要外部服务和指定账号的手动联调脚本；自动测试使用新脚本，不依赖该账号或固定端口。

---

## 九、 规则进阶探索与扩展设计：爆金币赏金击杀流 (Bounty Mode)

在规则研讨中，针对炸金花“**比牌需支付一次跟注金额的 2 倍，但比赢只能淘汰一个对手，剩下的公共大奖池反而容易被后手未参与消耗的第三方坐收渔翁之利**”的经典痛点，设计了全新的“**爆金币赏金击杀流**”创新玩法。

### 9.1 核心规则设定与结算公式
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

### 9.3 未来服务端多模式扩展架构预留
服务端 `Room` 状态机架构已为该玩法预留清晰的扩展接入位：
```typescript
export interface RoomOptions {
  roomId: string;
  roomName: string;
  baseAnte: number;
  turnSeconds: number;
  mode?: 'classic' | 'bounty'; // 经典通吃流 vs 爆金币赏金击杀流
}
```
* 当后续用户希望实装该模式时，只需在房间创建参数中增加 `mode` 字段，并在 `Room.compare()` 中增加胜者 50% 现金入账与 50% 悬赏转移逻辑，即可实现双玩法自由切换。
