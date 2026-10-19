# 炸金花游戏 —— 前后端分离架构与接口通信协议规范 (API & WebSocket Spec)

本文档旨在为**前端独立开发、Mock 联调以及后续后端实现**提供标准权威的契约规范。前后端开发严格遵循此协议。

> 2026-10-18 源码核对及回归验证：14 个测试文件、291 项通过，生产产物冒烟检查 6/6 通过；覆盖范围和仍未实现的恢复能力见 [数据库与服务审查记录](database_service_review.md)。未实现接口仍在各小节明确标出。
> **范围约束**：[爆金币赏金击杀流](backend_requirements.md#九-规则进阶探索与扩展设计爆金币赏金击杀流-bounty-mode) 尚未实现，仅作创想存档，不在近期开发或验收范围；用户后续明确要求启动前，不得据此增加页面、接口、模式参数或相关实现。

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
   - 每笔筹码变动及其流水在服务端同一数据库事务中提交；整桌底注批扣和多人派奖分别有外层事务。**房间与在途底池未持久化，进程重启不能恢复或自动退款**，不能将单笔原子性理解为整局资金恢复保证。
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
* `404`: HTTP 接口路径不存在或对应功能尚未实现
* `500`: 服务器内部错误，响应不得回显数据库路径、SQL、堆栈或凭据

### 通用参数与会话约束（已实现）

- 登录用户名为去首尾空格后 1～64 字符；登录密码非空且 UTF-8 不超过 72 字节。新建及重置密码至少 6 字符、不全为空白、不含 NUL，且 UTF-8 不超过 72 字节。
- 昵称去首尾空格后 1～40 字符，头像标识 1～256 字符；上述文本拒绝控制字符。修改资料至少提供昵称或头像之一；未提供的字段保留原值。
- 初始筹码是非负有限数；充值/扣减是非零有限数，金额绝对值及结果余额不超过 `Number.MAX_SAFE_INTEGER`，余额不能为负。保留现有小数筹码；管理员原因可省略，为文本时最多 500 字符且不得含控制字符，空白原因使用服务端默认描述。
- 分页 `page` 为正整数，`pageSize` 为 1～100 的整数，偏移量也必须是安全整数；拒绝小数、负数、混合字符串、数组。省略时个人流水默认 1/20，全局流水默认 1/50。路径用户编号为正安全整数。
- 请求体格式或参数错误返回 400；未知 `/api` 路径返回统一 404 JSON，不能返回前端页面冒充接口成功。
- 资料更新、充值/扣减和改密的已知业务拒绝返回 400；未预期存储错误统一返回脱敏 500，不伪装成用户输入错误。响应格式仍为 `{ code, message, data }`。
- JWT 使用 HS256 且有效期 7 天；载荷包含 `authVersion`，每次鉴权比较数据库当前凭据版本，管理员权限以数据库当前角色为准。重置密码递增版本并主动断开该账号所有在线连接；旧令牌及本次升级前无版本字段的令牌均需重新登录。

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
*提示：以下已实现接口必须通过 JWT 验证并确认数据库当前用户为管理员；令牌内的历史角色不能覆盖当前数据库角色。*

#### 1. 管理员开通新用户账号
* **路径**：`POST /api/admin/users`
* **身份边界**：当前只开通 `player` 账号；即使请求带有 `role/isBanned` 也不会实现授权或封禁，这些管理功能尚未接入。
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
      "role": "player",
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
      "role": "player",
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
* **响应数据**：`{ code: 200, message: "ok", data: { list, total } }`。`list` 包含个人流水字段，以及 `userId/username/nickname/operatorId/operatorUsername/roomId`。经办人从鉴权身份记录，不能由请求伪造；系统初始化与旧历史未知经办人用 `null`，旧流水未知房间也用 `null`。
* 当前是资金流水审计；不包含改密、零余额开号、封禁或规则配置修订等通用操作审计。`roomId` 不等于唯一牌局编号。
* `createdAt` 返回 SQLite UTC 时间文本（通常 `YYYY-MM-DD HH:MM:SS`），不保证为 ISO 8601。

#### 6. 删除玩家账号（待实现）

> 以下是预留设计，没有后端路由或完整数据库支持；所列成功响应仅为目标契约，当前调用返回 404。
* **路径**：`DELETE /api/admin/users/:id`
* **待确定**：删除或停用账户的政策尚需明确。现有资金流水仅允许追加，不能直接以删除关联资金记录作为安全删除方案。
* **响应数据**：
```json
{
  "code": 200,
  "message": "账号删除成功"
}
```

#### 7. 编辑玩家账号资料与权限（待实现）

> 以下是预留设计，没有后端路由或完整数据库支持；所列成功响应仅为目标契约，当前调用返回 404。
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

#### 8. 获取充值与调账流水专账记录（待实现）

> 以下是预留设计，没有后端路由或完整数据库支持；所列成功响应仅为目标契约，当前调用返回 404。
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

当前没有线上充值订单或提现申请接口。`POST /admin/users/:id/chips` 的负数仅代表管理员记录线下扣减，不包含资金冻结、实际付款或失败退款。

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

握手和每个入站事件都会验证令牌和当前凭据版本；失败拒绝连接或通过回调/`error` 返回 401 后断开。改密成功会主动断开全部旧连接。同账号多连接共享一个房间归属，只断开一个窗口不会删除仍在线的观战身份。重连恢复仅在服务进程仍持有房间内存时有效，不能跨服务重启恢复。

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
  "turnSeconds": 20           // 每轮思考时间（秒）：15/20/30/60；0 表示无限制；省略时默认 20
}
```
* **参数校验**：`roomName` 必须为字符串，去首尾空格后为空则采用默认房名；`baseAnte` 须为正有限数且十倍不超过安全整数上限，现有最小底注仍取 1；`turnSeconds` 必须为整数。创建的房号为 4 位数字，可用房号耗尽时返回 400。
* **房间归属**：同账号只属于一个房间。创建/加入新房时自动离开旧房，局中离座按弃牌处理，同账号全部在线连接一起切换订阅；加入同房间保留原座位。
* **思考时间契约**：`turnSeconds = 0` 明确表示无限制，服务端必须保留该值，不得回退为默认值或下限。非零值继续按 10～60 秒截取；未提供时默认 20 秒。
* **无限制房间**：开局及每次轮换后，`room:state.turnSeconds` 为 `0`、`turnDeadline` 为 `null`；不注册回合超时任务，不因等待时间或断线自动弃牌。手动下注、弃牌、比牌及 20 轮上限仍按现有规则执行。
* **服务端响应回调**：`{ code: 200, roomId: "8888" }`，同时该客户端自动加入该房间，并触发全量 `room:state` 广播。

#### 2. 加入房间
* **客户端发出**：`room:join`
* **入参**：`{ "roomId": "8888" }`，须为 4～6 位数字字符串；找不到返回 404。
* **说明**：玩家通过输入 4~6 位房间码或点击分享链接入房。进入后默认为**观战席**。

#### 3. 选座坐下
* **客户端发出**：`room:sit`
* **入参**：`{ "seatIndex": 0 }` (0~7 的整数，最多 8 个物理桌位)
* **业务逻辑**：如果该座位空闲且当前玩家筹码大于等于 `baseAnte * 10`，入座成功，状态变为待准备。

#### 4. 离开座位 (站起变为观战)
* **客户端发出**：`room:stand`
* **入参**：`{}`
* **注意**：如果在对局中站起，直接触发弃牌（Fold）。

#### 5. 准备 / 取消准备
* **客户端发出**：`room:ready`
* **入参**：`{ "isReady": true }`，只接受布尔值。
* **开局权限**：至少两名在座玩家且全员准备后自动开局。当前没有房主字段、房主强制开局或手动开始信令，管理员也无绕过准备的开局接口。

#### 6. 核心全量房间状态广播：`room:state` (服务端推全桌)
每当房间有人进出、换座、准备、开局、下注、轮转时，服务端均会广播此快照（客户端根据此状态做 100% 确定性渲染）：

```json
{
  "roomId": "8888",
  "deckKind": "standard", // 本局牌库类型，贯穿比牌与结算
  "roomName": "老友聚会局",
  "baseAnte": 10,
  "turnSeconds": 20,      // 0 表示思考时间无限制
  "gameStatus": "playing", // "waiting" (等待开局) | "playing" (游戏中) | "settling" (结算中)
  "currentRound": 3,      // 当前对局进行到第几轮 (上限 20 轮)
  "currentTurnPlayerId": 1, // 当前该谁操作
  "turnDeadline": 1799889920000, // 倒计时截止时间戳；无限制或无进行中回合时为 null
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
      "cards": [          // 本人及本局直接比牌胜者可见对应底牌，其余视角为 null
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
      "cards": null,      // 默认隐藏他人手牌；本局直接比牌胜者可取得其击败玩家的三张牌
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
当在座玩家 ≥ 2 且全员准备时自动触发；没有房主点击开始的实际链路：
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
* **校验与余额**：只接受 `call/raise/allin` 三类动作，未知动作不能免费推进回合；下注和比牌以数据库当前余额为准，全押读取实时余额。金额、单注基准、累计投入和奖池必须在有效数值范围内，扣款成功才更新金额状态。当前全押没有边池或免后续跟注状态，完整全押规则仍待确定。
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

#### 2. 比牌决斗结果：`game:compare_result` (服务端按接收者分别下发)
> **胜者私密查看**：胜负、费用和底池发给全桌；仅实际胜者的事件附带 `loserCards`。输者、其余玩家及观战者收到的事件不包含该字段。胜者不论是发起方还是被挑战方，均可查看输者三张牌；查看不会自动将胜者自己的手牌设为已看牌。

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
仅向上述例子的玩家 1 附加：
```json
{
  "loserCards": [
    { "suit": "spades", "rank": 10 },
    { "suit": "hearts", "rank": 10 },
    { "suit": "clubs", "rank": 8 }
  ]
}
```
* **快照与重连**：服务端按本局实际比牌记录维护查看权限。胜者后续收到的 `room:state.seats[*].cards` 可包含其直接击败且仍在座位上的输者手牌；除输者本人外，其他未获授权者的该座位仍为 `null`。权限不经后续胜负传递，重置房间或新局开始时清空。
* **终局隔离**：`game:over.revealedCards` 保持原有终局亮牌规则，不添加比牌输者的私密手牌。
* **前端动效**：对撞后，胜者在比牌弹窗看到输者三张牌及“仅你可见”提示；其他人仍看到牌背。比牌弹窗关闭后再显示终局战报，胜者也可在当前局牌桌查看已获授权的输者牌面，但牌桌不再附加“仅你可见”等小字。

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
* **入参**：`{ "emojiId": "fire" }` (如: `cool`, `fire`, `sweat`, `skull`, `money`, `cry`)，须为非空字符串且不超过 64 字符；畸形消息忽略。
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
* **入参**：`{ "phraseId": 3, "text": "快点吧，我等到花儿都谢了！" }`，编号为非负安全整数，文本非空且不超过 200 字符；畸形消息忽略。
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
  cards: Card[] | null;     // 本人手牌，或本局直接比牌胜者获准查看的输者手牌；其余为 null
  currentInvested: number;  // 本局已下注金额
  isReady: boolean;
}

// 房间全量状态
export interface RoomState {
  roomId: string;
  roomName: string;
  deckKind: 'standard' | 'short';
  baseAnte: number;
  turnSeconds: number; // 0 表示无限制，默认 20；非零为 10～60 秒
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
