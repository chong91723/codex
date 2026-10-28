# 能力与范围对照表

检查更新：2026-10-28（固定源码基线不变）。目标：桌面浏览器；允许 DeepSeek 官方 API 和国内公网，运行时不依赖国际公网。安装/编译/更新所需外网单独计算。手机端不在范围。


## 当前增量：用户确认的指标规则与系统推导证据（2026-10-28）

起始提交 `50b98bf366b382776c07ba278c61e3727d93d241`。用户现已要求增加数据推导关系证明和公式口径检查；下面的“暂缓”仅是前一批历史。本批是现有 Web／只读分析 MCP 的增量能力，不是锁定 Codex 源码自带的业务语义层，不修改原生代理循环、发行资源或 ChatGPT 账号边界。

| 能力／范围 | 入口与实际检查 | 依赖与边界 |
|---|---|---|
| 数据源绑定的指标口径／保留 | 数据源卡片“指标口径”：草稿、JSON导入／预览、用户确认、不可变新版本、停用及乐观并发检查；Agent只读列举规则 | 私有注册表 `metric_rules`，确认者姓名是操作者声明；尚无组织角色身份或双人审批。示例默认草稿 |
| 指标确定性执行／条件保留 | `execute_metric` 读取确认表／视图的原始字段，检查记录粒度、筛选、分组、类型、单位和参数；公式按依赖图执行 | 支持SQL数据源，实际集成验证限独立PostgreSQL；其他生产连接未据此认证。只支持单表／视图，视图内部字段关系不递归证明 |
| 精确中间值与公式一致性／条件保留 | 聚合与公式使用精确分数，中间结果不按展示精度截断；最终显式舍入，除零／空值按口径处理，拒绝原始浮点字段冒充精确小数 | 验证执行符合用户确认规则，不证明业务负责人选择的定义必然正确；日期仅明确DATE，表／列／别名使用ASCII标识 |
| 系统生成的数据推导证明／保留 | `metric_executions` 保存真实源快照、字段、行、各节点输入输出及规则版本；发布重读源与输出Parquet计算指纹，防止只比较两个元数据字段 | 证明绑定本次执行结果与确认定义，非Agent自述；不防已控制宿主机的管理员，源数据真实及视图内部逻辑仍由数据治理负责 |
| 发布与历史证据／保留 | 新发布复查当前规则、来源版本与时效，最终提交和规则修改通过注册表事务排序；对话按指标引用展示口径、参数、单位和节点，完整JSON与Markdown均可下载 | 停用或新草稿阻止旧规则新执行／新发布；历史保留发布时证据，不能误解为仍获当前规则认可。任意正文语义不整体背书 |
| Agent方案与Skills配套／保留原机制 | Agent建议任务步骤、选择规则与参数，系统负责执行和记录；Skills可记录分析流程并引用指标标识 | Skills和提示词不是口径权威存储，不自动批准规则。原生Plan／审批／中断保持原实现；本批没有真实Flash意图回归 |
| 自由SQL／Python及API／文件分析／保留 | 原有工具与数值发布链继续可用，不因缺少确认口径删除功能 | 仅执行记录匹配；不能借输入的治理证明把任意派生结果升级为已按口径检查。任意Python自动血缘推导未实现 |

