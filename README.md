# Codex Web Native

基于 Codex 原生运行时的数据分析工作台，面向使用自然语言查询数据库、生成图表和分析结论的用户，不要求用户编写 SQL 或代码。沿用现有架构，保留 Codex 的对话、Agent、技能、MCP、沙箱、审批和完整原生协议定义；工程维护入口移入高级设置。当前验证统一使用 `deepseek-flash`，允许 DeepSeek 官方 API 与国内公网；不提供 ChatGPT 登录、订阅、反馈、快速模式或生图入口；各能力的具体条件见 [能力对照表](CAPABILITIES.md)。代理内核直接从锁定版本 Codex 开源源码编译；Web 层负责界面与原生协议传输；数据库查询和图表通过独立的只读 MCP 扩展接入。上游源码以子模块保存在 `upstream/`，禁止在该目录修改源码。

## 获取与运行

```sh
git clone --recurse-submodules --branch codex/web-native-desktop git@github.com:chong91723/codex.git Codex
cd Codex
# 安装 upstream/codex-rs/rust-toolchain.toml 指定的 Rust 版本。
python3 web/scripts/build_native.py --jobs 2
python3 web/start.py --deepseek
```

浏览器打开 <http://127.0.0.1:8765>。沿用本机 Codex 配置；该配置须使用符合账号与网络范围的 provider，否则按下文使用 `--deepseek`。基础 Web 服务仅依赖 Python 3.11+ 标准库，不需要前端打包或 CDN。可选数据库功能使用独立 Python 环境和本机 Node.js 图表组件；浏览器验收使用 Playwright。

MCP 和插件各自需要其声明的运行环境。例如以 `npx` 启动的插件需要 Node/npm 位于 Web 服务的启动 PATH 中；浏览器插件还需要可用浏览器及适合服务器的无头参数。原生 MCP 只继承部分环境变量，npm 源、缓存和浏览器参数应通过该插件支持的 MCP `env` 配置明确提供，不能假定 Web 进程环境会全部转交。不满足依赖时显示真实启动错误，不自动安装运行时或切换模型。 Git市场的本地快照和插件缓存可能被原生重新同步，不能依赖直接修改缓存来持久保存参数。此前Playwright验证采用原生支持的本地市场配置副本，保留真实包的Manifest，仅配置MCP启动参数；具体条件与原始失败见 [远端扩展验收](test-results/mainland-services-2026-10-26/summary.json)。

当前原生构建脚本针对 Linux x86_64。编译需要 C/C++ 编译器、pkg-config、CMake，以及 OpenSSL、ALSA、DBus 和 libcap 开发头文件。构建脚本同时编译 CLI、code-mode host 和源码自带的 bwrap，再调用未修改的上游打包器组装标准目录及 ripgrep；不能只复制 CLI 单个可执行文件。若已安装 ripgrep，可传入 `--rg-bin /绝对路径/rg`。

使用 DeepSeek 测试或运行：

```sh
python3 web/start.py --deepseek
```

启动时隐藏输入 API 密钥，也可通过 `DEEPSEEK_API_KEY` 环境变量提供。密钥只进入进程环境，不保存到源码、Git、配置文件或访问日志。Web进程使用原生 `cli_auth_credentials_store="ephemeral"`，忽略现存ChatGPT登录态及其刷新，不删除授权文件；第三方 `env_key` 与独立 MCP OAuth 配置保持有效。这个模式使用 `.local-state/deepseek/` 中的独立原生配置，不覆盖现有 `~/.codex` 配置；模型为 `deepseek-flash`，接口为原生 Responses。

可使用 `--port 8766`、`--workspace /绝对/项目路径`。需要远程访问时先设置 `CODEX_WEB_TOKEN`，然后使用 `--bind 0.0.0.0`；首次访问 `/?token=设置的令牌` 建立 HttpOnly 会话，页面随即移除 URL 中的令牌。跨设备访问应使用 HTTPS 反向代理或 SSH 本地端口转发。

## 非 ChatGPT 模型

DeepSeek 模式不需要 ChatGPT 登录。网页不会给会话、文件、沙箱、审批、技能、MCP、本地插件、历史和 CLI 添加 OpenAI 账号检查；是否需要认证由当前原生模型提供方决定。这些功能已使用真实 DeepSeek 从网页验收。

其他服务沿用原生 Codex 的 `model_providers` 配置，要求服务实现 Codex 支持的 Responses 协议、模型和工具格式。可以使用独立的 `CODEX_HOME`，再运行 `python3 web/start.py`；也可以在网页“设置 → 高级设置 → 用户配置 JSON”中编辑原生用户配置层。密钥应通过提供方的 `env_key` 对应的环境变量注入。

