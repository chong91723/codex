# 实际验收报告


## 当前增量：ECharts、隔离 Python 与数值依据（2026-10-27）

起始提交 `e862590462775c856fc4158b73c1632949b104d9`；原生源码、发行资源、协议与核心没有修改。新增的是原生 MCP 允许接入的本项目分析扩展和前端核验，不自建模型循环。所有实验使用独立 `/tmp` 工作区、只读 PostgreSQL 和明确 DEMO API／CSV。密钥仅通过启动器隐藏输入用于测试进程，未写入配置、源码或报告；用户服务 8765 未重启。

| 验证类别 | 实际结果与边界 |
|---|---|
| 真实 deepseek-flash 数据流程 | [flash/results.json](test-results/numeric-evidence-2026-10-27/flash/results.json)：4/4、4个普通原生回合。纯 Decimal 运算、实际本机 API 夹具→Python→ECharts、真实CSV精确汇总绘图、实际只读PG的 SUM／COUNT直接发布。全部最终数字匹配本回合查询／计算字段。无模型回退、无业务库借用、无命令安装或其他绘图库。过程中2次 run_python 参数／结果校验失败，模型在原生回合内纠正后完成；失败项保留，未冒充首次全部成功 |
| 真实计划、多问与停止继续 | [lifecycle/results.json](test-results/numeric-evidence-2026-10-27/lifecycle/results.json)：4/4、5个原生回合。真实 `/plan`→生成→修改→编辑确认→Default执行，用户草稿保留；一次四问总额66.66、均额22.22、记录3、最大33.33均有真实计算引用，实际原生步骤全部completed。另一会话确认 Python进程已启动后点击停止，真实turn/interrupt、interrupted、实际进程及子进程退出、0新快照；本次观察401ms（不是时限承诺）。修改条件后新回合成功算出3.50。继续是新任务，不是事务断点恢复 |
| 正式新后端与浏览器 | [browser-canonical/results.json](test-results/numeric-evidence-2026-10-27/browser-canonical/results.json)：11/11、0页面错误、0模型；真实标准stdio MCP、Python、只读PG、HTTP／文件源、ECharts及实际CSV／PNG下载。验证无DB计算、同卡切换、严格拒绝裸数／改数／加日期、跨会话拒绝、核验HTTP失败重试、迟到响应不污染新会话及历史标签；自有会话永久删除后，本模块原文／答案／策略文件已实际清理，归档保留由独立行为及真实文件测试验证。工具／答案／历史通知与严格回合登记是明确UI夹具，不能当模型输出或原生历史持久化通过 |
| 已运行旧后端兼容 | [browser/results.json](test-results/numeric-evidence-2026-10-27/browser/results.json)：11/11，以旧result worker路由完成同类核验，未重启旧服务。旧配置补缺项、用户覆盖／禁用／工具策略、同名自定义MCP及提交ACK先到的风险由生产函数行为测试验证；配置迁移本身未单独进行真实生产启停验收 |
| 桌面截图 | [visual-review.json](test-results/numeric-evidence-2026-10-27/browser-canonical/visual-review.json)：1440／1024、明暗实际查看，单一结果区、唯一CSV、精确答案及来源可看，无横向溢出。最终截图等待实际ECharts finished事件。手机按用户要求不测 |
| 确定性行为 | [engineering/results.json](test-results/numeric-evidence-2026-10-27/engineering/results.json)：193/193，包含计划36、批准11、模式2、自动衔接21、设置19、产出31、上下文6、权限15、统一卡15、图表18、新核验19。均是生产函数配DOM／传输夹具，不代替真实模型；重复覆盖不再叠加 |
| 完整Python套件 | 同一工程记录：94项中90通过、4按既有条件跳过；新增证据／隔离计算22项包含真实bwrap、无宿主文件／密钥／网络、取消、超时、NaN、精确大整数／Decimal、数据归属、API／文件来源与worker兼容；最后补查CSV重复表头及行列数不一致的真实失败回归。跳过的3项原生Web旧命令集成和1项raw-socket作用域用例未设置CODEX_WEB_TEST_URL，不能称通过。其他真实浏览器／Flash验证另列，不用其替代跳过项 |
| 语法、构建与原生完整性 | 99份JS／MJS、42份Python AST通过；source pristine，176/176方法和完整schema与native一致，二进制／资源哈希一致。无前端bundler或TypeScript，构建／类型检查不适用；没有重编译核心。安装器新增显式国内包源选项，实际帮助参数检查通过；本轮依赖已从国内镜像安装且由真实计算使用，未声称重新执行完整npm安装 |
| 拼写数字补查 | 中英文数字拼写、中文无单位及空格形式新增识别回归，同时避免“千位分隔符／结果一致”误判。[实际正文重核](test-results/numeric-evidence-2026-10-27/engineering/actual-transcript-policy-replay.json)将本轮真实最终回答与原生方案共8项对照保留的回合证据，全部verified或notRequired；0新模型请求，这是执行后证据重核，不是新的一轮模型流程 |

[全部真实模型尝试](test-results/numeric-evidence-2026-10-27/model-attempts.json)包含9轮、22个普通turn/start，成功最终两组共9回合；不把provider内部HTTP推理算在此数。首次MCP失败解析、误把已阻断commentary算最终失败、合法澄清、未执行方案中的数量断言、格式词误判、测试器漏收进度及失败发布记录解析均原样保留。相应真实失败、代码依据风险与模型自纠正分开记录。无模型浏览器还出现过测试服务或API退出导致拒绝连接、旧接口故障注入选择器不全、截图抢在加载／动画完成前；最终测试器自管启动清理与等待真实渲染事件后通过，没有用固定延时或伪造成功解决。

来源规则保证可追溯的显示值，不证明源数据真实性、指标口径或任意自然语言语义；自然语言数字识别是明确规则，不能宣称全语义形式完备。未经核验数字保留诊断并明确要求补充依据，不显示成成功结论。默认国内行情域名本身不是兼容证据，本轮API是本机DEMO夹具，未重试真实英伟达行情源。任意第三方MCP结果的自动逐字段证据尚未覆盖；多租户认证、存储、cgroup和配额隔离仍待独立建设。自动自主规划的完整真实业务链是前批记录，本次数值策略下重新执行的是手动计划链；不将前批自动规划结果宣称为本次新的真实验收。严格国际出口按用户要求不做。

资源清理与推送以本批 `environment-cleanup.json` 和最终仓库记录为准；只清理自有测试数据、容器和服务，不改变其他运行实例或用户配置。

## 最新增量：统一图表／数据结果区（2026-10-27）

同一结果ID只显示一张卡，在同一区域切换ECharts图表与标准数据表；保留精确快照、分页、CSV、PNG，不把表格改绘成canvas。图表到达时合并原结果，多图在卡内选择；用户已查看数据或翻页时不抢回图表。完整CSV只有底部一处，短表与空表隐藏分页。暗色文字和图表先到的来源名称同时修复。问题、根因和验收见CW-054至CW-057。

| 验证 | 本次实际结果与边界 |
|---|---|
| 修前 | [baseline.json](test-results/unified-results-2026-10-27/browser/baseline.json)：真实独立PG＋ECharts输出经明确事件夹具呈现，复现表格卡和图表卡分离、图表内附表、两个CSV及短表分页；原截图保留 |
| 最终真实浏览器／数据库／图表 | [final/results.json](test-results/unified-results-2026-10-27/browser/final/results.json)：14/14、0pageerror、0模型；独立只读PG实际SQL得到10／247／0行，本机mcp-echarts校验3个图表，真实快照及图表读取；CSV分别实际下载10／247／0行，PNG签名及真实文件通过。表格／图表顺序反转、重复引用、多图及不同结果关联、247行13页及跳页、页码保持、0行、两种请求失败与重试、键盘ARIA、迟到事件／响应隔离均通过；额外验证inProgress回合恢复的completed查询与两图共享一卡，未完成工具不显示成功，后续turn完成不重复 |
| 历史与模型边界 | 原生线程创建和页面reload真实；工具完成事件及hydrateThread历史是明确fixture，不是Flash输出或模型持久化验收。旧用户历史不读取；本次不调用模型，不将前批手动／自动计划通过数算入此次 |
| 截图／主题 | [visual-review.json](test-results/unified-results-2026-10-27/browser/visual-review.json)：1440／1024桌面数据／图表／暗色实际查看，无横向溢出；暗色轴与legend实际对比度11.985；同一ECharts实例的legend选择和dataZoom25–65切主题保持。完整页面和结果区截图在final目录，无手机测试 |
| 确定性行为 | [state/final.tap](test-results/unified-results-2026-10-27/state/final.tap)：64/64＝原产物31＋统一卡15＋图表18。覆盖同轮结论、失败终态、跨会话、视图／页码保留、错误恢复、PNG等待真实canvas及主题切换；是DOM／事件／HTTP／canvas夹具，不代替上行真实浏览器 |
| 工程／相邻回归 | [engineering/results.json](test-results/unified-results-2026-10-27/engineering/results.json)：89份JS／MJS语法、36份Python AST、174/174行为；174已包含上述64，不重复相加。source pristine、176方法及完整Schema与native一致，diff检查通过。没有前端bundler或TypeScript，构建／类型检查不适用；未重编译核心、未重跑完整后端Python套件 |
| 后续脚本兼容 | analysis_plan_workflow_desktop、database_desktop、database_results_desktop已按resultId定位统一卡并切图／选择图；五类图从5个独立卡改验同一卡5个选择项。三份语法通过，本次未重新执行这些模型／旧数据库完整流程 |
| 清理 | [environment-cleanup.json](test-results/unified-results-2026-10-27/browser/environment-cleanup.json)：仅自有10个原生线程、3结果、3图、1连接清理成功，18873及本次PG容器与临时目录已移除，8765用户服务未动 |

首次浏览器第4组是测试器对隐藏旧图的严格选择器匹配失败，相关证据在first-run-selector；修为选择可见图。随后12/12版本在实看截图时发现暗色可读性和chart-first元数据问题，before-contrast-metadata原样保留；强化真实对比度／元数据断言并修复后，最终14/14覆盖主题交互状态。不能用旧12/12替代新增断言。


执行中恢复边界在最后代码复核发现并经实际renderItem函数复现：工具已completed但所属回合未完成，entry.done仍false；局部改为按工具实际状态准入，不改变回合状态。修前失败在state/in-progress-restore-before.tap；旧产物测试把done=false等同工具未完成的断言修为明确status=inProgress，旧断言失败在state/in-progress-after-before-assertion.tap。原有失败／pending／报告完成与跨会话保护保持通过。

## 前批次：数据分析工作台（2026-10-27）

起始提交 `19399bf16b472a1b144f1a90b396ca47c78af612`；锁定Codex源码 `970111f6cb62cc02fe36a82ea7d71b37a2889c97` 未修改。用户最终要求：无成果侧栏、无单次数据源选择，数据源主页面由用户完整配置管理，Agent发现全部已配置启用且获授权连接；Skills／MCP入口保留。唯一手动计划入口 `/plan` bare／inline，底部只显示计划状态与退出，不展示原显式开关。历史与中间形态不算最终通过。

