# 报告、业务纠错与跨会话记忆（单 root 规则更新）

## 当前增量：原生会话与记忆的 Web 管理（2026-10-30）

本批只补管理适配，保留原生存储、会话生命周期、写锁、提取与全局合并；不改原生时间戳、成功水位、冷却或租约。普通分析 generate_memories=false，明确偏好走原生笔记；确认业务知识走数据源裁决。不宣称单条撤回或删除聊天会同步抹除所有影响，也不以一次成功保证模型总能正确识别和遵循偏好。

原生会话历史、逐会话提取记录、全局摘要是不同对象。删除通过 thread/delete 执行：写者占用时拒绝，成功后清理对应逐会话记忆；已参与合并的来源由原生登记后续整理。独立保存的偏好和数据源知识保留；用户可从删除确认框进入各自管理页。已有上下文不自动撤回。真实删除原偏好聊天后，笔记及管理页编辑仍保留，新 Flash 会话继续按纠正后偏好回答。

后台维护登记原生返回的确切 ID、进程出生标识和状态，存放在当前 profile 的 Web 管理元数据中。普通列表按登记身份区分，不以标题／工作目录猜测；同名用户会话仍可见，运行与已清理的维护直链转到记忆管理。完成清理由所属 NativeSession 经原生接口执行，失败留诊断。原生没有完整 startup-finished 通知，限时未观察到本轮任务只能记录未确认，不能称合并成功。真实合并任务、生成文件变化、回执、内部会话移除及维护进程退出已确认；本次关闭页面与原生 job 完成在同一秒，仅清理时间明确晚于关闭，不夸大为整段工作在无浏览器期间执行。

Web 唤醒预检查对齐固定版本原生的交互来源、非空预览、归档、毫秒闲置边界及已成功无输出水位。最终领取、并发上限、重试与冷却仍由原生决定。来源删除后无剩余 stage1 记录的 pending 全局整理路径保留；候选数减少不是本维护 worker 成功证据。

管理页分开展示保存可读性和原生全局合并状态。只有本轮原生任务与真实摘要输出匹配才标完成，旧 done 行／已有文件／触发回复不构成独立完成证据。可见时每五秒只读刷新，关闭后停止；只更新展示，不触发模型整理。偏好编辑器持有独立基础版本，轮询不会升级未保存草稿的 CAS，另一页面保存后旧版本明确拒绝且留稿；用户确认后可载入当前保存内容再核对。实际两页浏览器验证通过，关闭前后读取计数保持不变。

MM-06 的真实失败曾被误看成模型不遵循：前端单个 codex-web-analysis 值把规则、用户编辑和近期笔记放在一起，超过固定原生每值 1000 近似 token（4000 UTF-8 字节）预算，原生从中间截掉最新纠正。现按稳定编号完整分段，每项含说明控制在 2000 字节内；应用规则使用 application，用户编辑和近期笔记使用独立 untrusted 原生片段，不提升数据权限。turn/start 和 turn/steer 均传递。修后真实 rollout 有最新编辑与原生不受信任片段，实测最大 1893 字节／项；Flash 使用新偏好，页面只显示真正用户问题，未把 JSON 变成聊天气泡。保留首轮真实失败以区分传输缺陷与剩余模型遵循边界。

历史任务摘要显示来源时间及状态，只作旧任务线索，不作为当前业务事实；空态不提示普通新分析闲置后必提取，生成摘要不自动回填用户偏好。实际原生笔记保存、新会话读取、手动纠正及删除原聊天后读取分别通过；后端 505 项中 501 通过、4 条件跳过，前端 25 文件 419／419，原生启用专项独立列账。当前问题、分层结果和公开证据见[AUDIT_2026-10-30.md](AUDIT_2026-10-30.md)、[TEST_REPORT.md](TEST_REPORT.md)及[memory-management-2026-10-30](test-results/memory-management-2026-10-30/)。本节优先于下方历史实现与阶段记录。

既有 42399 实例及历史未因本批验证清理。北京时间 10 月 30 日 16:40 的自然冷却核验现已完成，见下节及[scheduled](test-results/memory-management-2026-10-30/scheduled/)；不再沿用下方历史记录中的“未来尚未执行”作为当前状态。

## 2026-10-30 补充：已完成检查与自然冷却后的再次合并

最新结果见[AUDIT_2026-10-30.md](AUDIT_2026-10-30.md)和[证据](test-results/native-regression-2026-10-30/)。下方“未验证全局合并／已安排03:45”是10月29日阶段记录：该定时检查现已执行，观察到新的原生全局合并与文件变化，新 Flash thread 注入摘要的全文哈希一致并作答；不冒称它调用了专用 read 工具，也不认证任意语义全覆盖。

