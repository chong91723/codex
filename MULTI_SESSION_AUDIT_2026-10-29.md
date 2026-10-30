# 同一用户多会话与单 root 执行审计

## 最终范围与本轮状态

同一用户一次最多 **1 个 root 会话执行任务**；历史、草稿和已加载闲置会话数量不限。等待审批／用户输入、停止清理、浏览器断开后原生状态待核实时仍占 slot；不能只看当前页面是否在线或 turn 文本是否停止。原生 child agent 归所属 root，继续由原生派发、等待和回收。临时上下文隔离，显式保存的长期偏好与已确认、当前有效的业务知识共享；新分析 generate_memories=false，不自动抽取临时分析；未暂停时原生读取／dedicated tools 启用，显式偏好由 memories.add_ad_hoc_note 保存。旧摘要保留，旧历史及已保存 notes 仍按原生条件整理；本轮不做完整多租户。

本文件的定向脚本和验收清单是**验收要求**，A、B 已串行完成，实际覆盖、首次失败和未覆盖项见下方；不因代码或文档完成而扩大通过范围。末尾保留的既有审计数据属于旧轮快照；旧双 root 同时运行的证据不符合新规则，不能借用作本轮成功。原生能力优先，不修改 upstream/native，不恢复非图片上传，不写业务数据库。

本次证据根目录为[test-results/single-execution-2026-10-29](test-results/single-execution-2026-10-29/)，[manifest](test-results/single-execution-2026-10-29/manifest.json)记录文件哈希；下方 `serial-a/`、`serial-b/` 等简写均相对于此归档。原始收据内的临时环境路径不改写。

## 当前原生接入与已发现的适配问题

当前 Web 服务持有原生 app-server，经本地 Unix WebSocket 接入；独立后台观察连接收取原生状态，每个网页使用各自的原生连接。网页刷新、关闭或浏览器退出不会杀死服务持有的原生进程。审批继续按原生连接处理，不向所有页面广播或假定重连后审批已迁移；任务和审批不能自动重发或自动获准。原生请求回执未知、后台观察失败及清理未确认均保留 slot，并显示实际诊断。

`thread/start`／`thread/resume` 通过原生协议建立连接订阅；`thread/read` 只是快照。A 占用时，其他历史只读 read／分页并保留可编辑草稿，不调用可能恢复历史目标／队列的 resume；获得执行资格后再实际恢复。不能以观察到全局 thread/started 就假定所有网页已经订阅。

A 已复现：原生 child 关闭卸载后，后台终端列表接口不再适用，旧适配将其误作清理失败并保留占用。独立修复加载后，第二个真实 child 执行结束，产生 closedThreadHistory 清理证明并最终 idle；首次失败与真实回归均保留。旧证明中的 `closure.kind=closeAgent` 只表示关闭尝试结束，不是关闭 API 成功 ACK；安全核对仍要求 fresh notLoaded、完整历史命令均已退出、已观察命令无遗漏及 closure／hold／root revision 未变化。服务重启清除旧 hold 不算该问题回归通过。当前服务实现与下方旧 stdio 生命周期证据分开阅读。

原生 resume 自动恢复历史 goal／queue 的准入窗口、直连 process/spawn 等未归属执行绕过均已应用适配修复；最终后端 418 项：414 通过、4 条件跳过，B 的原始 process/spawn 请求真实拒绝，正常 thread 命令仍可执行。历史 goal／queue 自动恢复竞争未单独真实触发，不能以普通冷恢复替代；简明问题表见 REPORT_MEMORY_LOOP.md 的 CW-097～CW-107，前版 131／402 项记录仍保留。

## 记忆的分阶段证据

- 显式长期偏好：实际 `memories.add_ad_hoc_note` 保存成功后即可由原生工具读取，不必等待一小时；是否发生真实调用及是否跨新会话可读，仍须单列收据，口头承诺不作数。
- 旧 seed 的自然历史提取：`2026-10-29T11:00:19.524Z` 完成的 seed 自然闲置满一小时，原生 memory_stage1 于 `12:00:34`～`12:00:40 UTC` 完成，生成 1070 字逐会话摘要。证据为 `test-results/single-execution-2026-10-29/natural-memory-receipt.json`，包含原始更新时间、job、摘要 SHA256，未改时间戳／租约。该记录不证明新分析 generate_memories=false 的历史会被自动提取。
- 同一 seed 的全局 consolidation：仍受原生六小时冷却约束，**未验证完成**；不以逐会话提取、显式 notes 保存或旧批次合并成功代替。本次 A 原生保存偏好、B 新会话 search／read 有实际收据，另见下面覆盖表。
- 一次后续检查已安装：北京时间 `2026-10-30 03:45:11` 首检，之后最多只读观察一小时，不需浏览器；[安装收据](test-results/single-execution-2026-10-29/scheduled/launch-receipt.json)为 scheduled=true／notYetTested，未来结果写入运行状态目录 `/root/Codex/.local-state/global-memory-2026-10-30/once/result.json`。当前只证明已安排，不是全局合并成功；不承诺自动通知或系统重启后恢复，全部历史／notes／结果保留。

## 两位真实产品 tester 串行安排

