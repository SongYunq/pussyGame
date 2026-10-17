# 仓库维护约定与 AI Agent 协作规范

> **适用范围**：本文档为所有参与本项目的 AI Agent（智能编程助手）设立的**强制维护准则与协作工作流规范**。系统在执行开发任务时，必须将本文档作为最高优先级规则予以严格遵守。

---

## 一、 文档与代码强一致性原则 (Single Source of Truth)

`docs/` 目录下的四份核心技术文档构成了整个系统的权威事实标准，彼此分工明确且互相支撑：

1. [**`docs/frontend_requirements.md`**](file:///Users/prina/Downloads/pussyGame/docs/frontend_requirements.md)：前端 UI/UX 规范、第一人称自适应排座算法、牌桌交互状态机、动效与音频引擎、管理员中枢与 Mock 驱动规范。
2. [**`docs/backend_requirements.md`**](file:///Users/prina/Downloads/pussyGame/docs/backend_requirements.md)：后端架构、SQLite 数据库与原子账本系统、内存房间状态机、防作弊脱敏广播、单端口部署与测试保障规范。
3. [**`docs/api_specification.md`**](file:///Users/prina/Downloads/pussyGame/docs/api_specification.md)：前后端通信总契约，涵盖所有 RESTful HTTP 接口、WebSocket 双向信令负载（Room / Game / Chat）、状态码与共享 TypeScript 类型。
4. [**`docs/dealing_algorithm_requirements.md`**](file:///Users/prina/Downloads/pussyGame/docs/dealing_algorithm_requirements.md)：发牌算法构建规则、牌型判定、模式权重、概率仿真与实现状态的集中记录。

---

## 二、 核心文档即时同步规则 (Timely Synchronization)

所有 AI Agent 在实施代码变动、架构重构或规则调整时，必须严格执行**“代码与文档同频更新”**原则，**严禁只改代码不改文档，或只在对话中说明而不沉淀至文档**：

### 1. 前端变更联动 ([`docs/frontend_requirements.md`](file:///Users/prina/Downloads/pussyGame/docs/frontend_requirements.md))
- 凡涉及页面视图（登录/大厅/牌桌/管理后台/流水抽屉）、第一人称排座算法、操作面板交互逻辑、筹码堆叠与飞驰动效、Web Audio 纯振荡器音频合成、本地存储或 Mock 调测驱动台的改动，必须在同一次变更中同步更新该文档。

### 2. 后端变更联动 ([`docs/backend_requirements.md`](file:///Users/prina/Downloads/pussyGame/docs/backend_requirements.md))
- 凡涉及后端架构、SQLite 表结构（`users`, `ledgers`）、原子事务控制（`UserModel.changeBalance`）、内存房间状态机（`Room`, `RoomManager`）、倒计时控制器、防作弊手牌脱敏广播、管理员服务或容器化部署配置的改动，必须在同一次变更中同步更新该文档。

### 3. 通信协议与接口契约联动 ([`docs/api_specification.md`](file:///Users/prina/Downloads/pussyGame/docs/api_specification.md))
- 凡新增、修改、废弃任何 RESTful HTTP API 端点（路由路径、请求方法、鉴权头、请求体、响应结构或状态码）；
- 凡新增、调整任何 WebSocket 信令（包括 `room:*`, `game:*`, `chat:*` 的事件名、上行参数、下行广播 Payload）；
- **必须在同一提交中首先或同步更新该文档**，确保前后端团队以统一契约为准，杜绝“隐式私有协议”。

### 4. 发牌与裁判算法联动 ([`docs/dealing_algorithm_requirements.md`](file:///Users/prina/Downloads/pussyGame/docs/dealing_algorithm_requirements.md))
- 凡修改牌库、随机来源、洗牌、分牌、参与者筛选、手牌可见性、牌型判定或比牌大小比较逻辑时，必须在同一次变更中同步更新该文档；
- 凡修改发牌模式、权重加成、默认值、参数范围、个人幸运参数、配置保存与生效，或蒙特卡洛概率仿真逻辑时，必须同步更新该文档；
- 实质行为变化时递增文档版本号，并详细追加变更原因、前后行为差异、影响范围及验证结果。

---

## 三、 真实性与三态区分原则（严禁虚标“画饼”）

在编写、审查或更新任何文档时，必须实事求是地反映系统的真实代码状态，严格区分以下三态：

* **已实现**：已在工程源码中完整存在，且已被真实业务调用链调用的能力；
* **待实现**：已有 UI 界面元素、本地存储或客户端方法声明，但底层业务链路尚未真正接入或服务端未实现处理逻辑的能力（例如：管理后台界面已有发牌模式与幸运参数滑块，但实际服务端发牌尚未读取该配置）；
* **待确定**：尚未明确的产品规则、数值范围、算法作用方式或生效边界。

> **红线准则**：严禁将前端界面参数、本地 `localStorage` 缓存或估算模拟描述为系统已具备实际线上发牌或控牌能力。

---

## 四、 核验与测试执行规范

1. **纯文档更新**：必须严格核对源码路径、代码行号与符号链接，保持交叉引用（Markdown 链接）的准确性；
2. **代码功能或算法改动**：完成代码与文档更新后，必须在沙箱或指定环境中执行对应的测试套件（如单元测试 `tests/referee.test.ts`、`tests/room.test.ts`、`tests/api.test.ts`，或 E2E 模拟对局 `tests/socket_e2e.ts`），确认全部通过后方可交付。
