# 炸金花游戏 —— 前后端分离架构与接口通信协议规范 (API & WebSocket Spec)

本文档旨在为**前端独立开发、Mock 联调以及后续后端实现**提供标准权威的契约规范。前后端开发严格遵循此协议。

发牌算法的构建规则、实现状态与变更同步要求见 [dealing_algorithm_requirements.md](dealing_algorithm_requirements.md)。

---

## 目录
1. [系统整体架构与通信原则](#一-系统整体架构与通信原则)
2. [公共错误码与 HTTP 响应结构](#二-公共错误码与-http-响应结构)
3. [RESTful HTTP API 规范](#三-restful-http-api-规范)
   - [3.1 鉴权与用户基础模块](#31-鉴权与用户基础模块)
   - [3.2 个人资料与账本流水模块](#32-个人资料与账本流水模块)
   - [3.3 超级管理员后台专区 (`/api/admin`)](#33-超级管理员后台专区-apiadmin)
4. [WebSocket (Socket.io) 实时对局协议规范](#四-websocket-socketio-实时对局协议规范)
   - [4.1 连接鉴权与生命周期](#41-连接鉴权与生命周期)
   - [4.2 房间与大厅信令 (Room & Lobby)](#42-房间与大厅信令-room--lobby)
   - [4.3 炸金花牌局流转信令 (Game Flow)](#43-炸金花牌局流转信令-game-flow)
   - [4.4 特效广播与比牌决斗 (Animation & Showdown)](#44-特效广播与比牌决斗-animation--showdown)
   - [4.5 互动表情与快捷短语 (Chat & Emoji)](#45-互动表情与快捷短语-chat--emoji)
5. [核心 TypeScript 类型定义 (共享模型)](#五-核心-typescript-类型定义-共享模型)
6. [前端先行开发与 Mock 调试指南](#六-前端先行开发与-mock-调试指南)

---

## 一、 系统整体架构与通信原则

```
               [ 前端 Web App (React + Tailwind) ]
               /                                 \
  HTTP / RESTful (Fetch/Axios)            WebSocket (Socket.io-client)
  • 登录鉴权 (JWT)                        • 房间与桌位管理
  • 管理员发号 / 充减筹码                  • 发牌、看牌、下注、比牌
  • 个人流水账本查询                       • 实时倒计时、断线重连、动效广播
               \                                 /
               [ 后端单体服务 (Node.js + Express) ]
                                |
                   [ SQLite (better-sqlite3) ]
```

1. **前后端解耦与端口**：
   - 开发环境：前端 Vite 运行在 `http://localhost:5173`，通过代理（Proxy）转发 `/api` 和 `socket.io` 到后端 `http://localhost:3000`。
   - 生产环境：前端构建后的 `dist` 静态资源直接由 Express 托管，**同端口统一服务**。
2. **鉴权机制**：
   - 用户使用管理员分配的账号密码登录成功后，返回 `token` (JWT)。
   - **HTTP 请求**：通过 Header `Authorization: Bearer <token>` 携带。
   - **WebSocket 连接**：通过 Socket.io 初始化选项 `io({ auth: { token } })` 携带。
3. **数据一致性原则**：
   - 筹码变动（下注、扣除底注、胜利派发、管理员充减）**完全在服务端原子完成并持久化写入 SQLite**。
   - 前端接收到操作成功广播后更新视图，断线重连一律以服务端下发的最新全量 `room:state` 快照为准。

---

## 二、 公共错误码与 HTTP 响应结构

所有 HTTP 接口均返回统一的 JSON 包裹对象：

```typescript
interface ApiResponse<T = any> {
  code: number;       // 200 表示成功，非 200 表示业务异常
  message: string;    // 提示信息，如 "操作成功" 或 "筹码余额不足"
  data: T;            // 业务实体数据，失败时为 null
}
```

### 业务状态码枚举
* `200`: 成功 (Success)
* `400`: 请求参数校验失败 (Bad Request)
* `401`: 未登录或 Token 已过期 (Unauthorized)
* `403`: 权限不足（非管理员尝试调用后台 API）(Forbidden)
* `404`: 资源不存在（房间未找到 / 用户不存在）
* `500`: 服务器内部错误

---

## 三、 RESTful HTTP API 规范

### 3.1 鉴权与用户基础模块

#### 1. 用户/管理员登录
* **路径**：`POST /api/auth/login`
* **说明**：玩家及管理员统一登录入口。管理员账号系统在初次启动时默认预置（用户名：`admin`，密码由环境变量或配置文件定义）。
* **请求体 (Request Body)**：
```json
{
  "username": "zhangsan",
  "password": "user123456"
}
```
* **响应数据 (Response Data)**：
```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "zhangsan",
      "nickname": "绝世赌神张三",
      "avatar": "avatar_1.png",
      "balance": 10000,
      "role": "player" // "player" | "admin"
    }
  }
}
```

#### 2. 获取当前登录用户信息
* **路径**：`GET /api/auth/me`
* **Headers**：`Authorization: Bearer <token>`
* **响应数据**：
```json
{
  "code": 200,
  "message": "ok",
  "data": {
    "id": 1,
    "username": "zhangsan",
    "nickname": "绝世赌神张三",
    "avatar": "avatar_1.png",
    "balance": 10000,
    "role": "player"
  }
}
```

---

### 3.2 个人资料与账本流水模块

#### 1. 更新个人昵称与头像
* **路径**：`PUT /api/user/profile`
* **Headers**：`Authorization: Bearer <token>`
* **请求体**：
```json
{
  "nickname": "狂暴牌手小李",
  "avatar": "avatar_5.png"
}
```
* **响应数据**：
```json
{
  "code": 200,
  "message": "个人资料更新成功",
  "data": {
    "nickname": "狂暴牌手小李",
    "avatar": "avatar_5.png"
  }
}
```

#### 2. 查询个人筹码流水账本
* **路径**：`GET /api/user/ledger?page=1&pageSize=20`
* **Headers**：`Authorization: Bearer <token>`
* **响应数据**：
```json
{
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "id": 101,
        "type": "game_win", // "recharge" | "deduct" | "ante" | "bet" | "game_win"
        "amount": 1600,     // 正数为增加，负数为扣除
        "balanceAfter": 11600,
        "description": "第 8888 房间 炸金花胜出独揽奖池",
        "createdAt": "2026-10-13T20:30:00.000Z"
      },
      {
        "id": 100,
        "type": "bet",
        "amount": -200,
        "balanceAfter": 10000,
        "description": "第 8888 房间 加注 200",
        "createdAt": "2026-10-13T20:28:15.000Z"
      }
    ],
    "total": 42
  }
}
```

---

### 3.3 超级管理员后台专区 (`/api/admin`)
*提示：以下接口必须验证当前用户的 JWT 具备 `role: "admin"` 权限。*

#### 1. 管理员开通新用户账号
* **路径**：`POST /api/admin/users`
* **请求体**：
```json
{
  "username": "lisi",
  "password": "user654321",
  "nickname": "李四",
  "avatar": "avatar_2.png",
  "initialChips": 5000
}
```
* **响应数据**：
```json
{
  "code": 200,
  "message": "账号创建成功",
  "data": {
    "id": 2,
    "username": "lisi",
    "balance": 5000
  }
}
```

#### 2. 获取用户列表及实时状态
* **路径**：`GET /api/admin/users`
* **响应数据**：
```json
{
  "code": 200,
  "message": "ok",
  "data": [
    {
      "id": 1,
      "username": "zhangsan",
      "nickname": "绝世赌神张三",
      "avatar": "avatar_1.png",
      "balance": 11600,
      "isOnline": true,
      "currentRoomId": "8888",
      "createdAt": "2026-10-13T18:00:00.000Z"
    },
    {
      "id": 2,
      "username": "lisi",
      "nickname": "李四",
      "avatar": "avatar_2.png",
      "balance": 5000,
      "isOnline": false,
      "currentRoomId": null,
      "createdAt": "2026-10-13T19:30:00.000Z"
    }
  ]
}
```

#### 3. 手动充值/扣减玩家筹码
* **路径**：`POST /api/admin/users/:id/chips`
* **请求体**：
```json
{
  "amount": 2000, // 正数为充值，负数为扣减
  "reason": "老朋友微信转账线下结算，充值 2000"
}
```
* **响应数据**：
```json
{
  "code": 200,
  "message": "筹码操作成功",
  "data": {
    "userId": 2,
    "balance": 7000
  }
}
```

#### 4. 重置玩家密码
* **路径**：`POST /api/admin/users/:id/reset-password`
* **请求体**：
```json
{
  "newPassword": "newSecretPassword123"
}
```
* **响应数据**：
```json
{
  "code": 200,
  "message": "密码重置成功"
}
```

#### 5. 获取全局审计流水日志
* **路径**：`GET /api/admin/audit-logs?page=1&pageSize=50`
* **响应数据**：返回包括管理员充减、对局赢家胜出等在内的全局所有资金变动记录。

#### 6. 删除玩家账号
* **路径**：`DELETE /api/admin/users/:id`
* **说明**：管理员删除玩家账号及其关联对局资产记录（主管理员 `admin` 禁止删除）。
* **响应数据**：
```json
{
  "code": 200,
  "message": "账号删除成功"
}
```

#### 7. 编辑玩家账号资料与权限
* **路径**：`PUT /api/admin/users/:id`
* **请求体**：
```json
{
  "nickname": "绝世赌神张三(已更名)",
  "avatar": "👑",
  "role": "player",        // "player" | "admin"
  "isBanned": false        // true 表示封禁禁止进入游戏
}
```
* **响应数据**：
```json
{
  "code": 200,
  "message": "资料更新成功",
  "data": {
    "id": 1,
    "username": "zhangsan",
    "nickname": "绝世赌神张三(已更名)",
    "avatar": "👑",
    "role": "player",
    "isBanned": false
  }
}
```

#### 8. 获取充值与调账流水专账记录
* **路径**：`GET /api/admin/chips/logs?page=1&pageSize=50`
* **响应数据**：
```json
{
  "code": 200,
  "message": "ok",
  "data": {
    "list": [
      {
        "id": 1001,
        "userId": 1,
        "username": "zhangsan",
        "amount": 5000,
        "balanceAfter": 10000,
        "reason": "老友微信转账充值",
        "operator": "admin",
        "type": "recharge",
        "createdAt": "2026-10-13 21:30:00"
      }
    ],
    "total": 1
  }
}
```

#### 9. 获取当前发牌配置

- 路径：`GET /api/admin/algorithm/config`。
- 已实现；要求登录且具有管理员身份，未登录返回 401，普通玩家返回 403。
- 成功返回 `{ code: 200, message: "ok", data: AlgorithmConfig }`，默认 `data` 如下：

```json
{
  "version": 1,
  "deckProbabilities": {
    "standard": 20,
    "short": 80
  },
  "standardModes": {
    "random": 30,
    "rival": 40,
    "guarantee": 30
  },
  "shortModes": {
    "random": 70,
    "rival": 30
  },
  "rivalWeights": {
    "big_pair": 35,
    "straight": 35,
    "flush": 20,
    "premium": 10
  },
  "guarantees": {
    "2": {
      "pair": 2,
      "straight": 0,
      "flush": 0,
      "straight_flush": 0,
      "leopard": 0
    },
    "3": {
      "pair": 2,
      "straight": 0,
      "flush": 0,
      "straight_flush": 0,
      "leopard": 0
    },
    "4": {
      "pair": 2,
      "straight": 0,
      "flush": 0,
      "straight_flush": 0,
      "leopard": 0
    },
    "5": {
      "pair": 2,
      "straight": 0,
      "flush": 0,
      "straight_flush": 0,
      "leopard": 0
    },
    "6": {
      "pair": 2,
      "straight": 0,
      "flush": 0,
      "straight_flush": 0,
      "leopard": 0
    },
    "7": {
      "pair": 2,
      "straight": 0,
      "flush": 0,
      "straight_flush": 0,
      "leopard": 0
    },
    "8": {
      "pair": 2,
      "straight": 0,
      "flush": 0,
      "straight_flush": 0,
      "leopard": 0
    }
  }
}
```

每组概率范围为 0～100，组内合计 100%。所有七种人数方案都必须提供，五种牌型人数为非负整数，合计不能超过对应人数。`version` 必须为 1。服务端只保存校验后的完整新配置，旧的模式倍率和个人幸运格式不再适用。

#### 10. 保存发牌配置

- 路径：`POST /api/admin/algorithm/config`，管理员鉴权。
- 请求体为第 9 项的完整 `AlgorithmConfig` 对象。
- 成功：`{ code: 200, message: "发牌配置已保存，从下一局开始生效", data: AlgorithmConfig }`。
- 配置以 `dealing_config_v1` 写入 `game_settings`，每个房间下一次开局读取；不改变当前局牌库或已经生成的手牌。
- 校验失败返回 HTTP 400 和 `{ code: 400, message, data: null }`，已保存配置保持不变；页面不得把失败显示为保存成功。

#### 11. 执行真实发牌模拟

- 路径：`POST /api/admin/algorithm/simulate`，管理员鉴权。
- 请求：`{ rounds: number, playerCount: number, config?: AlgorithmConfig }`。
- `rounds` 为 1～5,000 的整数，`playerCount` 为 2～8 的整数；提供 `config` 时使用该草稿，否则读取已保存配置。模拟不保存草稿、不改玩家余额。
- 成功包裹仍为 `{ code: 200, message, data }`；数据字段如下：

| 字段 | 含义 |
| :--- | :--- |
| `algorithmVersion` | 当前发牌算法版本，`2.0.0` |
| `totalRounds`、`playerCount`、`totalHands` | 实际模拟局数、人数、总手数；总手数等于局数乘人数 |
| `branches` | `standard_random`、`standard_rival`、`standard_guarantee`、`short_random`、`short_rival` 五项实际局数 |
| `stats` | 以 `HandRankType` 为键，每项包含 `count` 和 `percentage`；按手统计，特殊 235 单列、不重复计入散牌 |

请求超限、人数非法或草稿配置无效时返回 HTTP 400。模拟调用与正式牌局相同的发牌函数，统计来自实际采样。

---

## 四、 WebSocket (Socket.io) 实时对局协议规范

### 4.1 连接鉴权与生命周期
客户端连接时直接通过 `auth` 传递 Token：
```javascript
import { io } from "socket.io-client";
const socket = io("http://localhost:3000", {
  auth: { token: localStorage.getItem("zjh_token") },
  transports: ["websocket"]
});
```

#### 异常断开与错误事件：`error`
```json
{
  "code": 401,
  "message": "身份凭据无效，请重新登录"
}
```

---

### 4.2 房间与大厅信令 (Room & Lobby)

#### 1. 创建房间
* **客户端发出**：`room:create`
* **入参**：
```json
{
  "roomName": "老友聚会局",
  "baseAnte": 10,             // 底注（例如 10 筹码）
  "turnSeconds": 20           // 房主自定义思考倒计时（秒），如 15/20/30/60
}
```
* **服务端响应回调**：`{ code: 200, roomId: "8888" }`，同时该客户端自动加入该房间，并触发全量 `room:state` 广播。

#### 2. 加入房间
* **客户端发出**：`room:join`
* **入参**：`{ "roomId": "8888" }`
* **说明**：玩家通过输入 4~6 位房间码或点击分享链接入房。进入后默认为**观战席**。

#### 3. 选座坐下
* **客户端发出**：`room:sit`
* **入参**：`{ "seatIndex": 0 }` (0~7，最多 8 个物理桌位)
* **业务逻辑**：如果该座位空闲且当前玩家筹码大于等于 `baseAnte * 10`，入座成功，状态变为待准备。

#### 4. 离开座位 (站起变为观战)
* **客户端发出**：`room:stand`
* **入参**：`{}`
* **注意**：如果在对局中站起，直接触发弃牌（Fold）。

#### 5. 准备 / 取消准备
* **客户端发出**：`room:ready`
* **入参**：`{ "isReady": true }`

#### 6. 核心全量房间状态广播：`room:state` (服务端推全桌)
每当房间有人进出、换座、准备、开局、下注、轮转时，服务端均会广播此快照（客户端根据此状态做 100% 确定性渲染）：

```json
{
  "roomId": "8888",
  "deckKind": "standard", // 本局牌库类型，贯穿比牌与结算
  "roomName": "老友聚会局",
  "baseAnte": 10,
  "turnSeconds": 20,
  "gameStatus": "playing", // "waiting" (等待开局) | "playing" (游戏中) | "settling" (结算中)
  "currentRound": 3,      // 当前对局进行到第几轮 (上限 20 轮)
  "currentTurnPlayerId": 1, // 当前该谁操作
  "turnDeadline": 1799889920000, // 倒计时截止时间戳 (前端做本地进度条与倒数)
  "currentBet": 20,       // 当前明牌单注基准（明牌下注 20，闷牌下注 10；开局底注另按 baseAnte 扣除）
  "totalPot": 380,        // 桌面中央奖池总筹码
  "dealerSeatIndex": 0,   // 庄家座位索引
  "seats": [              // 动态 8 个座位数组 (无人的位置为 null)
    {
      "seatIndex": 0,
      "user": {
        "id": 1,
        "nickname": "绝世赌神张三",
        "avatar": "avatar_1.png",
        "balance": 9800
      },
      "status": "active", // "empty" | "sitting" | "ready" | "active" (在局中) | "folded" (已弃牌) | "lost" (比牌淘汰)
      "hasLooked": true,  // 是否已看牌 (明注)
      "cards": [          // 重点：仅本人可查看到自己的底牌对象，其他人的 cards 均为 null
        { "suit": "spades", "rank": 14 },
        { "suit": "hearts", "rank": 14 },
        { "suit": "diamonds", "rank": 14 }
      ],
      "currentInvested": 60, // 该玩家在本局总共投入的筹码
      "isReady": true
    },
    {
      "seatIndex": 1,
      "user": {
        "id": 2,
        "nickname": "狂暴李四",
        "avatar": "avatar_2.png",
        "balance": 4900
      },
      "status": "active",
      "hasLooked": false,
      "cards": null,      // 他人手牌严密屏蔽
      "currentInvested": 30,
      "isReady": true
    }
  ],
  "spectators": [         // 观战席列表
    { "id": 5, "nickname": "吃瓜群众王五", "avatar": "avatar_3.png" }
  ]
}
```

---

### 4.3 炸金花牌局流转信令 (Game Flow)

#### 1. 开局通知：`game:start` (服务端广播)
当在座准备人数 ≥ 2 且全部就绪（或房主点击开始）时触发：
```json
{
  "round": 1,
  "deckKind": "standard", // 本局牌库类型
  "dealerId": 1,
  "baseAnte": 10,
  "totalPot": 30,
  "handCards": [          // 服务端分别单发给各在座玩家自己的三张牌（本地盖牌等待翻开）
    { "suit": "spades", "rank": 14 },
    { "suit": "hearts", "rank": 14 },
    { "suit": "diamonds", "rank": 14 }
  ]
}
```

#### 2. 看牌操作
* **客户端发出**：`game:look`
* **说明**：玩家本地触发 3D 翻牌动效，向服务端上报状态；服务端记录该玩家 `hasLooked: true`，后续按 `currentBet` 的 1 倍下注；未看牌时为 0.5 倍。开局底注始终按 `baseAnte` 原额扣除。
* **服务端向全桌广播**：`game:player_looked`
```json
{
  "playerId": 1,
  "nickname": "绝世赌神张三"
}
```

#### 3. 下注 / 加注 / All-in
* **客户端发出**：`game:bet`
* **入参**：
```json
{
  "actionType": "raise", // "call" (跟注) | "raise" (加注) | "allin" (全押)
  "chipOption": 50,     // 档位值: 10 | 20 | 50 | 100 | 500 | 1000 | 5000 | 8000 | 10000 | "allin"
  "amount": 50          // 可选；实际扣款由服务端按明牌 1 倍、闷牌 0.5 倍计算，不信任客户端金额
}
```
* **服务端广播**：`game:player_bet` (触发筹码飞入底池动效)
```json
{
  "playerId": 1,
  "actionType": "raise",
  "chipOption": 50,
  "amount": 50,
  "totalPot": 430,
  "playerBalance": 9750,
  "specialEffect": null // "none" | "gold" (本局首次 5000+ 全屏大金盛典与女声播报) | "allin" (All-in 全押特效)
}
```

#### 4. 弃牌操作
* **客户端发出**：`game:fold`
* **服务端广播**：`game:player_folded`
```json
{
  "playerId": 1,
  "reason": "manual" // "manual" (主动认输) | "timeout" (倒计时超时自动弃牌)
}
```

---

### 4.4 特效广播与比牌决斗 (Animation & Showdown)

#### 1. 发起双人比牌 (PK)
* **条件**：第 2 轮起开放，比牌花费为发起方一次跟注金额的 2 倍（闷牌为 `currentBet` 的 1 倍，明牌为 2 倍）。
* **客户端发出**：`game:compare`
* **入参**：
```json
{
  "targetPlayerId": 2 // 被选择挑战的在局玩家 ID
}
```

#### 2. 比牌决斗结果广播：`game:compare_result` (服务端向全桌广播)
> **绝密悬念原则**：决斗碰撞动画播放后，全桌任何人（包括旁观者与对决者自身）均**不公开彼此底牌**，仅公布裁决输赢，败者扣牌出局！

```json
{
  "initiatorId": 1,
  "targetId": 2,
  "winnerId": 1,
  "loserId": 2,
  "cost": 100,
  "totalPot": 530
}
```
*前端动效表现*：屏幕中央出现两人头像的 1v1 烈焰雷霆对撞动画，随后 `loserId` 玩家头像变灰并打上“淘汰/败”印章。

#### 3. 单局终局结算：`game:over`

单人存活或超过 20 轮强制摊牌时触发。事件结构：

```typescript
{
  winnerId: number | null; // 唯一胜者编号；平分时为 null
  winnerIds: number[]; // 全部获奖玩家
  payouts: Array<{ playerId: number; amount: number }>; // 各自所得
  splitPot: boolean;
  winAmount: number; // 本次分配的总底池，不是每人所得
  reason: 'last_survivor' | 'max_round_showdown';
  revealedCards: Array<{
    playerId: number;
    cards: Card[];
    handType: HandRankType;
    handTypeName: string;
  }>;
}
```

循环克制示例：`winnerId: null`、`winnerIds: [1, 2, 3]`、`splitPot: true`；底池 30 时三笔 `payouts` 各为 10。平分仅包含仍参与摊牌的人，弃牌和比牌出局者不分奖。所有派奖的余额及流水原子提交后才广播。

强制摊牌公开全部存活手牌，单人获胜公开赢家手牌。前端按 `playerId` 匹配各获奖者的牌面和金额。单人胜出更新庄家，平分保持原庄家；服务端 4 秒后重置准备状态。

`room:state` 与 `game:start` 只新增公开的 `deckKind`，不提供发牌模式、冤家或保底身份。

---

### 4.5 互动表情与快捷短语 (Chat & Emoji)

#### 1. 发送快捷表情
* **客户端发出**：`chat:emoji`
* **入参**：`{ "emojiId": "fire" }` (如: `cool`, `fire`, `sweat`, `skull`, `money`, `cry`)
* **服务端广播**：`chat:emoji_broadcast`
```json
{
  "playerId": 1,
  "emojiId": "fire"
}
```
*前端动效*：在 `playerId` 头像上方浮动冒出气泡表情动画，并伴有音效，2 秒后淡出。

#### 2. 发送快捷短语
* **客户端发出**：`chat:phrase`
* **入参**：`{ "phraseId": 3, "text": "快点吧，我等到花儿都谢了！" }`
* **服务端广播**：`chat:phrase_broadcast`，在头像侧边弹出气泡文本框。

---

## 五、 核心 TypeScript 类型定义 (共享模型)

前端工程中可直接在 `src/types/game.ts` 中引用此类型定义：

```typescript
// 卡牌花色
export type CardSuit = 'spades' | 'hearts' | 'clubs' | 'diamonds'; // 黑桃, 红桃, 梅花, 方块

// 卡牌定义 (rank: 2~14，14 代表 A)
export interface Card {
  suit: CardSuit;
  rank: number;
}

// 牌型等级定义
export type HandRankType =
  | 'special_235'      // 特殊 235 (花色不全相同 235 遇豹子逆袭)
  | 'high_card'        // 单张 (散牌)
  | 'pair'             // 对子
  | 'straight'         // 顺子
  | 'flush'            // 金花
  | 'straight_flush'   // 顺金
  | 'leopard';         // 豹子 (三张相同)

// 玩家在桌状态
export type PlayerTableStatus =
  | 'empty'
  | 'sitting'
  | 'ready'
  | 'active'
  | 'folded'
  | 'lost';

// 玩家桌位信息
export interface TableSeat {
  seatIndex: number;
  user: {
    id: number;
    nickname: string;
    avatar: string;
    balance: number;
  } | null;
  status: PlayerTableStatus;
  hasLooked: boolean;
  cards: Card[] | null;     // 仅本人可见具体牌面，他人为 null
  currentInvested: number;  // 本局已下注金额
  isReady: boolean;
}

// 房间全量状态
export interface RoomState {
  roomId: string;
  roomName: string;
  deckKind: 'standard' | 'short';
  baseAnte: number;
  turnSeconds: number;
  gameStatus: 'waiting' | 'playing' | 'settling';
  currentRound: number;
  currentTurnPlayerId: number | null;
  turnDeadline: number | null;
  currentBet: number;
  totalPot: number;
  dealerSeatIndex: number;
  seats: (TableSeat | null)[];
  spectators: Array<{ id: number; nickname: string; avatar: string }>;
}
```

---

## 六、 前端先行开发与 Mock 调试指南

在后端开发尚未介入前，前端可通过以下方式实现**纯前端 100% 独立开发与高保真动效调试**：

1. **Mock 状态仓库 (Mock Game Store)**：
   * 前端使用 Zustand 或 Pinia/React Context 构建一个 `useMockGame` 状态。
   * 提供“模拟发牌”、“模拟翻牌看牌”、“模拟下注抛筹码”、“模拟 PK 决斗”、“模拟全押特效”快捷调试悬浮条（可在界面左下角放一个 DevTool 开关）。
2. **动态 8 人自适应桌位渲染算法**：
   * 无论房间内有 2、3、4、5、6、7 还是 8 人，根据在座玩家的相对位置，通过三角函数：
     $$\theta_i = \frac{2\pi \times (i - myIndex)}{N} - \frac{\pi}{2}$$
     保证**当前玩家永远处于桌子正下方底座视角（第一人称）**，其余对手均匀分布在马蹄形/椭圆牌桌上方及左右两侧。
3. **音效合成方案 (Web Audio API)**：
   * 前端无需等待外部音频素材加载，可通过 `AudioContext` 振荡器快速合成发牌白噪声轻擦音、筹码金属碰撞音，确保开发阶段全流程有声。

---
至此，前后端分离的权威 API 与信令规范已全部就绪。前端开发者可直接对照此文档编写界面、状态流与动效！