1. 根 Agent 准备独立配置空间、工作目录和只读 fixture，明确服务地址与可操作资源；不打印凭据、不操作日常实例。模型只用 deepseek-flash。测试者是操作产品的两个 subagent，不是产品内部的 native children。
2. 只向 A 发开始信号。A 先按下方脚本定向操作，再自由探索最多 300 秒。自由窗口从第一项自由操作前记录 UTC startedAt/deadline；加载准备与定向测试另计。
3. A 到截止不再新发任务；只允许查看状态、停止和清理自有未完任务，报告不能把“窗口结束”写成“任务完成”。确认 slot 已空闲、原生命令／child 已回收后，记录 A finishedAt 与清理证据。
4. **只有 A 已结束且根 Agent 明确发出 GO-B，B 才能打开产品进行操作。** B 定向复用 A 留下的共享知识／偏好，再做独立纠错与第二 root 拒绝测试，之后自由探索最多 300 秒，使用同样的截止与清理规则。
5. 两者不同时自由探索、查询或互相操控页面。需要双页陈旧编辑／执行占用时，由当前 tester 独自操作自己的两个标签页，第二页的执行应被拒绝；不是安排两个 tester 同时跑任务。
6. 根 Agent 只定位机制缺陷并回归；不重算业务答案判定谁“正确”。有真实业务争议，由测试者扮演用户在产品知识页面查看原文、来源、版本后明确采用／拒绝并留理由；审计只核对审批归属、版本传播和反馈。

串行时间表均按真实回执填写；两人自由探索均在各自 300 秒内：

| tester | 定向开始／结束 UTC | 自由 startedAt／deadline／实际最后操作 | 原生清理／slot 空闲证据 | 根 Agent 接力信号 | 状态 |
|---|---|---|---|---|---|
| A | `12:09:26.604`～`12:49:13.137`；机制修复暂停 `12:22:30.380`～`12:37:41.269` | startedAt `12:49:13.159`，deadline `12:54:13.159`，最后操作 `12:50:56.079`，结束 `12:50:56.086`；102.927 秒 | `12:51:35.123` 最终核对并关闭浏览器；execution idle，activeTurns／pending children／cleanupHolds／backgroundCommands／pendingNativeAcks 为空；见 `test-results/single-execution-2026-10-29/serial-a/A-final-cleanup-status.json` | GO-A `12:08:29.788 UTC` | 已完成；未覆盖项不算通过 |
| B | `13:09:47.603`～`13:39:50.482`，晚于 A 最终结束 | startedAt `13:39:50.482`，deadline `13:44:50.482`，最后操作 `13:43:47.480`，结束 `13:43:47.543`；237.061 秒 | `13:48:22.227` 原生 idle、无自有等待进程；`13:48:22.564` 所有浏览器关闭；见 `test-results/single-execution-2026-10-29/serial-b/final-native-idle-resources.json`、`final-browser-closed.json` | GO-B 收到 `13:09:47.603 UTC` | 已完成；未覆盖项不算通过 |

## 可照做的定向脚本

每一步记录 threadId／turnId、UTC 时间、实际操作、原生事件或接口返回、截图／导出路径。成功、明确拒绝、模型未选工具、环境失败、未覆盖分别写；不要将预期表直接改成通过。

### Tester A：建立准备、计划与报告链路