本轮独立实例实际测试了用户编辑、旧版本保存拒绝、暂停时检索拒绝且新 thread summary=null、启用后分段按 hash 读取当前编辑文档，以及清空后记忆为空而原生对话历史保留。编辑后的新报告有采用新标题的实例；另一次 PG 报告未完全遵循已经传入的标题偏好，模型遵循的限制保留。清空期间遇到有效原生整理租约会真实拒绝，须等实际结束，不能伪造租约或显示假成功。

编辑内容即时跨会话读取与再次合并全局摘要分别计账：保留原服务、笔记与历史的北京时间 10 月 30 日 16:40 有界检查现已完成。实际观察到新的原生全局整理和 memory_summary.md 变化，新 deepseek-flash 会话经 thread/memory/read 绑定原生注入摘要的同一全文哈希，并回答先写“结论摘要”、再写“数据与限制”、不再使用旧“证据先行”标题。读取路径是原生全局摘要注入，不冒称调用专用 read 工具；原始结果 `/tmp/codex-audit-20261030/edited-memory-once/result.json` 将随[scheduled 证据](test-results/memory-management-2026-10-30/scheduled/)交付。该收据证明本次具体纠正合并和读取，不证明任意历史语义都被完整保留。


本文先描述已应用到现有代码的单 root 规则、持久原生接入及其验收边界，后保留 2026-10-28～29 的旧轮证据。A、B 已串行完成，代码、工程回归与真实流程按各自覆盖记录。resume／直连执行门禁已应用，B 已验证直连 process/spawn 拒绝；未实际触发的历史目标／队列竞争和 SQL in-flight 变更仍不算通过。

本次证据归档：[single-execution-2026-10-29](test-results/single-execution-2026-10-29/)，[manifest](test-results/single-execution-2026-10-29/manifest.json)记录逐文件哈希与排除范围。收据内临时源目录保留原文，不修改 JSON 制造新的执行记录。

## 会话与执行范围

同一用户最多 1 个 root 会话同时执行，历史／草稿总数不限；等待审批、停止清理、浏览器断开后未核实原生终态时仍占 slot。原生 child agent 属于当前 root，继续由原生派发、等待和中断。临时上下文、假设、草稿、工具输出和审批按 thread／turn 隔离；只有显式长期偏好与专门管理的确认业务知识共享。

当前由 Web 服务持有原生 app-server，使用本地 Unix WebSocket；后台观察连接和每个网页的原生连接相互独立。刷新、关闭网页或退出浏览器不终止服务持有的原生进程，后台观察继续核对事件和执行占用。原生服务错误、服务停止及实际中断按真实状态处理，不将浏览器断开当作回收凭据。审批仍由原生连接处理，不广播或模拟接管审批；重连不重发任务，也不自动批准。

`thread/start`／`thread/resume` 使用原生线程订阅，`thread/read` 只读快照。其他 root 活动时仅用 read／分页呈现历史，避免 resume 恢复历史目标或队列；获得执行资格后再真正恢复。执行回执未知或后台观察失败时保留占用、显示诊断并禁止新提交，已知原生回合仍可停止。

## 当前记忆策略

| 对象或阶段 | 当前规则与原生机制 | 不应误称的行为 |
|---|---|---|
| 新分析会话 | `memories.generate_memories=false`；未暂停时启用 `features.memories`、`memories.use_memories`、`memories.dedicated_tools` | 不是所有新历史都自动抽取／共享，也不是关闭整个原生记忆读取 |
| 显式长期偏好 | 用户明确要求长期保留后，通过原生 `memories.add_ad_hoc_note` 保存并留真实调用／返回收据；保存成功即可由工具读取，无需等待历史提取；原生 append-only/create_new 防同名覆盖 | 模型口头说“记住”不是保存；不把业务结果、临时条件或推断写成共享偏好 |
| 临时分析上下文 | 只在所属原生 thread 内使用；普通切换会话不继承临时目标／标记／假设 | 不凭相同登录用户把所有临时对话放进共享笔记 |
| 确认业务知识 | 数据源知识页面管理候选／原文／采用或拒绝／版本／纠错原因，查询读取当前有效定义 | 原生记忆不能批准知识，偏好不能覆盖公式、事实、权限或数据新鲜度 |
| 既有摘要和老历史 | 不删除既有原生摘要；既有老历史仍按原生资格、闲置、筛选与冷却条件整理 | 不改时间戳、租约、水位或年龄制造通过；不承诺五分钟内完成历史提取 |
| 已保存 notes | 自动 consolidation 继续由原生维护会话、锁、job 与冷却机制处理 | 不自建模型摘要循环，不将 notes 已保存与全局合并已完成混为一谈 |
| 暂停／用户编辑 | 保留已有暂停、清空、内容版本和用户编辑优先规则；暂停后不得让新 thread 重新开启记忆读写绕过用户决定 | 专用工具启用不等于可以绕过暂停，编辑 CAS 不等于任意文件写锁 |

新策略取代旧轮“浏览器 features.memories=false、generate_memories=true、前台只走管理 MCP 即时笔记桥接”的接入说明。旧轮实现与通过记录仍留在本文历史部分，不再描述当前目标。原生专用工具必须经实际新会话响应、工具调用和跨会话读取验证，不能只看配置或复用旧 search 探针。