| 验证类别 | 本轮实际结果与边界 |
|---|---|
| 最终真实浏览器／原生／后端 | [final-revision/results.json](test-results/analysis-workspace-2026-10-27/browser/final-revision/results.json)：13/13、0页面错误、0模型。核对最终导航与无侧栏／来源选择／开关、同一高级控件及事件、初始化与目标弹窗只打开不执行、原生协议可达、Skills／MCP管理入口可达、bare计划真实设置与通知及幂等退出、直接失败连接创建／编辑／启停／移除、真实列表故障重试与草稿保持 |
| 明确传输及UI夹具 | [verification-summary.json](test-results/analysis-workspace-2026-10-27/browser/final-revision/verification-summary.json)分别说明：inline `/plan`在发送前故障夹具核对前缀／mode／输入保留；对话事件夹具显示同轮结果卡、两条真实Markdown文件下载及跨回合隔离；未完成／失败下载隐藏。自动方案决定为夹具，后续thread/settings/update及等待原生通知真实，无额外turn/start／自动批准执行。CSV只验链接，不能当真实查询或下载通过 |
| 已复现报告状态问题 | 同一summary保留 `inline-rendering-before/results.json`及failure截图：item完成但turn未完成时过早显示下载。修为done消息＋成功完成回合联合判定，并在合并状态后刷新；修后及最终13组相关项通过。完成后可能仍隐藏为代码推断顺序风险，不冒称修前另复现。查询结果卡保持直接可见，不折叠进工具活动 |
| 桌面与截图 | 最终1440×960、1024×960无横向溢出；明暗主题及四张最终首页／对话下载／输入区截图已实际查看。不含手机，不以截图代替原生／模型／数据库结果 |
| 高级设置行为 | `web/tests/analysis_settings.mjs` 19/19，实际生产函数配DOM／RPC夹具：同一控件保留、折叠、原处理器、异步导航与失败；仅 `/plan` 可用，其余旧命令拒绝。无原生／模型请求，不冒充集成 |
| 对话结果与报告行为 | `web/tests/analysis_artifacts.mjs` 31/31，实际生产函数配原生item夹具：仅成功MCP合法ID、排除rows／错误／pending、same-turn隔离、真实答案快照、completed回合判定、commentary／方案／失败／中断拒绝、Markdown内容和导航／恢复保护，另含20行分页offset、防重、越界、失败保留及重试、0行与同ID去重。无模型或真实数据库 |
| 计划与自动衔接状态 | [state/auto-plan-after.tap](test-results/analysis-workspace-2026-10-27/state/auto-plan-after.tap)：70/70生产函数／受控传输事件，包括手动入口／批准草稿与自动决策后的归属、设置等待、并发与错误，不代替真实模型决定。修前失败保留于auto-plan-before.tap。与其他工程重叠项不累加为业务通过 |
| 中间实现历史 | [browser/final/results.json](test-results/analysis-workspace-2026-10-27/browser/final/results.json)12/12仅对应被替代侧栏／来源选择／显式开关；保留未改的真实原生技能停启、本地stdio MCP添加／停启／工具列举／echo证据，不重复配置写入。来源选择测试已随用户撤回删除，不作为当前能力 |
| 真实Flash手动计划完整链 | [手动计划完整链](test-results/analysis-workspace-2026-10-27/flash-plan/manual-chain/results.json)7/7，4个普通turn/start。真实原生方案→多轮修改→编辑批准→首查询后停止第二待审批SQL→修改条件新回合继续复用首结果→真实步骤全完成→完整回答三问→对话CSV／PNG／Markdown实际下载。三个标not-repeated的先期入口用例不计入7项，也不再产生模型请求 |
| 真实Flash自动规划完整链 | [自动决策修后完整链](test-results/analysis-workspace-2026-10-27/flash-plan/automatic-chain-after-policy/results.json)7/7，4个普通turn/start。初始Default由Flash实际提出方案（查询批准前0业务SQL），完成后真实转Plan、无额外模型回合；后续修改／批准／停止／继续／三问／图表及下载完整通过。不是用手动/plan代替自主决定 |
| 真实Flash简单直接查询 | [简单直接查询](test-results/analysis-workspace-2026-10-27/flash-plan/simple-direct/results.json)3/3，1个Default回合。模型通过native MCP实际query_database／read_result得到SUM2220.00，与独立固定SQL一致，0proposed_plan／0Plan设置；没有把基准数值喂给模型 |
| 真实PG结果分页与去重 | [真实分页浏览器](test-results/analysis-workspace-2026-10-27/browser/inline-pagination/results.json)9/9，0模型／0页面错误。独立PG真实查询247行与31行派生快照；自动20行表格、前后页、末页7行、越界零请求、失败保留上页重试、read_result不重复、同ID唯一卡、完整247行CSV下载。handleEvent MCP完成仅为明确渲染入口夹具，不冒充native模型数据库调用 |
| 最终工程检查 | [最终工程记录](test-results/analysis-workspace-2026-10-27/engineering/results.json)：86份JS／MJS语法、36份Python AST通过；141/141行为（Plan36＋批准提交11＋模式恢复2＋自动衔接21＋设置19＋产出31＋上下文6＋权限15）。source pristine、176/176完整Schema及native一致，diff通过。首次140/141仅旧断言仍期待精简前长Plan提示，更新为用户指定短提示后通过，before-results／before-behavior保留。无前端打包或TypeScript，未重编译核心，未重跑完整Python后端套件 |


真实模型两条完整链均使用独立只读PostgreSQL测试库。首查询得到地区Top2（华南980.00／4单、华东900.00／5单），第二条SQL等待真实MCP审批时停止，收到原生interrupted且第二条未执行。之后以新回合把Q2改为2026年8月各地区（华东400.00／2单、华北90.00／1单、华南300.00／1单），Q3改为产品Top1（Alpha910.00），复用Q1。最终三个问题均回答完整、原生update_plan所有步骤completed，CSV／PNG／Markdown实际下载；独立SQL与数据指纹均核对不变，自有会话、结果、图表及连接均清理。停止／继续不是事务断点恢复。

真实失败及测试器边界保留：attempt-1批准后等待state.turns终态超时、attempt-2／3遇到未预设澄清问题，按测试驱动等待或答案范围调整，不直接认定产品Bug；先期bare／inline／退出真实通过在attempt-1／2中保留。attempt-4是实际模型策略问题：复杂三问＋图表直接申请SQL，测试未批准即中断，0执行；强化analysisTaskContext的语义规划边界后自动完整链7/7，再以简单Default查询3/3确认未强迫所有问题先规划。语义指引不是权限强制保证。[全部真实模型尝试](test-results/analysis-workspace-2026-10-27/flash-plan/summary.json)确认全部7轮共18个普通turn/start，含4次失败尝试和最终3组成功；不能只报成功两链，不将内部provider HTTP请求算在该数字中。[相同业务问题修前／修后对照](test-results/analysis-workspace-2026-10-27/flash-plan/application-policy-fix.json)核对修前／修后相同业务问题、相同Default与Flash，保留实际应用上下文。

结果呈现回归另见CW-052：自动表格恢复、CSV底部唯一、read_result不新建卡和同ID去重；产出行为从23增至31项。此前工作台批次没有统一tabs；当前统一结果区已在本页最新增量中实现并验证，标准分页数据表仍保留。

最终无模型浏览器使用独立 `/tmp/codex-analysis-final-browser-20261027/`；只创建真实拒绝连接的本机MySQL，不伪造成功库响应。网络异常只中断一次浏览器请求，重试读取实际后端；显式原生事件／transcript夹具不代表模型或查询成功。4个自有会话和失败连接清理，MCP／provider配置保持。此前中间服务的技能状态也已恢复，测试MCP移除；不读取旧业务历史或凭据。

原生无模型当前回合自主改mode入口。最小Web配套只在Default模型以严格整块proposed_plan提出方案并真实成功完成后，通过公开设置接口等通知进入后续Plan讨论；不把此前Default过程标为Plan，无新模型回合或自研循环；历史／失败／中断不触发，等待阻止竞争，失败保留方案。此协议配套与真实模型是否遵循格式分别验证。

报告仅导出本条完成回答和同轮已加载结果编号，不含PDF／Word、完整模板或逐句审计。当前服务快照总表明确包含其他分析，不声称多租户隔离；本批真实模型业务回归限独立只读PostgreSQL与Flash，其他引擎／生产远端未重新验收，也不承诺所有意图分类必然正确；多租户未实现。手机及严格国际出口按用户要求不做。没有新增业务Skills，保留四个源码自带技能；Skills／MCP和数据源可由当前实例用户配置启停。root随后停止18872测试服务并移除本轮自有PG容器，未停止用户服务；模型summary中的runtime/container交接记录反映交给root时状态，清理在交接后完成。

## 前一批次（历史）：精简斜杠菜单与计划开关（2026-10-27）

> 下方两项菜单及底部新建聊天为前批历史。现行仅 `/plan`，新分析统一入口，计划状态及退出按钮可见；本节开关形态属于中间历史。


本轮按用户最新要求把 `/` 菜单和分发限制为 `/init /goal`，聊天改为输入框下方“新建聊天”按钮，计划模式使用显式开关，移除 `/plan` 及带需求形式的快捷触发。压缩继续按设置自动运行，技能页、MCP、模型/权限控件和原生能力保留。本轮起始提交为 `672a96012fefe027fccd53a0ea45522dcba5becd`；下方旧菜单及旧计划命令通过数均属于历史，不能代替本轮验收。

| 验证类别 | 本轮实际结果 |
|---|---|
| 修前菜单复现 | [browser/baseline/results.json](test-results/composer-scope-2026-10-27/browser/baseline/results.json)保留按新合约检查旧菜单的预期失败：仍为17项而非2项，且读取技能列表。不是成功测试，0模型 |
| 菜单及命令分发行为 | [state/results.json](test-results/composer-scope-2026-10-27/state/results.json)及results.tap：35/35（计划/入口28、批准草稿7），生产函数配受控传输夹具，0模型/浏览器/原生运行。覆盖旧命令拒绝、草稿/附件保持、所选mode提交、设置等待/失败和异步导航，不冒充真实集成 |
| 真实浏览器与原生设置 | [browser/results.json](test-results/composer-scope-2026-10-27/browser/results.json)：12/12、0turn/start、0页面错误。菜单精确2项、不读取技能目录；点击/Tab只填入，发送初始化和目标分别打开对应弹窗后取消，未生成文件或goal/set。24条旧命令尝试含 `/chat /plan` 参数形式全部零能力调用且草稿保持，带附件另测保持。输入框下方“新建聊天”不关联项目、保留cwd，可同时开启计划；计划开关新草稿不发RPC，已有会话收到真实plan/default设置事件；延迟真实ACK保持等待防重和新输入，真实非法thread拒绝不假成功且重试成功。仅本轮自有3个记录，全部清理、配置未改 |
| 桌面截图 | 1440×960及1024×768菜单和下方控件均无溢出，switch状态可识别；两张截图已实际查看，见[visual-review.json](test-results/composer-scope-2026-10-27/browser/visual-review.json)。不包含手机端，不以截图代替原生状态检查 |
| DeepSeek Flash真实任务 | 本轮未调用模型，不复用前批 `/plan` 5/5。当前provider/model设置可从原生事件核对为deepseek/deepseek-flash；实际初始化调查与写AGENTS、启动目标、模型生成计划/批准执行和自动压缩阈值触发均未在本轮重测 |
| 工程及相邻回归 | [engineering/results.json](test-results/composer-scope-2026-10-27/engineering/results.json)：78份JS/MJS语法、36份Python AST通过；58/58相邻行为（入口/计划28、批准草稿7、模式恢复2、上下文6、权限15）。其中含上述状态35，不相加。原生[source完整性](test-results/composer-scope-2026-10-27/engineering/native-integrity.txt)确认源码pristine、176/176方法和完整schema匹配；diff检查通过。首次57/58为旧权限夹具期待只读 `/export` 的失效合约，改为拒绝且归档不显示停止后58/58；`behavior-before.txt`、`results-before.json`保留原失败 |