| ID | 按顺序的操作与可复制提示词 | 待检查的机制与证据 |
|---|---|---|
| A-01 | 在指定 fixture 数据源卡测试连接，用户主动点击“一键探索”；查看实际结构与分页，填写仅适用于测试的业务补充并明确采用 | 真实连接与探索 job 状态、snapshot/sourceVersion/knowledge revision；观察与推断分开，未确认候选不能生效；失败不凭空补结果 |
| A-02 | 新建会话：“请先按计划模式提出针对这个只读样例数据源的分析方案，列出需要澄清的范围；我确认前不要执行分析查询。”澄清后修订：“修改刚才方案的范围和分工，以当前文本为准，等我确认。”再由用户实际确认 | 原生 Plan、用户输入与最终方案；确认前后分别记录；规划的只读调查不冒充正式执行；原生回合尚未结束的真实审批／输入等待不能释放 slot；已完成方案等待用户点击确认属于闲置，确认时重新准入 |
| A-03 | 实际确认后执行合理多步骤查询，必要时 Python；如任务适合分工：“使用原生子 agent 做两个独立检查，归当前 root；若写临时产物，各自使用不同目录／文件名，由主任务汇总。” | 原生 spawn/send/wait/close 与真实 child ancestry；不把 tester B 当 native child；root、child 消息与审批正确归属；输出文件所有权不重叠 |
| A-04 | 根任务活动／等待原生审批时，自己打开第二标签页的新草稿，尝试发送：“新任务：请开始另一项只读分析。”同时试普通发送、方案确认或可见的其他执行入口，并只读另一会话历史 | 第二 root 明确拒绝且草稿保留；原 root 可继续，两个页面状态一致；服务端亦拒绝，不能只靠按钮置灰；`thread/start` 创建闲置会话不计为第二次执行，查看其他历史只使用 read／分页、不发 resume |
| A-05 | 执行期间在当前 tester 的管理页修改已记录依赖：优先已授权 fixture 的知识版本／时效或连接配置；抓取真实查询开始、修改提交、查询结束时间 | 实际修改若发生在查询窗内，应走查询后的版本检查；若未赶上，写“查询中修改未覆盖”，不能把查询后修改包装成 in-flight 通过。另在查询完成后、派生／发布前修改依赖，验证拒绝旧版本并要求重读／重查；不写业务表 |
| A-06 | 对服务器允许目录内的已有临时分析文件，若本次任务实际使用 import_data_file，受控修改其内容，再尝试派生／发布；不得浏览器上传文档 | 稳定读取、文件 hash/签名传播，前后检查失败留原文；新增版本使用新 document/result ID；不将知识 CAS 当作文件写冲突证明。无真实文件任务时记未覆盖 |
| A-07 | 完成一份含实际查询结果、计算及 ECharts 的报告，导出 CSV／PNG、Markdown／HTML／依据 JSON；打开导出 HTML 检查静态图与来源记录 | 实际文件存在、可读取、与当前报告／结果 ID 对应；字段引用和 hash 机制而非整篇语义保证；不以 Agent 口头声称导出成功代替文件 |
| A-08 | 在单独 thread 写一个随机临时标记和临时限制，明确“仅当前会话，不要长期保存”；另明确要求：“请用原生记忆工具长期保留这个偏好：报告先说明数据读取时间与限制，用中文；不要保存本轮临时标记或业务结果。”完成后进入其他新草稿 | 临时标记只留本 thread，长期偏好有真正 memories.add_ad_hoc_note 调用／返回；新分析 generate_memories=false，未暂停时 features/use/dedicated_tools 启用，不能用旧管理桥接回执替代本项原生调用验收；不要将临时标记写进给 B 的操作说明。归档／恢复／历史读取不自动执行，也不限制历史总数 |
| A-09 | 定向结束后核对任务资源回收，保留供 B 读取的已确认知识／显式偏好；再进行独立最多 300 秒自由探索，截止后完成最终自有清理并交付记录 | 不清空共享结果或 B 将复用的资料；A 最终清理完毕才可 GO-B |

### Tester B：独立上下文、纠错、时效与生命周期

| ID | 按顺序的操作与可复制提示词 | 待检查的机制与证据 |
|---|---|---|
| B-01 | 收到 GO-B 后新建 thread：“请读取当前已确认的源知识，以及已显式保存的报告偏好；若当前会话没有临时条件就说明不知道，不要推测其他会话的内容。” | 实际读到共享的当前知识与长期偏好；A 的临时标记、草稿、步骤和审批不串入。新会话不能只靠模型声称“记得”作为检索成功 |
| B-02 | 独自在两标签页打开同一知识版本；第一标签页保存纠错候选，第二页用旧版本保存。再查看原文／候选／冲突，由用户在知识页面明确采用、拒绝或保留争议并留理由 | 旧版本写被拒绝且留草稿；候选不自动获准；用户决定与历史原文保留。tester 自行作界面选择，根 Agent 不裁定业务答案；有未决冲突时后续查询应按机制拒绝 |
| B-03 | 在消解测试争议后新分析：“说明刚才定义为何变化，引用纠错历史，并按当前已确认定义重新读取和分析。”同时查看 A 的旧报告 | read_knowledge_history／当前 context 实际调用、版本沿派生结果传播；旧报告保留并可显示 affected，不静默重写；重新执行使用新收据而非改旧结果 |
| B-04 | 设置 fixture 的 maxAgeMinutes=0 或可控短时效，取得结果后结束当前回合，在新回合尝试复用；再按当前规则真实重查；用双标签页保存旧 freshnessRevision | 旧 acquisition 不因 Python 派生而刷新；跨回合复用受时效校验，旧报告仍可历史查看；陈旧时效写返回冲突并保留输入，不用等待真实生产数据来造过期 |
| B-05 | 建立原生计划／澄清或工具审批等待；第二标签页反复尝试开启另一个 root，随后拒绝一次审批并观察原任务；在当前 root 测真实停止 | 等待审批仍占 slot，拒绝按原生决定处理；停止请求到原生终态及命令／child 回收之间仍拒绝第二 root，不能点击停止即释放；只有清理确认后可新执行 |
| B-06 | 如需命令清理场景，在独立临时目录请求受限原生等待命令／child（不得读凭据／业务数据），启动后停止；记录命令／child 最终状态 | turn 文本结束不等同于命令结束；槽位由真实清理决定；一个 root 可合法持有 native children，不误杀其他维护进程 |
| B-07 | 当前 root 活动时断开自己的测试页／WS；另一标签页尝试新 root，再重新接回原 thread | 网页断开不终止服务持有的原生进程，后台观察继续；断开不释放 slot、不创建重复 turn、不重发原输入；审批仍按原生连接处理。依据实际原生状态继续或显示错误；状态未知时应拒绝新 root，终态与清理确认后能释放，无永久假忙 |
| B-08 | 清理后再执行一个简短新任务并导出报告；查看／新建多个历史与草稿，确认只有执行限制 | 先后执行而非同时执行；历史／草稿总数不因 1 slot 被限制；报告仍关联正确 thread／turn／resultId |
| B-09 | 进行独立最多 300 秒自由探索，截止停止新操作；核验全部自有运行任务回收并交付记录 | 记录真实窗口与最后操作；无截断后续“补测”混入五分钟通过；未做项目写明未覆盖 |