```toml
model = "your-model-id"
model_provider = "custom"

[model_providers.custom]
name = "Custom Responses Provider"
base_url = "https://your-provider.example/v1"
wire_api = "responses"
env_key = "CUSTOM_MODEL_API_KEY"
requires_openai_auth = false
supports_websockets = false
```

不要把 Chat Completions 接口当作 Responses 接口填写。模型目录和能力应按实际服务配置；DeepSeek 启动器只在被忽略的独立配置目录生成适配模型目录，未修改上游源码。实时语音、图像输入、特定工具格式、托管搜索和上下文上限取决于模型服务；需要 ChatGPT 账号或工作区的云端服务仍遵守其原生授权要求。外部服务失败会展示原因，本地插件与应用目录分开显示。

## 数值依据与非数据库分析（2026-10-27）

绘图统一使用本机 ECharts；Python 只处理数据和计算，不下载或调用其他绘图库。API、CSV／JSON 文件及纯计算都可以生成通用不可变 `resultId`，直接用于同一张图表／数据卡，不需要连接 Sakila 或其他业务数据库。`resultId` 是本项目快照接口，不是 ECharts MCP 强制要求数据库查询。真实数据库聚合结果仍可直接引用，不强迫重复计算。

本机分析扩展增加 `fetch_data`、`import_data_file`、`run_python`、`publish_answer`。Python 环境预装 NumPy、pandas、Decimal，使用现有 bwrap 资源隔离文件系统和网络，仅挂载本次选定的数据快照；具备计算超时、资源上限和按请求取消，没有隔离组件时明确失败，不退回宿主机执行。原生 Codex 的工具审批、Agent 回合和中断协议保持不变，这不是多租户运行隔离。

数值回答通过 `publish_answer` 的模板引用真实结果行列，后端直接代入数值、保留精确小数／大整数，并记录快照指纹、来源与 SQL／Python 代码。数值、日期、百分比、编号和数量精度不能裸写或心算；相同文字也必须在当前原生会话和回合重新发布。前端核验原样答案才展示为数值结论并允许下载；不匹配时明确报错，保留折叠原文供排查，由用户决定补充依据，不自动重发任务。未核验的过程说明只显示诊断状态。旧历史仍可读，并标注未按新规则核验；不会追溯改写历史。归档保留原文与证据，永久删除会话会清除本模块保存的这些副本；共享结果快照仍单独管理。无数字的说明可正常显示；尚未执行的计划使用定性描述。

现有扩展需要安装新增的固定计算依赖。可重新运行安装器，并按环境明确配置国内安装源：

```sh
python3 web/scripts/install_databases.py --node /绝对路径/node --npm /绝对路径/npm \
  --python-index-url https://pypi.tuna.tsinghua.edu.cn/simple \
  --npm-registry https://registry.npmmirror.com
```

分析 MCP 的 `env` 中，`CODEX_WEB_DATA_ORIGINS` 为允许的完整 API origin 逗号列表，默认是东方财富及腾讯的行情入口；`CODEX_WEB_ANALYSIS_ROOTS` 为允许读取的分析目录（Linux 用冒号分隔），新配置默认使用服务工作区。它们可以通过现有 MCP 管理入口配置，不在提示词或 URL 中放凭据。运行中的 HTTP 请求及每次重定向都核对来源。API 原文需要经过 Python 解析后才能发布数值；不把预览当完整数据。空来源配置会禁止外部接口。已启用的项目管理 MCP 只补充缺失配置，保留用户覆盖、工具权限及禁用状态；不改自定义同名服务。

这里的依据核验证明“显示值来自哪次执行”，不证明源数据真实、SQL／Python 业务口径正确，也不验证每个自然语言语义。外部 MCP／Skills 若产生数字，需先形成可引用的计算结果；尚未支持任意第三方工具的自动逐字段证明。本轮外部 API 是明确的本机测试夹具，不是英伟达真实行情；默认行情源的实时可用性未据此标为通过。实际回归和限制见 [验收报告](TEST_REPORT.md)。

## 数据分析工作台

主导航提供“新分析、技能、数据源、MCP 服务、设置”。直接描述数据问题即可；用户无需手工选择“本次数据源”，Agent 通过已有 MCP 发现全部已配置、启用、可用且获授权的只读连接。“数据源”主页面由用户直接添加、编辑、测试、启停和移除连接，查看表结构；高级设置也保留跳转入口。这里的可用连接范围沿用当前服务和数据库账号权限，不构成多租户授权隔离。

每次任务通过原生 `turn/start.additionalContext` 提供分析用途说明：保留用户指定思路，澄清指标、日期和比较基准，使用真实工具结果回答全部子问题。没有额外的数据源选择状态，也不把连接凭据放进模型上下文。模型与工具工作仍由原生 Codex 执行。