初始化指令已沿 `/api/init-prompt` 核对为锁定源码 `upstream/codex-rs/tui/assets/prompt_for_init_command.md`：当前目录已有AGENTS.md时不覆盖、不修改。计划开启时弹窗增加“先生成计划，确认后才写”说明；此最后文案经过语法检查，前述浏览器是在加入该提示前完成，不宣称该文字已截图复验。完整模型初始化未执行。后端未改，未重跑72项完整Python套件，未重编译Codex核心。

不修改原生源码、发行包或代理循环，不读取旧用户会话或凭据。手机端及严格国际出口检查仍取消。项目无前端打包或TypeScript；未执行的构建、完整后端套件或模型流程均不能标记通过。

## 前一批次（历史）：计划模式输入与退出（2026-10-27）

> 本节是前批 `/plan` 实现及真实结果；当前已恢复唯一 `/plan`，具体布局及本轮衔接验证以上方最新记录为准，历史数字不计入本轮。

修复`/plan`进入后无说明、重复命令反向退出，以及`/plan 具体需求`没有请求原生plan的问题。进入模式、向模型发任务和退出模式分别验证。仅在独立`/tmp`原生配置/工作区使用本轮新建合成数据；模型仅DeepSeek Flash，没有读取已有用户历史或凭据，没有修改原生源码、程序或代理循环。

| 验证 | 实际结果与证据 |
|---|---|
| 修前原问题复现 | [baseline-final/results.json](test-results/plan-command-2026-10-27/baseline-final/results.json)：3/3按缺陷预期复现，新会话手输、菜单选择及已有会话均已进入plan却无下一步提示，0模型；不是模型鉴权/请求失败。较早夹具首次运行及失败保留在baseline目录 |
| 生产函数的状态/协议夹具 | [state/summary.json](test-results/plan-command-2026-10-27/state/summary.json)：最终20/20、0模型/浏览器/原生运行；真实生产函数配受控传输/设置事件，不冒充真实协议集成。修前19项中11失败；初修19/19后新增迟到回执误toast到新会话用例先失败，修复同会话/导航代次/草稿归属后20/20。覆盖幂等、prefix输入与plan参数、运行中拒steer、错误/附件/草稿/导航保护 |
| 无模型真实浏览器及原生设置 | [browser/final/results.json](test-results/plan-command-2026-10-27/browser/final/results.json)：9/9、0turn/start及0浏览器错误。bare与菜单仅进入、重复不退出、已有会话真实settings/update和通知、模式按钮明确退出、等待防重与新输入保留、原生非法线程拒绝后保留输入并成功重试、晚到不改新会话、归档及另一连接writer占用只读；自有存储夹具清理。响应门只延迟真实回复，不伪造成功 |
| 相邻模式恢复真实浏览器 | [mode-recovery/results.json](test-results/plan-command-2026-10-27/mode-recovery/results.json)：2/2、0模型、0页面错误。真实旧resume回复晚到不覆盖新导航default；[fixture-provenance.json](test-results/plan-command-2026-10-27/mode-recovery/fixture-provenance.json)记录本次新建user-only源与全部3个自有会话清理，未读取旧用户历史。runner通用scope中的existing source特指该新建源 |
| DeepSeek Flash真实计划与退出 | [flash/results.json](test-results/plan-command-2026-10-27/flash/results.json)：5/5，普通turn/start恰好2，0浏览器错误。单独/plan零任务且持续提示；其后自然语言和已有默认会话/plan需求各真实完成原生plan item，显示待确认卡片；请求mode=plan、模型deepseek-flash、provider=deepseek，第二条input无命令前缀。未调用工具、未执行计划，自有哨兵文件不变；两次按钮退出均由真实default设置事件确认，0额外模型任务；自有线程和目录清理 |
| 桌面截图 | 最终无模型浏览器的进入/退出/归档状态截图及Flash四张截图单独保留；模式反馈与按钮布局不作为模型成功的替代证据 |
| 工程及相邻回归 | [engineering/results.json](test-results/plan-command-2026-10-27/engineering/results.json)：77个JS/MJS语法检查、36个Python AST检查通过；50项状态/行为回归通过（计划输入20、计划批准提交7、模式恢复2、上下文恢复6、权限15）。原生完整性检查确认源码未修改、176项接口及完整schema匹配；git diff --check通过 |

本轮仅验证通过模式按钮退出；计划卡“确认 / 修改后执行”在现有实现中会切默认模式后提交任务，其真实批准执行属于前批记录，本轮未重复，不累计为新增通过。计划模式允许原生只读调查，工具审批仍按当前权限策略；切默认模式本身不会自动执行已有计划，也没有新增`/default`命令。手机端和严格国际出口检查保持取消。

本轮静态、相邻行为和原生完整性见独立工程记录；未重跑完整72项Python后端套件，历史结果不代替本轮执行。项目没有前端打包或TypeScript，构建及类型检查不适用；未重编译Codex核心。

## 前一批次（历史）：输入框会话命令与占用删除（2026-10-27）

> 下述五项会话斜杠入口现已移除；历史测试保留，原生能力仍在，不能将这些通过数算为本轮入口验收。

侧栏右键/“…”只保留重命名、归档/恢复、永久删除；输入框新增 `/compact /fork /export /review /rollback`，点击或Tab仅填入，发送才执行。沿用现有threadAction→原生接口，不新增代理循环，不改变原生自动压缩。仅使用deepseek-flash，新合成数据及独立 `/tmp` Git 工作区；没有读取旧会话、凭据或修改全局配置。

| 验证 | 实际结果与证据 |
|---|---|
| 无模型侧栏管理 | [sidebar-final/results.json](test-results/composer-thread-commands-2026-10-27/sidebar-final/results.json)：10/10，0turn/start、0浏览器错误。仅管理入口、目标ID绑定、非当前草稿/附件/目录保持，真实重命名/归档/恢复/删除、确认防重、键盘/焦点/桌面边界；自有存储夹具清理 |
| 无模型输入框命令及只读保护 | [composer-final/results.json](test-results/composer-thread-commands-2026-10-27/composer-final/results.json)：10/10，0turn/start、0浏览器错误。选择零执行；无会话/带附件/真实在途操作失败保留输入，原生export/fork及迟到响应不抢导航，真正另一页面writer占用时/export下载等于native，普通任务和执行命令仍拒绝；三桌面尺寸及中文输入法通过 |
| 新合成Flash历史相邻回归 | [synthetic-history-final/results.json](test-results/composer-thread-commands-2026-10-27/synthetic-history-final/results.json)：4/4，1个全新合成普通Flash回合、无工具。非空导出与native一致，回退读取/结果被真实响应门延迟时不覆盖新对话框或导航，源历史保持；自有会话清理。以上三组[汇总](test-results/composer-thread-commands-2026-10-27/summary.json)共24项，不能称全部零模型 |
| 五命令完整Flash真实链 | [flash/results.json](test-results/session-actions-2026-10-27/flash/results.json)：最终6/6、0浏览器错误。新seed非空历史且无工具；5项选择零执行；/compact收到真实contextCompaction item/completed且任务结束；/review原生uncommittedChanges审查完成并指出测试代码ZeroDivisionError；/fork继承全部turn，/export下载含用户/助手且严格等于fork原生分页结果；/rollback确认前无revert，确认后fork由4回合变0，源会话和磁盘文件未变。最终普通turn/start、compact、review各1次；本地命令未增加普通turn/start；自有数据全部清理 |
| 占用删除原生行为 | [native-writer-probe.json](test-results/session-actions-2026-10-27/native-writer-probe.json)：两个未修改原生进程+新独立存储，0模型；另一进程resume/delete/archive均被active writer拒绝；持有方自行删除成功，另一场景持有方退出后观察方删除成功。不是“前端放开即可跨进程删”，不绕过写入锁 |
| 占用删除界面及原地重试 | [busy-delete/results.json](test-results/session-actions-2026-10-27/busy-delete/results.json)：5/5，0模型、0浏览器错误；真实两页面写入占用，删除可打开说明、取消0RPC；确认1RPC被原生拒绝，弹窗持久显示未删除/原因，原历史和owner草稿保持，未中断owner；只关闭测试自有owner后，同弹窗1次重试删除成功，无须observer恢复会话，自有数据清理 |
| 权限及归档相邻浏览器 | [adjacent-permissions](test-results/session-actions-2026-10-27/adjacent-permissions/results.json)：9通过、1个已验证模型项明确跳过；[adjacent-archive](test-results/session-actions-2026-10-27/adjacent-archive/results.json)：10通过、1个旧source历史项明确跳过。两组均0模型、0浏览器错误，各3个自有seed清理，全局配置SHA不变；跳过项不计通过 |
| 相邻状态单元 | 批准草稿7/7、权限15/15、上下文恢复6/6、模式2/2，共30项通过；另补归档/占用状态残留activeTurns不误显示停止；不替代真实模型或写入锁验证 |
| 本批最终工程检查 | [engineering/results.json](test-results/session-actions-2026-10-27/engineering/results.json)：74份JS/MJS语法、36份Python AST、diff均通过，0语法错误；[behavior.txt](test-results/session-actions-2026-10-27/engineering/behavior.txt)30项通过；[native-integrity.txt](test-results/session-actions-2026-10-27/engineering/native-integrity.txt)pristine=true、176/176方法完整Schema匹配。没有重编译核心，没有前端打包或TypeScript；本批未重跑完整72项Python后端套件，上一批结果仅作历史 |

[Flash各次执行](test-results/session-actions-2026-10-27/flash/attempt-summary.json)保留原始失败：18866起初离线，0模型/原生请求；首次真实流程4通过、1个脚本断言失败，源/分叉原生索引对review父/内部turn排序不同。修正继承比较为按turn ID逐条核对完整字段，导出仍逐项等于fork自身原生顺序，随后6/6通过；未改模型或产品数据。两次真实运行普通任务/手动压缩/审查请求累计各2，另外的新合成历史专项另1次普通seed；内部模型HTTP请求没有独立计数。

无模型入口组的首轮夹具问题也保留于其汇总：独立服务未启动、用例迁移漏显式切回最近范围、等待action解锁却未等待原composer.pending结束。均修正测试前提再重跑，不当作产品成功或覆盖原失败。最终完成3张压缩/审查/回退截图、输入框和侧栏桌面截图与功能结果分开记录；已归档和writer占用会话只可/export，普通聊天及执行命令受原生和前端守卫限制，权限入口仍禁用。手机端、严格国际出口检查按用户要求不做；未获得原生桌面右键菜单的精确条目参考，不声称完全一致。

## 前一批次（历史）：侧栏菜单与输入框Agent权限（2026-10-27）