## 验收清单与可复制记录

以下是两位 tester 的联合验收要求；已按下方实际覆盖勾选，未覆盖的组合项继续留空：

- [x] A 结束、原生资源回收且 slot 空闲后才发 GO-B；两位自由窗口各不超过 300 秒。证据：`serial-a/summary.json` 与 `serial-b/summary.json`。
- [ ] 普通发送、计划确认、恢复后执行、可见的 review／queue 等 root 执行入口遵守同一用户 slot；原 root 的继续／steer、子 agent 不误判成新 root。
- [x] 实测的审批等待、停止清理、刷新／全页面关闭期间维持占用；第二 root 拒绝并留稿，清理完成后可恢复执行。证据：`serial-b/B05-second-root-server-rejection.json`、`B06-stop-cleanup-admission.json`、`B07-full-close-reconnect-final-stop-cleanup.json`。
- [ ] 临时上下文隔离；新分析 generate_memories=false；未暂停时 features.memories/use_memories/dedicated_tools 启用；显式偏好经原生 add_ad_hoc_note 收据保存、确认知识共享，临时上下文和业务结果不进 notes。既有摘要未删除，旧历史／已存 notes 按原生条件维护，不伪造新历史抽取成功。
- [ ] 探索、知识纠错／用户冲突决定、查询中依赖修改、时效及旧报告 affected 分别有实际证据；赶不上执行窗的项目如实未覆盖。
- [x] 原生 Plan／child／stop 与消息、审批归属有真实事件；child 输出路径和文件所有权独立。A children／Plan 见 `serial-a/observations.md`，B 审批与 Stop 见 `serial-b/cases.json`；不扩大为 B 已测 child Stop。
- [x] 报告 CSV／PNG／Markdown／HTML／JSON 实际导出可读，引用 ID 与版本对应。证据：A observations 与 `serial-b/B08-exports-manifest.json`、`B08-local-artifact-verification.json`。
- [x] 未改 upstream/native、未写业务库、未恢复非图片上传、未以 Web 锁伪装任意 shell 防覆盖。证据：`upstream-integrity-current.log`、A／B 原始记录；不是多租户或通用文件锁认证。

每项记录模板（先保留 pending，执行后按观察填写）：

```json
{
  "caseId": "A-01",
  "tester": "A",
  "status": "pending",
  "startedAtUtc": null,
  "finishedAtUtc": null,
  "rootThreadId": null,
  "turnId": null,
  "childThreadIds": [],
  "slotBefore": null,
  "slotAfter": null,
  "versionsBeforeAfter": {},
  "actualObservation": "",
  "evidencePaths": [],
  "limitations": []
}
```

只有证据充分才将 status 记为 observed-pass；明确拒绝若符合预期可通过其机制，但不能当查询或文件写入成功。测试环境失败记 environment-failed，模型未执行记 model-not-executed，未覆盖记 not-covered。不要用模拟 handleEvent、静态图或已有单测冒充新的真实模型链路。

## 本次 A／B 串行结果（两位已完成）

| 对象 | 状态 | 待补的实测结果与证据 |
|---|---|---|
| Tester A | 已完成，按实际覆盖计入 | [A 汇总](test-results/single-execution-2026-10-29/serial-a/summary.json)、[观察记录](test-results/single-execution-2026-10-29/serial-a/observations.md)、[最终清理状态](test-results/single-execution-2026-10-29/serial-a/A-final-cleanup-status.json) |
| Tester B | 已完成，按逐项覆盖计入 | [B 汇总](test-results/single-execution-2026-10-29/serial-b/summary.json)、[逐项记录](test-results/single-execution-2026-10-29/serial-b/cases.json)、[最终资源](test-results/single-execution-2026-10-29/serial-b/final-native-idle-resources.json)、[浏览器全关](test-results/single-execution-2026-10-29/serial-b/final-browser-closed.json) |
| closed child 清理适配修复 | 第二个真实 child 回归通过 | closedThreadHistory proof 含 54 个已观察命令 ID、closure 与 revision，最终 execution idle；首次失败 `serial-a/A-cleanupFailed-public-snapshot.json` 保留。旧 closeAgent 名称不是成功 ACK |
| 原生 resume 自动工作／直连执行门禁 | 修复已应用；最终后端回归通过 | B 实际 process/spawn 明确拒绝，正常 thread 命令实测；历史 goal／queue 自动恢复竞争未单独真实触发，不以普通恢复代替 |

### A 的实际覆盖与剩余项