Skills 和 MCP 保留当前主入口，用户仍可配置、启用和停用。技能范围保持锁定源码自带的 `openai-docs`、`review-agent`、`skill-creator`、`skill-installer` 四项，没有安装业务分析技能或恢复非原生技能导入。MCP 支持已有 stdio、HTTP 和独立 OAuth 路径，配置更新及工具结果沿用原生协议。

结果、图表和结论均在对应对话中展示与下载，不提供成果侧栏。同一查询结果只占一张卡，在同一区域切换“图表／数据”：ECharts 渲染图表，标准表格显示完整快照的分页数据；图表不再附带另一份表格。数据每页20行，多页时显示前后页和页码跳转，单页和空结果隐藏分页。切换视图保留页码、图例选择和缩放；同一结果的多张图通过卡内选择器切换。查询语句默认折叠，底部只保留一个完整CSV入口，图表视图另有PNG下载；读取失败显示原因并提供重试，`read_result`不生成重复卡。每条已完成回答提供该条结论的 Markdown 导出，只附同轮已加载的成功查询结果 ID；未完成、失败、中断和待确认方案不作为完成结论导出。切换或恢复分析时，旧下载操作会被拒绝。它不是 PDF／Word 报告引擎；新增数值来源核验的范围见上节。

模型、provider、思考强度、Agent 文件执行权限、项目／工作目录、初始化、持续目标、原始文件和原生协议均从“设置 → 高级设置”进入。原有控件与事件处理保留；折叠不构成管理员权限：当前实例用户仍可操作。Agent 沙箱权限与数据库只读权限分别控制，不能互相替代。

输入 `/` 仅展示 `/plan`，点击或键盘选择只填入，发送才触发。其他旧斜杠命令不执行并保留草稿。上下文压缩仍按原生设置自动触发。

## 分析记录与历史管理

不同分析可在同一页面中同时执行；运行状态按原生 thread／turn ID 归属。点击侧栏“新分析”创建新的未关联项目会话，保留当前工作目录，可通过 `/plan` 进入计划模式；不再提供另一个“聊天／Agent”互斥模式或底部重复新建按钮。切换分析不会断开原生进程；刷新或关闭整页会影响该连接正在运行的任务，重连以原生历史恢复，不重复提交。

侧栏“最近分析／已归档”切换记录范围；右键或每行“…”只提供重命名、归档／恢复、永久删除。归档保留历史，可恢复后继续；永久删除调用原生 `thread/delete`，确认后无法撤销。其他进程持有写入锁时，原生拒绝原因保留在弹窗；关闭已确认的占用方后可原地重试，网页不会强关未知连接或绕过锁。历史优先加载最近 20 回合，更早记录按需加载并保留阅读位置。

分叉、JSON 导出、历史回退、代码审查等原生能力仍保留于高级设置的原生协议诊断，不占日常分析入口。文件工具与命令执行能力没有因隐藏界面而删除，工具过程和错误仍可展开查看。

## 分析计划

`/plan`：手动进入计划模式，生成计划后由你确认执行。

单独发送 `/plan` 后继续描述需求，或发送 `/plan 具体问题`。计划卡支持“修改分析方案”和“确认并执行分析”，确认时可编辑整体方案。输入框下方只显示计划状态与“退出计划模式”，不再提供显式开关；退出不会执行已有方案。运行中先停止或等待结束，再退出。

用户已有思路时，说明步骤、口径和期望产出；没有思路时，直接描述复杂问题，由 Codex 理解并提出方案。Default 中形成的方案仍属于 Default 回合，完成后才由 Web 通过公开设置接口进入原生 Plan，供后续讨论；具体衔接和限制见[能力表](CAPABILITIES.md)。

规划期间可能进行只读调查，整体确认不等同于逐条 SQL 审批。确认执行后切回默认模式，提交用户编辑的方案并要求原生 `update_plan` 更新实际步骤；输入框上方显示已完成／总步骤和当前状态，不代表数据库扫描或用时百分比。停止后修改条件再执行属于新回合，不承诺数据库事务断点恢复或自动回滚。

工作区初始化移到“设置 → 高级设置 → 初始化工作区”：确认后使用锁定原生指令检查目录并生成 `AGENTS.md`，已有文件不覆盖。它不是新分析的必要步骤。持续目标也在高级设置，是持续推进与预算机制，不是分析计划或定时调度。