本批在18866独立原生配置及测试工作区执行，只使用`deepseek-flash`，不读取密钥或ChatGPT授权，不修改Codex源码、发行程序或代理循环。实际浏览器、真实原生存储/事件、受控交付顺序以及模型工作流分别报告。

| 验证 | 实际结果与证据 |
|---|---|
| 侧栏会话右键/省略号菜单 | [context-menu/results.json](test-results/sidebar-menu-2026-10-27/context-menu/results.json)：12/12，0模型提交、0浏览器错误；非当前目标ID、项目/模型/草稿/附件保持，键盘和焦点，真实重命名/归档/恢复/删除/分叉及重复确认仅1RPC；1024/1280/1440与深色菜单不越界。此组用户消息夹具的导出为空turns，不作为非空历史导出证据 |
| 迁移后的归档相邻流程 | [archive/summary.json](test-results/session-menu-2026-10-27/archive/summary.json)：11/11，0新模型、0浏览器错误；最近/已归档、原生归档文件保留、恢复、拒绝/取消/成功永久删除、搜索/刷新/范围晚到、已有独立Flash历史分叉内容保持，源SHA不变；自有夹具清理 |
| 新建合成真实历史的导出与回退 | [synthetic-history/results.json](test-results/sidebar-menu-2026-10-27/synthetic-history/results.json)：4/4、0浏览器错误；仅本轮新夹具调用1次Flash并回复SIDEBAR_EXPORT_FIXTURE_OK，无工具。非当前分叉导出含真实用户/助手且与native read一致；延迟真实历史读取不覆盖新重命名框，延迟已确认revert不抢新导航，只删除目标回合；菜单本身0模型提交、自有seed/fork清理 |
| 输入框权限入口及原生状态 | [browser/summary.json](test-results/composer-permissions-2026-10-27/browser/summary.json)：8/8、0浏览器错误；实际三档快照、取消0RPC、受控pre-wire失败保留草稿、真实空ACK后等待真实通知、A/B迟到隔离、加载/归档禁用、自定义只读不假标、新草稿选择保持。仅1次普通Flash，原生start配置与所选auto一致、运行中入口禁用；全局配置SHA一致、自有会话清理 |
| 权限三档真实工作流 | [首轮](test-results/composer-permissions-2026-10-27/flash/results.json)2通过1测试失败，3个新父回合：auto原生审核approved→exit0/stdout，full无审批/审核→实际文件/stdout→恢复ask；ask已出现真实审批，但测试误等完成历史数组中的“开始”，30秒后清理中断，未计拒绝通过。[增量](test-results/composer-permissions-2026-10-27/flash-ask-followup/results.json)2/2：ask实际点击拒绝发decline、文件不存在、回答说明拒绝；筛选文字重叠多跑的full也通过。合计5父回合，0浏览器错误、自有会话/目录全清理；三模式有效覆盖齐全，不称单次3/3。现提供PERMISSION_MODES=ask精确补验 |
| 新增权限边界协议/状态回归 | [after-review/summary.json](test-results/composer-permissions-2026-10-27/browser/final-review/summary.json)：9通过、1明确跳过（此前新草稿真实Flash用例不重复），0模型、0浏览器错误、3个自有seed清理、配置SHA不变。真实通知先于被延迟ACK仍能结束确认；原生resume快照可结束等待，释放旧通知不重开pending；原有7组协议/界面相邻用例复验。ask↔auto实际请求不含sandboxPolicy，保留既有原生配置来源；没有单独展示或逐项测试命名profile |
| 权限桌面布局 | [layout/summary.json](test-results/composer-permissions-2026-10-27/layout/summary.json)：1024/1280/1440 × 明暗主题共6/6，输入框内权限按钮、发送按钮及选择框均未溢出；12张截图实际查看。仅预选新草稿模式，不创建会话、不发送任务、不写全局配置 |
| 本批单元、静态及核心完整性 | [engineering/results.json](test-results/composer-permissions-2026-10-27/engineering/results.json)：权限状态14/14、模式2/2、批准草稿7/7、上下文恢复6/6，进度13个状态用例通过（node:test包装计1个脚本）；JS/MJS语法71份、Python AST36份、diff通过。原生pristine=true、176/176方法完整Schema匹配，无上游/原生重编译。没有前端打包或TypeScript，构建/类型检查不适用；本轮未重跑72项完整Python后端套件 |

权限状态14项为确定性单元夹具，覆盖JSON字段顺序、通知/ACK顺序与计时清理、resume确认、错线程、超时、断线、原生拒绝分支、新会话权限不符阻发及未确认时保留停止能力；另验证命令仍在回收时禁改权限、新默认值更新不改已有会话。初次仅最小DOM夹具漏dataset，修测试夹具后通过；单元构造的失败不冒充真实模型或服务器拒绝。

模型计数分开：菜单合成夹具1个父回合、权限界面1个父回合、权限三模式5个父回合；原生审核内部模型调用另计，未独立抓取出站HTTP请求体。“帮我批准”使用原生风险评估而非无条件放行，不要求ChatGPT登录；完全访问不提供多租户隔离。

原始失败均保留：菜单最初的空预览用户夹具未被native list发现、空布局不构成滚动条件、归档搜索输入scroll误关菜单（真实产品Bug）、后续冗余scrollIntoView遇真实重绘脱离，以及权限ask等待条件错误。旧历史导出增强曾被自动审批拒绝而未执行，改用本轮新建合成Flash夹具完成安全替代，不将未执行路径计通过。当前桌面右键菜单的实际条目和顺序尚无截图；已检查网页桌面尺寸，不能据此宣称与桌面产品精确一致。手机端和严格国际出口测试保持取消。

## 前一批次（历史）：历史、归档删除及进度可见性

证据目录：`test-results/history-usability-2026-10-26/`。仅deepseek-flash，未改原生内核。日常实例8765只检查启动和元数据，不恢复或执行用户任务；完整新后端18868使用独立配置和工作区。

| 验证 | 实际结果 |
|---|---|
| 日常启动前后 | performance/summary.json：原initialize6.59–9.28秒，正常浏览器新连接455/826ms；页面与40条会话列表1.73/2.65秒（原7.64–10.43秒）。只改原生ephemeral配置，私有备份、授权文件/历史和其他配置保留，旧连接未终止 |
| 最近页与更早历史 | performance/after-final/history-loading-results.json：6/6，真实原生3回合42item样本合法limit1，顺序/去重/锚点/晚到导航/刷新通过，0模型/配置写；不存在>20样本压力验收，原生与前端耗时分开保存 |
| 归档与真正删除 | archive/summary.json：11/11，1440/1024；真实归档、恢复、取消/拒绝/成功删除、草稿隔离、刷新、搜索、范围竞态，以及真实原生非法参数失败/重试。0模型，另真实Flash历史归档/刷新/恢复全文一致，源SHA不变，临时历史全部清理 |
| 进度真实模型工作流 | progress/flash-final-backend/results.json：3/3，实际Flash计划→编辑批准→原生update_plan→真实只读文件/计算17+23+41=81，执行1/3、完成3/3；专属线程和文件清理，全局配置不变 |
| 进度界面与状态 | progress/ui-final-backend/results.json：12/12合成通知UI测试；progress单测13/13。明确与真实模型结果分开，覆盖审批/中断/失败/断线/缓存恢复/焦点/历史滚动/小桌面宽度 |
| 状态相邻回归 | behavior-units.txt：上下文恢复6、模式顺序2、批准草稿7、目标16、上下文计算12、进度状态13逐组通过；上下文真实只读普通与轻量恢复4/4、0模型，context/context-readonly-results.json |
| 语法及核心完整性 | static.json：68份JS/MJS、36份Python语法与diff通过；native-integrity.json：pristine=true，176方法完整Schema一致。无前端打包/TypeScript，构建及类型检查不适用。桌面真实截图已查看，截图不替代功能验证 |
| 完整Python与传输 | python.txt：72/72，含真实原生浏览器、raw WebSocket范围、SQL校验及新ephemeral配置保护 |

持久认证A/B对照因可能触发账号刷新被自动审批拒绝，未执行。改用受支持ephemeral且不读取持久登录态的路径，随后日常正常浏览器同路径复验支持修复效果。性能小样本及合成事件覆盖不推论任意长历史/任意任务均可见进度。

## 前一批次（历史）：剩余问题修复、入口隐藏与卸载验收

本批只用deepseek-flash。最终独立实例18866，CODEX_HOME和工作区在`/tmp/codex-web-final-fixes/`；未修改Codex源码、发行程序或代理循环。以下结果与历史原始失败分别保存，未把代码修改直接算测试通过。

| 验证 | 真实结果 / 证据（final-fixes-2026-10-26/） |
|---|---|
| 完整Python/原生/传输 | 70/70通过，checks/python-final-database.txt；首次旧测试按目录名audit拦截已保留，改为显式独立目录精确匹配后重跑 |
| 生成模型能力目录 | 两项回归包含于70项；实际重新初始化目录选V1，未改用户config主模型 |
| 审查→委派原组合 | 2/2通过，review-worker/final/combined-results.json；真实父子V1/明文任务/唯一token/51/只读；原V2及其他失败对照均留证 |
| 旧未见分叉 | 23项回归；修复前漏项复现、修复后同步骤5/5，forks/implementation-evidence.json；源数据库/历史未被补发现改写 |
| 目标独立观测 | 16项行为回归+真实Flash6/6，goal/summary.json；原生0 vs观测1625、刷新去重、目标/会话隔离、未知与下界 |
| 插件入口与卸载核查 | visibility与previous-test-cleanup各6/6，三个桌面尺寸；12项命令、隐藏入口/旧命令不误发、Playwright与测试MCP未安装 |
| 相邻审批/停止/恢复 | 4/4通过，adjacent/results.json；拒绝未写文件、允许实际写入、原生interrupt+进程回收、刷新/断线不重复提交 |
| 上下文占用核验/分页恢复 | context/summary.json：真实10534/1048576→1.0%，非累计20976；12项计算+4项事件顺序单测，普通/分页打开刷新4/4且0模型请求/配置写。真实分页前丢统计、修复后恢复；目录窗口不匹配保护由源码及单测验证 |
| 计划批准与未发送草稿 | database-agent/approved-plan-unit.txt：7/7行为回归；真实数据库run1复现丢失、run2实际保留且不夹带；普通聊天相邻11/11，chat-after-plan-fix/results.json（含真实Flash错误重试和模型配置恢复） |
| 同一提示多个数据库问题 | database-multiquestion/results.json：普通聊天一轮三个问题1/1通过；3条真实只读SQL合批、3次结果读取，逐项与独立SQL吻合，数据/全局配置不变，浏览器错误0；连接明确指定，首次别名歧义驱动失败保留 |
| 真实复杂数据库Agent流程 | database-agent/run3/workflow-results.json：6/6、浏览器错误0；原生Plan仅查结构→编辑批准→首Q1完成→Q2待审批时真实interrupt且未执行→改门店1/活跃Top2继续→复用首结果+剩余查询→原生步骤与最终三问答案对应，独立SQL/数据指纹/配置哈希核对。此轮旧MCP误拒DATE_FORMAT一次，模型说明后以已固定月份常量恢复；不称每条SQL首次成功 |
| SQL安全校验修复 | database-sql-guard/unit-tests.txt：13/13，已含在70项；sqlglot30.24.0真实Sakila适配器AND+CASE+DATE_FORMAT聚合与OR查询成功。危险函数/写入/锁定/导出/越权仍拒绝；最新进程前端→Flash→原生MCP→Sakila另3/3通过，browser/results.json：两条原SQL/结果均匹配独立基准，0错误/改写绕过，配置/数据不变 |
| 计划模式恢复顺序 | mode-recovery/after/results.json：真实原生、零模型2/2；修复前晚到旧plan覆盖default已复现。顺序回归2/2，连草稿7/上下文4共13项，相邻unit日志；不修改源历史/全局配置 |
| 语法、diff与桌面截图 | checks/static.json：63份JS/MJS、36份Python语法通过，git diff --check通过；本项目无打包/TypeScript。实际查看计划、最终结果及原SQL修复截图；run3首张完成截图保留历史滚动位置，另用零模型只读恢复拍最终三张表，不冒充新浏览器恢复瞬时步骤进度 |
| 核心完整性 | checks/native-integrity.json：pristine=true，176方法完整Schema一致；构建/TypeScript不适用，语法检查另记 |