| 项目 | 观察结果与当前判定 | 证据边界 |
|---|---|---|
| 探索与业务补充 | 真实连接、一键探索完成，70 对象／479 字段；业务补充 savedByUser，结构分页可读 | 见 A observations；不是所有引擎／大库性能验收 |
| Plan 与确认 | 两轮原生 request_user_input，修订方案、UI 确认最终正文后 default 执行 | 已结束方案待点击不占 slot，确认后重新准入；不等于逐 SQL 审批 |
| 原生 children | root 真实派发两个 Flash child，独立 schema/check 目录，主任务独占 final；spawn／wait／完成／关闭尝试与 ancestry 有原生记录 | 第二 child 清理真实回归通过；没有让外部 tester 代替产品 native child |
| 查询、计算、发布与导出 | query→Python→两张 ECharts→publish_answer；最终 verification=verified、scope=referenced-fields，7 结果／2 图。CSV、2 PNG、Markdown／HTML／依据 JSON 实际下载，离线 HTML 两张静态图与来源可读 | 未完成发布时的 rejected 导出另保留；字段依据不认证全文解释或业务真理 |
| 第二标签页准入 | blocking 用户输入期间显示唯一 root 占用，禁发且保留草稿 | 仅 A 的 UI 项；A 未构造绕过 UI 的第二 turn/start，服务端完整入口矩阵未由 A 覆盖 |
| 依赖变更 | 查询后业务补充 rev1→2；`12:38:32.520 UTC` 旧 run_python 明确拒绝；模型重读 context／重查后用 rev2 发布 | 查询执行窗内修改未赶上，记 not-covered；不能用查询后变更冒充 in-flight |
| 全页面关闭时查询 | query_database 于 `12:18:39.108 UTC` 开始；`12:18:39.591` 两页全关；`12:18:48.744112` 查询结果读取；`12:18:50.962` 重开，`12:19:31.340` 恢复原 thread | 离线查询完成、原 turn 未重发，结果表／CSV可用；不同于此前仅原生命令的定向生命周期实验 |
| 显式偏好 | 原生 memories.add_ad_hoc_note 成功后 read 实际读回；note 不含本 thread 临时内容；新 thread generate_memories=false，features／use／dedicated_tools 启用 | 以原生 rollout 调用收据核对，非 Web 工具计数或模型自述；B 后续实际 search／read 共享偏好，临时未知回答与盲测限制另见 B 表 |
| 文件依赖与全局合并 | child 实际 import_data_file，但未受控改文件触发 hash 拒绝；未完成后台全局合并 | 均 not-covered，不以知识 CAS／显式 note／自然 seed stage1 代替 |
| 自由窗口与清理 | 102.927 秒，截止前停止新操作；最终浏览器关闭且原生执行与待回收列表为空 | A 已完成；根 Agent 核对并发 GO-B 后 B 才可开始 |

首个 child 的 cleanupFailed 发生后，仅点击一次原生回收重试；暂停等待修复期间无产品操作。第二 child 的新真实执行及历史证明才用于复跑通过。历史记录 `closure.kind=closeAgent` 表示关闭尝试结束，实际安全依据是当前 notLoaded、完整已退出命令历史以及 revision 核对；不能从 item/completed 推断关闭 API 调用成功。

### B 的实际覆盖与测试限制

| 项目 | 观察结果与当前判定 | 证据与范围 |
|---|---|---|
| 共享偏好与临时条件 | 新 B thread 实际读当前知识 rev2，原生 memories.search／read 找到 A 的显式报告偏好，临时条件回答不知道 | `serial-b/B01-native-memory-receipts.json`；首次只生成准备文案、组合关键词零命中不算成功，后续拆词搜索／实际读取才用于通过。控制器曾意外显示同用户历史预览，未将临时内容加入 B 模型提示词；盲测独立性有限，不认定上下文泄漏 |
| 纠错与版本冲突 | 提议进入 pendingUserReview，用户在数据源页采信并留理由；陈旧第二页保存 **HTTP 400**，提示冲突并保留草稿，新查询引用 rev3 | `B02-user-adopt-and-stale-draft.json`、`B02-stale-save-settled.json`、`management-http-failures.json`。本次不是 HTTP 409；错误响应正文未单独捕获，不伪造 |
| 变更解释与旧报告 | 新分析实际 read_knowledge_history／当前 context，真实查询、ECharts 和发布；旧 A 报告原文保留并提示依赖需复核 | `B03-current-definition-query-chart-receipts.json`、`B03-old-report-affected-current-query.json`；不重算或裁决业务答案 |
| 源时效 | maxAgeMinutes=0 生效，跨轮旧 result 的 run_python 真实拒绝，明确读取／派生不能延长获取时间；重新查库后新 acquisition 与发布成功 | `B04-cross-turn-refusal-and-real-requery.json`；陈旧时效保存同样 HTTP 400／冲突提示／留稿。首次等待错误位于 toast 而非 dialog，失败保留 |
| 真实审批拒绝 | id0 `13:18:12.887 UTC` decline；原候选写工具于 `13:18:13.058` failed、result=null、user rejected MCP tool call、durationMs=0，原受控操作未执行 | `B05-native-denial-tool-receipts.json`；后续 accept 的 id1 是另一调用，不能混作原操作已执行；不是文件写入测试，不声称目标文件不存在 |
| 错误 Stop／第二 root／直连执行 | 原生未知 thread／错误 turn Stop 真实报错，owner／active turn／blocked roots／cleanup holds 不变；正确格式第二 turn/start 为 executionBusy；process/spawn 明确后端拒绝 | `B05-approval-slot-exception-rpc.json`、`B05-second-root-server-rejection.json`；最初脱敏配置重放／缺 threadId 的请求错误不能作准入通过证据 |
| Stop 与清理 | 真实等待命令开始后点击 Stop，cleaningUp 期间第二 root 仍拒绝；interrupted、命令退出／进程不存在且 idle 后，另一 root 才成功执行 | `B06-stop-cleanup-admission.json`、`B08-new-root-after-stop-cleanup.json`；首次 90 秒命令在 Stop 前自然结束属于未覆盖，后续 300 秒重试才用于通过。B 未创建 child，不算 B child Stop 测试 |
| 刷新／全页面关闭恢复 | 同一 thread／turn／PID 在刷新、实测零页面和重连后继续，原始提交仅一次；另一 root 拒绝且留稿，恢复后 Stop 回收 | `B07-refresh-no-duplicate-cleanup.json`、`B07-actual-zero-pages.json`、`B07-full-close-reconnect-no-duplicate.json`；新 socket 未观察 command-completed，使用 interrupted／清理 idle／进程不存在证据，不补造事件 |
| 受控 CSV 哈希 | 原生工具在自有允许目录创建并导入 CSV，修改后旧 documentId run_python 拒绝；重新导入新 ID／hash 后计算成功 | `B-filehash-native-import-mutate-reject-reimport-receipts.json`；未恢复浏览器文件上传。专项最终文案未 publish_answer，未核验警示保留，不冒充正式报告发布；不等于 SQL in-flight 修改 |
| 导出与历史数量 | 实际 CSV／PNG／Markdown／HTML／依据 JSON 文件可读；离线 HTML 两张完整图片加载；清理后新 root 成功，多条历史／闲置线程没有 3 会话总量上限 | `B08-exports-manifest.json`、`B08-local-artifact-verification.json`、`B08-export-html-readable.json`；不是 SVG 计数。最初将 CSV anchor 当 button 造成控制器退出，失败保留，后续恢复历史未重发后导出成功 |
| 自由探索 | 237.061 秒、截止前结束；已完成 Plan 等待确认时 idle，另一 root 可执行，方案未自动执行；1024 宽度无横溢出，记忆仅查看、最终未暂停 | `B09-completed-native-Plan-idle.json`、`B09-free-independent-root-history-layout.json`、`B09-memory-management-unpaused-final.json`；不声称完整响应式／无障碍审计或故意越界操作已测 |

