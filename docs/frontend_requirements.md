# 炸金花联机网页游戏 —— 前端需求规范与技术实现白皮书

> **文档定位与说明**：本文档基于当前前端工程源码（`client/`）进行全面梳理与标准更新，涵盖架构设计、页面视图流转、第一人称自适应排座算法、3D 卡牌手感、2.5D 拟真筹码堆叠动效、Web Audio 振荡器音频合成引擎、防作弊绝密比牌机制、管理员多维管控中枢及双模驱动（Mock 独立演示 / Socket.io 实时信令）实现规范。
> 接口契约参考：[api_specification.md](file:///Users/prina/Downloads/pussyGame/docs/api_specification.md)；服务端规范参考：[backend_requirements.md](file:///Users/prina/Downloads/pussyGame/docs/backend_requirements.md)。

---

## 一、 项目工程技术栈与核心定位

### 1.1 技术底座与依赖库
* **核心框架**：React 18.3 + TypeScript 5.7。
* **构建工具**：Vite 6.2（支持极速 HMR、同服静态打包托管于 `client/dist`）。
* **样式引擎**：Tailwind CSS 3.4 + PostCSS + Autoprefixer（扩展墨绿呢绒 `table-felt`、皮革金边 `table-border`、赌场筹码色板以及 All-in 屏幕震颤与金光帧动画）。
* **状态管理**：Zustand 5.0（精简响应式状态机，驱动全桌牌局、动效队列及鉴权缓存）。
* **实时网络**：Socket.io-client 4.8（与服务端 WebSocket 网关无缝长连接双向通信）。
* **图表与粒子**：Lucide React 图标库 + Canvas-Confetti 胜利纸屑引擎。
* **音频合成**：HTML5 Web Audio API（代码级纯振荡器合成，零 MP3 静态文件依赖，零延迟）。

### 1.2 全端响应式与移动端专属优化
* **防缩放与手势冲突**：`index.html` 严格限制 `viewport-fit=cover, user-scalable=no, maximum-scale=1.0`。
* **刘海屏与安全区**：注入 CSS 安全区环境变量 `--sat`, `--sar`, `--sab`, `--sal`（`env(safe-area-inset-*)`）。
* **防橡皮筋与原生选区屏蔽**：全局锁定 `touch-action: manipulation`，全桌视图统一开启 `select-none` 杜绝误触长按弹出文字选择条。

---

## 二、 页面视图架构与路由流转

系统采用基于角色的多视图状态切换流转（由 [App.tsx](file:///Users/prina/Downloads/pussyGame/client/src/App.tsx) 统一分发）：

```
App 视图流转体系
├── 1. 登录视图 (LoginView)
│    ├── 账号密码校验登录（无公开外链注册，仅限管理员内部分配）
│    ├── 快速填入体验账号（admin 管理员 / zhangsan 玩家）
│    └── 离线与断网自动降级快速通道
├── 2. 游戏大厅视图 (LobbyView)
│    ├── 个人资料与钱包筹码即时展示
│    ├── 快捷房间号检索加入（4~6位房间号）
│    ├── 自定义开辟房间（房间名、底注 10/20/50/100、思考倒计时 15/20/30/60s）
│    └── 牌型权重与特殊 235 裁判规则图解弹窗
├── 3. 游戏桌面核心视图 (TableView)
│    ├── 顶部信息栏（房号、底注、思考时间、静音切换、账本入口、个人筹码）
│    ├── 牌桌主体椭圆画布（内嵌毛呢桌布纹理、中央底池全息金字、自适应桌位）
│    ├── 底部交互面板 (ActionPanel)：看牌、弃牌、比牌、跟注、加注抽屉、梭哈、表情/短语
│    ├── 专属动效与特写层：PK 绝密对决弹窗、All-in 屏幕雷电震颤、5000+ 金光流幅、终局结算卡片
│    └── 左下角纯前端 Mock 调测驱动台 (DevToolBar)
├── 4. 房主/管理员后台 (AdminDashboard)
│    ├── 角色权限物理隔离（管理员账号登录强制锁定管理端，隔离牌桌）
│    ├── 账号管理子系统：检索、多状态筛选、开通新账号、重置密码、修改资料/封禁、安全删除
│    ├── 充值与资金子系统：快速充减筹码、流水明细溯源、全流通筹码统计
│    └── 发牌算法调控子系统：自然平衡/激烈碰撞/新手偏好模式、各牌型加权、个人幸运偏置、万局蒙特卡洛仿真器
└── 5. 个人战绩流水抽屉 (LedgerDrawer)
     └── 右侧划出全局抽屉：底注扣除、单局加注、获胜独揽、管理员充扣款时间戳明细与结余溯源
```

---

## 三、 牌桌核心交互与视觉动效规范

### 3.1 动态 8 人自适应桌位算法 (第一人称视角居中)
* **核心规范**：不论玩家实际坐于哪一个物理座位，在自己的客户端屏幕上永远处于椭圆牌桌的正下方底部正中（相对旋转归零）。其余 1~7 位在座玩家依照顺时针顺序均匀环形分布在牌桌上方及左右两侧。
* **数学计算模型**（见 [useTableLayout.ts](file:///Users/prina/Downloads/pussyGame/client/src/hooks/useTableLayout.ts)）：
  设在座有效人数为 $N$（$2 \le N \le 8$），当前客户端玩家在在座列表中的相对基准偏移为 $baseOffset$。
  对于任意在座玩家序号 $index$：
  $$\text{relativeOrder} = (index - baseOffset + N) \pmod N$$
  $$\theta = \frac{2\pi \times \text{relativeOrder}}{N} + \frac{\pi}{2}$$
* **椭圆坐标与旋转朝向**：
  * **外圈头像区**：$X = 50\% + R_{x,\text{avatar}} \times \cos(\theta),\quad Y = 50\% + R_{y,\text{avatar}} \times \sin(\theta)$（长短半轴 $44\% \times 42\%$，紧贴牌桌外圈皮革）。
  * **内圈手牌区**：自身手牌半轴 $27\% \times 22\%$；其他玩家手牌半轴 $34\% \times 28\%$。
  * **手牌向心朝向角度**：$Deg = \theta \times \frac{180^\circ}{\pi} - 90^\circ$，并通过周期变换归一化至 $[-180^\circ, 180^\circ]$，保证扑克顶部始终平滑朝向牌桌中央，且席位变动时角度过渡无突兀反转。

### 3.2 3D 拟真翻牌手感 (GPU 硬件加速)
* **组件实现**：[Card3D.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/table/Card3D.tsx)。
* **未看牌状态（暗注）**：
  * 采用双面 `preserve-3d` 与 `backface-visibility: hidden` 构造立体纸牌；
  * 背面采用深蓝暗金渐变并带双层微细虚线框与黑桃金底纹印花；
  * 三张暗牌横向呈弧度扇形错位排列（偏转角度分别为 $-12^\circ$、`0°`、$12^\circ$，X 轴水平微叠）；
* **看牌翻转手感**：
  * 点击“看牌”瞬间触发 `perspective: 1000px; transform: rotateY(180deg)`，耗时 700ms 平滑翻折展开正面；
  * 同步播放清脆高音翻折音效 `playFlipCard()`；
  * 正面四角展示清晰点数与花色（黑桃/红桃/梅花/方块），中央带大尺寸透明度 15% 的花色专属水印；
  * 自身手牌翻开后，右侧自动弹出由本地裁判引擎识别并高亮渲染的牌型胶囊（如：“豹子 AAA”、“金花 K最大”、“顺金”）。

### 3.3 2.5D 真实筹码堆叠与阵地阵型系统
* **组件实现**：[FlyingChipStack.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/table/FlyingChipStack.tsx) 与 [PokerTable.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/table/PokerTable.tsx)。
* **下注筹码高度分级模型**：
  依据每次下注/加注的实际筹码金额，自动生成分层筹码柱：
  * $\le 10$ 筹码：4 层；
  * $20 \sim 50$ 筹码：7 ~ 11 层；
  * $100 \sim 500$ 筹码：14 ~ 21 层；
  * $1000 \sim 2000$ 筹码：25 ~ 28 层；
  * $\ge 5000$ 或 All-in：最高 32 层满柱。
* **赌场六级色系阶梯**：
  * 翡翠绿（Emerald，底注/小额） $\to$ 宝石蓝（Sapphire） $\to$ 绯红（Crimson） $\to$ 紫晶（Amethyst） $\to$ 曜黑烫金（Obsidian） $\to$ 皇家纯金（Gold，All-in 顶层专属）。
  * 筹码侧壁附带经典黑金/黑白交替条纹，顶表面印有同心压花圆环与微小倾斜方块高光；
  * 单层筹码生成轻微的水平正弦扰动（$\pm 1.5\text{px}$ 随机微错位），模拟真实手工堆叠的层次感。
* **三阶段物理动效与阵地落位**：
  1. **生成阶段 (Spawn, 260ms)**：在玩家手牌前方伴随逐层阶梯落下声音迅速堆起；
  2. **推进阶段 (Moving, 660ms)**：以贝塞尔曲线平滑推向当前玩家所属的桌面前方阵地；
  3. **落定保留阶段 (Settled)**：落定时触发金色冲击波纹圈（`animate-ping`），筹码柱**稳稳常驻保留在桌面上**，直到整局结算，使对局双方下注多寡一眼可见；
  * **阵型矩阵算法**：每位玩家前方开辟多排扇面阵地（每排最多 5 摞，前中后最多 3 排，错落排列）；
  * **景深渲染层级**：依据筹码在桌面的 Y 轴纵深动态计算 `zIndex`（下层遮挡上层），完全契合真实 2.5D 俯视视角；
  * **性能与防爆炸熔断**：单人面前最多保留 15 摞筹码或累计 60,000 筹码，全桌上限 75 摞或 250,000 底池，超出阈值平滑转为静默数字累加。

### 3.4 专属震撼高潮特效
1. **5000+ 高额加注金色流幅 ([GoldStreamer.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/animations/GoldStreamer.tsx))**：
   * 当单次下注金额 $\ge 5000$ 时触发；
   * 屏幕上方弹出金光离子横幅：“豪气冲天 · 大额加注！单手掷注 5,000+，全场目光聚集！”；
   * 伴随旋转星芒与金币跳跃，持续 2.5 秒淡出。
2. **All-in 屏幕雷电全押震颤 ([AllInEpicEffect.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/animations/AllInEpicEffect.tsx))**：
   * 玩家点击“全押”时触发；
   * 屏幕四周激活 8px 暗红雷电暗角与全屏心跳震颤动效（`allin-shake`）；
   * 两侧闪电劈落，屏幕中央弹出带烈焰烈火图标的金色 All-in 浮空徽章（“孤注一掷 · 绝境亮剑”）；
   * 音频引擎同步播放双脉冲深沉心跳与雷鸣声（`playAllIn()`），沉浸感拉满。
3. **绝密比牌决斗 (PK 碰撞对决 [PKClashModal.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/animations/PKClashModal.tsx))**：
   * **发起流程**：第 2 轮及之后开放比牌；点击“比牌”按钮，牌桌所有存活对手头像亮起红色呼吸光圈并浮现“点击对决”靶心；
   * **消耗倍率**：扣除自身一次跟注金额的 2 倍，即闷牌扣除单注基准的 1 倍、明牌扣除 2 倍；
   * **1v1 暗封撞击舞台**：
     * 屏幕正中调出双人特写大幕（黑金背景 + 闪烁烈火决斗图标）；
     * 挑战者与守擂者两张暗色扑克牌自两侧以强烈势头在中线碰撞；
     * 碰撞瞬间伴随低频轰鸣与短促爆炸白噪音（`playPKClash()`）；
     * 碰撞后**绝不公布双方底牌**，仅在输家头像盖上倾斜暗红色“战败”印戳；
     * 输家在牌桌上的状态即刻置为 `lost`，手牌暗灰倾斜淘汰，杜绝底牌泄露外挂。
4. **终局胜出结算卡片 ([SettlementModal.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/animations/SettlementModal.tsx))**：
   * 对局决出胜者时（其余全员弃牌/战败，或达到 20 轮上限亮牌），触发全屏纸屑礼花飞舞；
   * 弹出终局大捷金色奖杯卡片，展示赢家头像、独揽筹码数值（如 `+12,800 筹码`）；
   * 若存在比牌终局，卡片下方自动展示赢家手牌与最终牌型标签；
   * 提供“再来一局”一键重置发牌与“关闭战报”按钮。

---

## 四、 纯代码拟真音效系统 (Web Audio API)

位于 [SoundManager.ts](file:///Users/prina/Downloads/pussyGame/client/src/audio/SoundManager.ts)，无需下载外部音频资产，零网络等待、零跨域问题：

| 音效方法 | 物理拟真声学原理 | 触发时机 |
| :--- | :--- | :--- |
| `playDealCard()` | 80ms 白噪声发生器 + 1400Hz 带通滤波器指数衰减 | 发牌开局、重新发牌 |
| `playFlipCard()` | 600Hz $\to$ 1200Hz 三角波快速滑频 + 增益指数衰减 | 点击看牌翻转瞬间 |
| `playChip()` | 1800Hz / 2600Hz 正弦双频微小随机相位交错脆响 | 单枚筹码入池、基础跟注 |
| `playChipStack(count)` | 1750Hz 起步多阶正弦琶音叠加，依层数连续清脆碰撞 | 玩家下注/加注成摞筹码堆叠 |
| `playPKClash()` | 160Hz $\to$ 40Hz 锯齿波轰鸣 + 0.2s 爆炸白噪声脉冲 | 1v1 比牌两牌碰撞瞬间 |
| `playAllIn()` | 90Hz $\to$ 35Hz 双心跳脉冲（顿-顿）重低音波 | 点击全押（All-in）瞬间 |
| `playWin()` | C 大调大三和弦琶音（C5-523Hz, E5-659Hz, G5-784Hz, C6-1046Hz） | 终局结算、胜者独揽奖池 |

* **静音开关**：全站右上角支持一键静音/取消静音，状态自动持久化于本地 `localStorage.getItem('zjh_sound_muted')`。

---

## 五、 牌型识别与裁判算法核心

位于 [pokerEvaluator.ts](file:///Users/prina/Downloads/pussyGame/client/src/utils/pokerEvaluator.ts)，纯函数、强类型，供前端本地 Mock 与手牌标签计算：

1. **牌型等级与基础权重分**：
   * **豹子 (Leopard)**：基数 $6,000,000 + rank$（如 AAA 为 6,000,014）；
   * **同花顺 (Straight Flush / 顺金)**：基数 $5,000,000 + topRank$（支持 A-2-3 特殊最小顺金，最大点计为 3）；
   * **金花 (Flush / 同花)**：基数 $4,000,000 + r_0 \times 10^4 + r_1 \times 100 + r_2$；
   * **顺子 (Straight)**：基数 $3,000,000 + topRank$（支持 A-2-3 最小顺子）；
   * **对子 (Pair)**：基数 $2,000,000 + pairRank \times 100 + singleRank$；
   * **单张 (High Card / 散牌)**：基数 $1,000,000 + r_0 \times 10^4 + r_1 \times 100 + r_2$。
2. **特殊 235 逆袭规则**：
   * 当手牌为不同花色的 2-3-5 时，评为 `special_235`；
   * **当且仅当对手为“豹子”时，235 逆袭获胜**；
   * 若对手非豹子，则 235 作为普通最小散牌进行比对。
3. **平局裁决规则**：
   * 两者牌型点数完全相同时，**主动发起比牌挑战方判负**，严格遵循民间传统规则，防范恶意拖延。

---

## 六、 社交互动体系规范

位于 [ActionPanel.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/table/ActionPanel.tsx)：
* **快捷表情浮空弹窗**：支持 8 种高频互动 Emoji（🔥 烈火、😎 墨镜帅、😭 痛哭、💀 绝望骷髅、💰 金币眼、👍 点赞、🚀 起飞、🍺 干杯）；
  * 发送后在对应玩家头像正上方生成 2.5 秒浮动放大、平滑淡出的动画气泡（`animate-float-up`）。
* **快捷短语对话框**：预设 5 条经典金句（“快点吧，我等到花儿都谢了！”、“梭哈是一种智慧！”、“风水轮流转，底裤全靠这把！”、“老铁，稳住别慌！”、“搏一搏，单车变摩托！”）；
  * 头像旁弹出带倒三角指示箭头的漫画式白底对话框，展示 3.5 秒后自动隐去。

---

## 七、 超级管理员中枢平台规范 (AdminDashboard)

位于 [AdminDashboard.tsx](file:///Users/prina/Downloads/pussyGame/client/src/views/AdminDashboard.tsx)，为独立于游戏桌的深度运维平台：

### 7.1 账号管理系统 (Accounts)
* **全生命周期管控**：开通新账号、设置初始筹码、编辑昵称/头像、重置密码为明文指定新值、一键封禁/解封、永久安全删除（主管理员 admin 账号受物理锁保护，严禁删除）。
* **多维统计指标**：总在册玩家数、实时在线数（含当前所在房号关联）、全网流通总筹码池、封禁账号数。
* **搜索与多态筛选**：支持按用户名/昵称模糊检索，支持全量、在线、离线、已封禁四态快速过滤。

### 7.2 充值与资金系统 (Chips)
* **快速双向充减**：支持任意玩家一键增加/扣减筹码，强制附带业务变更原因（如“老友微信转账充值”、“线下结算核减”）。
* **全量审计日志 (Audit Log)**：每笔流水包含日志 ID、用户、变动数值、变动后余额、经办操作人、详细原因、精确时间戳，不可篡改。

### 7.3 发牌算法调控系统 (Algorithm Control)
* **四大运作模式**：
  1. 自然平衡模式（Fair，各牌型自然数学概率）；
  2. 激烈碰撞模式（Action Boost，大幅提升顺子、金花、顺金与豹子生成率，刺激对局拼注）；
  3. 新手偏好模式（Beginner Favor，倾斜大牌概率提升对局留存）；
  4. 自定义深度模式（Custom，允许自由拖拽滑块微调各项系数）。
* **核心调控参数矩阵**：
  * 豹子加权系数（0.1 ~ 5.0）、顺金加权系数（0.1 ~ 5.0）、金花加权系数（0.1 ~ 4.0）；
  * 顺子加权系数（0.1 ~ 3.0）、对子加权系数（0.1 ~ 2.0）、散牌加权系数（0.1 ~ 2.0）；
  * 强强对撞率（Clash Rate，0 ~ 100%）；
  * 特殊 235 逆袭豹子加权系数（0.1 ~ 5.0）；
  * 指定用户个人幸运偏置（$-50 \sim +50$ 幸运值）。
* **蒙特卡洛仿真模拟器 (Monte Carlo Simulator)**：
  * 支持在管理端一键对 1,000 ~ 50,000 局发牌执行高频离线仿真；
  * 测算后实时输出豹子、顺金、金花、顺子、对子、散牌的实际产出局数与精准百分比分布，辅助运维人员直观验证控牌参数合理性。

---

## 八、 运行模式与调测驱动体系

系统设计为**双模驱动**架构：

### 8.1 纯前端 Mock 独立驱动模式 ([mockGameService.ts](file:///Users/prina/Downloads/pussyGame/client/src/store/mock/mockGameService.ts))
* **脱机独立运行**：在无任何 Node.js 服务端启动的环境下，前端状态机完全闭环；
* **内置机器人 AI 调度器**：
  * 开局自动生成 52 张真实洗乱扑克并分发暗牌（Fisher-Yates 算法）；
  * 自动模拟真实对手轮流出牌（30% 概率看牌、35% 概率加注，其余跟注，1.15 秒拟人化延迟）；
  * 真实比牌牌型裁决、弃牌判定、独揽结算与余额更新。
* **底部悬浮调测工具台 ([DevToolBar.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/dev/DevToolBar.tsx))**：
  * 提供快捷测试功能：`[一键发牌]`、`[翻开看牌]`、`[小注 +20]`、`[中注 +100]`、`[高摞 +1000]`、`[对手加注 +500]`、`[5000+ 超高筹码]`、`[All-in 满柱]`、`[比牌 PK 模拟]`、`[终局结算战报]`；
  * **2~8 人动态切换器**：点击 2人 ~ 8人 按钮，一键验证任意人数下的椭圆自适应桌位数学重排过渡。

### 8.2 生产联机 WebSocket 网关模式 ([socket.ts](file:///Users/prina/Downloads/pussyGame/client/src/services/socket.ts))
* **同服同端口直连**：浏览器访问与 WebSocket 握手统一位于当前域名根端口，零跨域开销；
* **全生命周期信令支持**：
  * 发出指令：`room:create`, `room:join`, `room:sit`, `room:stand`, `room:ready`, `game:look`, `game:bet`, `game:fold`, `game:compare`, `chat:emoji`, `chat:phrase`；
  * 监听广播：`room:state`, `game:start`, `game:player_looked`, `game:player_bet`, `game:compare_result`, `game:over`, `chat:emoji_broadcast`, `chat:phrase_broadcast`；
  * 与客户端动效体系无缝触发（筹码柱飞入、全押震颤、金色流幅、PK 弹窗与结算礼花）。

---

## 九、 交付文件拓扑一览表

| 模块类别 | 文件路径 | 职责定位 |
| :--- | :--- | :--- |
| **工程配置** | [package.json](file:///Users/prina/Downloads/pussyGame/client/package.json) | 前端依赖、构建命令与 TypeScript 配置 |
| | [tailwind.config.js](file:///Users/prina/Downloads/pussyGame/client/tailwind.config.js) | 墨绿呢绒、筹码色系、震颤与金光关键帧动画 |
| | [index.html](file:///Users/prina/Downloads/pussyGame/client/index.html) | 移动端防缩放、防橡皮筋回弹与安全区适配 |
| **类型契约** | [game.ts](file:///Users/prina/Downloads/pussyGame/client/src/types/game.ts) | 卡牌、桌位、房间快照、结算与对决数据契约 |
| **音频引擎** | [SoundManager.ts](file:///Users/prina/Downloads/pussyGame/client/src/audio/SoundManager.ts) | Web Audio API 纯代码合成发牌、翻牌、撞筹码、PK、Allin、胜利 6 种音效 |
| **裁判引擎** | [pokerEvaluator.ts](file:///Users/prina/Downloads/pussyGame/client/src/utils/pokerEvaluator.ts) | 牌型识别、大小加权计算、特殊 235 杀豹子及平局判定 |
| **排座算法** | [useTableLayout.ts](file:///Users/prina/Downloads/pussyGame/client/src/hooks/useTableLayout.ts) | 2~8 人动态三角函数第一人称居中排座与向心倾角计算 |
| **状态管理** | [useGameStore.ts](file:///Users/prina/Downloads/pussyGame/client/src/store/useGameStore.ts) | 牌桌状态、筹码堆队列、PK 与结算弹窗调度 |
| | [useAuthStore.ts](file:///Users/prina/Downloads/pussyGame/client/src/store/useAuthStore.ts) | JWT 令牌、当前登录人资料持久化与鉴权 |
| | [mockGameService.ts](file:///Users/prina/Downloads/pussyGame/client/src/store/mock/mockGameService.ts) | 纯前端 Fisher-Yates 洗牌、模拟对手出牌与单机闭环 |
| **网络服务** | [api.ts](file:///Users/prina/Downloads/pussyGame/client/src/services/api.ts) | HTTP RESTful 客户端（登录、个人资料、管理员专区） |
| | [socket.ts](file:///Users/prina/Downloads/pussyGame/client/src/services/socket.ts) | Socket.io 实时信令封装与事件分发 |
| **桌位组件** | [Card3D.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/table/Card3D.tsx) | 3D 轴向透视翻转、扇形重叠与花色水印扑克 |
| | [FlyingChipStack.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/table/FlyingChipStack.tsx) | 2.5D 多层分段成摞筹码、推入动效与常驻桌面阵型 |
| | [TableSeat.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/table/TableSeat.tsx) | 头像轮廓、光圈倒计时、牌型胶囊、战败印戳与气泡 |
| | [PokerTable.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/table/PokerTable.tsx) | 毛呢椭圆桌面、中央底池全息金字与桌位/筹码挂载 |
| | [ActionPanel.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/table/ActionPanel.tsx) | 下注跟注、看牌、加注抽屉、比牌、Allin 与社交面板 |
| **专属特效** | [PKClashModal.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/animations/PKClashModal.tsx) | 1v1 绝密对撞撞击特写、烈火爆炸与战败印戳 |
| | [AllInEpicEffect.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/animations/AllInEpicEffect.tsx) | 全屏暗红雷电震颤、烈焰徽章与低音心跳震撼 |
| | [GoldStreamer.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/animations/GoldStreamer.tsx) | 5000+ 高额加注金色离子横幅与高光粒子 |
| | [SettlementModal.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/animations/SettlementModal.tsx) | 终局大捷奖杯、礼花飞舞、独揽筹码与亮牌展示 |
| **调测平台** | [DevToolBar.tsx](file:///Users/prina/Downloads/pussyGame/client/src/components/dev/DevToolBar.tsx) | 左下角纯前端 Mock 调测控制台与 2~8 人切换台 |
| **页面视图** | [LoginView.tsx](file:///Users/prina/Downloads/pussyGame/client/src/views/LoginView.tsx) | 登录视图与快速体验账号选择 |
| | [LobbyView.tsx](file:///Users/prina/Downloads/pussyGame/client/src/views/LobbyView.tsx) | 大厅房间号加入、自建私局与规则速查指南 |
| | [TableView.tsx](file:///Users/prina/Downloads/pussyGame/client/src/views/TableView.tsx) | 核心游戏对局主视图 |
| | [AdminDashboard.tsx](file:///Users/prina/Downloads/pussyGame/client/src/views/AdminDashboard.tsx) | 管理中枢平台（账号管控、资金审计、算法调控与模拟器） |
| | [LedgerDrawer.tsx](file:///Users/prina/Downloads/pussyGame/client/src/views/LedgerDrawer.tsx) | 个人筹码明细战绩抽屉 |
| | [App.tsx](file:///Users/prina/Downloads/pussyGame/client/src/App.tsx) | 应用主入口与基于角色的全域视图流转 |