边界：计划确认是原生计划模式中的用户交互，普通只读工具不是天然必须逐条审批；本次为测试线程显式配置query_database原生审批。停止是turn/interrupt，修改继续为携带历史的新回合，不是SQL事务断点。进度为真实模型步骤事件，不是数据库内部百分比。原生V2历史不能由公开接口迁移，委派需新会话；网页真实观测没有伪写原生预算或保证硬费用上限。代表性远端插件额外true的模型指令风险保留，测试资源已卸载。手机端和严格国际出口测试按用户要求不做。

## 前一批次（历史）：Flash 与原生 Skill 范围调整后的实际复验

本节为最新状态，后文 ChatGPT/Pro/反馈/自定义 Skill 记录均属于历史。最新用户范围仅使用 deepseek-flash 验证；ChatGPT 模型和强账号入口、反馈、快速、生图及非原生技能已从当前产品入口移除。上游源码及原生程序未修改。配置、文件和命令实验均在独立测试工作区完成。

最终完整后端实例：`127.0.0.1:8789`，`CODEX_HOME=/tmp/codex-web-flash-final-audit/home`，工作区为其兄弟 `workspace`。通过标准启动器 getpass 使用已授权凭据，密钥未落盘，未复制 ChatGPT 授权；移除代理后直连官方 DeepSeek。此前实例8785用于增量流程，8787专用于四库，8788无模型密钥用于协议/存储。没有宿主出口防火墙，不能称所有生产依赖均已通过国际出口阻断。

| 验证类型 | 实际结果与证据 |
|---|---|
| 必要Python与原生/传输 | 最终50/50，含真实浏览器原生与raw WebSocket范围检查；python-final.txt |
| 13个保留的 / 命令 | 每个命令真实选中、发送并执行；14组有效用例通过，menu-coverage.json。完整阶段13/14中的初始化审批驱动缺口经增量3/3补验，不声称单次干净全跑 |
| 聊天状态、草稿、滚动、中文输入、Flash实际模型及工具 | 11组通过，chat/results.json；负向用不存在模型触发真实错误，不验证其他可用模型，也不静默fallback |
| 历史/连接/审批关联竞态 | 3组通过，connection/results.json |
| 审批、停止、并发、刷新与断线 | 6组通过，native/results.json；最终完整版本另复测允许/拒绝/回收/刷新4组及Flash实际命令1组 |
| 空预览分叉发现 | 6组通过，真实跨刷新、跨browsercontext、搜索、归档/恢复/删除和晚到响应；fork-browser-results.json |
| 队列、分组、附件存储 | 3组通过，原生CRUD/分页/排序/刷新/隔离/归档过滤；native-storage-results.json。另2组Flash队列自动消费及忙碌拒绝→停止→手动启动真实通过，native-queue-flash-results.json |
| 四个保留原生Skill | 来源/哈希与真实Flash调用5组通过，skills-run/results.json；不是测试额外自建marker Skill |
| Guardian | 真实允许/拒绝/确认2组通过，skills-guardian-run/results.json。审核模型依据目录/显式配置/原生回退源码核实，不伪称抓取过独立HTTP请求体 |
| 记忆 | 原生笔记新增/读/搜1组通过；自然一小时后另有6条真实stage1提取、v2合并及3583字符摘要原生读回，v2Ready=true，skills-memory-auto-final/results.json；此前时间条件阻塞报告保留 |
| 手动/自动压缩 | 手动1组、自动及恢复2组通过，menu-compaction-*.json；临时阈值20,000，真实31,554→27,493、续聊标记正确、阈值已恢复；未消耗默认734,003阈值冒充实测 |
| HTTP MCP/OAuth | 本机真实HTTP、PKCE、Flash工具、超时、断连6组通过，oauth-final/oauth-results.json；真实资源目录为空，不宣称资源内容或所有生产OAuth已验 |
| 真实远端MCP | 24好玩公开匿名HTTP服务，原生8工具/1资源；Flash真实搜索及详情、启停及清理4项增量通过。HTTP429原始失败和恢复记录保留，不等同一轮全绿；mainland-services-2026-10-26/mcp/coverage-summary.json |
| 真实远端来源插件包 | GitCode固定版本Playwright插件远程原生市场生命周期通过；Node/Chrome及Git缓存重置的原始失败保留。原生local市场配置副本下Flash实际4次浏览器工具调用、读取唯一标记/标题通过；额外true命令使仅MCP约束失败，不能标整轮通过。配置/卸载/清理分开记录，mainland-services-2026-10-26/plugin/coverage-summary.json |
| 四库/跨库范围/只读/图表 | 有效11项通过，database-coverage.json，保留分组增量来源和失败记录；MySQL/PostgreSQL/ClickHouse/Elasticsearch均真实读取，Flash实际查询并出图 |
| 原生Hooks | 线程级5项声明和原生哈希信任，真实SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop日志与文件通过；有效全局配置及config.toml哈希不变；hooks-current/hooks-results.json |
| 原生审查/子代理 | review/start显式Flash发现真实缺陷；独立只读worker实际求和并核对child Flash身份。首轮审查后委派组合180秒超时未定位，未取得原始child结果，不能认定串线或称修复；见native-review-worker-evidence-summary.json |
| 静态/构建/截图/源程序 | JS/Python语法和diff分别见static-checks.json；无前端打包/TypeScript，构建及类型检查不适用。实际浏览器截图不替代功能验证。源码pristine，176项完整Schema与原生相同，native-integrity.json |

本批新增根因修复：目标暂停/移除必须先完成真实工具中断输出，再写目标状态，避免Flash拒绝调用/输出间插入用户消息；MCP授权helper误随账号清理删除，已恢复独立服务授权、原生完成/超时反馈。两项失败及修复后原步骤均保留，不吞错误或伪造工具结果。

测试前置错误也保留：过时的“必须存在ChatGPT/只一个模型选项”断言、已配置参考库遗留导致的负向用例条件不成立、目录重名、Node路径缺失、初始化真实审批未被驱动处理，以及Hooks对象键顺序比较。修正测试条件后只按实际重跑结果更新有效覆盖，不把原失败直接改成通过。

范围校验不是租户/命令/网络沙箱；从未被Web见过的旧隐藏fork仍不能全局发现；目标首回合tokensUsed可能0；官方在线文档、GitHub安装、尚未验收的实际远端扩展配置和平台组合仍未验证。严格国际出口阻断测试已按用户要求取消，未计为测试通过；已完成24好玩远端MCP和Playwright真实插件包代表验收；插件运行需本地配置副本，纯MCP约束仍失败，其他服务不泛化。实时语音缺可用Flash服务配置，启动明确拒绝。历史私有云测试插件没有新的清理成功证据，本轮不调用ChatGPT重试。

本轮汇总、原始报告、失败和SHA-256索引在 [flash-followup-2026-10-26](test-results/flash-followup-2026-10-26/summary.json)。各组有重叠，不求和冒充一次全能力验收。

## 以下为前轮历史验收记录


验收日期：2026-10-25。官方源码基线：`970111f6cb62cc02fe36a82ea7d71b37a2889c97`。已重新获取官方 HEAD，确认仍为此提交。上游源码、未跟踪文件和忽略文件检查均干净；CLI、Code Mode Host、Linux bwrap 与 ripgrep 使用完整原生包布局。源码和执行程序导出的四组完整协议定义一致，共 176 个客户端方法。源码内版本号为 `0.0.0`，通过提交号和构建哈希标识实际版本，没有修改上游版本号。


## 上下文口径与原生功能入口（2026-10-26）

完成 11 项功能专项，另实际验证自动压缩、新对话计划模式、持续目标自动完成及数据库图表回归；所有模型、命令和原生功能请求均从桌面网页控件发起。反馈仅保存本地，未执行用户已拒绝的上传。浏览器 JavaScript 错误为 0。详见 [功能记录](test-results/native-ui/results.json)、[自动压缩](test-results/native-ui/compaction.json)、[目标完成](test-results/native-ui/goal-complete.json)、[查询与图表](test-results/native-ui/database-regression.json)。

- 当前保留上下文以最近完整请求统计为准，累计消耗不参与占比。两轮实际请求验证保留历史、分子替换、完整 1M 分母和刷新恢复；新对话圆环隐藏。旧数据库图表会话 66,233 tokens 原先除以 996,147 显示约 6.6%，改为除以 1,048,576 后约 6.3%。系统/开发指令、技能及工具定义也占窗口，不能按对话轮数推断占用。
- 独立验收配置通过网页临时设为 60,000 tokens，实际到达 69,979 后原生自动压缩，重算估计 25,052；没有调用手动压缩接口。下一轮保留“银杏”标记，刷新正常。随后通过网页移除测试阈值；日常目录的 Flash/Pro 均为 734,003，网页按 total 范围启用原生回合结束检查。70% 配置和源码边界已核对，没有声称实际消耗 734,003 tokens 完成验收。
- 原生 Plan 模式实际生成建议计划，刷新保留；用户编辑并确认后在同一聊天执行，原生 update_plan 显示 2/2；中断等待命令后清单显示已停止。新对话预选 Plan 不会在创建会话时丢失。普通 update_plan 清单不会自动阻塞等待计划确认，工具审批仍由原生策略决定。进度来自模型报告，同一浏览器缓存最近 50 个有清单的回合；原生历史 API 不重放这些瞬时清单事件，其他浏览器没有该缓存时不伪造历史进度。
- 初始化使用源码中的官方提示实际创建 AGENTS.md，第二次执行保持文件字节不变。原生项目创建、编辑、关联/解除、项目内新对话、普通聊天及删除分组均已执行，不删除会话或磁盘文件。
- 目标设置、暂停并中断、继续、移除，以及模型调用原生工具标记完成和刷新持久化均已验证；开始和继续会继承输入框选定模型与推理，实际验证 low 设置。发现原生 `ext/goal/src/extension.rs` 在新会话首回合缺少 token baseline 时跳过目标计数，短目标完成后可能报告 0；网页保留真实返回并说明，不修改上游。原生目标预算按未缓存输入加输出计算，与上下文百分比不同。
- ChatGPT `priority` 档位实际启用、模型真实回复、刷新保留、恢复原生标准 `default`；DeepSeek 隐藏入口。不复制模型/推理控件。状态展示实际模型、提供方、权限和上下文，DeepSeek 不混用 ChatGPT 额度。反馈本地 ZIP 保存成功，上传按用户要求未验收。画草图画布无对应开源实现，未添加虚假入口。
- 实际重新配置专用只读 Sakila，DeepSeek 经原生 MCP 查询电影分级数量并生成 ECharts；图表独立于折叠的执行过程，完整窗口仍为 1,048,576。六个管理页、文件浏览、隐藏 CLI 与桌面布局回归通过，无横向溢出。
- 工程检查 19 项通过；另外三个可选原生集成用例通过真实网页补跑，共 22 项。上游仍干净，四组完整协议匹配，176/176 客户端方法保留。没有修改任何 upstream 文件或原始账号认证。
- 日常服务已在用户明确确认任务结束并授权后重启，备份位于 `.local-state/acceptance/deployment-backups/20261026T031536Z`。从 8765 实际发出 DeepSeek 请求，统计为 60,276 / 1,048,576（5.7%），新对话隐藏圆环、菜单、刷新和两个 DeepSeek 模型的 734,003 阈值均已复核；仅归档本次自建测试聊天，没有改写那 5 条历史遗留 inProgress 状态。[日常回执](test-results/native-ui/live.json)