本批[最终浏览器](test-results/analysis-workspace-2026-10-27/browser/final-revision/results.json)13/13，0 模型请求、0 页面错误。真实原生设置、直接连接管理和错误重试，与明确标记的对话事件／传输夹具分开记录；夹具中的下载和模型方案决定不等于真实查询或模型兼容通过。独立 DeepSeek Flash＋只读PostgreSQL的[手动计划完整链](test-results/analysis-workspace-2026-10-27/flash-plan/manual-chain/results.json)7/7、[自动决策修后完整链](test-results/analysis-workspace-2026-10-27/flash-plan/automatic-chain-after-policy/results.json)7/7分别通过，各4个普通回合；[简单直接查询](test-results/analysis-workspace-2026-10-27/flash-plan/simple-direct/results.json)3/3，1个Default回合真实返回2220.00且不进入Plan。两完整链实际完成方案修改、批准、首查询后中断、调整条件继续、三问完整回答及CSV／PNG／Markdown下载；[真实分页浏览器](test-results/analysis-workspace-2026-10-27/browser/inline-pagination/results.json)9/9，0模型，另验247行结果分页与完整CSV。[全部真实模型尝试](test-results/analysis-workspace-2026-10-27/flash-plan/summary.json)共7轮18个普通turn/start，失败原始证据保留；[最终工程记录](test-results/analysis-workspace-2026-10-27/engineering/results.json)86份JS／MJS、36份Python AST、141/141行为及原生176方法完整性通过。不以单条成功保证所有复杂问题均会主动规划，也不泛化生产远端或其他数据库配置；详细边界见[验收报告](TEST_REPORT.md)。

## 图片与已移除功能

Flash 的图片输入、识图、图片预览及历史图片显示保留。此前实际模型验收只使用 Flash；本批未新增图片模型验收。已有 Pro 配置可以保留，不作为后续验证模型。不会自动切换模型。

反馈、快速模式和生图已从本项目操作入口移除，后端同样拒绝对应请求或重新启用配置。Web 启动的原生进程通过官方配置关闭相关功能；不修改原生程序或源码包中的能力定义。原有用户历史、授权文件不会被删除。

## 沙箱网络与模型身份

“设置 → 高级设置”中的当前分析 Agent 权限只作用于当前会话；新对话的选择附在其草稿上，首次发送时通过原生 `thread/start` 生效，不修改其他会话或全局默认配置。已有会话使用 `thread/settings/update`，收到真实 `thread/settings/updated` 快照后才确认应用；等待、断线或失败会保留可诊断信息，不自动重试或伪装成功。任务运行中、命令停止回收中、历史恢复中及归档只读时不能更改权限。

| 模式 | 原生审批 / 审核人 / 沙箱 | 行为 |
|---|---|---|
| 请求批准 | `on-request` / `user` / `workspaceWrite` | 工作区沙箱内执行，需要越过权限边界时由用户审批 |
| 帮我批准 | `on-request` / `auto_review` / `workspaceWrite` | 原生审核代理评估需要审批的操作，可能允许或拒绝 |
| 完全访问权限 | `never` / `user` / `dangerFullAccess` | 明确选择并应用后取消 Codex 执行沙箱及操作审批，权限仍受服务端运行账户限制 |

两种工作区模式保留既有网络、额外可写目录等设置。服务端策略或未启用的原生审核功能会限制可选项并说明原因；只读等未匹配的权限显示为自定义，无法核实的默认值不当成已生效快照。请求批准与帮我批准之间切换不重写已有工作区沙箱，以保留原生命名配置来源；当前没有单独展示命名权限名称，也未验收其全部配置组合。三档不依赖 ChatGPT 登录；本项目按实际 DeepSeek Flash 配置验证。“完全访问权限”不提供多租户隔离，当前服务仍是个人环境。

“设置 → 高级设置 → 沙箱网络访问”使用原生配置开关 `sandbox_workspace_write.network_access`；不会切换 `approval_policy` 或 `sandbox_mode`。开启后普通联网命令可在工作区沙箱内执行，工作区外的写入限制和原生危险操作审批仍保留。当前选中且可写的 workspace-write 会话会同步该网络设置。其他历史会话保留原生权限快照，若与全局设置不同，设置页显示“应用到当前会话”，只同步网络字段并保留其他权限。

DeepSeek 生成目录的身份提示已经适配实际提供方，工具和权限指令保持完整。网页还通过原生 `turn/start.additionalContext` 提供实际提供方和模型 ID，避免旧会话继承的 OpenAI 身份提示导致错误自述。应以原生请求及会话设置为准确认底层模型。

## 原生 Skill 与 MCP

技能页仅展示上述四项保留的源码自带技能，并支持启停。技能不再出现在输入框 `/` 菜单；可在对话中说明任务或提及技能名称，让原生按技能规则使用。原生 `UserInput.skill` 协议与启用状态、名称及当前实例真实路径的校验保留，删除菜单不等于卸载技能。项目管理的非原生技能已清理，不操作宿主 Codex 桌面端的全局技能目录。

`openai-docs` 的原生本地参考已验证；在线查询官方文档仍需要对应网络。`skill-installer` 的原生离线帮助已验证，GitHub 在线安装未验证，也不属于本轮仅原生技能的验收范围。显示为已安装不代表其所有在线行为均符合当前网络条件。