两位均未覆盖真正 SQL 查询执行窗内修改。B 还未独立覆盖 request_user_input 等待、native child Stop、自由截止后的故意拒绝；早期模型未执行、选择器／控制器失败和盲测局限保留在 `serial-b/cases.json`／`test-side-controller-failures.json`，不通过删除失败制造全部通过。

本次工程分层：最终后端 **418 项（414 通过、4 条件跳过）**，19 个 JS 行为文件 **308 项通过**，语法 **221 份（94 Python AST＋127 JS／MJS）**；CodeGraph 当前同步，上游原样。原生专项 **131 项**、后端 **402 项／398 通过4跳过**仍是前版历史。证据：[最终后端](test-results/single-execution-2026-10-29/repository-backend-final-current.log)、[JS 汇总](test-results/single-execution-2026-10-29/js-verified-results.json)、[语法](test-results/single-execution-2026-10-29/syntax-current.json)、[CodeGraph](test-results/single-execution-2026-10-29/codegraph-sync-current.log)、[上游完整性](test-results/single-execution-2026-10-29/upstream-integrity-current.log)；纯 JS／CSS 无单独打包构建／TypeScript 步骤。本次文档更新没有重跑产品、模型或工程测试。

日常 8765 服务已按授权内存继承原位重启，旧 Web PID 4137200→162874；[1440 桌面只读检查](test-results/single-execution-2026-10-29/daily-readonly/receipt.json)确认 web-service／native-unix-websocket、无横溢出／页面错误、无 turn/start，不冒充新的业务模型流程。独立验收服务和一次记忆检查继续保留历史、notes、结果，不依赖浏览器控制器。

本表不改写下方旧轮通过记录；实际用户流程、工程测试、自然 stage1 和尚未完成的全局合并分别记录，不宣称所有组合或生产并发可靠性。

## 文件冲突与资源解释

单 root 规则去除了两个独立 root 正常同时写的路径，未解决 native children／未回收命令／管理编辑／外部 CLI 的所有文件竞争。继续复用既有 dependency hash、知识／设置／记忆的版本 CAS、不可变 resultId；root 给 children 分配独立文件所有权与路径，再引用汇总。原生 fs/writeFile 无 expectedSHA256，apply_patch 上下文检查不是整文件 CAS，任意 shell 不会天然取得 Web 文件锁。共享文件确需编辑时仅在受管理的窄提交端点比较版本；不得声称拦截全部写者，不自研通用文件系统编辑器或长期锁整个工作区。

`/tmp/codex-resource-20261029/report.md`、`results.json`、`summary.json` 是无 turn/start 的闲置 native 资源对照。3 线程／3 app-server 只用于比较，不是执行目标；PSS 分摊随共享映射变化，RSS 重复页，不能外推生产峰值。真实预算应另测 1 活动 root + 实际 native child／命令 + 查询／Python／Web 固定开销的同时间点峰值，不能将历史会话数乘单次运行内存。

