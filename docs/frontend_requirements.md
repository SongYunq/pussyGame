# 炸金花联机网页游戏 —— 前端需求规范与技术实现白皮书

> **文档定位与说明**：本文档基于当前前端工程源码（`client/`）进行全面梳理与标准更新，涵盖架构设计、页面视图流转、第一人称自适应排座算法、3D 卡牌手感、2.5D 拟真筹码堆叠动效、Web Audio 振荡器音频合成引擎、防作弊绝密比牌机制、管理员多维管控中枢及正式实时通信与独立模拟测试的边界规范。
> 接口契约参考：[api_specification.md](api_specification.md)；服务端规范参考：[backend_requirements.md](backend_requirements.md)。
> 发牌算法规则、实际接入状态与变更同步要求统一见：[dealing_algorithm_requirements.md](dealing_algorithm_requirements.md)。
> **2026-10-18 正式流程更新**：正式入口已接入真实认证、房间、手动对局、账号管理及分页流水；模拟状态仅保留在独立回归测试模块。验证结果见 [原生部署记录](native_deployment.md)。
> **范围约束**：[爆金币赏金击杀流](backend_requirements.md#九-规则进阶探索与扩展设计爆金币赏金击杀流-bounty-mode) 尚未实现，仅作创想存档，不在近期开发或验收范围；用户后续明确要求启动前，不得据此增加页面、接口、模式参数或相关实现。

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
* **移动操作区**：窄屏下注按钮用三列换行，轮次及注额保持完整单行；不允许横向裁掉全押或跟注按钮。
* **防缩放与手势冲突**：`index.html` 严格限制 `viewport-fit=cover, user-scalable=no, maximum-scale=1.0`。
* **刘海屏与安全区**：注入 CSS 安全区环境变量 `--sat`, `--sar`, `--sab`, `--sal`（`env(safe-area-inset-*)`）。
* **防橡皮筋与原生选区屏蔽**：全局锁定 `touch-action: manipulation`，全桌视图统一开启 `select-none` 杜绝误触长按弹出文字选择条。

---

## 二、 页面视图架构与路由流转

系统采用基于角色的多视图状态切换流转（由 [App.tsx](../client/src/App.tsx) 统一分发）：

```
App 视图流转体系
├── 1. 登录视图 (LoginView)
│    ├── 账号密码校验登录（无公开外链注册，仅限管理员内部分配）
│    ├── 不预填账号；失败留在登录页并显示服务端错误
│    └── 保存的令牌须经 /api/auth/me 验证，忽略旧模拟身份和缓存角色
├── 2. 游戏大厅视图 (LobbyView)
│    ├── 个人资料与钱包筹码即时展示
│    ├── 快捷房间号检索加入（4~6位房间号）
│    ├── 自定义开辟房间（2～8 人、房间名、底注 10/20/50/100、思考时间 15/20/30/60s 或无限制）
│    └── 牌型权重与特殊 235 裁判规则图解弹窗
├── 3. 游戏桌面核心视图 (TableView)
│    ├── 顶部信息栏（房号、底注、思考时间、静音切换、账本入口、个人筹码）
│    ├── 牌桌主体椭圆画布（内嵌毛呢桌布纹理、中央底池全息金字、自适应桌位）
│    ├── 底部交互面板 (ActionPanel)：看牌、弃牌、比牌、跟注、加注抽屉、梭哈、表情/短语
│    ├── 专属动效与特写层：PK 绝密对决弹窗、All-in 屏幕雷电震颤、5000+ 金光流幅、终局结算卡片
│    └── 入座／离座／准备：达到指定人数且全员在线、准备才开局；每局重新准备
├── 4. 管理员后台 (AdminDashboard)
│    ├── 角色权限物理隔离（管理员账号登录强制锁定管理端，隔离牌桌）
│    ├── 账号管理子系统：读取真实列表、开通玩家账号、重置密码
│    ├── 充值与资金子系统：快速充减筹码、流水明细溯源、全流通筹码统计
│    └── 发牌算法调控子系统：双牌库比例、互斥模式、按人数精确保底、真实发牌模拟
└── 5. 个人战绩流水抽屉 (LedgerDrawer)
     └── 右侧划出全局抽屉：底注扣除、单局加注、获胜独揽、管理员充扣款时间戳明细与结余溯源
```

---

### 2.1 创建房间与思考时间（2026-10-18）

* 创建弹窗使用“每轮思考时间”，提供 `15s / 20s / 30s / 60s / 无限制` 五个选项，默认保持 `20s`；无限制用数值 `0` 表达。
* 选择无限制时提示“不设倒计时，不会因超时自动弃牌”；牌桌顶部显示“思考: 无限制”，不显示 `0s`。
* 大厅经 `room:create` 创建真实房间，发送名称、底注、思考时间及 `playerCount`；房号由服务端分配，只有收到 `room:state` 才进入牌桌，不存在默认房间。创建/加入后先观战，点击“入座参与”后显示在牌桌上。
* 选择开局人数 2～8 人（创建弹窗默认 4）；仅真实在座者参与，满额、全员在线且准备后由服务端发牌。页面展示实际入座、观战、准备及离线状态。正式链路没有机器人、自动下注、手动强制开局或调试浮条；限时房间仍保留服务端超时弃牌，无限制房间不自动行动。

## 三、 牌桌核心交互与视觉动效规范

### 3.1 动态 8 人自适应桌位算法 (第一人称视角居中)
* **核心规范**：不论玩家实际坐于哪一个物理座位，在自己的客户端屏幕上永远处于椭圆牌桌的正下方底部正中（相对旋转归零）。其余 1~7 位在座玩家依照顺时针顺序均匀环形分布在牌桌上方及左右两侧。
* **数学计算模型**（见 [useTableLayout.ts](../client/src/hooks/useTableLayout.ts)）：
  设在座有效人数为 $N$（$2 \le N \le 8$），当前客户端玩家在在座列表中的相对基准偏移为 $baseOffset$。
  对于任意在座玩家序号 $index$：
  $$\text{relativeOrder} = (index - baseOffset + N) \pmod N$$
  $$\theta = \frac{2\pi \times \text{relativeOrder}}{N} + \frac{\pi}{2}$$
* **椭圆坐标与旋转朝向**：
  * **外圈头像区**：$X = 50\% + R_{x,\text{avatar}} \times \cos(\theta),\quad Y = 50\% + R_{y,\text{avatar}} \times \sin(\theta)$（长短半轴 $44\% \times 42\%$，紧贴牌桌外圈皮革）。
  * **内圈手牌区**：自身手牌半轴 $27\% \times 22\%$；其他玩家手牌半轴 $34\% \times 28\%$。
  * **手牌向心朝向角度**：$Deg = \theta \times \frac{180^\circ}{\pi} - 90^\circ$，并通过周期变换归一化至 $[-180^\circ, 180^\circ]$，保证扑克顶部始终平滑朝向牌桌中央，且席位变动时角度过渡无突兀反转。

### 3.2 3D 拟真翻牌手感 (GPU 硬件加速)
* **组件实现**：[Card3D.tsx](../client/src/components/table/Card3D.tsx)。
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
* **组件实现**：[FlyingChipStack.tsx](../client/src/components/table/FlyingChipStack.tsx) 与 [PokerTable.tsx](../client/src/components/table/PokerTable.tsx)。
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
1. **首次 5000+ 全屏大金盛典与女声播报 ([GoldStreamer.tsx](../client/src/components/animations/GoldStreamer.tsx))**：
   * **触发条件**：每局牌中，当**首次**出现单次实际押注金额 $\ge 5000$（5000 或 5000+）时全桌同步触发（同一局后续 5000+ 押注不再重复触发全屏阻断）；
   * **全屏占满与全桌操作锁定**：以 `fixed inset-0 z-[100] pointer-events-auto` 占满整个屏幕并拦截所有点击/触摸交互，同时锁定底部操作面板与 AI 出牌回合，持续 4.2 秒，期间所有人无法操作；
   * **皇家大金盛典视觉与动态金额**：全屏黑金毛玻璃底幕配合居中旋转的皇家太阳金芒射线、漫天鎏金星尘粒子与 3D 浮雕“恭喜大金”主舞台，画面动态展示**玩家昵称**与**实际押注金额**（`首次下注 {amount} 码`，严格与实际押注金额相符）；
   * **预录制真人感女声播报**：同步调用 [`SoundManager.playFirstGoldAnnouncement()`](../client/src/audio/SoundManager.ts#L293)，先奏响皇家庆典和弦，随后播放预录制的高品质中文女声 MP3 音频文件 [`/audio/first_gold.mp3`](../client/public/audio/first_gold.mp3)（*“恭喜大金！豪气冲天，一掷千金，全场瞩目！”*）。
2. **All-in 边缘流光与顶部战报特效 ([AllInEpicEffect.tsx](../client/src/components/animations/AllInEpicEffect.tsx))**：
   * 玩家点击“全押”或收到全押广播时触发，持续 2.0 秒平滑进退场；
   * **零遮挡中央视野**：屏幕中央 64% 区域保持完全通透，不放置任何遮挡牌桌、底池或筹码柱的中央弹窗；
   * **四周电影感赤金暗角与火星粒子**：屏幕外圈柔和赤红暗角脉冲（`animate-allin-vignette`）、上下边缘能量锋线，以及左右两侧外沿升腾的赤金火星粒子（`animate-allin-ember`）；
   * **顶部悬浮流光战报横幅**：在顶部状态栏下方弹出黑金赤焰胶囊战报（`animate-allin-banner`），表面伴随高光扫掠（`animate-allin-sheen`），动态展示 `ALL IN` 金属字样、全押玩家昵称及全押金额；
   * **牌桌本体震动与桌沿流光**：联动 [PokerTable.tsx](../client/src/components/table/PokerTable.tsx) 触发牌桌本体冲击震颤（`allin-shake`）与桌沿金红脉冲光晕，音频引擎同步播放双脉冲深沉心跳重低音（`playAllIn()`）。
3. **绝密比牌决斗 (PK 碰撞对决 [PKClashModal.tsx](../client/src/components/animations/PKClashModal.tsx))**：
   * **发起流程**：第 2 轮及之后开放比牌；点击“比牌”按钮，牌桌所有存活对手头像亮起红色呼吸光圈并浮现“点击对决”靶心；
   * **消耗倍率**：扣除自身一次跟注金额的 2 倍，即闷牌扣除单注基准的 1 倍、明牌扣除 2 倍；
   * **1v1 暗封撞击舞台**：
     * 屏幕正中调出双人特写大幕（黑金背景 + 闪烁烈火决斗图标）；
     * 挑战者与守擂者两张暗色扑克牌自两侧以强烈势头在中线碰撞；
     * 碰撞瞬间伴随低频轰鸣与短促爆炸白噪音（`playPKClash()`）；
     * 碰撞后仅胜者展示输者三张牌及“败者底牌 · 仅你可见”，其他玩家和观战者仍看到牌背；防守获胜同样适用。
     * 胜者的弹窗保留 6 秒，可点击“返回牌桌”收起；其他视角保持 2.8 秒。终局战报等待比牌弹窗关闭后再显示，避免覆盖私密手牌。
     * 输家状态即刻置为 `lost`；胜者视角的牌桌保留输者正面牌，其余视角仍为暗牌。牌桌不附加“仅你可见”等小字，提示仅在比牌弹窗展示。展示不依赖输者是否看牌，也不会替胜者查看自己的手牌。
     * 服务端按本局直接胜负记录授予权限，重连后快照恢复；权限不因后续胜负继承，重置或新局清空。模拟控制器仅在本地玩家获胜时提供对应输者牌面；新局重新隐藏其他人手牌。
4. **终局胜出结算卡片 ([SettlementModal.tsx](../client/src/components/animations/SettlementModal.tsx))**：
   * 对局决出胜者时（其余全员弃牌/战败，或达到 20 轮上限亮牌），触发全屏纸屑礼花飞舞；
   * 弹出终局大捷金色奖杯卡片，展示赢家头像、独揽筹码数值（如 `+12,800 筹码`）；
   * 按获奖玩家编号展示各自手牌、牌型和派奖金额；循环克制时展示平分奖池；
   * 提供“再来一局”一键重置发牌与“关闭战报”按钮。

---

## 四、 拟真音效与语音系统 (Web Audio API + 预录制语音)

位于 [SoundManager.ts](../client/src/audio/SoundManager.ts)，结合 Web Audio API 实时合成与预录制真人感女声播报：

| 音效方法 | 物理拟真声学原理 | 触发时机 |
| :--- | :--- | :--- |
| `playDealCard()` | 80ms 白噪声发生器 + 1400Hz 带通滤波器指数衰减 | 发牌开局、重新发牌 |
| `playFlipCard()` | 600Hz $\to$ 1200Hz 三角波快速滑频 + 增益指数衰减 | 点击看牌翻转瞬间 |
| `playChip()` | 1800Hz / 2600Hz 正弦双频微小随机相位交错脆响 | 单枚筹码入池、基础跟注 |
| `playChipStack(count)` | 1750Hz 起步多阶正弦琶音叠加，依层数连续清脆碰撞 | 玩家下注/加注成摞筹码堆叠 |
| `playPKClash()` | 160Hz $\to$ 40Hz 锯齿波轰鸣 + 0.2s 爆炸白噪声脉冲 | 1v1 比牌两牌碰撞瞬间 |
| `playAllIn()` | 90Hz $\to$ 35Hz 双心跳脉冲（顿-顿）重低音波 | 点击全押（All-in）瞬间 |
| `playWin()` | C 大调大三和弦琶音（C5-523Hz, E5-659Hz, G5-784Hz, C6-1046Hz） | 终局结算、胜者独揽奖池 |
| `playFirstGoldAnnouncement()` | 皇家升调五音庆典琶音 + 播放预录制女声 MP3（`/audio/first_gold.mp3`：“恭喜大金！豪气冲天，一掷千金，全场瞩目！”） | 每局首次押注达到 5000 或 5000+ 时 |

* **静音开关**：全站右上角支持一键静音/取消静音，状态自动持久化于本地 `localStorage.getItem('zjh_sound_muted')`。

---

## 五、 牌型识别与裁判算法核心

前端 [pokerEvaluator.ts](../client/src/utils/pokerEvaluator.ts) 适配共用 [poker.ts](../server/src/shared/poker.ts)，牌型标签与本地对局使用同一规则：

- 本局 `deckKind` 决定 A-2-3 或 A-8-9 最小顺子；牌桌顶部展示 52 张标准牌／28 张短牌。
- 豹子 > 顺金 > 金花 > 顺子 > 对子 > 散牌；标准牌特殊 235 仅在与豹子直接比牌时逆袭。
- 点数相同再比关键牌花色，顺序为黑桃 > 红桃 > 梅花 > 方块；对子比较对子中的最大花色，低 A 顺子比较 3／9。
- 多人强制摊牌出现 235 循环克制时，存活玩家平分。结算弹窗按 `winnerIds` 和 `payouts` 展示各玩家及各自所得，亮牌通过玩家编号匹配，不依赖列表首项。
- 仅在所有已定义比较仍相同时保留主动比牌方判负的后备处理。

---

## 六、 社交互动体系规范

位于 [ActionPanel.tsx](../client/src/components/table/ActionPanel.tsx)：
* **快捷表情浮空弹窗**：支持 8 种高频互动 Emoji（🔥 烈火、😎 墨镜帅、😭 痛哭、💀 绝望骷髅、💰 金币眼、👍 点赞、🚀 起飞、🍺 干杯）；
  * 发送后在对应玩家头像正上方生成 2.5 秒浮动放大、平滑淡出的动画气泡（`animate-float-up`）。
* **快捷短语对话框**：预设 5 条经典金句（“快点吧，我等到花儿都谢了！”、“梭哈是一种智慧！”、“风水轮流转，底裤全靠这把！”、“老铁，稳住别慌！”、“搏一搏，单车变摩托！”）；
  * 头像旁弹出带倒三角指示箭头的漫画式白底对话框，展示 3.5 秒后自动隐去。

---

## 七、 超级管理员中枢平台规范 (AdminDashboard)

位于 [AdminDashboard.tsx](../client/src/views/AdminDashboard.tsx)，为独立于游戏桌的深度运维平台：

### 7.1 账号管理系统 (Accounts)
* 已实现：从真实管理员接口读取用户及在线/所在房间状态；创建普通玩家账号、重置密码。列表可手动刷新。创建成功后重新读取服务端数据，失败显示错误并保留表单。
* 管理员编辑他人资料/角色、封禁和删除账号的服务端接口仍待实现，正式页面不展示这些无效操作。管理员登录进入管理页，普通玩家进入大厅。

### 7.2 筹码与流水系统 (Chips)
* 调整筹码必须填写原因，正数增加、负数扣除；只有服务端成功后显示成功并刷新列表和流水。请求失败不修改本地余额，也不自动重试资金请求。
* 个人抽屉读取 `/api/user/ledger`（每页 20 笔），管理员全站流水读取 `/api/admin/audit-logs`（每页 20 笔）；包含加载、空数据、错误及分页状态，移除固定测试流水。
* 账本记录实际收支及经办人；这里记录管理员线下充扣，尚未接入线上充值或提现。

### 7.3 发牌规则配置与真实模拟

[AlgorithmPanel.tsx](../client/src/components/AlgorithmPanel.tsx) 替代旧的牌型倍率和个人幸运值面板。

- 默认标准牌 20%、短牌 80%；标准牌随机／冤家／保底为 30／40／30，短牌随机／冤家为 70／30。
- 冤家组合默认 35／35／20／10，按实际规则产生两手强牌。
- 对 2～8 人分别设置对子、顺子、金花、顺金、豹子的指定人数；各人数默认两手对子，其余为零，剩余人数自动随机。
- 牌型精确生成，没有“及以上”；零不禁止自然出现。人数溢出或概率和错误会禁止保存和模拟。
- 配置由管理员接口读取和保存；保存失败明确报错，成功提示从下一局生效。正式页面不提供本地演示保存路径。
- 草稿与已保存配置分离，恢复默认需再保存；读取失败时不能以默认草稿覆盖联机配置。
- 支持按 2～8 人执行 1,000 或 5,000 局真实发牌模拟。分支按局、牌型按手统计，特殊 235 单列；模拟不保存草稿、不影响余额。

完整字段与实现边界见 [发牌算法规范](dealing_algorithm_requirements.md)。

---

## 八、 运行模式与调测驱动体系

正式应用只启用真实联机；独立模拟模块用于回归验证，不由正式 App 导入或挂载。

### 8.1 仓库与本机辅助工具边界（2026-10-19）

仓库只维护正式游戏页面及其业务依赖。测试、模拟状态、调试工具栏和演示配置仅保留在本机，由忽略规则排除；前端编译同时排除这些文件。正式管理页面只通过管理员接口读写配置和执行真实发牌模拟，不再依赖本机演示配置。管理员的发牌模拟属于已实现的业务能力，继续保留。

### 8.2 生产联机 WebSocket 网关模式 ([socket.ts](../client/src/services/socket.ts))
> **2026-10-18 正式流程核对**：`App` 验证真实登录后连接 `socketService`；状态仓库初始身份、房间均为空。清除旧 `mock_*` 身份，缓存资料不能授予管理员权限。登录失败、API 401、连接鉴权失败不会回退到模拟身份。重连先清除旧房间视图，由服务端恢复仍存在的真实房间；服务器重启丢失房间时回到大厅。退出登录清理连接及牌桌状态。

* **同服同端口直连**：浏览器访问与 WebSocket 握手统一位于当前域名根端口，零跨域开销；
* **全生命周期信令支持**：
  * 发出指令：`room:create`, `room:join`, `room:sit`, `room:stand`, `room:leave`, `room:ready`, `game:look`, `game:bet`, `game:fold`, `game:compare`, `chat:emoji`, `chat:phrase`；
  * 监听广播：`room:state`, `room:left`, `game:start`, `game:player_looked`, `game:player_bet`, `game:compare_result`, `game:over`, `chat:emoji_broadcast`, `chat:phrase_broadcast`；
  * 与客户端动效体系无缝触发（筹码柱飞入、全押震颤、金色流幅、PK 弹窗与结算礼花）。

---

## 九、 交付文件拓扑一览表

| 模块类别 | 文件路径 | 职责定位 |
| :--- | :--- | :--- |
| **工程配置** | [package.json](../client/package.json) | 前端依赖、构建命令与 TypeScript 配置 |
| | [tailwind.config.js](../client/tailwind.config.js) | 墨绿呢绒、筹码色系、震颤与金光关键帧动画 |
| | [index.html](../client/index.html) | 移动端防缩放、防橡皮筋回弹与安全区适配 |
| **类型契约** | [game.ts](../client/src/types/game.ts) | 卡牌、桌位、房间快照、结算与对决数据契约 |
| **音频引擎** | [SoundManager.ts](../client/src/audio/SoundManager.ts) | Web Audio API 纯代码合成发牌、翻牌、撞筹码、PK、Allin、胜利 6 种音效 |
| **裁判引擎** | [pokerEvaluator.ts](../client/src/utils/pokerEvaluator.ts) | 牌型识别、大小加权计算、特殊 235 杀豹子及平局判定 |
| **排座算法** | [useTableLayout.ts](../client/src/hooks/useTableLayout.ts) | 2~8 人动态三角函数第一人称居中排座与向心倾角计算 |
| **状态管理** | [useGameStore.ts](../client/src/store/useGameStore.ts) | 牌桌状态、筹码堆队列、PK 与结算弹窗调度 |
| | [useAuthStore.ts](../client/src/store/useAuthStore.ts) | JWT 令牌、当前登录人资料持久化与鉴权 |
| **网络服务** | [api.ts](../client/src/services/api.ts) | HTTP RESTful 客户端（登录、个人资料、管理员专区） |
| | [socket.ts](../client/src/services/socket.ts) | Socket.io 实时信令封装与事件分发 |
| **桌位组件** | [Card3D.tsx](../client/src/components/table/Card3D.tsx) | 3D 轴向透视翻转、扇形重叠与花色水印扑克 |
| | [FlyingChipStack.tsx](../client/src/components/table/FlyingChipStack.tsx) | 2.5D 多层分段成摞筹码、推入动效与常驻桌面阵型 |
| | [TableSeat.tsx](../client/src/components/table/TableSeat.tsx) | 头像轮廓、光圈倒计时、牌型胶囊、战败印戳与气泡 |
| | [PokerTable.tsx](../client/src/components/table/PokerTable.tsx) | 毛呢椭圆桌面、中央底池全息金字与桌位/筹码挂载 |
| | [ActionPanel.tsx](../client/src/components/table/ActionPanel.tsx) | 下注跟注、看牌、加注抽屉、比牌、Allin 与社交面板 |
| **专属特效** | [PKClashModal.tsx](../client/src/components/animations/PKClashModal.tsx) | 1v1 绝密对撞撞击特写、烈火爆炸与战败印戳 |
| | [AllInEpicEffect.tsx](../client/src/components/animations/AllInEpicEffect.tsx) | 全屏暗红雷电震颤、烈焰徽章与低音心跳震撼 |
| | [GoldStreamer.tsx](../client/src/components/animations/GoldStreamer.tsx) | 5000+ 高额加注金色离子横幅与高光粒子 |
| | [SettlementModal.tsx](../client/src/components/animations/SettlementModal.tsx) | 终局大捷奖杯、礼花飞舞、独揽筹码与亮牌展示 |
| **页面视图** | [LoginView.tsx](../client/src/views/LoginView.tsx) | 真实账号登录与错误提示 |
| | [LobbyView.tsx](../client/src/views/LobbyView.tsx) | 大厅房间号加入、自建私局与规则速查指南 |
| | [TableView.tsx](../client/src/views/TableView.tsx) | 核心游戏对局主视图 |
| | [AdminDashboard.tsx](../client/src/views/AdminDashboard.tsx) | 管理中枢平台（账号管控、资金审计、算法调控与模拟器） |
| | [LedgerDrawer.tsx](../client/src/views/LedgerDrawer.tsx) | 个人筹码明细战绩抽屉 |
| | [App.tsx](../client/src/App.tsx) | 应用主入口与基于角色的全域视图流转 |

### 2026-10-18 后端审查联动说明

此前数据库与服务审查只修改后端与契约；本次已将上述正式页面接通，历史审查记录保持其当时范围。账号改密会使旧令牌失效并断开其在线连接，本次升级前令牌需要重新登录。资料及余额保存后，后端刷新所在房间快照；实际前端联机接入程度仍按本文各处“已实现/待实现”区分。详细范围见 [数据库与服务审查记录](database_service_review.md)。


### 2026-10-18 正式流程验证补记

本次变更双端构建、15 个文件共 305 项回归、6 项生产构建检查通过。新增正式认证状态、错误处理、人数校验、满员准备、断线取消准备及多窗口离房测试；已有模拟隐私与金额测试改用独立 `useMockGameStore`。Playwright 使用临时数据库及三个独立浏览器账号验证真实开号、错误密码、登录大厅、指定人数建房、实际入座与观战、满员且全员准备、无自动下注、手动跟注/看牌/弃牌、聊天、结算、下一局重新准备、刷新恢复、真实流水及退出。390 像素窄屏操作栏已验证完整显示。线上发布与公网检查见 [原生部署记录](native_deployment.md)。


### 2026-10-19 仓库整理验证

测试、调试工具栏、演示配置和部署工具仅本机维护。正式管理页已移除对演示配置模块的导入；前端编译排除本机辅助目录。迁移后的本地入口完成双端构建、305 项回归与 6 项生产产物检查，均通过。