## 技能自动调用、中文管理与 MCP 渐进加载（2026-10-25）

按用户最新要求调整技能和 MCP 界面，完成 11 项专项与 6 项桌面回归，共 17 项真实网页检查；浏览器 JavaScript 错误为 0。另从日常网页只读复查首屏与布局，并通过原生界面停用用户不需要的三项 pets 技能。没有重启日常服务，没有修改用户已有会话。

- MCP 原入口等待完整 `mcpServerStatus/list` 后才绘制页面，包含启动连接、认证、工具和资源发现；技能列表主要读取本地元数据。改为先显示页面和配置，后台读取 `toolsAndAuthOnly` 目录；完整资源点击详情时按需获取。同一连接下 30 秒缓存、手动刷新和配置变更失效均已实测。4 秒启动延迟的真实 stdio 服务连接时，页面和配置仍可操作；连接中启停不会被旧响应覆盖。[专项记录](test-results/skills-mcp/results.json)
- 日常服务本次测量：MCP 标题从修改前约 5361 ms 降到 331 ms，已配置服务约 634 ms 出现；这些是本次首屏测量，远端连接仍在后台完成。[日常网页回执](test-results/skills-mcp/live-layout.json)
- 新增列表主要来自原生插件发现，包括 20 个文档、表格与演示模板，以及 Pages、Sites 等插件技能；未为此另行安装。网页增加独立中文展示目录，按常用、自定义、插件和模板分组，后两组默认收起；支持名称/用途搜索，保留原生技能标识用于搜索和调用，不显示文件路径。用户自定义技能可以保留其原始说明。1440、1280 和 1024 像素宽度下卡片与按钮无越界。
- 技能卡片仅保留启用/停用。实际导入、停用、重新启用自定义技能后，仅发送普通文字，DeepSeek 读取启用的技能并真实执行脚本，原生输入没有 skill 附件。pets 的三个原生配置停用标记已保存，并从界面移除；其他技能保留。[日常 pets 回执](test-results/skills-mcp/live-pets.json)
- 生图改由输入框模型选择切换 OpenAI 会话，再直接对话调用启用的生图技能。已实际生成 PNG 并显示，没有手动附加 skill；新建普通对话恢复 DeepSeek。CLI 入口与终端面板按用户要求隐藏，原生 CLI、PTY、Agent 执行命令能力和 176 项协议入口保留。历史 CLI UI 用例标记不适用，不把隐藏状态算作一次新的 CLI 执行通过。
- 六项桌面回归覆盖欢迎页、模型/推理相邻布局、176 项入口、真实回答复制、真实图片与文本附件理解、隐藏 CLI 和深浅主题。[回归记录](test-results/skills-mcp/layout-regression.json)

[中文技能页](test-results/skills-mcp/skills.png) · [MCP 页面](test-results/skills-mcp/mcp.png) · [无技能附件的真实生图](test-results/skills-mcp/image-auto.png)。截图遮盖账号和会话列表。专项中的 MCP 对话用例隔离了两个同名 echo 测试夹具，并逐一响应自建工具的确认后重测通过；产品审批策略没有改变。

## 表格、模型身份、网络权限与原生生图（2026-10-25）

本次修复并完成 27 次真实网页专项及回归检查，浏览器 JavaScript 错误为 0；另复查日常服务配置及用户报告的旧会话表格。没有修改上游 Codex 源码。

- 8 项表格与模型/网络专项：真实流式 Markdown 表格、列对齐、转义竖线、行内格式、代码块、列表；历史恢复与宽表滚动；真实 HTML 样本清理；新旧会话正确识别实际模型；沙箱联网设置和真实天气查询；联网后工作区外写入仍被阻止。[记录](test-results/render-network/results.json)
- 2 项历史权限复查：历史会话显式应用已保存的网络选择，只改变网络字段；开关修改、当前会话同步及刷新持久化。[记录](test-results/render-network/network-history.json)
- 5 项原生生图流程：默认 DeepSeek 网页的技能入口创建 OpenAI 生图会话；实际调用官方 `image_gen` 生成 PNG；独立显示、放大与真实下载；绝对路径图片读取及刷新恢复；新对话恢复 DeepSeek。[记录](test-results/native-images/results.json)
- 4 项图片显示复查：放大与下载、生成图重复引用去重、原生历史恢复、默认模型恢复，以及 DeepSeek 对话独立显示服务器本地图片。[记录](test-results/native-images/display-results.json)
- 8 项已有交互回归：桌面窗口下标题与输入框、模型与思考强度、176 项原生入口、真实回答复制、图片/文本附件理解、CLI 中英文输入、终端缩放与底部边界、深浅主题。[记录](test-results/render-network/layout-regression.json)

此前表格渲染器只处理标题、加粗和代码，缺少表格解析。改用本地 Marked 与 DOMPurify，支持完整 Markdown 展示并过滤可执行 HTML；宽表在回答内部滚动。用户报告的旧会话现显示 1 张 2 列、4 行数据的表格，仅读取历史，没有发送新模型任务或保存用户问题内容。[旧会话复查](test-results/render-network/existing-table.json)

模型身份已从实际配置和会话记录核实：日常网页为 `deepseek` 提供方的 `deepseek-flash`，地址 `https://api.deepseek.com/`。此前适配目录沿用了官方 OpenAI 目录中的 GPT-6 身份提示，导致自我介绍错误；已只改生成目录中的身份句，并通过原生 application context 提供实际运行时模型信息。工具/权限指令保留完整，生图辅助模型保留官方完整元数据。

用户明确同意沙箱访问网络后，已从日常网页设置开启 `sandbox_workspace_write.network_access=true`。`approval_policy=on-request`、`sandbox_mode=workspace-write` 保持不变。原来的天气查询因 DNS/网络隔离重试提权，自我介绍又触发官方文档联网查询；普通联网天气查询现在实测 0 次审批。高风险操作仍按原生策略判断，未自动批准用户请求。[日常配置回执](test-results/render-network/live-network.json)

DeepSeek 提供方在官方源码中不会开放内置 `image_gen`。已使用现有独立 ChatGPT 访问会话完成生图，不需要 OPENAI_API_KEY；保留日常 DeepSeek 配置。生图会话由 `gpt-5.6-luna` 驱动，官方扩展调用 `gpt-image-2`，没有用代码绘图冒充模型生图。访问会话副本不包含原始刷新令牌；原始账号授权文件未修改。该访问会话到期后需通过网页原生账号登录续用。

独立服务已验证 OpenAI 使用现有 `127.0.0.1:15236` HTTP 代理，DeepSeek 通过 NO_PROXY 保持直连；无法据此确认出口一定经过 Veee。日常服务的代理环境切换在用户明确确认任务已结束、允许重启后执行。重启后又从日常网页实际完成 OpenAI 与 DeepSeek 两次模型调用，两条通道均通过；默认模型仍为 DeepSeek，网络开启，审批策略和工作区沙箱保持原值。仅新建并通过网页删除本次测试会话，没有修改用户已有会话。[重启后验收](test-results/render-network/live-smoke.json)

最后只读复查原生隐藏模型元数据：生图历史恢复为 `gpt-5.6-luna`，推理选项与官方完整模型元数据一致，日常选择列表仍只显示 DeepSeek，生成图片正常显示。[模型元数据复查](test-results/native-images/model-metadata.json)

[表格截图](test-results/render-network/table.png) · [宽表滚动](test-results/render-network/wide-table.png) · [单张生成图显示](test-results/native-images/generated-image-single.png) · [大图预览](test-results/native-images/image-preview.png) · [DeepSeek 本地图片](test-results/native-images/local-image.png)。截图遮盖账号与会话列表。

## 新版对话界面与终端（2026-10-25）

页面以个人 AI 对话为主，采用简洁侧栏、居中输入区、用户消息气泡与直接显示的回答。模型和思考强度并排放在输入框下方；移除与侧栏重复的工具菜单。左下角“＋”明确用于添加文件或图片，保留多选、图片预览及附件移除。技能、MCP、插件、项目、文件、设置、账户、原生终端和 176 项原生方法入口全部保留。

新版页面完成 40 项真实网页检查，浏览器 JavaScript 错误为 0：

- 32 项原生功能回归：模型选择、流式对话、命令、文件与补丁、技能启停及调用、MCP 工具和资源、计划、代码审查、压缩与回退、插件安装卸载、会话恢复/分叉/归档/导出、附件理解、人工审批、补充输入与中断、用户问题、CLI 实际模型调用及后台服务、全部原生方法模板、配置保存恢复、第三方模型独立性与主题。[回归记录](test-results/chat-ui/desktop-results.json)
- 8 项最新界面专项：1440×1000、1280×720、1024×768 下标题不与输入框重叠；模型和思考强度相邻且真实发送给原生运行时；所有原有入口可达；真实回答复制；从“＋”打开系统文件选择器，同时添加图片和文本，移除并重选图片，DeepSeek 实际识别蓝色图片及文本标记；CLI 未启动时提示；默认 CLI 中英文输入真实回显；缩放窗口与展开/还原时输入行和底部边界可见；主题及原生版本输出。[专项记录](test-results/chat-ui/layout-results.json)

终端改用与 xterm.js 6.0.0 配套的官方 FitAddon 0.11.0，按字体实际行高和宽度调整原生 PTY；此前手算行列导致底部裁切。未启动时禁用无处传递的输入并显示启动说明，启动后输入由原生 CLI 回显。展开/还原保留同一个 PTY 进程。修复空会话滚动容器高度，标题与输入框不再叠加。

[首页](test-results/chat-ui/home.png) · [图片与文件](test-results/chat-ui/attachments.png) · [中英文终端输入](test-results/chat-ui/terminal-input.png) · [缩放后的底部边界](test-results/chat-ui/terminal-resized.png) · [深色界面](test-results/chat-ui/dark.png)。截图遮盖账户与会话列表。

本次仅调整 Web 展示与终端组件；官方源码和 176 项完整协议保持一致。审批策略、沙箱模式和网络设置均未改动。运行中的用户服务未重启。完整的外部服务及账号条件限制仍按下文记录，不因页面更新改为已通过。