### 本次原生后台阶段证据

旧 seed 历史于 `2026-10-29T11:00:19.524Z` 完成，自然闲置满一小时后，原生 `memory_stage1` 于 `12:00:34`～`12:00:40 UTC` 完成，生成 1070 字逐会话摘要。只读证据 `test-results/single-execution-2026-10-29/natural-memory-receipt.json` 记录原始更新时间、job 和摘要 SHA256；未修改时间戳、job 或租约。设置页面可读取该摘要全文，不能以显式 note 的即时写入代替这一阶段。

该 seed 的全局 consolidation **未验证完成**，仍受原生六小时冷却约束。逐会话摘要已生成、显式 note 已保存、全局摘要已合并是三种不同结果；本条不宣称新分析自动提取或替代 A／B 的独立显式偏好验收。证据归档见本文开头。

已实际安排一次全局记忆检查：北京时间 `2026-10-30 03:45:11`（`2026-10-29 19:45:11 UTC`）首检，之后最多只读观察一小时。[安装收据](test-results/single-execution-2026-10-29/scheduled/launch-receipt.json)为 scheduled=true、semanticOutcome=notYetTested；不需要浏览器在线，保留全部历史／notes／结果。未来结果写入运行状态目录 `/root/Codex/.local-state/global-memory-2026-10-30/once/result.json`。已安排不等于已执行或合并通过，不承诺自动通知或系统重启后恢复，也不改历史时间戳或租约。

## 报告与知识闭环

- 完成分析在原对话展示，导出 Markdown、离线 HTML 与完整依据 JSON；数据／ECharts 同区、CSV／PNG 沿用现有入口。导出是否成功以实际文件和关联 resultId 为准，不能以模型承诺代替。
- 用户主动探索；物理结构与推测解释分开。知识纠错保留原文、候选、用户决定和原因，争议由用户在数据源页面明确处理，模型和测试根 Agent 不判业务谁对谁错。
- 查询前读取当前 context；连接／知识／指标／文件／新鲜度收据贯穿实际结果、计算、图表和发布。修改依赖后拒绝旧版本继续派生／发布或标记历史需复核；旧报告和原依据保留，不静默重写或无限重跑。
- 业务结果不因“以后可能有用”进入共享记忆。可重用的业务定义须走确认知识管理；历史分析报告可按原生历史与结果存储查阅，不等于当前共享事实。

## 文件并发与防丢修改

单 root 执行消除了两个独立 root 正常同时写同一文件的路径；同 root 的 native children、未回收命令、管理编辑和外部 CLI 仍可竞争。root 应给 children 分配独立目录／文件所有权，再引用汇总；普通结果沿用不可变 resultId，源输入沿用稳定读取及 hash／版本依赖。设置、知识和用户编辑记忆用其已有版本接口与 CAS，不另造通用文件编辑系统。

固定原生 fs/writeFile 没有 expectedSHA256，apply_patch 只有上下文匹配而非整文件 CAS；原生 add_ad_hoc_note 的 create_new 防同名覆盖，后台 consolidation 的锁覆盖其协作流程。任意 shell 不会自动参与 Web 文件锁；不能以 Web 端 hash 检查假称所有写者已受保护，也不对整个分析周期持有全工作区锁。

## 本次 A／B 串行验收结果（两位已串行完成）

| 对象 | 当前记录状态 | 最终结果与归档 |
|---|---|---|
| Tester A | 已完成；GO-A `12:08:29.788 UTC`，定向 `12:09:26.604`～`12:49:13.137`；机制修复暂停 `12:22:30.380`～`12:37:41.269` | 自由 `12:49:13.159`～`12:50:56.086`，102.927 秒；最后新操作 `12:50:56.079`，早于 `12:54:13.159` 截止；`12:51:35.123` 最终核对并关闭浏览器，execution idle。`test-results/single-execution-2026-10-29/serial-a/summary.json`／`observations.md`／`A-final-cleanup-status.json` |
| Tester B | 已完成；接到 GO-B／定向开始 `13:09:47.603 UTC`，定向结束 `13:39:50.482` | 自由 `13:39:50.482`～`13:43:47.543`，237.061 秒，最后新操作 `13:43:47.480`，早于 `13:44:50.482` 截止；`13:48:22.227` 原生 idle／无自有等待进程，`13:48:22.564` 浏览器全关。`test-results/single-execution-2026-10-29/serial-b/summary.json`／`cases.json`／`final-native-idle-resources.json`／`final-browser-closed.json` |
| A 发现的 closed child 清理故障 | 首次真实 child 卸载后终端列表返回 thread not found，旧适配卡住 cleanup；首次失败保留，重启清除旧 hold 不算通过 | 修复后第二个真实 child 执行，closedThreadHistory proof 包含 54 个已观察命令 ID，最终 idle；真实复跑通过。旧 `closure.kind=closeAgent` 仅表示关闭尝试结束，不是 API 成功 ACK；安全证明是 fresh notLoaded、完整已退出历史及 closure／hold／root revision 核对 |