## 旧轮证据阅读约定

以下内容从真实仓库原文保留。所有“通过”“已修复”“本轮”、数字、端口、时间和截图索引均指它们原来的旧测试批次，不代表本次单 root 串行测试已经执行。旧 stdio 页面进程生命周期和记忆专用工具未接入的限制已由上方当前机制取代；历史提取未等待也只指旧批次。保留既有失败与限制，不篡改为新的通过；实际临时环境、服务地址和 tester 时间表必须在上方重新记录。

## 旧轮证据快照：实际环境与原生边界

- 固定源码 `970111f6cb62cc02fe36a82ea7d71b37a2889c97`，显示版本 codex-cli 0.0.0；Web → stdio app-server。原生源码和构建文件未修改。
- 独立测试服务 44437、独立配置／工作目录；两位使用相同 sourceId `9f0e887b483dd2f73f189590`。MySQL 8.4 独立容器、只读 AdventureWorks，公开夹具固定 GitHub 提交与哈希；原始连接凭据不归档。
- 真实任务只使用 deepseek-flash。会话、Plan、工具、步骤、审批、停止和子代理都是原生执行；Web 展示、MCP 提供数据库和共享资料业务机制。本轮没有生产压力、多租户、手机或国际出口限制验收。
- 桌面布局只沿用已有参考，本轮按实际 1440 和 1024 宽度检查；不声称与未提供版本的客户端完全一致。

## 旧轮问题与处理

| 编号／类型／优先级 | 操作与实际表现 | 已确认根因与影响 | 修复与验收 | 当前状态 |
|---|---|---|---|---|
| MS-01 Bug／P1 数据源时效覆盖 | 两页均打开空规则；B 保存10分钟，A旧窗口保存20分钟，静默覆盖B | 旧接口更新无独立策略版本；共享源的缓存复用要求被过期页面改写 | Store 原子CAS＋独立 freshnessRevision；UI携带版本、冲突留稿、读取最新而不替换输入。真实双页40／50冲突→保留50→读最新40→明确保存50通过 | 已修复并实测 |
| MS-02 Bug／P1 当前记忆检索缺失 | 用户编辑的中文偏好在设置／上下文存在，Agent关键词搜索却为空 | 为排除已被编辑取代的追加历史，连当前编辑文档也未加入搜索；新会话难以按需找到偏好 | 增加只读虚拟项 user-memory:current，绑定当前revision／hash；旧编辑不冒充当前。真实Flash search→read、暂停拒绝、恢复revision3读取通过 | 已修复并实测 |
| MS-03 体验／P2 刷新中断不清楚 | 执行时刷新结束本页原生进程，重连只显示通用中断 | 当前WS独占原生进程，未提示离开影响；不能误称后台继续运行 | 真实活动时beforeunload；pagehide／WS断开按turn记录；恢复的中断卡保留原因与不自动重发说明。真实浏览器取消刷新→工具继续；确认刷新→中断，重新开历史仍显示理由、仅一次提交 | 已修复提示；生命周期边界保留 |
| MS-04 交互缺失／P2 原生子代理难读 | 真实两个Flash子任务已运行，但默认只有技术名和长JSON | 原生collab事件没有专用展示 | 对话内任务卡、真实模型、原生状态／返回；按需thread/read过程。最初回归发现已读过程与初始化摘要不同步，继续修复并加缓存事件优先级。完成与中断状态、父会话不变、过程保留、1024／1440通过 | 已修复并实测 |
| MS-05 体验／P2 MCP重载无即时反馈 | 点击重载后难判断请求是否开始或完成 | 旧按钮不显示pending／真实返回 | 禁用重复点击、显示执行中；原生reload成功后明确仅配置已重载、工具就绪看实际服务状态；错误继续保留 | 已修复并实测：真实请求／响应、执行中禁用及成功反馈 |
| MS-06 工程回归／P2 最新时效读取端点 | MS-01首次补丁的“读取最新规则”实际失败 | 修复中误用不存在的list端点；未以代码通过代替UI验收 | 改用现有GET数据源列表；保留第一次失败证据，完整冲突恢复重跑通过 | 已修复并实测 |
| MS-07 接入限制／P2 原生记忆专用工具 | 隔离Flash真实调用memories.search及返回记录存在，普通分析仍走管理MCP桥接 | 上游MemoryTool开关同时启动后台整理；浏览器原生进程寿命短，不能安全接管服务端整理租约。可编辑文档的CAS／暂停优先级也须保留 | 继续使用原生服务端提取／合并；桥接不自建摘要循环。后续将专用工具纳入持久原生进程生命周期后迁移，不能把已存在工具说成模型不支持 | 未完成接入，明确保留 |

以上机制验证不裁决任何测试者的业务答案。保留第一次失败和后续成功证据，修改后的共享模块也跑相邻行为回归。

## 旧轮实际协作与完整链路