## 会话恢复、整轮折叠与自定义扩展（2026-10-25）

主界面已补齐原生永久删除入口，侧栏显示运行中的任务。不同会话可并发执行，同一会话的原生写入锁保持有效。旧会话的选择写入 URL，刷新后直接通过原生会话接口恢复。支持浏览器前进/后退及归档只读恢复；被另一页面占用时保留只读历史并提供重试入口；无效地址显示恢复错误，禁止静默创建新会话。每次任务的思考、过程说明、命令、文件更改和工具活动都在同一个默认收起的“思考与执行”区域，最终回答独立显示。展开状态在流式更新中保持，人工审批继续直接显示。

本次完成 23 项真实网页检查，浏览器 JavaScript 错误为 0：

- 8 项会话专项：整轮折叠及流式展开状态、刷新直接恢复、失败命令摘要、中断与任务边界、浏览器前进/后退、归档只读恢复、无效链接错误处理、另一页面占用时的只读历史及释放后重试。[专项记录](test-results/whole-turn-collapse/results.json)
- 10 项扩展专项：上传单个 SKILL.md、完整文件夹导入、原生技能启停、DeepSeek 实际读取技能资源和执行脚本、重名保护及无效导入清理、自定义 stdio MCP、现有会话中真实 MCP 调用、启停与刷新持久化、HTTP MCP OAuth 与受保护工具调用、会话恢复。[专项记录](test-results/custom-tools/results.json)
- 3 项并发与删除专项：同一网页的两个不同会话同时执行真实命令（以进程实际输出的时间戳验证运行重叠）、删除确认取消及永久删除、归档会话永久删除。仅删除本次测试新建的会话；普通无害命令没有触发审批。[专项记录](test-results/thread-lifecycle/results.json)
- 1 项原生计划专项：真实调用 update_plan，计划位于本轮收起的过程区域，可手动展开查看。[计划记录](test-results/whole-turn-collapse/plan-results.json)
- 1 项既有会话回归：用户报告问题的旧会话 71 个原生条目完整保留；刷新后自动恢复，显示为用户消息、一个 34 像素的过程折叠区和最终回答。没有发起新模型任务，记录只保留数量，不包含用户会话内容。[回归记录](test-results/whole-turn-collapse/existing-chat.json)

测试任务中的过程说明、思考、命令及文件更改整体收起后仅占 34 像素，原始条目顺序保持一致。[收起截图](test-results/whole-turn-collapse/collapsed.png) · [展开截图](test-results/whole-turn-collapse/expanded.png) · [技能界面](test-results/custom-tools/skills.png) · [MCP 界面](test-results/custom-tools/mcp.png)。截图遮盖账户与其他会话列表。

Skills 导入使用原生文件接口和技能发现、配置接口；MCP 使用原生配置写入、重载、连接与确认请求。启停保留原配置。此前工具调用等待的问题是缺少原生 MCP 确认按钮，现已补齐并通过真实模型调用验证。没有自动批准用户操作，`approval_policy = "on-request"`、`sandbox_mode = "workspace-write"` 及沙箱网络设置保持原样。官方源码无修改，官方 HEAD 与本地源码仍一致。

## 验收口径

所有功能验收均从真实 Chromium 桌面网页发起。常用功能点击专用界面；协议验收通过“原生能力”面板搜索方法、填写参数、点击“执行原生请求”；CLI 从网页内的真实 PTY 终端发起。浏览器驱动没有直接连接后台 RPC。初始化由网页连接流程发送，测试读取该次真实初始化结果。

[完整方法矩阵](test-results/METHODS.md) 和 [机器可读覆盖报告](test-results/coverage.json) 保留实际证据分类：176 项均有网页入口，173 项已从网页执行，160 项至少有一次正常 RPC 返回，13 项返回了原生限制或服务错误，3 项按用户明确要求未执行。正常 RPC 返回不能证明异步连接或外部业务完成；实时连接和 Windows 设置的实际失败另外记录，未作为功能通过。

35 个桌面操作场景通过，浏览器 JavaScript 错误为 0。另有实际 Guardian 审核与人工确认、Hook 生命周期、Linux 沙箱边界和 Git 市场升级的专门验收。底层 HTTP/WebSocket 单元检查及上游自身测试只算工程验证，不替代网页功能验收。

## 已通过的真实网页功能

| 范围 | 实际结果 | 证据 |
|---|---|---|
| DeepSeek 桌面操作 | 30 项完整流程通过：真实流式对话、命令与文件修改、补丁差异、文件预览、技能调用、MCP 工具和资源、计划、压缩、发现除零问题的代码审查、历史回退、插件安装卸载、重命名、分页恢复、分叉、导出、归档、附件理解、审批、补充输入与中断、动态工具、用户问题、CLI 与主题配置 | [30 项记录](test-results/browser-desktop/desktop-results.json) |
| 第三方模型独立性 | 原生 `requiresOpenaiAuth=false`；无需 ChatGPT 登录；高级配置保存及恢复后，DeepSeek 和 MCP 配置保持完整，真实模型再次完成任务 | [提供方验收](test-results/browser-provider/desktop-results.json) |
| CLI 后台服务 | 从网页终端启动原生 daemon、查询实际版本并停止，仅操作独立测试配置 | [后台服务记录](test-results/browser-daemon/desktop-results.json) |
| ChatGPT 登录会话 | 使用现有账号的独立访问会话，模型实际调用 shell 计算并读写文件；原始授权文件哈希保持不变 | [模型验收](test-results/browser-chatgpt/results.json)、[授权完整性](test-results/account-session-integrity.json) |
| CLI Code Mode | 从网页终端运行源码 CLI；再通过网页读取原生历史，匹配实际 `exec` 的 `text(123*456)` 调用及 V8 返回 `56088`，没有仅凭模型回答判断通过 | [实际调用证据](test-results/browser-chatgpt/results.json) |
| HTTP MCP OAuth | 从网页 MCP 登录按钮打开本地授权页；实际完成发现、动态注册、授权重定向、PKCE 验证及令牌交换，再由原生客户端调用受保护工具。使用本地真实测试授权服务，无外部账号 | [OAuth 记录](test-results/browser-oauth/results.json) |
| Guardian | DeepSeek 真实评估无害命令，按本地测试规则产生拒绝；网页显示真实审核内容，点击人工确认后，原生历史新增 `guardian.approved_action`。没有伪造拒绝事件 | [Guardian 记录](test-results/browser-guardian.json) |
| Hooks | 网页配置并信任测试脚本，真实触发 SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop，之后恢复原配置 | [Hook 记录](test-results/browser-hooks.json) |
| Linux 沙箱 | 真实写入验证：只读模式阻止写入、工作区内允许写入、工作区外阻止写入 | [沙箱记录](test-results/browser-linux-sandbox.json) |
| Git 插件市场 | 实际 Git 仓库从插件版本 1 升级至版本 2，并通过原生接口移除测试市场 | [升级记录](test-results/browser-git-marketplace.json) |
| 原生协议能力 | 文件监听与 CRUD、PTY 进程、流式命令输入/调整大小/终止、模糊搜索、项目、会话元数据与分组、队列、采样及取消、记忆、附件所有权、运行环境连接等均从网页执行 | [协议记录](test-results/browser-native.json) |
| 账号与远程控制 | 当前账号额度、用量、应用已安装列表；临时远程控制注册、客户端列表、生成配对码、查询状态及关闭。没有撤销用户已有客户端 | [账号记录](test-results/browser-account.json) |

专用浏览器驱动记录方法、发起入口和结果状态，不记录请求参数、令牌或密钥。截图和真实模型输出位于对应的 `test-results/browser-*` 目录。

## 条件限制和未通过项

下列情况保留可用的原生入口并显示真实错误，不能宣称其外部业务已完成：

| 项目 | 实测结论 |
|---|---|
| 预测 `thread/prediction/request` | 官方源码直接返回 `not implemented yet`，不是 Web 层遗漏。 |
| 实时连接 | DeepSeek 普通 Responses 对话正常；实时 WebSocket 握手实际返回 404。当前 ChatGPT 登录会话在实时接口收到要求 API key 的原生错误。启动请求返回不算连接成功。 |
| Windows 沙箱 | 原生 Windows 专用入口在 Linux 返回平台限制，异步设置结果为 `success=false`。服务器使用 Linux 沙箱，上述三项 Linux 约束实测已通过。 |
| 用户验证 enroll / verify / delete | 此原生构建或账号返回 `providerUnavailable`，无法完成验证。 |
| ChatGPT 应用目录 | 当前代理出口下，真实 `app/list` 请求被远端 Cloudflare 浏览器验证拦截（403）。已安装列表正常；网页将应用与本地插件分开显示。托管应用事件订阅需要真正的 hosted app，不能以普通 MCP 服务替代。 |
| 工作区消息 | 当前账号的真实服务请求超时；用户确认只有个人空间。 |
| 云端插件分享与远程技能 | 私有测试插件保存/更新本身成功，但修改分享目标、checkout、删除需要当前账号不具备的活跃工作区条件。远程插件技能未完成，本地插件技能已经实际调用。 |
| AWS Bedrock 设置 | 缺少 AWS 凭据及对应提供方条件；未以 DeepSeek 密钥冒充 AWS 凭据。 |
| Gateway OAuth | 当前 DeepSeek 提供方不使用 gateway OAuth；普通 HTTP MCP OAuth 已独立通过。 |
| 撤销远程客户端 | 缺少可安全撤销的、已经完成配对的测试客户端。没有拿用户现有客户端做破坏性测试。 |

**测试资源清理尚有一项外部阻碍：**账号内仍有一个仅自己可见的 `Native Web Acceptance` 私有测试插件。已通过网页重试原生删除，返回 `Workspace plugin creation requires an active workspace`。未公开分享；停止创建新的远端测试插件。唯一资源标识保存在忽略的 `.local-state/chatgpt-acceptance/test-plugin-cleanup-id`，未写入 Git；现有账号和原生删除接口目前无法完成清理。[实际错误记录](test-results/browser-private-share.json)

用户明确选择不执行以下三项，因此标记未验收：`account/rateLimitResetCredit/consume`、`account/sendAddCreditsNudgeEmail`、`feedback/upload`。没有消耗重置券、发送加购邮件或上传测试反馈。

## 第三方模型与授权边界

网页不对原生会话、文件、沙箱、审批、技能、MCP、本地插件或 CLI 添加 ChatGPT 登录要求。已使用真实 DeepSeek 验证这些能力，包括独立的 HTTP MCP OAuth 和 Guardian 审核。其他提供方使用原生 `model_providers` 配置，仍需支持相应 Responses、流式输出和工具协议；不能保证任意 Chat Completions 地址均兼容。

图片、实时能力、托管搜索、特定工具格式和上下文上限由模型及服务决定。需要 ChatGPT 账号或工作区的原生云端服务仍需要相应授权；这些前提不适用于本地文件、终端、技能、普通 MCP 和本地插件。

ChatGPT 验收使用单独的访问会话，没有使用或修改原账号的刷新令牌，未更改原始 `~/.codex/auth.json`。该临时会话会到期；正常长期使用请从网页账号页完成原生登录，远程服务器可选设备码登录。DeepSeek 测试密钥只在运行进程环境中，未保存到源码、Git、测试证据或配置文件。