在“MCP 服务 → 添加自定义 MCP”中选择 stdio 或 HTTP。stdio 支持启动命令、JSON 参数数组、工作目录及环境变量；命令在服务器上运行。HTTP 支持服务 URL、Bearer Token 环境变量名、固定请求头及从环境变量读取请求头。需要 OAuth 的服务添加后可点击登录。服务添加及启停使用原生配置写入和 MCP 重载；停用后仍保留卡片及原配置，可重新启用。从下一次任务开始应用更新，正在执行的调用遵循原生运行时的处理。

MCP 页面先显示配置与操作按钮，在后台读取轻量工具状态；同一连接下 30 秒内复用目录，点击“刷新连接状态”可主动更新。完整资源只在“查看工具与资源”时获取，慢连接不阻塞页面操作。

MCP 要求用户确认时，网页显示原生确认请求，用户选择后才继续。添加自定义扩展不会改变现有审批策略或开放沙箱网络；凭据只保存在本机原生配置或环境中，不进入项目源码。

## 数据库与回答图表

安装独立扩展（不修改 Codex 上游源码）：

```sh
python3 web/scripts/install_databases.py --node /绝对路径/node --npm /绝对路径/npm
# 下载依赖需要代理时可加 --proxy http://127.0.0.1:15236
```

组件固定版本保存在 `web/database/requirements.txt` 和 `chart-package-lock.json`。Python 适配器、NumPy、pandas、DuckDB 和 Arrow 位于 `.toolchains/databases/`，`mcp-echarts@0.7.1` 及 Node 位于 `.toolchains/chart-mcp/`。ECharts 页面资源随项目提供，不使用外部图表云或对象存储。

从侧栏“数据源”直接添加和管理 MySQL、PostgreSQL、ClickHouse 或 Elasticsearch，无需为每次分析手工选择连接。保存后实际验证连接与只读权限；通过验证后连接才对 Agent 开放；分析 MCP 在首次分析时即可注册，文件／API／纯计算无需先添加数据库。密码保存在当前 `CODEX_HOME/web-databases/` 的私有配置中，不提供给模型、不进入 Git。编辑配置后必须重新验证，停用、删除、断连和配置版本变化都会阻止 Agent 使用连接或旧结果。

所有连接永久只读，没有写入授权入口。MySQL 账号只允许 `SELECT`、`SHOW VIEW`、`USAGE`；PostgreSQL 不接受管理、建表或目标 schema 的写权限；ClickHouse 要求服务器设置 `readonly=1`；Elasticsearch 仅接受读取、索引元数据和指定的只读监控权限。SQL 同时经过语法树校验和数据库只读事务。支持 1–5 条只读 SELECT/CTE，整批先校验；同服务器跨库/schema 查询仅限已配置、启用且连通的范围。文件、外部数据源函数、锁定、DDL、写入与脚本不开放。

连接后直接提问，例如：“查询 Sakila 中租借次数最多的 10 类电影，生成柱状图并说明结论。”Agent 使用原生 MCP 查询；柱状图、折线图、面积图、饼图和散点图直接显示在回答中，支持交互、查看查询及数据、PNG 下载和历史恢复。

完整结果流式写入不可变 Parquet 快照。查询工具仅返回结果 ID、精确行数及字段，避免把全量明细挤进模型上下文。`read_result` 精确读取选定明细，`describe_result` 分页读取字段，`analyze_result` 使用 DuckDB 对完整快照计算并生成新的完整结果，`create_chart` 直接读取真实结果生成图表。原结果不会被摘要替换；对话查询卡自动显示20行分页表格、上一页／下一页及页码跳转，完整CSV仅在表格下方提供一次；数据源页“全部查询快照”用于查看及清理当前服务的快照，明确包含其他分析，不冒充会话隔离。Elasticsearch 聚合同时保存完整原生响应，可下载 JSON。高精度小数、长文本、二进制（base64）与 NULL 保留，超出单次上下文预算时拒绝过大的明细页，不截断单元格。

计划分析可先发送 `/plan`，再要求调查连接与字段、生成方案并等待确认；在计划卡编辑后确认执行。执行中点击停止会发送原生中断，之后可修改计划或补充新条件，在同一会话继续，已完成的结果可按结果 ID 复用。进度来自模型的原生步骤更新，不代表数据库内部执行百分比。原生计划模式允许只读调查，逐条 SQL 是否另需批准由 MCP 工具审批策略决定；这不是数据库事务暂停、回滚或持久任务调度。