本批独立PG／MCP／浏览器最终9/9、0模型请求、0页面错误；后端最终25/25，单独UI夹具9/9，真实模型自主选择规则仍未重测。当前完整源扫描上限十万行、分组上限两千组，唯一键检查覆盖筛选前的完整输入；不能通过过滤隐藏重复粒度。无新增模型校验回合，但扫描、物理指纹和本地计算有成本，大表需已有合适视图，不能以小型示例的毫秒数承诺生产等待。职责与存储建议见[README](README.md#指标口径与数据推导证明2026-10-28)，真实测试及未验证项见[验收报告](TEST_REPORT.md)。严格国际出口、手机端不测试，多租户隔离仍未实现。

## 前一批次（历史）：数据时效与核验范围（2026-10-28）

数据源卡片新增“数据时效”配置弹窗，按连接ID独立保存复用时长；留空未设置、零仅当前任务、正整数分钟从实际查询起计。Python／快照SQL继承原来源时间，多来源逐项检查；Agent遇过期来源需重新查询，已有结果、CSV和历史不删除。没有自设全局期限，也没有把重新计算视为刷新数据。配置后只更改本连接的时效策略，不改变连接版本或要求重新验证；新版MCP按请求读当前策略。API／文件尚无独立可配置来源注册项，获取时间保留并显示未设置，不能据此认证最新。

新发布记录的`publicationChecks.version=analysis-publication-v2`表示实际执行了当前检查，时间与规则保留在数值依据和下载报告；旧记录明确未应用此检查。原有服务与占用MCP未强制重启，前端刷新与后台加载分开判断。中文已知漏检／误判、导出legacy警示已修复，并测量本地处理开销；本轮为实际PG／Python／MCP／浏览器加确定性回归，**零模型请求**，不能冒称重新验证Flash全部工作流。

按用户当时指示，本节所述批次将业务字段来源证明、公式口径／计算精度自动正确性证明暂缓；现已由上节受限指标路径补充。普通自由计算的来源状态仅说明与执行记录匹配。内部未输出中间值不逐一检查，自然语言数字识别不保证全语义完备；没有新增模型校验轮次。

## 本轮显示验证（2026-10-28）

现有8765服务已实际加载当前前端，指定Sakila回答的Python数值来源核验为verified，旧服务使用worker兼容入口。另修复该历史回答的GFM分隔行缺列：仅修正确定的显示／Markdown导出格式，不改消息正文或证据；新发布在存证前检查表头、分隔和数据列数。代码块、HTML清理及数值篡改拒绝保留。需刷新已打开网页，未重启服务或触发新的数据库／模型任务；后台新模块由新建／重载的MCP进程读取。实际范围见[验收报告](TEST_REPORT.md)。

## 当前增量：数值依据、通用数据与隔离计算

基线继续锁定开源源码 `970111f6cb62cc02fe36a82ea7d71b37a2889c97`，原生运行时标识 `codex-cli 0.0.0`，stdio app-server／公开实验协议；未更改核心、源码、二进制或代理循环。最新验证只用 `deepseek-flash`，不需要 ChatGPT 账号；桌面参照沿用用户截图，不新增未经核实的一致性结论。

| 能力／范围 | 开源依据与接入方式 | 依赖／前端表达／实际状态 |
|---|---|---|
| 原生对话、MCP、Plan、审批、中断／保留 | 锁定版本 MCP tools/call 的 `_meta.threadId` 与 `x-codex-turn-metadata.turn_id`；原生 thread/settings、turn/start、turn/interrupt、turn/plan/updated；Web 仅注册扩展、传输和呈现 | 使用 DeepSeek 官方 API；Skills／MCP 管理及 `/plan` 入口不变。新数值指引与计划执行的回归分开记录，见最新报告 |
| 只读数据库查询与完整快照／保留 | 现有本项目 MCP 网关＋锁定原生 MCP 入口；不是上游自带数据库业务工具 | 配置且验证通过的只读账号；SQL 数字可直接引用，不新增写入权限。独立 PostgreSQL 与真实 Flash 已验证；不泛化其他生产引擎 |
| 文件／API／纯 Python 计算／条件保留 | 本项目独立 MCP 配套，复用原生 MCP 协议和已有 bwrap；新增四工具，不冒称 Codex 自带 Python 业务 API | 固定 NumPy／pandas／Decimal，允许目录和 API origin，网络请求由受限 fetch_data 执行；隔离 Python 无网络、无宿主家目录和密钥。明细快照进入原结果卡，无额外入口。真实文件、独立 API 夹具和 Flash 已验证；实际行情来源仍待核实 |
| ECharts 唯一绘图／保留 | 现有 mcp-echarts@0.7.1 校验和本地 Apache ECharts；项目通用 resultId 可以来自 SQL／Python | 无 ChatGPT／图表云依赖。图表／数据同卡切换及 CSV／PNG 保留，非数据库结果不需要数据库连接；真实 Flash API／CSV 绘图已验证 |
| 数值来源发布与显示核验／条件保留 | 新 Web／MCP 配套，按当前原生 thread＋turn 和答案正文匹配模板字段、行、快照 SHA；不修改原生模型返回值 | 回答中的数字来自真实 SQL／Python 字段；未核验最终回答阻止结论下载，原文可诊断、无自动重发；历史显式标注。证明执行来源，不证明指标语义或原始数据真实性；自然语言数字识别有范围限制 |
| Matplotlib、其他绘图库与运行中安装包／排除 | 属于本项目已确认绘图路径的产品边界，不是上游无此能力 | 没有额外入口；分析指引及计算环境阻止直接绘图库导入。原生高级 shell 能力未被篡改，不能把提示词／导入检查宣称为生产租户的权限边界 |

数值规则也适用于方案中的实际数量，但格式术语（例如千位分隔符）不作为数据断言。未执行方案使用定性描述，避免生成未经证明的数量与日期。完整问题、实测与未验证项见 [问题清单](WEB_AUDIT.md) 和 [最新验收](TEST_REPORT.md)。

## 前批交付状态：数据分析工作台

Skills 和 MCP 保留当前主入口及用户配置、启停能力。主导航为新分析、技能、数据源、MCP 和设置；数据源主页面直接配置、测试、启停和移除连接，Agent 发现全部已配置、启用、可用且获授权的只读数据源。没有“本次数据源”选择状态。模型／思考强度／Agent 文件权限、目录、初始化、持续目标、原始文件及协议移入高级设置；当前没有管理员角色，折叠不构成权限隔离。

斜杠菜单只保留 `/plan`：手动进入计划模式，生成计划后由你确认执行。支持 bare 与带需求形式，选择只填入、发送才触发；计划状态和退出按钮可见，原显式开关隐藏。其余旧命令不执行并保留输入。压缩按原生配置自动触发。

锁定原生协议没有让模型在当前回合自主改变 collaborationMode 的入口。本批最小 Web 配套在 Default 的分析用途上下文中要求模型对复杂多阶段问题先提出严格整块 `<proposed_plan>`；只有本连接拥有、真实完成且成功的回合可在结束后调用公开 `thread/settings/update`，等待真实原生设置通知再确认进入 Plan，供后续讨论。Default 生成过程不标为 Plan，不新增模型回合或自研代理循环；历史重放、失败／中断不触发，等待期间阻止发送及模式竞争，失败保留方案并说明。方案仍须用户确认后执行。

不提供成果侧栏。成功query_database／analyze_result与create_chart按resultId合并为同一结果卡，在同一区域切换“图表／数据”，而非分别占区。ECharts渲染图表，数据表沿用服务端完整快照、20行分页和跳页；单页／零行隐藏分页，读取失败可重试。页码和用户当前视图保留，多图用同卡选择器，SQL折叠、完整CSV仅底部一处，图表视图另有PNG；read_result及重复引用不新建卡。完成回答操作区导出该条 Markdown 结论及同轮已加载结果 ID；未完成、失败、中断、commentary 和待确认方案不能导出为完成结论。只聚合成功 MCP 的合法 ID，跨回合隔离，旧导航下载会拒绝。没有新增 PDF／Word 引擎或逐句证据绑定；四个原生技能边界保持。

本次统一结果区增量验收：[浏览器14/14](test-results/unified-results-2026-10-27/browser/final/results.json)，独立只读PostgreSQL真实查询10／247／0行及本机mcp-echarts生成3张真实图，实际CSV／PNG下载；进行中回合恢复的已完成工具也保持同一卡；工具事件与刷新后历史为明确UI夹具，0模型请求，不称新的Flash意图／计划实测。1440／1024桌面、暗色文字对比度和主题切换后图例／缩放保留通过；15项统一卡、18项图表行为及相邻回归合计174/174，源码pristine、176方法及完整schema一致。测试资源已清理，8765服务未动。详见[本次验收](TEST_REPORT.md)。

前批能力证据：[最终浏览器](test-results/analysis-workspace-2026-10-27/browser/final-revision/results.json)13/13、0模型、0页面错误：真实原生设置和失败连接管理，与显式事件／传输夹具分开记录。事件夹具验证两条同轮隔离的 Markdown 下载及未完成／失败隐藏；自动方案决定使用夹具，后续原生 Plan 请求和确认是真实的，不代表 Flash 自主决策通过。确定性状态测试：计划与自动衔接70/70、设置19/19、对话产出31/31，分别报告，不相加当成业务成功。[调整前12项](test-results/analysis-workspace-2026-10-27/browser/final/results.json)仅为被替代中间界面及未改的技能／MCP生命周期证据。独立Flash＋只读PostgreSQL [手动计划完整链](test-results/analysis-workspace-2026-10-27/flash-plan/manual-chain/results.json)7/7与[自动决策修后完整链](test-results/analysis-workspace-2026-10-27/flash-plan/automatic-chain-after-policy/results.json)7/7分别通过，各4个普通回合，完成修改／批准／真实中断／修改继续／三问／图表及下载；[简单直接查询](test-results/analysis-workspace-2026-10-27/flash-plan/simple-direct/results.json)3/3以1回合Default直接返回2220.00，0方案／0Plan设置。[真实分页浏览器](test-results/analysis-workspace-2026-10-27/browser/inline-pagination/results.json)9/9使用真实247行及31行派生快照，0模型，UI进入点为明确MCP事件夹具。前期复杂问题直接申请SQL的失败保留，语义策略已修但不是权限强制保证；[全部真实模型尝试](test-results/analysis-workspace-2026-10-27/flash-plan/summary.json)共7轮18个普通turn/start（含失败，不是provider内部HTTP请求计数）；[相同业务问题修前／修后对照](test-results/analysis-workspace-2026-10-27/flash-plan/application-policy-fix.json)确认Default相同业务问题修后通过。[最终工程记录](test-results/analysis-workspace-2026-10-27/engineering/results.json)86份JS／MJS、36份Python AST及141/141行为通过，source pristine、176/176完整Schema一致；无前端打包／TS，未重跑完整Python后端套件。当前真实业务回归限独立PG与Flash，不泛化生产远端、其他引擎或所有意图分类；多租户未实现。详见[验收报告](TEST_REPORT.md)。

## 前一批次交付状态（历史）：两项菜单与独立计划开关

按用户2026-10-27的最新明确要求，输入框 `/` 只保留初始化 `/init` 和目标 `/goal`；聊天移到输入框下方“新建聊天”按钮，计划模式使用该处的显式开关。`/chat` 不再新建聊天，`/plan` 及带需求形式不再触发计划模式；压缩、分叉、导出、审查、回退、MCP、项目、模型、推理、状态、技能、设置及原生协议不再在斜杠菜单中显示或由该路径触发。手工输入旧命令应报明原因并保留草稿，不能静默变为普通模型任务。

原生自动压缩按既有配置继续运行，不改阈值或代理循环。其他页面、模型和权限控件、四个源码自带技能及原生协议仍保留；本批删除的是错误的快捷入口及其斜杠分发路径。本轮[真实浏览器](test-results/composer-scope-2026-10-27/browser/results.json)12/12，0模型任务及0页面错误，24条旧命令尝试均零能力调用并保留输入；初始化和目标只打开弹窗并取消。真实设置事件核对开关on/off、等待和拒绝重试，新聊天保留cwd且不关联项目；3个自有记录清理。受控传输状态35/35与工程相邻行为58/58分别记录，覆盖重叠不相加；JS/MJS78、Python AST36、原生176方法完整schema及源码未改检查通过。未调用模型、未重测实际初始化写文件、目标执行、计划批准执行或自动阈值触发，不沿用下方历史计数当作本轮通过。


## 前一批次交付状态（历史）：计划模式命令与退出

> 以下 `/plan` 用法和测试仅反映前批版本，现行仅 `/plan`，布局及衔接以本页当前状态为准，不是当前操作说明。

2026-10-27修复单独发送 `/plan` 后输入消失却无说明的问题：该命令只进入模式，不请求模型；现已提供即时提示和持续输入框状态，重复发送保持计划模式。`/plan 具体需求` 会去掉前缀并通过原生 `turn/start.collaborationMode=plan` 提交，执行中拒绝将其当成 `turn/steer`。点击输入框“计划模式”可切回默认：已有会话经原生设置请求确认，新会话保留草稿选择至首次提交；切换不自动执行计划。异步提示只归属于发起时同一会话、导航代次和草稿。

本批真实浏览器无模型9/9、相邻原生模式恢复2/2、生产函数的确定性传输夹具20/20分别通过；独立DeepSeek Flash真实5/5，仅2个普通规划任务，原生建议计划完成、无工具和文件改动，两次退出均有真实default设置事件且不发任务，自有记录清理。详见[本批验收](TEST_REPORT.md)。本轮未重验计划卡批准执行，不复用历史结果冒充新测试；没有新增 `/default` 命令。

## 前一批次交付状态：会话能力归位（历史）

2026-10-27本批根据用户提供的当前 Web 菜单截图再次调整入口：侧栏右键/“…”只保留重命名、归档/恢复、永久删除；当前会话的五项能力改从输入框 `/compact`、`/fork`、`/export`、`/review`、`/rollback` 选择，点击或 Tab 仅填入，发送才调用原生接口。自动压缩仍由原生触发，没有改阈值或代理循环。只读输入框可用 `/export`，普通任务、执行命令和权限更改仍被阻止。

永久删除不再因当前页的只读占用标记直接灰禁：可打开说明并由原生 `thread/delete` 最终核对写入锁；锁未释放会拒绝删除且弹窗持久显示原因。关闭用户确认的占用方后可在同窗重试，不强制关闭未知连接、不绕过原生保护。真实双原生进程探针与浏览器5组通过。

本批验证分开记录：无模型侧栏10/10及输入框命令10/10；另1次全新合成Flash建立非空历史后4/4导出与回退验证，见[入口汇总](test-results/composer-thread-commands-2026-10-27/summary.json)。独立真实Flash完整链最终6/6，包含原生压缩完成和实际除零问题审查；首轮4通过1个分叉排序测试断言失败保留，修正为按turn ID逐条比较继承内容，导出仍严格等于原生目标数组，两轮普通任务/手动压缩/审查请求累计各2，见[真实流程及各次计数](test-results/session-actions-2026-10-27/flash/attempt-summary.json)。另有占用删除5/5及相邻状态单元30项通过（权限15、批准草稿7、上下文恢复6、模式2）；权限相邻浏览器9通过1个已验证模型项明确跳过、归档相邻10通过1个旧历史项明确跳过，均0模型/0浏览器错误、各3个自有seed清理、全局配置SHA不变。本批[最终工程检查](test-results/session-actions-2026-10-27/engineering/results.json)通过：74份JS/MJS语法、36份Python AST、30项行为及diff；原生pristine=true、176/176完整Schema匹配。未重跑72项完整后端套件，未重编译核心，无前端打包或TypeScript。

## 前一批次交付状态（历史）

2026-10-27新增：会话管理集中至侧栏行的右键/“…”，目标会话ID独立绑定，保留原功能、删除确认及原生拒绝原因；菜单12组、归档11组通过，另用本轮新建合成Flash历史补验非空导出及回退竞态4组。当前桌面右键菜单截图缺失，具体条目和顺序仍待确认，不以记忆认定一致。

输入框内左下角新增会话级Agent权限：请求批准=`on-request/user/workspaceWrite`，帮我批准=`on-request/auto_review/workspaceWrite`，完全访问=`never/user/dangerFullAccess`。新草稿经原生start回执确认、已有会话经真实settingsupdated/恢复快照确认，保留工作区网络和额外路径，策略及feature限制显示原因。只读和未知默认值不误标；ask↔auto不重写原workspacePolicy以保留命名配置来源，未单独实现命名profile名称展示或验收其所有组合；无ChatGPT账号要求，完全访问不等于租户隔离。权限界面8组通过，三档实际工作流有效覆盖齐全；首轮测试等待失败及增量重复full均保留，详见[最新验收报告](TEST_REPORT.md)。后续ACK迟到/原生恢复确认等真实协议增量9组通过、1个已验证模型用例明确跳过，权限状态单测12项通过；未确认权限仍可停止当前任务。JS70/Python AST36、相邻状态用例及原生176方法完整性检查分别通过，未重跑72项Python后端套件。

新增历史与可见性改进：原生最新20回合优先、旧页按需加载；侧栏明确最近会话/已归档与永久删除；输入框上方常驻真实步骤摘要。日常旧ChatGPT登录态引起启动等待，已以原生ephemeral配置跳过且保留授权文件，新连接initialize实测455–826ms。完整证据见 `test-results/history-usability-2026-10-26/`。

测试插件和24好玩MCP已卸载，前端插件侧栏及/apps入口隐藏，原生协议能力保留。审查后委派已定位为生成模型目录错误继承V2能力声明，修为原生V1并在同组合真实验收。Web首次发现旧分叉已补当前实例只读元数据接入；目标消耗以真实Web观测与原生预算分别展示。最终证据：`test-results/final-fixes-2026-10-26/`。

升级必须用DeepSeek启动器重启以更新生成目录，并重新建立原生连接。已持久化V2的旧会话保留历史，需新建兼容会话执行委派；原生目标预算漏计不可通过公开接口写回，不能作为硬费用上限。严格国际出口测试已由用户取消。

## 前批范围调整与复验（历史）

用户后续明确：以后只使用 `deepseek-flash` 验证；移除 ChatGPT 模型/账号强依赖内容、反馈、快速和生图；删除项目管理的非源码自带技能。源码内置共五项，`imagegen` 排除后保留 `openai-docs`、`review-agent`、`skill-creator`、`skill-installer` 四项。旧 Flash/Pro 对照和测试结果属于前轮历史，不计入本轮 Flash 通过项。

前轮证据位于 `test-results/flash-followup-2026-10-26/`。当时的十三个斜杠命令已逐项完成真实路径验收，现行斜杠菜单仅保留 `/plan`，其他入口按当前分析定位处理；菜单公共测试、具体业务验收、后台协议和模型兼容性分别记录。

后续验收口径：用户明确不再要求严格国际出口阻断测试，该项从待验收清单移除，未标记为测试通过。远端扩展改为分别选择一个中国大陆可用的真实 MCP 和原生插件做代表性验收；不将代表性结果泛化到其他配置。

## 固定基线

- 实际仓库 `/root/Codex`，本批数据分析工作台起始HEAD为`19399bf16b472a1b144f1a90b396ca47c78af612`；前批精简入口修复起始HEAD为`672a96012fefe027fccd53a0ea45522dcba5becd`；前批计划修复起始HEAD为`db6089b2269a889c3b5c6ca4776c57a9c399e043`；前批会话入口修复起始HEAD为`7a47a139a09b0f4a0595826d72e6c6f1c0cc0009`，前批侧栏权限改进起始HEAD为`8befc8eccedbc3e246a54c5fdffb83da21598c46`；前轮能力核验起始HEAD为`f31cbabb1a6677d116df67cc6631be948973cd42`。前轮起始改动的 diff、23 个文件及 SHA-256 已保存到 `/tmp/codex-web-capability-audit/baseline/`；不回滚前轮修复。
- 原生程序 `native/bin/codex` 报告 `codex-cli 0.0.0`，因此不拿此开发版本字符串与其他发行版混用。身份以 `upstream-lock.json` 的提交 `970111f6cb62cc02fe36a82ea7d71b37a2889c97`、树 `e09c71b9069e689c9c997c766d0de8b7b288583f` 和 `native/provenance.json` 的二进制 SHA-256 为准。
- 集成：Python 3.12 标准库 HTTP/WebSocket 桥接，每个浏览器连接独占一个未修改的 `codex app-server --listen stdio://`；一个进程内允许多个 thread。初始化开启实验协议。实际生成 ClientRequest 为 **176** 方法；完整盘点见 [protocol-inventory.json](test-results/capability-audit-2026-10-26/protocol-inventory.json)。方法数量不等于可用功能数量。
- 前端为普通 JS/CSS，无打包和 TypeScript。`app.js` 管连接、会话、事件和通用页面；`native-ui.js` 管计划/目标/项目，`analysis-workspace.js` 管分析用途、对话内产出和完成后的原生计划衔接；`permissions.js` 管会话权限选择和原生确认；`context.js` 管统计；`databases.js` + 独立 Python MCP 管只读数据库。配置由原生 config APIs 读写，模型/目录/权限按 thread settings 生效。
- 启动：`python3 web/start.py --deepseek --state-dir <独立目录> --port <端口> --workspace <测试目录>`；需有效 `DEEPSEEK_API_KEY`。前轮独立实例为 `127.0.0.1:8784`；最新完整版本已在 `127.0.0.1:8789` 以标准隐藏输入启动，工作区 `/tmp/codex-web-flash-final-audit/workspace`，工作区与配置均在 `/tmp/codex-web-flash-final-audit/`，未复制 ChatGPT 授权；清除了 HTTP/HTTPS/ALL_PROXY，保留 DeepSeek 直连。没有改变宿主机路由或施加系统出口防火墙，不能把此环境称为“已通过全网封锁测试”。
- 当前验证模型：provider `deepseek`，仅 `deepseek-flash`；Pro 目录保留但本轮未调用；原生 Responses，实际目标 `https://api.deepseek.com/responses`。第三方普通 Chat Completions 地址不可直接替代。
- 桌面参考：用户已提供两张新会话 `/` 菜单截图（`codex-clipboard-fffaa287-1cde-4b6e-89c8-1cd66e40c1df.jpg`、`codex-clipboard-f735667f-02f5-4da6-bc12-0bd4dc30d1f8.png`）。原截图仅保留为布局参考；当前按用户最终要求只保留 `/plan`，统一侧栏新分析，仅显示计划状态和退出按钮，不照搬旧截图的工程命令。截图未给出桌面构建号；当前右键菜单没有截图，具体条目和顺序待确认。权限三档另有锁定开源TUI预设依据，不能据此宣称闭源桌面布局完全一致。

## 证据与判定口径

所有协议以锁定提交为准：

- P：`upstream/codex-rs/app-server-protocol/src/protocol/common.rs`、`protocol/v2/` 及执行程序生成的 Schema。
- T：`upstream/codex-rs/app-server/src/request_processors/thread_processor.rs`；`core/src/tasks/mod.rs`、`core/src/unified_exec/process_manager.rs`。停止与进程回收是两个生命周期。
- A：`app-server/src/request_processors/apps_processor.rs` 的 `apps_enabled_for_auth` / `uses_codex_backend`；`protocol/v2/account.rs` 的认证变体；原生反馈 `feedback/src/lib.rs` 的 Sentry 上传目标。
- C：`web/start.py` 生成独立 Responses provider/catalog，原生 `config/read`、`model/list`、`thread/settings/update` 和实际发送帧核对配置。
- U：Web 实际调用链与本轮浏览器报告。历史已验证与本轮新验证分开记录。

“保留”表示属于产品范围，不代表每个异常场景均已验收。“条件保留”须满足该行条件。仅出现协议名称不能证明模型或依赖可用；未知项不登记为普通 Bug。

除明确写出账号依赖的行外，下表本地能力不要求 ChatGPT 登录；调用模型时仍需第三方 provider 的有效密钥。MCP/Skill/插件的外部服务认证另按具体配置核实。

| ID / 能力 | 开源依据与外部入口 | 前端表达 | 模型 / 网络条件 | 范围及当前状态 |
|---|---|---|---|---|
| C01 连接/诊断 | P initialize、server/diagnostics；原生 stdio | 连接状态、错误、重连 | 本机；模型无关 | 保留；前轮连接/服务重启已验证；前批ephemeral启动与第三方Flash实际工作流已验证，MCP OAuth使用独立存储 |
| C02 项目/目录 | P project CRUD、thread/metadata/update、fs/readDirectory | 高级设置中的分析空间与工作目录；不提供 `/projects` | 本地；模型无关 | 保留；前轮真实项目创建/编辑/关联/解除/删除通过，目录保留 |
| C03 会话历史/搜索/分页/分叉/归档/删除/回退 | P thread APIs，T 实际存储 | 侧栏管理重命名/归档/恢复/删除；其他接口保留于原生能力面板，不再由 `/fork /export /rollback` 触发，恢复错误明确显示 | 本地；删除/回退需确认；回退不撤销磁盘 | 保留；已见索引和当前CODEX_HOME只读元数据补候选，均经原生确认；此前从未见的真实旧fork首次发现/搜索/刷新/归档恢复删除5组通过，23项只读与边界回归；最新20回合/按需更早页真实6/6；前批侧栏目标菜单12/12、归档恢复/删除11/11、新建合成真实历史导出和回退4/4。历史入口迁移侧栏10/10、旧输入框命令10/10、另一新合成历史4/4；历史Flash完整链6/6覆盖分叉继承/非空导出/确认回退；占用删除5/5，原生锁仍最终控制 |
| C04 流式对话/多轮/执行中补充 | P turn/start、steer、item delta/completed | 输入、过程折叠、最终回答；侧栏“新分析”统一创建会话并保留cwd，不改变工具权限，可独立使用原生计划模式 | DeepSeek Responses + 工具格式 | 保留；Flash/Pro 分别验证，不能用聊天代替工具验收 |
| C05 模型/provider/推理强度 | P model/list、thread/settings/update；C | 高级设置中的原模型／强度控件；不提供 `/model` 或 `/reasoning` | provider 实现 Responses；真实模型目录 | 保留；禁止静默 fallback；历史 OpenAI 数据可读 |
| C06 命令/文件修改/沙箱 | T native unified exec、apply_patch；P fs APIs | 真实工具过程与错误保留；原始目录浏览仅高级设置，日常在对话内显示结果与下载 | 工具调用能力；本机 OS 沙箱 | 保留；不另写代理循环；终端 UI 沿用原产品隐藏要求 |
| C07 停止与前轮命令回收 | P turn/interrupt + backgroundTerminals list/terminate；T | 停止、回收状态、失败重试 | 实验 API 已启用；仅匹配前轮 itemId | 保留；CW-009 已接入；单进程、同线程旧后台任务、A/B 隔离、失败重试、目标暂停及回收期间导航通过 |
| C08 审批/拒绝/用户问题/权限请求 | P ServerRequest、resolved | 高级设置中的当前分析权限、实际审批卡片和明确归属 | 原生策略与requirements；自动审核需guardian_approval启用及Flash工具能力；不要求ChatGPT登录 | 保留三档；会话级界面8/8含真实新建Flash，人工拒绝文件未创建、原生auto_review允许后命令输出、full实际文件后恢复工作区模式均有真实证据；初次ask测试等待失败及增量重复full另记，不称一次3/3。后续真实通知先于ACK、同线程resume确认等9组协议/浏览器增量与12项状态单测通过；ask↔auto请求不重写沙箱以保留profile来源，不声称命名profile全部组合已验 |
| C09 多会话并发 | P thread/turn IDs；T 原生线程管理 | 侧栏运行状态、分会话草稿 | 不同 cwd 才隔离文件；不等于租户边界 | 保留；前轮 A/B 事件与文件已验证 |
| C10 手动/自动压缩、上下文统计 | P compact、tokenUsage；C catalog | 统计圆环和原生配置；压缩按设置自动触发，不提供 `/compact` | 压缩调用当前Flash；可能丢细节 | 保留原生压缩能力及自动路径；前批移除 `/compact` 菜单与分发，不改自动压缩。历史手动请求及原生contextCompaction完成已验证；前批手动1组、自动及阈值恢复2组通过；临时阈值20,000，真实31,554→27,493并续聊保留标记，不冒充默认阈值实耗验收；上下文默认按最近采样/核实完整窗口，实际10534/1048576=1.0%，分页恢复丢统计已修复，12+4行为与4组只读浏览器通过 |
| C11 计划模式／步骤 | P collaborationMode、plan delta、turn/plan/updated；公开 thread/settings/update | 唯一 `/plan` bare／inline；计划状态、退出、整体确认与真实步骤；无显式开关 | 模型须遵循计划／工具与方案标记格式；Default 决策与原生 Plan 分别核验 | 条件保留；计划与自动衔接确定性70/70，最终浏览器原生设置及夹具决策衔接通过；Default 仅在成功完成后由 Web 等待原生通知转 Plan，不把生成过程冒充 Plan，不新增模型回合。真实Flash手动计划链7/7、自动决策修后链7/7各4回合，计划修改／批准／中断／继续／三问和产出已验；简单问题1回合3/3保持Default直接查询。复杂题曾直接申请SQL而未提方案，修语义指引后重跑通过，失败保留；语义策略不是权限强制保证。历史Sakila6/6另记；不是数据库事务断点或逐SQL审批 |
| C12 持续目标 | P thread/goal set/get/clear；T | 高级设置中的持续目标、状态、暂停／继续；不提供 `/goal` | 原生目标工具与预算；非云调度 | 保留；完整生命周期及CW-021通过；网页独立真实观测与原生预算分列，16项行为+6组Flash通过。原生首回合/终态漏计不可写回，明确未知/下界及预算限制 |
| C13 源码自带Skills发现/启停/调用 | skills/src/assets/samples；P skills/list、config/write、UserInput.skill | 保留主技能页供用户配置启停、对话按任务调用；不进 `/` 菜单，不再提供额外导入 | 保留四个原生Skill；在线依赖分开核实 | 保留；四个均真实Flash调用，5组验收；2375个非原生定义已从项目受管目录清理，宿主全局目录不动 |
| C14 stdio MCP / 工具 / 资源 | P mcpServer*；原生 MCP manager | 保留主 MCP 页供用户添加／配置／启停、查看状态和工具资源 | 本机进程可离线；模型工具格式 | 保留；前轮本地真实 MCP + Flash/Pro 验收 |
| C15 HTTP MCP / OAuth / elicitation | P OAuth、tools、resources、ServerRequest | HTTP配置、服务授权和确认 | 按实际国内/内网端点及后端依赖判定，OAuth不等于ChatGPT登录 | 条件保留；本机HTTP/OAuth 6组通过；另真实远端24好玩匿名MCP经网页添加、8工具/1资源目录、Flash搜索→详情、启停及清理4项增量通过，含真实429错误反馈；未逐个调用全部工具或读取资源内容，不泛化其他服务 |
| C16 本地插件/市场 | P plugin/list/read/install、marketplace APIs；实际来源配置 | 插件目录、协议操作 | 本地目录/国内源可用；插件内部网络逐项核实 | 条件保留底层能力，按用户要求隐藏常规前端入口；Playwright代表性验收及额外true失败证据保留。测试插件/MCP现已卸载并核查；不恢复云Apps或安装非原生Skill |
| C17 云端Apps/连接器 | A apps_enabled_for_auth / uses_codex_backend | 已移除对应操作入口 | 当前实现强依赖云端账号且无现成国内路径 | 排除；前后端均拒绝app/*；保留本地插件/MCP及原始协议定义 |
| C18 ChatGPT登录、订阅、额度、用户验证 | A account与userVerification处理器 | 提供方连接页替代账号登录页 | DeepSeek env_key不经过账号登录；用户验证仅ChatGPT身份 | 移除；前后端拒绝对应请求，历史授权文件保留，不静默换模型 |
| C19 生图/快速档位 | 原生image_generation、fast_mode、service_tier及内置imagegen | 已移除对应操作与Skill入口 | 用户明确移除，无替代模型接入 | 移除；原生受支持启动配置关闭、后端拒绝重新启用；源包能力定义不改，Flash图像输入保留 |
| C20 图片上传/预览/本地图片显示 | P UserInput image、fs/readFile；C modalities | 附件、图片预览 | Flash 目录声明 image；Pro 仅 text；不能自动换模型 | 条件保留；Flash 真实本地色块识图通过；Pro 图像发送前拒绝并保留草稿/附件，无切换模型 |
| C21 实时语音/音频/语音列表 | P thread/realtime APIs及实验WS配置 | 保留定义，当前不提供启动操作 | 原生默认GPT实时模型；Flash无已配置且验证的实时服务 | 条件未满足；start明确拒绝，不发默认GPT请求；不能据此宣称所有可配置实时服务永久绑定ChatGPT |
| C22 搜索/联网浏览 | 原生工具及MCP | 工具活动/具体服务配置 | Flash Responses托管web_search不作为已支持路径；国内MCP另按配置验证 | 条件保留；默认web_search=disabled；前轮Pro实测为历史，不能替代前轮Flash验证 |
| C23 Hooks | P hooks/list；core hooks 执行器 | 配置入口、执行事件 | 本地命令可离线；具体 hook 可访问外网 | 条件保留；无需为每个自动 hook 加按钮；前轮线程级五类生命周期事件与真实命令通过，全局配置/文件哈希不变；不泛化所有处理器类型 |
| C24 Guardian自动审核 | P审核事件/确认；ext/guardian-reviewer模型选择 | 高级设置中的“帮我批准”、实际审核结果及用户确认 | 当前目录无默认审核模型时原生回退父Flash；需要guardian_approval和策略允许，未独立捕获HTTP请求体 | 条件保留；前批真实允许、拒绝及手动确认2组保留；前批经权限选择器切为auto_review后真实approved与命令stdout通过。自动审核会拒绝，不是全部批准，手动确认只记录授权不自动重执行 |
| C25 记忆 | P memory/status、thread/memory；原生memories工具 | 配置/协议和原生工具 | 辅助模型显式Flash；原生自动提取要求源会话至少闲置1小时 | 条件保留；真实笔记新增/读取/检索通过；自然满一小时后6条历史真实提取、v2合并及3583字符原生摘要读回，v2Ready=true；全局功能未擅自开启 |
| C26 队列/分组/会话附件 | P thread/queue、threadSection、attachment APIs | 通用协议；无需为了接口增按钮 | queue/add可自动执行，CRUD需未加载线程；存储与模型交付分开 | 条件保留；前轮存储3组通过：增改删、排序、分页、刷新、隔离和附件归档过滤；另有Flash自动消费、忙碌拒绝与停止后手动启动2组真实通过，不以CRUD冒充执行 |
| C27 子代理/审查 | 原生 spawn-agent tools、P review/start | 对话工具事件、原生能力面板；不提供 `/review` | 模型工具能力；可独立第三方配置 | 条件保留；历史 `/review` 真实审查未提交除零修改并完成，未增加普通turn/start；目录正确声明原生V1，真实同连接审查后新父worker 2/2通过，完整任务/父子关联/Flash身份/文件结果已验；非前端串线。V2字段编码不兼容、旧V2会话需新建，不重写循环 |
| C28 数据库/图表/完整结果 | Web独立只读MCP；不是Codex内置数据库 | 主数据源页直接配置管理启停；对应对话同一结果卡图表／数据切换、20行分页与下载 | 本机/国内数据库与既有驱动；资源本地 | 保留扩展；本轮真实PG247行／31行派生结果分页及CSV9/9，真实Flash手动／自动完整链各7/7，普通简单查询3/3；前轮MySQL/PostgreSQL/ClickHouse/Elasticsearch真实读取、跨库范围、写入拒绝及Flash真实图表已复验；这些为历史真实能力证据；新增Sakila复杂三问真实计划/批准/停止/修改继续/最终结果6/6、普通一轮多问通过。SQL结构及日期format误判修复，13项回归及真实聚合通过；最新MCP原SQL浏览器完整链3/3通过，run3旧MCP一次format拒绝与透明恢复保留 |
| C29 本地反馈 | P feedback/save | 操作入口已移除 | 用户明确移除 | 排除；后端拒绝feedback/*，不再创建反馈包 |
| C30 上传反馈 | P feedback/upload | 操作入口已移除 | 用户明确移除且网络范围外 | 排除；前后端拒绝，不上传 |
| C31 平台/远程环境 | P windowsSandbox、environment、remoteControl | 协议定义/条件说明 | Windows 不适用 Linux；远程控制中继、认证、网络待核实 | Windows 条件保留；原生 remoteControl 的 auth.rs 明确拒绝 API key、要求 ChatGPT，因此当前远程控制路径排除；environment 其余配置待核实 |
| C32 云插件分享/内部测试入口 | core-plugins remote::ensure_chatgpt_auth、mock协议 | 已移除对应执行入口，保留定义 | 分享要求ChatGPT/workspace；内部测试非业务能力 | 排除对应路径；不阻断本地plugin/list/read/install及MCP |
| C33 云自动化/画布/闭源桌面专属 | 未找到该锁定版本适合本项目的公开入口 | 不伪造入口 | 闭源/私有或证据不足 | 待核实/超范围，不能把原生持续目标认作定时调度 |
| C35 分析任务上下文与数据发现 | P turn/start.additionalContext；现有只读数据库 MCP | 不提供手工来源选择；Agent 发现全部已配置、启用、可用且获授权连接 | 固定 Flash 与实际连接／权限；没有新增账号依赖 | 保留；只传用途说明，不传凭据，不增加选择状态或授权。直接连接管理与真实拒绝连接已验；本轮Flash通过MCP发现独立只读PG并执行成功，手动链／自动链各7/7，简单Default直接查询3/3，权限与数据hash保持；不泛化其他provider／数据库配置 |
| C36 对话内结果与结论导出 | 成功 done MCP structuredContent／文本 JSON 引用；已完成 agentMessage；本地 Markdown | 同一结果卡图表／数据切换，唯一CSV及图表PNG，每条完成回答Markdown；无成果栏 | 实际成功结果；同轮且已加载；导出受导航／恢复保护 | 保留；31项生产函数行为与最终浏览器显式事件夹具验证同轮隔离／完成状态及两条Markdown下载；真实Flash两条完整链各7/7包含CSV、PNG、Markdown实际下载；另PG247行全量CSV及31行派生分页浏览器9/9（0模型，渲染入口为明确事件夹具），不混作native模型查询。未新增PDF／Word／逐句审计 |
| C34 多租户 | 现 Web 单 token、同 UID/env/CODEX_HOME，不是上游业务能力 | 当前个人服务，无租户 UI | 必须后端授权 + 密钥/文件/执行环境/配额隔离 | 当前未实现；单独范围工作，不将本次定向进程回收宣称租户隔离 |

最新证据见 [WEB_AUDIT.md](WEB_AUDIT.md) 和本轮 summary。排除路径由前后端校验，Web启动原生进程使用支持的关闭配置；这不等于OS出口策略、多租户隔离或任意命令/MCP的安全白名单。协议源定义176项保持原样，界面只列当前范围内操作；用户文件、历史、授权和Codex源包保留。

## DeepSeek 快速模式与生图的专门核验

用户已明确两者非必要，不新增适配层或替代模型。已读取官方 [Responses 兼容说明](https://api-docs.deepseek.com/guides/responses_api/)、[思考模式](https://api-docs.deepseek.com/guides/thinking_mode/) 和 [模型目录定义](https://api-docs.deepseek.com/api/list-models/)，并用当前凭据**直连实际 GET /models**，只保存非敏感字段到 [deepseek-model-capabilities.json](test-results/capability-audit-2026-10-26/deepseek-model-capabilities.json)。

- 原生快速档位使用 `service_tier`；DeepSeek 官方明确不支持该参数，且不支持的参数可能被忽略，因此“请求没有报错”不能证明快速生效。`low/high/max` 与 `none` 的思考控制是另一项能力，不伪装成优先档位；保留现有有效推理控件，不新增快速按钮。
- 当前实际 Flash/Pro 均返回 `output_modalities=[text]`；Flash 输入为 text/image，Pro 为 text。没有提供 DeepSeek 原生生图入口。外部 MCP 生图要另有符合网络/模型条件的真实配置，本轮未建设。内置 OpenAI imagegen 技能标明当前范围不可用，未删除其文件或已有配置。
- Flash **识图**已从网页真实上传本地测试图并正确识别红背景/蓝方块；这不作为生图证据。