A 的真实链路覆盖：主动探索 70 对象／479 字段、Plan 两轮澄清与修订确认、两个原生 Flash children、查询→Python→两张 ECharts→publish_answer；最终依据 verification=verified、scope=referenced-fields，7 个结果，不认证正文全部解释。CSV、两张 PNG、Markdown／离线 HTML／依据 JSON 已下载，离线 HTML 两张静态图可读。全部页面于 `12:18:39.591 UTC` 关闭，查询结果于 `12:18:48.744112` 读取，重开后恢复原 thread，未重发原 turn。知识 rev1→2 发生在查询后；旧派生于 `12:38:32.520` 被拒绝，模型重读并重查后使用 rev2。显式长期偏好有原生 add_ad_hoc_note 和 read 收据；临时内容没有写入 note，B 的独立跨会话检索仍 pending。

A 未覆盖：查询执行窗内修改、受控文件 hash 变化拒绝、绕过 UI 的第二 turn/start 及其他执行入口完整矩阵、后台全局合并完成。证据只按实际范围计入，不将第二标签页 UI 禁发当作服务端全矩阵通过。

B 补足的真实链路与例外：

- 新分析实际读取当前知识与原生 memories.search／read，共享显式偏好可检索，临时条件答不知道。首次回合只有准备文案、未调用工具，后续真实检索才算证据；控制器曾意外打印同用户历史预览，未把 A 临时内容放进 B 模型提示词，盲测独立性有限，不能据此认定模型上下文泄漏。
- 对话纠错先登记 pendingUserReview，用户在数据源页查看原文／候选、说明理由后采信。陈旧业务补充与时效规则保存均实际返回 **HTTP 400** 并提示版本冲突、保留草稿；不是本次 HTTP 409。知识错误响应正文未单独捕获，保留 HTTP 时间与界面反馈。新分析读取纠错历史和 rev3 重查，旧 A 报告原文保留并提示复核。
- `maxAgeMinutes=0` 后，跨轮旧结果 run_python 因时效拒绝；读取结果／Python 派生没有刷新获取时间。重新读 context、真实查询后得到新获取时间并发布。受控服务目录 CSV 经原生工具修改后，旧 documentId 的 run_python 真实拒绝；重新导入生成新 ID／hash 后计算成功。文件专项未 publish_answer，尾部未核验文案警示保留，不冒充正式报告已发布。
- 原生审批 id0 于 `13:18:12.887 UTC` 收到 decline，原 `propose_database_correction` 于 `13:18:13.058` 返回 failed／result=null／user rejected MCP tool call／durationMs=0，候选写入确实未执行；后来 accept 的 id1 是新调用，不能混用。审批等待时，正确格式第二 root 被后端 executionBusy 拒绝；未知 thread、错误 turn 的 Stop 返回真实原生错误且占用不变；直连 process/spawn 被后端明确拒绝。
- 真实等待命令点击 Stop 后处于 cleaningUp，立即第二 root 仍被拒绝；原生 interrupted、命令退出和自有等待进程不存在后 idle，另一 root 才成功执行。首次 90 秒命令自然结束前没点到 Stop，保留为初次未覆盖；后续 300 秒等待在开始后立即停止才用于通过。刷新／全页面关闭后同一 thread／turn／PID 继续，重连未重发；重连后的 Stop 由 interrupted、资源回收／idle 及进程消失证明，未声称新 socket 收到了 command-completed。
- CSV、PNG、Markdown、HTML、依据 JSON 实际下载；离线 HTML 是两张已加载完整图片，不是 SVG 计数。自由探索 237.061 秒，1024 宽度无横溢出；已完成 Plan 草稿等待确认时 idle，另一 root 实际可执行，原方案未被偷偷执行。

B 未独立覆盖 native child 停止、另一种 request_user_input 等待或故意越过自由截止的操作；A 已有原生 children 与用户输入等待证据，但不混写成 B 执行。两位均未覆盖 SQL 真正执行窗内修改。控制器的错误选择器、脱敏配置重放／缺 threadId、CSV 下载等待导致控制器退出等失败保留，不把它们当作有效后端准入或导出通过证据。详见 `serial-b/cases.json` 逐项 limitations，原生模型身份均为 deepseek-flash／deepseek。

两位真实产品 tester：A 定向测试→自由探索最多 300 秒→原生任务／命令／child 清理→slot 空闲→根 Agent 明确 GO-B→B 定向测试→自由探索最多 300 秒→清理。不存在“两位同时开跑”的阶段；每位可自己操作两标签页验证陈旧编辑和第二 root 被拒绝。完整可复制提示词、步骤、时间表和 pending 证据模板见 `MULTI_SESSION_AUDIT_2026-10-29.md`。

