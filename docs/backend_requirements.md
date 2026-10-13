# 炸金花游戏 —— 后端专属设计需求与架构开发规范

> **使用说明**：本文档专门用于指导**后端开发对话**。后端工程师可根据本文档，独立搭建 Node.js + Express + Socket.io + SQLite 架构，实现无作弊防作弊权威裁判、纯内存房间流转、管理员发号控币经济系统以及生产单端口静态托管。
> 数据接口与 WebSocket 契约统一参照：`api_specification.md`。

---

## 一、 后端技术栈与工程定位
* **技术底座**：Node.js (ES Modules / TypeScript) + Express + Socket.io + `better-sqlite3`（轻量嵌入式高性能数据库）。
* **核心职责**：
  1. **绝对权威防作弊**：所有牌型生成、比牌输赢、下注倍率、倒计时流转全部由服务端严格裁决，向客户端仅下发当前操作者合法可见的数据；
  2. **独立经济系统**：玩家筹码持久化存储在 SQLite 中，入座直接用钱包余额对决，下注与赢钱实时原子扣账入账，防掉线防刷币；
  3. **房主/管理员后台**：提供专门的管理后台 API，支持给朋友发号、充减筹码、密码重置与审计日志；
  4. **单端口部署**：Express 同时托管 WebSocket 网关与前端静态构建文件（`dist`），占用单一服务器端口。

---

## 二、 SQLite 数据库结构设计

数据库文件默认存放于 `server/data/game.db`（首次启动自动创建表结构并初始化默认管理员账号）：

### 1. 用户表 (`users`)
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,      -- 账号（字母/数字）
  password_hash TEXT NOT NULL,         -- bcrypt 加密密码
  nickname TEXT NOT NULL,             -- 显示昵称
  avatar TEXT DEFAULT 'avatar_1.png', -- 头像标识
  balance INTEGER DEFAULT 0,          -- 钱包当前可用筹码（不可为负）
  role TEXT DEFAULT 'player',         -- 'player' | 'admin'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2. 筹码流水账本表 (`ledgers`)
```sql
CREATE TABLE IF NOT EXISTS ledgers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,                 -- 'recharge' | 'deduct' | 'ante' | 'bet' | 'game_win'
  amount INTEGER NOT NULL,            -- 变动数额（正数为入账，负数为支出）
  balance_after INTEGER NOT NULL,     -- 变动后余额
  description TEXT,                   -- 描述（如 "8888 房间底注扣除"）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 三、 炸金花核心规则与裁判算法引擎 (核心重点)

服务端需封装完全独立的 `GameReferee` 类，具备以下严密逻辑：

### 1. 牌库与洗牌 (Fisher-Yates)
* 扑克牌共 52 张（去除大小王），花色：黑桃 (spades)、红桃 (hearts)、梅花 (clubs)、方块 (diamonds)；点数：2~14（14 代表 A）。
* 开局使用 Fisher-Yates 算法充分打乱发牌，每位在座准备玩家各分 3 张。

### 2. 牌型权重判定体系 (从小到大)
1. **单张 (散牌)**：三张牌不构成任何组合，按最大单牌依次比点数；
2. **对子**：两张点数相同 + 一张散牌；
3. **顺子**：点数连续（如 2-3-4、10-J-Q、Q-K-A），特殊：A-2-3 为最小顺子；
4. **金花 (同花)**：三张花色相同但点数不连续；
5. **同花顺 (顺金)**：三张相同花色且点数连续；
6. **豹子**：三张点数完全相同（如 222 ~ AAA，AAA 最大）；
7. **特殊 235 逆袭规则**：
   * **不同花色的 2-3-5**，当且仅当场上比牌存在 **“豹子”** 时，235 大于所有豹子（逆袭）；
   * 若场上无任何豹子，不同花色 235 作为普通最小单张对待。

### 3. 同牌型对决裁决 (平局规则)
* 当两名玩家牌型与点数完全相等时，**主动发起比牌者判负**（保护被动防守方，符合经典大众规则）。

---

## 四、 纯内存房间状态机设计 (Room State Machine)

房间状态存储在服务端内存 `Map<string, Room>` 中：

### 1. 桌位与观战席
* 每个房间包含固定 `seats[8]`（0~7 共 8 个物理槽位），未入座进入房间的用户存入 `spectators` 集合。
* 玩家在局中强行断开或离开，状态设为 `folded`（弃牌），下注筹码不予退回。

### 2. 对局流转控制
```
等待准备 (waiting) 
    ──(在座准备人数 ≥ 2)──> 发牌扣底注 (playing)
    ──(轮流出资/看牌/加注/比牌)──> 单局决胜 (settling)
    ──(派发总奖池入账 SQLite，展示3秒)──> 重置回 (waiting)
```

### 3. 下注计算规则
* **当前单注基准（`currentBet`）**：
  * 未看牌（闷牌）玩家：下注额 = `currentBet`；
  * 已看牌（明注）玩家：下注额必须为 `currentBet * 2`；
  * 玩家选择加注（Raise）：更新新的 `currentBet`。
* **比牌费用**：
  * 轮到自己操作时，消耗当前单注的 2 倍筹码（若已看牌则乘明注倍率）向存活的任意对手发起 PK。
* **上限控制**：
  * 达到 20 轮上限时，强制触发 `max_round_showdown`，存活玩家亮牌自动决出唯一赢家。

---

## 五、 出牌倒计时控制器与断线保护

1. **倒计时定时器**：
   * 轮到玩家操作时，服务端生成 `turnDeadline = Date.now() + turnSeconds * 1000` 并设置 `setTimeout`；
   * 若玩家在规定时间内无操作，服务端自动触发 `game:fold` 弃牌，并将操作权顺延至下一位在局玩家。
2. **断线与切后台保护**：
   * 玩家掉线后，桌位状态保留，计时器照常倒计时；
   * 玩家在倒计时内重新连入（Socket.io `reconnect`），服务端根据 JWT 识别其身份，立即定向推送最新的全量 `room:state`，客户端无缝恢复操作权与手牌。

---

## 六、 部署与生产运维

* **单服务单端口**：
  ```javascript
  // Express 托管前端打包文件
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
  // 监听单一端口 (如 3000)
  server.listen(PORT, () => console.log(`Game Server running on port ${PORT}`));
  ```
* 启动命令：
  ```bash
  npm run build  # 构建前端
  npm run start  # 启动后端 (兼托管前端)
  ```