服务器可通过现有 SSH 转发代理访问账号和模型服务。仅凭本地 Veee 为全局/虚拟网卡模式，无法确定转发出口一定经过 Veee；没有把这一推测作为测试结论。

## 工程验证和复现

- 8 项 HTTP/WebSocket 边界单元检查通过。
- 3 项原生集成检查已全部改为浏览器按钮发起，并通过；测试驱动文件句柄清理已复核。
- 未修改的上游 Code Mode Runtime 测试：81 项通过。[原始输出](test-results/engineering/code-mode-runtime.txt)
- `verify_upstream.py --native`：上游干净，源码/程序完整协议一致，无缺失或额外方法。
- `update_upstream.py --check` 及默认完整更新流程均已执行；当前官方 HEAD 与本地一致，因此无需切换提交。

功能复现先按 README 启动独立测试配置及工作区，并创建测试夹具。Playwright 仅为可选验收依赖，运行网页不需要 Node。

```sh
python3 web/scripts/create_test_fixtures.py --help
# 设置 PLAYWRIGHT_MODULE、CHROMIUM_BIN，以及 CODEX_TEST_NODE（Python 驱动用）。
# DeepSeek 测试服务监听 8765，ChatGPT 独立已登录测试服务监听 8766。
node web/tests/desktop_acceptance.mjs
# 新版布局、附件与终端专项使用独立 chat-ui-acceptance 配置。
node web/tests/chat_layout_desktop.mjs
node web/tests/render_network_desktop.mjs
node web/tests/images_desktop.mjs
# 以下三项使用 README 中的两个独立专项配置实例。
node web/tests/custom_tools_desktop.mjs
node web/tests/activity_desktop.mjs
node web/tests/thread_lifecycle_desktop.mjs
python3 web/tests/native_acceptance.py --output /tmp/browser-native.json
python3 web/tests/native_acceptance.py --only-sandbox --output /tmp/browser-linux.json
python3 web/tests/native_acceptance.py --only-git-marketplace --output /tmp/browser-marketplace.json
python3 web/tests/hooks_acceptance.py --output /tmp/browser-hooks.json
node web/tests/oauth_desktop.mjs
node web/tests/chatgpt_desktop.mjs
python3 web/tests/account_acceptance.py --output /tmp/browser-account.json
python3 web/tests/guardian_acceptance.py --output /tmp/browser-guardian.json
```

账号脚本默认不会创建远端插件。不要在个人空间执行远端分享生命周期；重新验收现有测试插件使用 `private_share_recheck.py`，不会创建第二个资源。旧的直接协议检查和被替代的早期截图已移入忽略的本地归档，不作为网页验收证据。


## 数据库与完整结果发布验收（2026-10-26）

全部功能操作由真实桌面网页的管理、对话或原生能力面板按钮发起。独立发布实例使用 `database-release-acceptance`，与日常配置隔离，未修改 `upstream/`。

- [核心流程](test-results/database-release/core.json)：11 项通过。四类数据库实际配置并读取，拒绝 MySQL 管理账号，批量与受控跨库查询通过，写入/文件/外部数据源查询拒绝，DeepSeek 实际查询并生成回答图表。
- [完整结果](test-results/database-release/complete-results.json)：9 项通过。Sakila `payment` 共 16,044 行全部保存和导出；DuckDB 全量 COUNT/SUM 与原库一致（16,044、67,406.56）；10,000 字符文本、高精度小数、二进制和 NULL/空字符串区分保留；五类图表及 PNG 下载、刷新恢复、停用和断连限制通过。
- [取消与继续](test-results/database-release/cancellation.json)：MySQL、PostgreSQL、ClickHouse 均从网页发起真实查询并点击停止，数据库侧确认任务结束，没有发布部分快照，同一会话继续回答通过。耗时分别约 0.9、0.6、0.4 秒。ClickHouse 25.8 所需三列只读权限经过用户明确授权后配置，未授予写权限。
- [Elasticsearch 完整原生 JSON](test-results/database-release/elasticsearch.json)：三组聚合原生 JSON 完整下载，总额 620；跨未配置索引的文档引用被拒绝。搜索取消的连接关闭行为另经 HTTP 响应头前/响应体期间的传输测试；未以三条样例数据宣称测得长查询取消耗时。
- [完整结果计算取消](test-results/database-release/analyze-cancellation.json)：网页启动 DuckDB 全量自连接计算，确认有实际 CPU 运算后点击停止，CPU 运算结束、没有部分结果，同会话继续通过。修复了流式读取器无法重复扫描的问题，使用可重复扫描的 Arrow 数据集。
- [重复扫描回归](test-results/database-release/repeat-scan.json)：全量读取、精确聚合、自连接和完整导出 4 项通过。[跨库依赖](test-results/database-release/dependencies.json)：派生分析继承全部连接依赖，停用/版本变化后读取、分析和图表均拒绝。
- HTTP/WebSocket 边界 11 项、只读与取消安全检查 8 项通过。上游源码干净，完整原生协议 176 个方法与构建程序一致。

本次发布只包含数据库、结果存储、回答图表、上下文显示与相应安全检查。独立草稿中的同会话跨 DeepSeek/ChatGPT 历史迁移没有通过，未纳入此次发布；保留此前已发布的模型选择行为，不将其称为已修复。原生自动压缩已按源码确认存在，手动压缩网页验收此前通过；自动阈值触发尚未做专项网页实测。用户明确不执行的三项账号操作继续保持未验收。

日常服务已在原端口 **8765** 部署并通过[上线网页验收](test-results/database-release/live.json)：从网页配置 Sakila 专用只读账号，DeepSeek 实际查询并调用图表工具，刷新后同一会话和图表恢复、上下文圆环正常。示例会话为“数据库上线验收 · Sakila 查询与图表”。部署前确认没有活动会话写入锁，保留原登录和 API 环境；页面和模型目录已在忽略的本地目录备份。


## 2026-10-26 系统性稳定性复查

本轮使用独立 `/tmp/codex-web-system-audit/` 配置、会话和工作目录，不复用业务工作区，也不使用 ChatGPT 登录。问题、根因、验收口径和可复跑命令见 [WEB_AUDIT.md](WEB_AUDIT.md)。新增 `chat_state_desktop.mjs`、`connection_state_desktop.mjs` 和 `native_flow_audit.mjs`。

明确保留失败项：真实 `turn/interrupt` 协议和 `interrupted` 状态已确认，但 Python 命令在随后至少 15 秒内仍存活；不能将该项记为进程停止通过。停止后未创建尾部标记并不能代替进程已退出的验证。未修改原生运行时或通过关闭整个页面来伪造停止成功。

最终结果：Python 22/22；聊天状态 10/10；连接/历史/审批隔离 3/3；桌面长提示及窗口专项 2/2；真实服务重启通过；原生流程 5/6，CW-009 未通过。上游源码干净，176 个方法及完整 schema 与原生一致。可追溯报告见 `test-results/system-audit-2026-10-26/summary.json`。手机端按用户要求不纳入本轮。

CW-009 后续更正：锁定版本已有原生后台终端 list/terminate 接口，上一轮对可用接口的判断遗漏。新增单会话定向终止验证和并发 A/B 隔离验证均通过；没有修改产品停止流程或核心。默认停止回收集成仍待完成。报告：`background-termination-probe.json`、`background-termination-isolation.json`，位于本轮 system-audit 目录。


## 2026-10-26 能力与范围核验、根因修复和输入框 / 菜单

这是上述稳定性调查之后的新一批结果，保留此前失败。核心记录：[能力与范围](CAPABILITIES.md)、[问题清单](WEB_AUDIT.md)；可追溯汇总：[summary.json](test-results/capability-audit-2026-10-26/summary.json)。

环境为全新的 `/tmp/codex-web-capability-audit/{home,workspace}`，8784 端口，未复制 ChatGPT auth.json；使用已授权的 DeepSeek 密钥，仅在进程环境中存在。清除代理后直接调用官方 API。没有施加宿主机出口防火墙，未验证任意外部扩展的供应商内部网络依赖。

| 实际验证 | 本批结果 |
|---|---|
| Python 传输、安全、只读数据模块与原生集成 | 22/22；最终前端又重跑其中 3 项真实浏览器原生集成，3/3 |
| 聊天状态、草稿、重复 Enter、流式快照、中文输入、滚动、Pro 命令、失败重试、窗口尺寸 | 11/11 |
| 连接/历史竞态与审批跨连接隔离 | 3/3 |
| 真实原生审批拒绝/允许、停止、并发目录、刷新和执行中断线 | 6/6；原 CW-009 在同一复现步骤中转为通过 |
| 停止回收扩展 | 4/4：旧后台任务/并发 B 保留，失败与重试归属、目标暂停、回收中导航；新 /goal 入口又单独实测通过 |
| Flash/Pro 能力工作流、入口范围、本地 Skill/MCP、计划确认执行、识图/图像拒绝、本地反馈、页面布局 | 核心 11/11；后续命令/项目/会话改动分组增量验收通过，明细分开保存 |
| 输入框 / 命令与已安装 Skill 菜单 | 6/6；包括点击后发送、键盘/IME、Pro 模型实际生效、已停用 Skill 拒绝、真实 UserInput.skill + 脚本成功、目录晚到隔离；精确命令文本下改选 Skill 的键盘回归另 2/2 |
| 原生项目 CRUD 和会话生命周期 | 新 / 入口下增量 3/3，包括本地反馈、项目与会话组；分叉继承/导出、归档后恢复、刷新与只删除本次分叉均真实执行 |
| 长历史分页 | 65 个真实已存在的测试会话，跨页 65 个唯一 ID，无重复导航项 |
| DeepSeek Pro 原生搜索 | 独立会话 web_search=live 实测通过，真实 webSearch 项及两个政府网站结果；应用默认 disabled 保留 |
| 主要页面截图 | 6 页面 × 1024/1280/1440 宽度检查无整页横向溢出；/ 菜单另检查空态/历史、宽度对齐、标题间距、技能分组 |
| 工程和核心完整性 | git diff --check、15 个 JS/MJS 语法、2 个 Python AST 通过；源码 pristine，完整 176 方法及 Schema 与原生相符 |

没有前端打包或 TypeScript 项目，构建和类型检查记“不适用”；语法、截图、协议和真实模型检查没有互相替代。原生程序未重编译或修改。

失败过程保留：能力首次 9/1 暴露保留附件与斜杠交互；菜单首次 4/2 暴露边框对齐与中文筛选问题，随后 5/1 暴露初始化 ready 过早导致菜单消失；生命周期首次 1/1 暴露取消归档定位与原生空预览过滤。修复后重跑相关步骤；U-001 原生列表限制仍单列未解决。未把跳过或范围排除计作模型能力通过。

DeepSeek 快速档位/生图为用户确认的非必要项。实际直连 GET /models 已保存非敏感模态字段；官方文档不支持 service_tier，Flash/Pro 输出均 text，Flash 图像输入单独实测通过。没有转向 ChatGPT 或伪造快速/生图成功。历史授权、上游/发行内容及无关修改保留。

当前仍是个人 Web 服务，不能将浏览器会话隔离或本轮 managed-terminal 回收当作多租户执行隔离。数据库真实四库、全部远端扩展、实时/记忆等条件项和严格出口环境未在此新实例全部实测；见能力表逐行状态。