记忆定向验收必须包括：A 生成只限本 thread 的临时标记，另明确请求长期偏好并真正调用原生 add_ad_hoc_note；A 结束后 B 新 thread 读取当前偏好和确认知识，不能获得 A 临时标记／草稿；确认新分析 generate=false、未暂停时原生读取和 dedicated tools 可用；暂停与用户编辑优先规则保留，已有原生摘要不删除。保存 notes 和 consolidation 成功分别记录，若原生条件未满足就记未完成。

同时覆盖探索、知识纠错和用户冲突决定、实际查询窗内依赖修改（没赶上则如实未覆盖）、时效与 acquisition、旧报告 affected、实际导出、Plan／native child／stop／多标签页拒绝，以及等待／停止清理／断开期间 slot 保留。测试者记录机制，不用独立业务答案裁决产品。

## 本次新增问题与处理（CW-097 起）

类型区分真实复现、源码风险和纯界面问题；协议回归不冒充真实模型业务验收。已应用与仍未实测的子场景分别标注。

| 编号／类型／优先级／流程 | 实际表现或检查依据与影响 | 根因、修复方向与验收标准 | 当前证据与状态 |
|---|---|---|---|
| CW-097 已复现／P1／浏览器与后台生命周期 | 旧连接拥有原生进程，关页可能连带结束执行／整理 | 服务持有固定 Unix WebSocket 原生进程，独立后台观察；网页只断开投递，不重发输入。验收关掉全部页面仍有真实任务结果，重连不重复执行 | 定向真实 Flash 生命周期 9 项通过；A 全页面关闭期间 MySQL 查询完成并恢复，见 `test-results/single-execution-2026-10-29/browser-lifecycle/verification-summary.json`、`serial-a/observations.md`；已修复并实测此范围 |
| CW-098 已复现／P1／全局单 root 准入 | 旧规则允许多个 root 同时运行，不满足新单用户执行限制；单靠禁用当前页面按钮无法跨标签页约束 | Web 原子预留，原生 ancestry 归 root；审批、回收和状态未知继续占用，终态与清理后才放行。验收跨页／直接请求均拒绝第二 root 且留稿，原 root 可继续 | 定向生命周期、A blocking 输入 UI 与 B 真实审批等待／cleaningUp 时正确格式第二 turn/start 拒绝、草稿保留及清理后新 root 成功均有证据；不泛化为所有未来协议入口或生产并发认证 |
| CW-099 已复现／P1／原生记忆配置 | 已加载且仍有订阅者时，resume 的新 memory flag 可能不生效；nested／flat 冲突又可形成不同实际配置 | 空闲且无清理时取消所有已知网页／observer 订阅，同 ID 冷恢复；配置扁平化，memoryMode/set 成功后读取真实 feature 再缓存。验收启用／暂停／再启用真实生效，忙时拒绝，不误写成功 | `test-results/single-execution-2026-10-29/native-memory-policy-receipt.json`：固定原生无 key 协议探针验证 warm 忽略、cold 生效和隐藏订阅者失败可诊断；真实 Flash 原生工具调用另有生命周期及 A 收据。已修复；不等于本轮全局合并完成 |
| CW-100 已复现／P1／普通 root 事件订阅 | root 已执行但网页只有全局状态，缺少 turn／item；全局 thread/started 不构成订阅 | 创建连接与网页分别走原生订阅；新 root 必要时用首个真实问题持久化名称，再由网页原生 resume 附着。验收两端得到真实 turn／item，刷新不代造事件 | 首次失败保留；定向真实 Flash 和 A 的 Plan／查询／工具过程已可见。已修复并实测，不用复制事件替代原生订阅 |
| CW-101 源码风险／P1／idle 先于 Completed | 原生全局 idle 与订阅 Completed 可先后到达；若 idle 先释放，旧 Completed 可能重新占用旧 root，造成准入窗口／假忙 | 保留已观察 active turn 至匹配终态，按实际回合和清理 revision 收敛。验收 idle→迟到 Completed 顺序不能放行后再复活旧占用 | `web/tests/test_native_runtime.py` 定向顺序回归已覆盖；已修复此顺序风险，未把人工协议顺序夹具当成新增真实模型场景 |
| CW-102 源码风险／P1／断页时 ACK drain | 浏览器先关闭、执行 ACK 后到；若同时关闭原生 reader，会丢回执并错误释放或永久未知 | 网页投递断开后原生 reader 继续 drain 全部受跟踪请求；请求、发送和内部等待均清空后才断连接。真实 native EOF 且 ACK 未知时保持 acknowledgementUnknown，显示错误而不重发 | 协议回归覆盖断页、迟 ACK、投递积压及真实 EOF 未知；UI 43 项含未知状态禁 steer、保留 Stop。已修复已知投递路径；真实 EOF 未知仍需核实／恢复，不能声称自动解除 |
| CW-103 已复现／P1／closed child 清理 | A 第一个 child 已完成卸载，终端列表报 thread not found，旧适配保守卡 cleanupFailed | 对关闭尝试结束的 child，用 fresh notLoaded、完整命令均退出的历史、已观察命令无遗漏及 closure／hold／root revision 证明回收；不把 list 报错当空列表，不 resume 已关闭 child | A 第二个真实 child 回归产生 closedThreadHistory／54 命令 ID，最终 idle；首次失败 `serial-a/A-cleanupFailed-public-snapshot.json` 保留，成功见 `A-final-cleanup-status.json`。旧 kind=closeAgent 只是尝试结束，非成功 ACK；已修复并实测此路径 |
| CW-104 源码风险／P1／陈旧 interrupt | 旧页错误 thread／turn 的 Stop 原样报错前，Web 仍可能先造 cleanup root／hold，影响另一个正在执行的 root | 仅精确当前 active turn 或既有 cleanup job 可登记回收；其他请求让原生返回实际结果，不新造归属。验收旧／未知 Stop 不产生 conflicted／假忙，真实当前停止仍待终态与清理 | 修复已应用且协议回归通过；B 在真实审批等待期间向未知 thread／错误 turn 发 Stop，原生报错，前后 owner／active turn／blocked roots／cleanup holds 保持不变；正确 Stop 和清理后释放另有真实证据 |
| CW-105 纯界面已复现／P2／记忆弹窗 | 探索弹窗 flex/hidden 被复用，10 行编辑框压为 22px，摘要和操作不可达 | 仅记忆弹窗改独立 block／auto 滚动，不改探索布局。验收 1440／1024 编辑框正常、摘要全文和所有动作可达、无横溢出 | `test-results/single-execution-2026-10-29/memory-dialog-layout/after/receipt.json`：225.906px、动作可达、探索计算样式不变；0 模型／0 设置写／0 页面错误。已修复并浏览器实测 |
| CW-106 源码风险／P1／resume 自动目标／队列窗口 | 即使原来 idle，原生 resume 也可能在 ACK 后自动恢复历史 goal／queue；若未预留和导入真实持久状态，可短暂放行第二 root | 已应用：实际 resume 前原子预留并读取原生 goal／queue，ACK 后按实际自主工作保留占用；内部 observer 恢复同样经过门禁。验收未加载历史自动工作与新 root 竞争时无空窗 | `test-results/single-execution-2026-10-29/applied-resume-final.json`；最终后端 418 项：414 通过、4 条件跳过。B 真实冷恢复历史未产生重复 turn；历史目标／队列自动恢复竞争本轮未单独触发，不将普通恢复当成该子场景通过 |
| CW-107 源码风险／P1／直连 process/spawn | 原生直连执行方法不一定带分析 thread 归属，可能绕开单 root 准入；隐藏诊断入口不构成后端门禁 | 已应用：分析用户通道明确拒绝未纳入归属的 process/spawn 等直连执行，保留原生 Agent 线程内工具；独立维护诊断另按授权管理。验收原始 RPC 明确失败，正常 thread 工具不受损 | B 原始 process/spawn 请求实际返回 -32002“该原生执行方式尚不能完整关联单会话状态”，占用不变；正常原生 thread 命令随后实测，后端 418 项：414 通过、4 条件跳过。没有声称任意 shell／外部 CLI 已受 Web 文件锁或此准入规则控制 |