单次完整读取最多 60 秒、1 GiB 逻辑数据，结果缓存最多 5 GiB；本地分析最多 30 秒。超过预算会明确失败并清理未完成结果，不把部分数据称为完整结果。图表过大时要求显式筛选或聚合，不自动抽样。超过 DuckDB 精确小数计算范围时要求回原数据库聚合，原始快照仍保留。

网页停止任务时，扩展处理原生 MCP 的 `notifications/cancelled`：MySQL 仅取消该账号当前请求的查询，PostgreSQL 发出取消信号，ClickHouse 按随机 query_id 取消自己的查询，Elasticsearch 关闭搜索 HTTP 连接，本地 DuckDB 中断计算。不会向 Agent 暴露 KILL 管理语句。ClickHouse 25.8 取消自己查询还要求只读账号拥有 `SELECT(query_id,user,query) ON system.processes`；不需要授予 `KILL QUERY` 或写权限，服务器只读设置继续生效。部分数据库操作不保证瞬间终止，连接和服务端超时仍作为兜底。平台行为参考 [ClickHouse 文档](https://clickhouse.com/docs/reference/statements/kill) 和 [Elasticsearch 文档](https://www.elastic.co/guide/en/elasticsearch/reference/8.19/search-your-data.html#search-cancellation)。

输入框右侧圆环显示“最近一次原生采样总量 ÷ 已核实窗口”。分子使用 `last.totalTokens`，即最近采样的完整输入加输出，包含当时保留历史、指令、技能、工具定义与结果；不累加历史消耗、不扣缓存输入，也不重复添加已含在输出中的推理量。默认Flash完整窗口为1,048,576，原生95%可用窗口为996,147；目录与真实原生窗口核对一致时采用完整窗口，不一致则采用该次原生可用窗口并说明完整窗口未知，避免全局配置覆盖会话设置。

这是最近采样快照，生成中和追加工具结果可能尚未计入，不能视为实时精确当前保留量；原生自动压缩检查还会计入部分本地尾部估算。压缩后原生估算标≈，下一次完整采样替换。累计消耗、缓存输入、推理输出、真实原生可用窗口与配置压缩阈值在详情分别显示。已补回历史分页恢复中独立的统计事件，刷新不因较晚的回合列表快照而丢失占用徽标。

DeepSeek Flash/Pro 的独立模型目录设置 `auto_compact_token_limit = 734003`，按完整 1M 的 70% 自动压缩。网页创建、恢复 DeepSeek 会话时使用原生 `total` 范围并开启回合结束检查（`model_post_turn_compact_threshold_percent = 100`，由已达到 70% 的主阈值触发；不能把此值直接设为 70，否则会乘以原生 95% 可用窗口而提前压缩）。保留原生回合前、中、后检查；上下文压缩根据这些配置自动触发，输入框不再提供 `/compact` 入口或调用。原生压缩接口仍保留，本批不修改自动压缩机制或阈值。压缩可能丢失历史细节，不能替代完整数据库快照。

输入框 `/` 菜单只提供 `/plan`；选择只填入，发送才触发，中文组合输入与 Shift Enter 保留。其他旧命令发送时给出说明并保留原文。四个源码自带技能仍可从主技能页启停，并在对话中按任务调用；初始化和持续目标只从高级设置进入。

计划模式由 `/plan` 手动进入，使用原生 `collaborationMode`，输入框下方仅展示模式状态及退出按钮。建议计划单独显示，支持编辑后确认，在原会话切换默认模式并执行，保留输入框中尚未发送的文字、附件和技能；`update_plan` 的真实进度固定显示在输入框上方，包含已完成/总步数与当前步骤，点击“查看分析步骤”展开；等待审批、停止、中断、失败和完成各有状态。同一浏览器可从本地缓存恢复已收到的步骤，新浏览器没有原生瞬时事件时不伪造历史进度。清单进度来自模型事件，不是执行引擎的百分比，也不是每一步审批。

DeepSeek 不展示快速档位；生图与快速模式均按本次非必要范围处理。项目使用原生项目存储，新聊天可以不关联项目，工具能力保留。持续目标由用户明确设置，支持暂停并停止、继续、移除和原生状态展示；目标预算口径为未缓存输入加输出，与上下文占用不同。原生新会话首个回合缺少统计基线时，短目标的 `tokensUsed` 可能为 0，不能视作没有消耗。反馈保存和上传均已移除。未发现开源画草图画布的对应实现，因此没有伪造此入口。

专项复验使用独立 `.local-state/database-release-acceptance` 配置、8770 端口及现有的四类只读测试库。设置 `CODEX_DATABASE_CREDENTIALS` 指向私有测试账号文件（不提交），按顺序运行 `database_desktop.mjs`、`database_results_desktop.mjs`、`database_cancellation_desktop.mjs`；后两项通过 `CODEX_DB_CONNECTION_IDS` 读取首项生成的 ID。`database_results_desktop.mjs` 的断连测试需要显式设置 `CODEX_TEST_ALLOW_CONTAINER_RESTART=1`，仅用于独立测试容器。取消测试的服务器脚本只观察从网页发起的查询状态，不从命令行发起功能测试。测试准备与运行时工具分离。

## 源码完整性与版本

```sh
python3 web/scripts/verify_upstream.py
python3 web/scripts/verify_upstream.py --native
git -C upstream status --porcelain
```

基线：`upstream-lock.json`。构建脚本使用 `--locked`，将全部 Cargo 产物写到 `.toolchains/build-target/`，同时编译 CLI 与 code-mode host。构建前后校验源码干净，保存提交号、树哈希与二进制 SHA-256 到忽略的 `native/provenance.json`。默认启动还会核对二进制校验值及源码/执行程序的完整协议方法集合；缺失或额外方法都会阻止启动。它不会自动回退到已安装的旧 Codex。

更新官方源码：

```sh
python3 web/scripts/update_upstream.py --check
python3 web/scripts/update_upstream.py --jobs 2
```

更新脚本只检出官方提交，更新锁文件，并重新编译、核对完整协议。它会拒绝带本地改动或生成文件的上游目录。构建缓存放在运行包之外，避免原生后台服务复制编译缓存。更新完成后重启服务、运行验收，再提交父仓库中的锁文件和子模块指针。Web 层从新程序导出接口定义，新增接口会自动进入原生能力面板。

## 项目结构

```text
upstream/               原始 Codex Git 子模块
upstream-lock.json      最新源码基线
web/server.py           HTTP/WebSocket/stdio/PTY 桥接
web/start.py            启动与隔离 DeepSeek 配置
web/public/             Web 页面与本地终端组件
web/scripts/            源码编译、完整性与测试工具
web/tests/              传输、安全、原生与浏览器验收
native/                 本机构建产物（忽略）
.toolchains/            本地工具链（忽略）
.local-state/           本地原生配置及会话（忽略）
workspaces/             默认任务工作区（忽略）
```

WebSocket 断开时会终止该连接拥有的原生进程，当前执行会受到影响；重连后从原生会话历史恢复。多个标签页有各自的原生进程。32 MiB 为单条 WebSocket 消息上限，浏览器单个附件限 16 MiB。

## 验收

```sh
python3 -m unittest discover -s web/tests -v
python3 web/scripts/verify_upstream.py --native
```

必要数据库依赖与 Playwright 使用项目已有工具链。可选真实原生/传输测试需要本机套接字权限；明确跳过不计通过。浏览器测试必须使用独立配置与测试工作区：

```sh
python3 web/start.py --deepseek --state-dir /tmp/codex-web-flash-audit/home --port 8785 --workspace /tmp/codex-web-flash-audit/workspace
# 另一终端配置 PLAYWRIGHT_MODULE、CHROMIUM_BIN，并使用可用 Node.js：
CODEX_WEB_URL=http://127.0.0.1:8785 CODEX_TEST_WORKSPACE=/tmp/codex-web-flash-audit/workspace node web/tests/flash_menu_followup_desktop.mjs
CODEX_WEB_URL=http://127.0.0.1:8785 CODEX_TEST_WORKSPACE=/tmp/codex-web-flash-audit/workspace node web/tests/native_builtin_skills_desktop.mjs
CODEX_WEB_URL=http://127.0.0.1:8785 CODEX_TEST_HOME=/tmp/codex-web-flash-audit/home node web/tests/chat_state_desktop.mjs
CODEX_WEB_URL=http://127.0.0.1:8785 node web/tests/connection_state_desktop.mjs
CODEX_WEB_URL=http://127.0.0.1:8785 CODEX_TEST_HOME=/tmp/codex-web-flash-audit/home CODEX_TEST_WORKSPACE=/tmp/codex-web-flash-audit/workspace node web/tests/native_flow_audit.mjs
```

新验收只调用 `deepseek-flash`。当前数据分析工作台、唯一 `/plan` 入口和高级设置的验证记录见 [验收报告](TEST_REPORT.md)。以下旧会话命令与旧计划斜杠测试用于对应历史版本，不能据其结果宣称当前菜单通过；现行验收应使用本轮保留入口的测试。历史会话命令专项 `composer_thread_commands_flash_desktop.mjs` 要求同时显式设置 `CODEX_TEST_HOME`、`CODEX_TEST_WORKSPACE` 和 `CODEX_WEB_URL`，仅在独立 `/tmp` 工作区建立本轮合成 Git 项目及新会话，实际验收压缩、审查、分叉、非空导出和回退，并清理自有数据；不读取旧会话或改全局配置。无模型的入口和只读保护另由 `composer_thread_commands_desktop.mjs` 验证。压缩专项 `flash_compaction_followup_desktop.mjs` 仅能在独立实例运行，会临时降低阈值并恢复；OAuth 专项 `flash_oauth_mcp_desktop.mjs` 仅启动本机测试服务。自动记忆专项 `native_memory_auto_flash_desktop.mjs` 需要已有自然闲置至少一小时的合格历史，无合格源明确退出，不把空跑算通过。数据库专项支持 `CODEX_TEST_HOME` 精确指定 `/tmp` 独立实例，凭据仍通过私有文件提供，不写入测试结果。

数据库 Agent 专项还需先配置并验证独立只读示例库，将 `CODEX_TEST_DB_CONNECTION_ID` 指向其真实连接 ID，同时设置 `CODEX_TEST_HOME`、`CODEX_TEST_WORKSPACE`、`CODEX_WEB_URL`。`database_agent_workflow_desktop.mjs` 验证 Sakila 的计划、修改批准、停止、修改条件继续与最终三问；`database_multiquestion_desktop.mjs` 验证普通聊天一次多问。脚本核对独立 SQL 基准和数据指纹，不能指向真实业务库作实验。

当前仅保留 `/plan`；`/init /goal` 等其他旧斜杠入口改由对应页面或高级设置进入；纯账号、生图、Pro 搜索源码保存在不可执行的 `web/tests/history/removed-services/`，历史结果不改写。无独立环境、零检查或检查失败均不能返回假成功。

本轮能力、修复、逐项测试及剩余条件见 [CAPABILITIES.md](CAPABILITIES.md)、[WEB_AUDIT.md](WEB_AUDIT.md) 和 [TEST_REPORT.md](TEST_REPORT.md)。构建、语法、截图、协议和真实模型验证分别记录；项目没有前端打包或 TypeScript。

## 参考与许可

- [Codex 开源仓库](https://github.com/openai/codex)
- [OpenAI app-server 文档](https://developers.openai.com/codex/app-server)
- [DeepSeek 原生 Codex 集成说明](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/)
- Markdown：[Marked](https://marked.js.org/) 18.1.1（MIT）与 [DOMPurify](https://github.com/cure53/DOMPurify) 3.4.17（Apache-2.0 / MPL-2.0）；静态组件、许可证和 npm 完整性记录保存在 `web/public/vendor/`。
- xterm.js 6.0.0 与官方 @xterm/addon-fit 0.11.0：MIT，许可证分别保存在 `web/public/vendor/XTERM-LICENSE` 和 `XTERM-FIT-LICENSE`。所有组件随页面本地提供，无需 CDN。

本项目为独立 Web 界面，不是 OpenAI 官方桌面产品。


## 2026-10-26 稳定性排查

本轮会话草稿、提交事务、审批连接归属、流式历史恢复、运行会话列表与小窗口交互的修复、复现步骤及真实验证见 [WEB_AUDIT.md](WEB_AUDIT.md)。文本草稿按标签页和会话保存，附件在当前页面中按会话保留；重连不会自动重发任务。

停止流程已补齐：仅调用 `turn/interrupt` 会中断回合，Agent 的可续接命令仍可能存活。后续核查已确认本版本原生 `thread/backgroundTerminals/list` 与 `terminate` 可以定向回收，单命令及并发隔离验证均通过，不需要修改 Codex 核心；默认停止按钮及目标暂停/移除已串联这一步，确认本轮 managed terminals 清空后展示结果，失败可重试。页面保留未确认退出提示，原始失败及后续验证见 `WEB_AUDIT.md`。


## 当前桌面验收记录

最新2026-10-27批次为数据分析工作台：Skills／MCP 主入口与用户管理保留，数据源页直接配置启停全部可用连接，无单次来源选择和成果侧栏；唯一斜杠入口为 `/plan`，结果、图表和结论在对话中下载。最终浏览器13/13、0模型，真实原生设置及管理与明确标记的UI／传输夹具分别记录。真实Flash手动计划链7/7、自动计划修后链7/7、简单Default直接查询3/3及真实PG分页浏览器9/9已分别完成；7轮共18个普通模型回合，最终141/141行为及原生完整性通过，失败尝试和完整分类见 [TEST_REPORT.md](TEST_REPORT.md)。中间侧栏／来源选择／显式计划开关实现与旧模型证据保留为历史，不算当前通过。桌面右键顺序缺截图，多租户隔离未实现。

升级后通过 `python3 web/start.py --deepseek --state-dir 原DeepSeek配置目录` 重启，以重新生成正确的原生V1委派能力目录；随后刷新建立新原生连接。旧V2会话的委派版本无法自动迁移，需要新建会话，历史不删除。原生目标预算仍可能漏计，不能当硬费用上限；网页显示其与真实已观测消耗的差异。多租户未实现，严格国际出口测试已取消。