| 场景 | 实际证据与结果 |
|---|---|
| 从数据源探索开始 | A点击一键探索，实际70对象479字段；B复用同一准备成果，未重复采集 |
| 同一业务补充陈旧修改 | 两位读revision0，B先存、A旧稿收到409且保留输入；读取最新后决定，不静默覆盖 |
| 业务知识纠错及对话外审批 | B提交纠正候选、待处理冲突、用户明确采信并留理由；历史原文保留，新分析读取采用版本 |
| 计划、澄清、修订和批准 | A通过 /plan 进入原生模式，收到3项澄清；修订排名规则和委派要求、最终确认后执行。步骤最终6／6；裸/plan仅切换有反馈 |
| 真正的分析子代理 | 主线程01a186f9…真实派发2个Flash子线程01a186fc…、01a186fd…；sendInput修正任务笔误、两次wait及close。不是把外部测试者当内部子代理 |
| 旧双 root 对照（现已被单 root 规则取代） | 旧轮两页不同线程曾实际同时运行；B刷新或停止自己任务时A继续。保留当时观察，不能将其当作本轮第二 root 应被拒绝的通过证据，也不再作为产品目标 |
| 查询之后依赖变化 | A实际查询24行后B业务补充revision3→4；旧run_python原文拒绝“结果所用的业务知识已变化…不能继续计算、绘图或发布”。Flash重读revision4、重查，最终publish_answer成功。没有root另算答案裁决 |
| 历史报告 | 共享资料变化后旧报告提示复核且原文保留；归档／恢复保持结果和获取时间 |
| 图表与报告 | 真实查询／Python／ECharts、同区数据／图表、CSV／PNG／Markdown／HTML／JSON下载；独立浏览器加载HTML，9张静态SVG全部正常 |
| 跨会话当前记忆 | 当前用户文档检索、分段read、暂停拒绝、恢复后读当前版本；不把即时保存当全局历史合并 |
| Skills与MCP | 沿原生入口查看4个保留技能、22个分析工具；本轮未重新执行全部技能、在线安装或任意外部MCP组合 |
| 文件编辑冲突 | 当前分析界面未开放共同编辑本地依赖文件入口；只允许图片上传。两位未写共享工作区文件，不把知识／时效CAS当作文件冲突测试。此项未验证 |

## 五分钟窗口与测试方法的实际限制

| 测试者 | 自由窗口（UTC） | 时长 | 最后一次实际操作 | 截止处理 |
|---|---|---|---|---|
| A | 09:40:39.916514—09:45:05 | 265.083486秒 | 09:44:49.615 | 09:45:08.596守卫拒绝后续点击；无超时产品操作 |
| B | 09:33:17.753398—09:37:55 | 277.246602秒 | 09:37:37.245 | 停止新操作；无运行任务 |

定向测试、修复后回归和报告整理另计。A自由阶段仍在调查的Plan任务随后在定向回归中明确停止，不因达到窗口就冒称执行完成。

测试者会犯操作错误：B曾在记忆编辑框异步加载完成前填写／保存，造成测试资料被替换，随后按既有原生记录通过UI恢复并保留历史。一次button选择器错误实际控件是tab；未列产品Bug。新浏览器两次导航超时与首次原生工具探针的网络沙箱错误均保留，不据超时认定产品故障。短子任务曾偏离分工去寻找工具入口，用户在原父任务中实际关闭；模型自述关闭不代替原生状态。

避免方式：等待实际加载和原生事件后操作；标记实际资产哈希与模型归属；协调的是操作时间而非答案；保留前后版本与失败证据；依赖由产品检查；不在另一任务运行中清理共享资源。自由探索由每次操作前的截止守卫限制，根Agent监督；不是先执行超时操作再删报告。

## 旧轮验证分层与剩余边界

- 后端全量282项：278通过、4项条件跳过。本轮没有将未启用的原生浏览器／原始WS检查算通过；真实Flash专项另列。
- 最终JavaScript行为263／263；Python AST86份、JS／MJS语法125份通过。纯JavaScript前端无构建／TypeScript检查步骤。
- 浏览器和真实模型流程由两位分别记录；构建／单测不替代真实任务，字段关联也不等于整篇论述或业务真理认证。
- 原生后台历史整理的一小时间隔和六小时合并冷却未在本轮重新等待；沿用机制，不伪造历史年龄。原生专用记忆search兼容性由独立实际函数调用记录证明，普通会话接入仍见MS-07。
- 本轮未新增业务标准口径场景；未覆盖任意数据引擎、线上服务重启、复杂审批拒绝全矩阵、长期运行、大库规模或生产并发可靠性。旧批次通过不自动升级成本轮通过。

证据集中在[test-results/multi-session-2026-10-29](test-results/multi-session-2026-10-29/)，含两位原始报告、协议、截图、导出和修复检查。连接密钥、profile、环境变量和临时私有文件不归档。日常8765服务未重启；刷新加载新UI，空闲时下一任务按v7合同重载托管MCP，不能仅凭静态页面声称已有进程全部更新。


MCP最终回归补充：10:20:49.355Z 发出原生 `config/mcpServer/reload`，10:20:54.766Z 返回真实空成功结果；按钮执行中禁用，随后提示配置已重载。证据 agent-b/reg-40-mcp-native-reload.jsonl、reg-40-mcp-reload-result.json 和截图。B在完成这些操作后，其编程subagent回合遇到模型容量错误，最终追加总结未完成；原始产品操作证据保留，未将编程模型容量错误登记为Web功能Bug或切换模型。