## 本次工程回归的版本范围

- 19 个 JavaScript 行为文件合计 **308 项通过**，最终汇总见[js-verified-results.json](test-results/single-execution-2026-10-29/js-verified-results.json)。此前 298 项中的 single_execution_state 33→43，净增 10，不重复计数；浏览器布局和真实模型另计。
- 前版原生专项 **131 项通过**见[前版原生日志](test-results/single-execution-2026-10-29/native-closed-child-suite.log)，前版后端 **402 项（398 通过、4 条件跳过）**见[前版后端日志](test-results/single-execution-2026-10-29/repository-backend-verified.log)，历史结果保留，不冒充最终版本。
- resume／直连执行补丁应用后的最终后端 **418 项（414 通过、4 条件跳过）**见[最终后端日志](test-results/single-execution-2026-10-29/repository-backend-final-current.log)；语法 **221 份（94 Python AST＋127 JS／MJS）**通过见[语法记录](test-results/single-execution-2026-10-29/syntax-current.json)。[CodeGraph 当前同步](test-results/single-execution-2026-10-29/codegraph-sync-current.log)和[固定上游源码原样](test-results/single-execution-2026-10-29/upstream-integrity-current.log)分别记录。前端纯 JS／CSS，无单独打包构建或 TypeScript 编译步骤。
- 日常 8765 服务已按授权原位重启，旧 Web PID 4137200→162874，原生进程由 Web 服务持有；[日常只读收据](test-results/single-execution-2026-10-29/daily-readonly/receipt.json)于 `14:00:20.687 UTC` 记录 native-unix-websocket／web-service、1440 无横溢出、零页面错误、无 turn/start。没有把日常只读检查当作新模型任务。
- 两位真实用户流程、浏览器检查和工程回归分开记录，不互相替代。本次文档更新没有运行产品、模型、CodeGraph 或重跑测试。

当前剩余运行边界：真实 ACK 丢失或后台观察失败会保守保留占用，需要人工核实，不能冒称自动解除；closedThreadHistory 仅证明原生管理的已观察命令结束，不证明任意脱离管理的 OS 进程已消失。已加载闲置线程的 MCP 进程，以及终态／待决请求的墓碑记录，可能随运行时寿命增长，目前没有完整淘汰策略；单 root 准入不等于长期内存恒定。同配置空间外部 CLI 不受 Web 准入约束。这些保留为运行与后续资源治理限制，本轮不另扩展开发。

## 资源测量的范围

`/tmp/codex-resource-20261029/report.md` 与 JSON 仅测无 turn/start、无模型调用的闲置 native 进程／已加载空线程；3 线程布局只是对照，不是产品并发目标。PSS 受共享映射分摊影响、RSS 可重复计页，不能外推单 root 加 native child、查询 worker、Python／DuckDB 的生产峰值，更不能按历史会话数乘执行峰值。需要另测同一时刻实际活动进程集合与服务固定开销；本轮未执行该压力测试。

## 旧轮证据阅读约定

以下是从真实仓库保留的历史批次记录。所有“本轮”“通过”“已修复”、端口、PID、源码基线与数值仅指当时的测试，不是本次单 root／原生显式记忆新策略的验收结果；其中浏览器生命周期、generate=true／前台桥接接入限制已被上面的当前规则取代。旧批次 notes 合并成功不证明本次 seed 全局合并完成；旧批次历史提取未覆盖不否定上方本次自然一小时 stage1 证据。保留原失败、未覆盖与模型漏记限制，不伪造成新通过。

## 旧轮问题处理清单（历史记录，非本次通过）

| 编号／类型／优先级 | 复现或依据、影响 | 根因、修复与验收 |
|---|---|---|
| CW-085 体验／P2／报告 | 正文被大量技术 JSON 占据，复杂报告缺阅读和可分享导出 | 正文优先、目录、Markdown／离线 HTML 与证据 JSON 分开；真实 Chromium、SVG 及 PDF 打印通过；真实复杂 Flash 报告三格式已导出 |
| CW-086 代码确认＋行为回归／P1／知识依赖 | 旧结果可在采用新定义后继续派生／发布，当前轮未读取有效知识 | 按轮知识凭据与派生传递、发布原子检查、旧报告影响提示、必需业务补充分页独立；后端回归通过；真实完整闭环已通过 |
| CW-087 代码确认／P1／语义版本 | 拒绝错误修订后的业务补充物化 ID 改变，可能误报旧结果失效 | 对当前业务正文归一化，物化笔记只表达引用；拒绝恢复和相同重采回归通过 |
| CW-088 已复现／P1／刷新恢复 | 真实 Flash 流程刷新后 resume 提示 memories.dual_write 应为 boolean | 原生可选 null 回传 TOML 形成空字符串；配置映射排除 null／undefined，保留 false／0；真实刷新重连与后续查询通过 |
| CW-089 已复现／P2／数值正文 | 百分点／百分比被识别为常量百，模型反复修订增加等待 | 双端数字规则排除单位词，保留真正中文计数；共享正负语料回归通过；真实 Python／发布专项通过 |
| CW-090 已复现／P1／发布与最终正文 | 发布返回 JSON，模型把转义段落或已发布措辞再次改写，严格核验拒绝 | publish_answer 返回真实正文 content＋结构化依据；拒绝代码块外伪换行并说明；不放宽 hash。下一真实轮已确认原先失败的简短报告原样发布，完整闭环也通过 |
| CW-091 代码确认／P1／后台生命周期 | 原生后台在聊天 root 启动，浏览器 WS 关闭可能终止持租约任务 | 浏览器 root 不启动记忆整理、保留历史资格；服务端独立调度原生任务，近期笔记走原生格式桥接。无页面调度两次真实检查通过；已看到离线期间真实原生任务运行；完整离线笔记合并已实测完成，读回原生摘要后进入六小时冷却 |
| CW-092 代码确认／P2／记忆时间 | 只说明一小时提取，遗漏原生六小时合并冷却，会误解为满一小时必成功 | UI／文档显示阶段与冷却，可直接看／搜原生逐会话总结；只读状态／分段 hash 回归通过，不绕过原生条件 |
| CW-093 体验和代码确认／P2／记忆编辑 | 后台生成文件使手工草稿误判并发；旧编辑又作为笔记重复注入 | 用户内容单独 CAS，真正用户并发仍拒绝且保留草稿；已取代编辑不重复注入，原生历史保留。实际浏览器保存／跨页／冲突／清空通过 |
| CW-094 代码确认／P1／部署生效 | 旧 MCP 未加载新工具，配置空间有误会读错记忆 | 分析合同版本升级并绑定 CODEX_WEB_MEMORY_HOME，只迁移本项目托管配置，等待活跃任务结束再重载；不回退其他 profile。相关行为回归通过 |
| CW-095 已复现／P1／后台原生触发与完成 | 真实离线调度存活但原生任务数为零；只调用 thread/start 不触发流水线。另有 use_memories=false 导致读取接口返回空 | 增加一次原生 turn/start，维护源禁止参与记忆提取，禁用业务 MCP；摘要读权限启用，内容哈希代替 mtime 判断，结束后清理自有维护会话。协议回归通过；真实原生笔记合并在全部测试页面关闭后完成，原生摘要实际读回；首轮仅存活／仅运行证据保留 |
| CW-096 真实模型限制／P2／即时偏好漏记（未保证消除） | 同样的“长期偏好＋仅一句确认”真实请求，有成功写入，也有模型只口头说记住却未调用记录工具 | 已明确优先级和不得无保存收据声称记住，但复跑仍见漏记，不能宣称百分之百修复。原生后台历史整理是自动后备，仍受时间和模型筛选约束；重要偏好可在设置查看／确定性编辑。普通自然表达与后台实际完成单独验证，失败证据保留 |

## 旧轮分层验收与边界

- 后端最终一次：243 项，239 通过，4 个既有条件跳过。JS：16 文件、249 项通过。没有前端打包编译步骤；语法、原生验证与浏览器／模型分开报告。
- 原生校验：源码 pristine，176 方法和完整 schema 与当前二进制匹配；没有修改 native 或 upstream。
- 独立 Chromium：四组通过，零页面错误；1440／1024、目录、统一图表／数据、离线 SVG、PDF 打印、Markdown／HTML／JSON、编辑／并发草稿／真实原生清空。报告数据是明确界面夹具，非模型结果。
- 独立调度：全部测试 UI 关闭后，两次真实 idle 检查通过，模型请求为零。证明无需浏览器，不冒充完成模型历史提取。
- 真实模型：前四轮日常服务＋独立 AdventureWorks 已覆盖复杂多问题、自主／手动计划、修改／确认／进度／停止继续、拒绝、实际 MySQL 运行取消、刷新重连、报告三格式。前两轮脚本写死候选主题名失败；第三轮发现实际恢复 bug；第四轮发现单位词误判及最终正文改写；全部失败证据保留。独立配置空间第一轮修复后简短发布通过，但脚本把 tab 写成 button；第二轮脚本未解析千分位金额；第三轮完整纠错、新会话解释和重算、旧报告影响以及 Python 单位词发布通过。即时偏好在成功回合和漏记回合均保留；最终普通自然表达记录及跨会话使用通过。全部测试页面关闭后，真实原生笔记合并 completed，thread/memory/read 实际返回非空摘要，随后 nativeControl=waiting_native_cooldown；v2ConsolidatedThreads=0，不能冒充已执行一小时历史提取。
- 固定公开样例仍为 tapsey/AdventureWorksMYSQL@b287f5995a967bf2751b7249878759eb4bbd53fc，独立 MySQL 8.4、只读账号；测试连接、会话、结果、容器和配置空间只清理自有资源。

不保证自动识别所有语义错误／偏好；不证明任意 SQL／Python 公式口径正确；源级冲突目前保守阻止整个源。纯定性历史报告没有完整数值发布凭据时标为未跟踪，不假称能定位全部受影响结论。旧报告不自动无限重跑。没有生产多租户、大库性能、长期运行费用或模型端到端延迟保证。国际出口测试与手机按用户要求不做。该旧批次实测的是即时笔记及离线原生合并，当时未实测一小时历史提取；本次自然闲置的 stage1 独立证据见上方，不混用两个批次。重要的“仅一句确认”漏记仍是已知未保证消除项。

证据索引：[交付验收](test-results/report-memory-delivery-2026-10-29/summary.json)，[真实闭环](test-results/report-learning-isolated-round3-2026-10-28/)，[实际离线完成](test-results/report-learning-native-completion-2026-10-29/)。所有较大的原始 JSON 压缩保留，compressed-records.json 记录原文哈希；失败未删除。复现脚本为 web/tests/run_isolated_learning_audit.mjs，需显式 CODEX_CONFIRM_LIVE_MODEL_TEST=1；通过原生 process/spawn 正常继承现有服务环境启动隔离测试服务，不读取、打印或写入凭据。

旧批次日常实例加载快照：PID 3162632／8765 当时保持运行，后端已加载 native-memory-scheduler-v7，状态 completed，当时原生任务未运行；维护会话已移除的状态字段存在。只记录版本和任务元数据，不导出用户记忆或对话。该批次独立 8797 UI 服务与调度已停止，日常服务当时未重启；这不是本次持久 Unix WebSocket 服务的加载状态记录。
