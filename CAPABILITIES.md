# 能力与范围对照表

检查更新：2026-10-27（固定源码基线不变）。目标：桌面浏览器；允许 DeepSeek 官方 API 和国内公网，运行时不依赖国际公网。安装/编译/更新所需外网单独计算。手机端不在范围。

## 当前交付状态

2026-10-27新增：会话管理集中至侧栏行的右键/“…”，目标会话ID独立绑定，保留原功能、删除确认及原生拒绝原因；菜单12组、归档11组通过，另用本轮新建合成Flash历史补验非空导出及回退竞态4组。当前桌面右键菜单截图缺失，具体条目和顺序仍待确认，不以记忆认定一致。

输入框内左下角新增会话级Agent权限：请求批准=`on-request/user/workspaceWrite`，帮我批准=`on-request/auto_review/workspaceWrite`，完全访问=`never/user/dangerFullAccess`。新草稿经原生start回执确认、已有会话经真实settingsupdated/恢复快照确认，保留工作区网络和额外路径，策略及feature限制显示原因。只读和未知默认值不误标；ask↔auto不重写原workspacePolicy以保留命名配置来源，未单独实现命名profile名称展示或验收其所有组合；无ChatGPT账号要求，完全访问不等于租户隔离。权限界面8组通过，三档实际工作流有效覆盖齐全；首轮测试等待失败及增量重复full均保留，详见[最新验收报告](TEST_REPORT.md)。后续ACK迟到/原生恢复确认等真实协议增量9组通过、1个已验证模型用例明确跳过，权限状态单测12项通过；未确认权限仍可停止当前任务。JS70/Python AST36、相邻状态用例及原生176方法完整性检查分别通过，未重跑72项Python后端套件。

新增历史与可见性改进：原生最新20回合优先、旧页按需加载；侧栏明确最近会话/已归档与永久删除；输入框上方常驻真实步骤摘要。日常旧ChatGPT登录态引起启动等待，已以原生ephemeral配置跳过且保留授权文件，新连接initialize实测455–826ms。完整证据见 `test-results/history-usability-2026-10-26/`。

测试插件和24好玩MCP已卸载，前端插件侧栏及/apps入口隐藏，原生协议能力保留。审查后委派已定位为生成模型目录错误继承V2能力声明，修为原生V1并在同组合真实验收。Web首次发现旧分叉已补当前实例只读元数据接入；目标消耗以真实Web观测与原生预算分别展示。最终证据：`test-results/final-fixes-2026-10-26/`。

升级必须用DeepSeek启动器重启以更新生成目录，并重新建立原生连接。已持久化V2的旧会话保留历史，需新建兼容会话执行委派；原生目标预算漏计不可通过公开接口写回，不能作为硬费用上限。严格国际出口测试已由用户取消。

## 前批范围调整与复验（历史）

用户后续明确：以后只使用 `deepseek-flash` 验证；移除 ChatGPT 模型/账号强依赖内容、反馈、快速和生图；删除项目管理的非源码自带技能。源码内置共五项，`imagegen` 排除后保留 `openai-docs`、`review-agent`、`skill-creator`、`skill-installer` 四项。旧 Flash/Pro 对照和测试结果属于前轮历史，不计入本轮 Flash 通过项。

本轮证据位于 `test-results/flash-followup-2026-10-26/`。保留的十三个斜杠命令已逐项完成真实路径验收；菜单公共测试、具体业务验收、后台协议和模型兼容性分别记录。

后续验收口径：用户明确不再要求严格国际出口阻断测试，该项从待验收清单移除，未标记为测试通过。远端扩展改为分别选择一个中国大陆可用的真实 MCP 和原生插件做代表性验收；不将代表性结果泛化到其他配置。

## 固定基线

- 实际仓库 `/root/Codex`，本批开始父仓库HEAD为`8befc8eccedbc3e246a54c5fdffb83da21598c46`；前轮能力核验起始HEAD为`f31cbabb1a6677d116df67cc6631be948973cd42`。前轮起始改动的 diff、23 个文件及 SHA-256 已保存到 `/tmp/codex-web-capability-audit/baseline/`；不回滚前轮修复。
- 原生程序 `native/bin/codex` 报告 `codex-cli 0.0.0`，因此不拿此开发版本字符串与其他发行版混用。身份以 `upstream-lock.json` 的提交 `970111f6cb62cc02fe36a82ea7d71b37a2889c97`、树 `e09c71b9069e689c9c997c766d0de8b7b288583f` 和 `native/provenance.json` 的二进制 SHA-256 为准。
- 集成：Python 3.12 标准库 HTTP/WebSocket 桥接，每个浏览器连接独占一个未修改的 `codex app-server --listen stdio://`；一个进程内允许多个 thread。初始化开启实验协议。实际生成 ClientRequest 为 **176** 方法；完整盘点见 [protocol-inventory.json](test-results/capability-audit-2026-10-26/protocol-inventory.json)。方法数量不等于可用功能数量。
- 前端为普通 JS/CSS，无打包和 TypeScript。`app.js` 管连接、会话、事件和通用页面；`native-ui.js` 管计划/目标/项目；`permissions.js` 管会话权限选择和原生确认；`context.js` 管统计；`databases.js` + 独立 Python MCP 管只读数据库。配置由原生 config APIs 读写，模型/目录/权限按 thread settings 生效。
- 启动：`python3 web/start.py --deepseek --state-dir <独立目录> --port <端口> --workspace <测试目录>`；需有效 `DEEPSEEK_API_KEY`。前轮独立实例为 `127.0.0.1:8784`；最新完整版本已在 `127.0.0.1:8789` 以标准隐藏输入启动，工作区 `/tmp/codex-web-flash-final-audit/workspace`，工作区与配置均在 `/tmp/codex-web-flash-final-audit/`，未复制 ChatGPT 授权；清除了 HTTP/HTTPS/ALL_PROXY，保留 DeepSeek 直连。没有改变宿主机路由或施加系统出口防火墙，不能把此环境称为“已通过全网封锁测试”。
- 当前验证模型：provider `deepseek`，仅 `deepseek-flash`；Pro 目录保留但本轮未调用；原生 Responses，实际目标 `https://api.deepseek.com/responses`。第三方普通 Chat Completions 地址不可直接替代。
- 桌面参考：用户已提供两张新会话 `/` 菜单截图（`codex-clipboard-fffaa287-1cde-4b6e-89c8-1cd66e40c1df.jpg`、`codex-clipboard-f735667f-02f5-4da6-bc12-0bd4dc30d1f8.png`）。已据此实现输入框上沿的紧凑菜单、命令与技能分组、名称/说明/来源、选择后发送。截图未给出桌面构建号；当前右键菜单没有截图，具体条目和顺序待确认。权限三档另有锁定开源TUI预设依据，不能据此宣称闭源桌面布局完全一致。

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
| C01 连接/诊断 | P initialize、server/diagnostics；原生 stdio | 连接状态、错误、重连 | 本机；模型无关 | 保留；前轮连接/服务重启已验证；本批ephemeral启动与第三方Flash实际工作流已验证，MCP OAuth使用独立存储 |
| C02 项目/目录 | P project CRUD、thread/metadata/update、fs/readDirectory | 目录选择、`/projects` | 本地；模型无关 | 保留；本轮真实项目创建/编辑/关联/解除/删除通过，目录保留 |
| C03 会话历史/搜索/分页/分叉/归档/删除/回退 | P thread APIs，T 实际存储 | 侧栏行右键/“…”，恢复错误 | 本地；删除需确认；回退不撤销磁盘 | 保留；已见索引和当前CODEX_HOME只读元数据补候选，均经原生确认；此前从未见的真实旧fork首次发现/搜索/刷新/归档恢复删除5组通过，23项只读与边界回归；最新20回合/按需更早页真实6/6；本批侧栏目标菜单12/12、归档恢复/删除11/11、新建合成真实历史导出和回退4/4 |
| C04 流式对话/多轮/执行中补充 | P turn/start、steer、item delta/completed | 输入、过程折叠、最终回答 | DeepSeek Responses + 工具格式 | 保留；Flash/Pro 分别验证，不能用聊天代替工具验收 |
| C05 模型/provider/推理强度 | P model/list、thread/settings/update；C | 模型/强度控件、`/model`、`/reasoning`、设置 | provider 实现 Responses；真实模型目录 | 保留；禁止静默 fallback；历史 OpenAI 数据可读 |
| C06 命令/文件修改/沙箱 | T native unified exec、apply_patch；P fs APIs | 对话工具过程、文件面板、差异 | 工具调用能力；本机 OS 沙箱 | 保留；不另写代理循环；终端 UI 沿用原产品隐藏要求 |
| C07 停止与本轮命令回收 | P turn/interrupt + backgroundTerminals list/terminate；T | 停止、回收状态、失败重试 | 实验 API 已启用；仅匹配本轮 itemId | 保留；CW-009 已接入；单进程、同线程旧后台任务、A/B 隔离、失败重试、目标暂停及回收期间导航通过 |
| C08 审批/拒绝/用户问题/权限请求 | P ServerRequest、resolved | 输入框内权限选择、审批卡片和明确归属 | 原生策略与requirements；自动审核需guardian_approval启用及Flash工具能力；不要求ChatGPT登录 | 保留三档；会话级界面8/8含真实新建Flash，人工拒绝文件未创建、原生auto_review允许后命令输出、full实际文件后恢复工作区模式均有真实证据；初次ask测试等待失败及增量重复full另记，不称一次3/3。后续真实通知先于ACK、同线程resume确认等9组协议/浏览器增量与12项状态单测通过；ask↔auto请求不重写沙箱以保留profile来源，不声称命名profile全部组合已验 |
| C09 多会话并发 | P thread/turn IDs；T 原生线程管理 | 侧栏运行状态、分会话草稿 | 不同 cwd 才隔离文件；不等于租户边界 | 保留；前轮 A/B 事件与文件已验证 |
| C10 手动/自动压缩、上下文统计 | P compact、tokenUsage；C catalog | 侧栏会话菜单、统计圆环 | 压缩调用当前Flash；可能丢细节 | 保留；本轮手动1组、自动及阈值恢复2组通过；临时阈值20,000，真实31,554→27,493并续聊保留标记，不冒充默认阈值实耗验收；上下文默认按最近采样/核实完整窗口，实际10534/1048576=1.0%，分页恢复丢统计已修复，12+4行为与4组只读浏览器通过 |
| C11 计划模式/步骤 | P collaborationMode、plan delta、turn/plan/updated | 模式、计划确认、步骤状态 | 模型须遵循计划/工具协议 | 条件保留；最新Flash真实Sakila计划→编辑批准→首查询完成→停止待审批的下一查询→改条件继续→步骤完成和三问回答6/6；普通聊天一次三问另通过。保留草稿、恢复模式竞态已修；不是持久步骤调度或数据库事务断点，逐SQL审批取决于原生工具策略；输入框上方真实步骤摘要和等待/终态可见，13状态+12合成UI+3真实Flash通过 |
| C12 持续目标 | P thread/goal set/get/clear；T | /goal，状态、暂停/继续 | 原生目标工具与预算；非云调度 | 保留；完整生命周期及CW-021通过；网页独立真实观测与原生预算分列，16项行为+6组Flash通过。原生首回合/终态漏计不可写回，明确未知/下界及预算限制 |
| C13 源码自带Skills发现/启停/调用 | skills/src/assets/samples；P skills/list、config/write、UserInput.skill | 技能页、输入框 /；不再提供额外导入 | 保留四个原生Skill；在线依赖分开核实 | 保留；四个均真实Flash调用，5组验收；2375个非原生定义已从项目受管目录清理，宿主全局目录不动 |
| C14 stdio MCP / 工具 / 资源 | P mcpServer*；原生 MCP manager | 服务配置、状态、按需详情、对话调用 | 本机进程可离线；模型工具格式 | 保留；本轮本地真实 MCP + Flash/Pro 验收 |
| C15 HTTP MCP / OAuth / elicitation | P OAuth、tools、resources、ServerRequest | HTTP配置、服务授权和确认 | 按实际国内/内网端点及后端依赖判定，OAuth不等于ChatGPT登录 | 条件保留；本机HTTP/OAuth 6组通过；另真实远端24好玩匿名MCP经网页添加、8工具/1资源目录、Flash搜索→详情、启停及清理4项增量通过，含真实429错误反馈；未逐个调用全部工具或读取资源内容，不泛化其他服务 |
| C16 本地插件/市场 | P plugin/list/read/install、marketplace APIs；实际来源配置 | 插件目录、协议操作 | 本地目录/国内源可用；插件内部网络逐项核实 | 条件保留底层能力，按用户要求隐藏常规前端入口；Playwright代表性验收及额外true失败证据保留。测试插件/MCP现已卸载并核查；不恢复云Apps或安装非原生Skill |
| C17 云端Apps/连接器 | A apps_enabled_for_auth / uses_codex_backend | 已移除对应操作入口 | 当前实现强依赖云端账号且无现成国内路径 | 排除；前后端均拒绝app/*；保留本地插件/MCP及原始协议定义 |
| C18 ChatGPT登录、订阅、额度、用户验证 | A account与userVerification处理器 | 提供方连接页替代账号登录页 | DeepSeek env_key不经过账号登录；用户验证仅ChatGPT身份 | 移除；前后端拒绝对应请求，历史授权文件保留，不静默换模型 |
| C19 生图/快速档位 | 原生image_generation、fast_mode、service_tier及内置imagegen | 已移除对应操作与Skill入口 | 用户明确移除，无替代模型接入 | 移除；原生受支持启动配置关闭、后端拒绝重新启用；源包能力定义不改，Flash图像输入保留 |
| C20 图片上传/预览/本地图片显示 | P UserInput image、fs/readFile；C modalities | 附件、图片预览 | Flash 目录声明 image；Pro 仅 text；不能自动换模型 | 条件保留；Flash 真实本地色块识图通过；Pro 图像发送前拒绝并保留草稿/附件，无切换模型 |
| C21 实时语音/音频/语音列表 | P thread/realtime APIs及实验WS配置 | 保留定义，当前不提供启动操作 | 原生默认GPT实时模型；Flash无已配置且验证的实时服务 | 条件未满足；start明确拒绝，不发默认GPT请求；不能据此宣称所有可配置实时服务永久绑定ChatGPT |
| C22 搜索/联网浏览 | 原生工具及MCP | 工具活动/具体服务配置 | Flash Responses托管web_search不作为已支持路径；国内MCP另按配置验证 | 条件保留；默认web_search=disabled；前轮Pro实测为历史，不能替代本轮Flash验证 |
| C23 Hooks | P hooks/list；core hooks 执行器 | 配置入口、执行事件 | 本地命令可离线；具体 hook 可访问外网 | 条件保留；无需为每个自动 hook 加按钮；本轮线程级五类生命周期事件与真实命令通过，全局配置/文件哈希不变；不泛化所有处理器类型 |
| C24 Guardian自动审核 | P审核事件/确认；ext/guardian-reviewer模型选择 | 输入框“帮我批准”、审核结果及用户确认 | 当前目录无默认审核模型时原生回退父Flash；需要guardian_approval和策略允许，未独立捕获HTTP请求体 | 条件保留；前批真实允许、拒绝及手动确认2组保留；本批经权限选择器切为auto_review后真实approved与命令stdout通过。自动审核会拒绝，不是全部批准，手动确认只记录授权不自动重执行 |
| C25 记忆 | P memory/status、thread/memory；原生memories工具 | 配置/协议和原生工具 | 辅助模型显式Flash；原生自动提取要求源会话至少闲置1小时 | 条件保留；真实笔记新增/读取/检索通过；自然满一小时后6条历史真实提取、v2合并及3583字符原生摘要读回，v2Ready=true；全局功能未擅自开启 |
| C26 队列/分组/会话附件 | P thread/queue、threadSection、attachment APIs | 通用协议；无需为了接口增按钮 | queue/add可自动执行，CRUD需未加载线程；存储与模型交付分开 | 条件保留；本轮存储3组通过：增改删、排序、分页、刷新、隔离和附件归档过滤；另有Flash自动消费、忙碌拒绝与停止后手动启动2组真实通过，不以CRUD冒充执行 |
| C27 子代理/审查 | 原生 spawn-agent tools、P review/start | 对话工具事件、会话审查入口 | 模型工具能力；可独立第三方配置 | 条件保留；目录正确声明原生V1，真实同连接审查后新父worker 2/2通过，完整任务/父子关联/Flash身份/文件结果已验；非前端串线。V2字段编码不兼容、旧V2会话需新建，不重写循环 |
| C28 数据库/图表/完整结果 | Web独立只读MCP；不是Codex内置数据库 | 数据库页、结果和图表 | 本机/国内数据库与既有驱动；资源本地 | 保留扩展；本轮MySQL/PostgreSQL/ClickHouse/Elasticsearch真实读取、跨库范围、写入拒绝及Flash真实图表已复验；不是仅历史证据；新增Sakila复杂三问真实计划/批准/停止/修改继续/最终结果6/6、普通一轮多问通过。SQL结构及日期format误判修复，13项回归及真实聚合通过；最新MCP原SQL浏览器完整链3/3通过，run3旧MCP一次format拒绝与透明恢复保留 |
| C29 本地反馈 | P feedback/save | 操作入口已移除 | 用户明确移除 | 排除；后端拒绝feedback/*，不再创建反馈包 |
| C30 上传反馈 | P feedback/upload | 操作入口已移除 | 用户明确移除且网络范围外 | 排除；前后端拒绝，不上传 |
| C31 平台/远程环境 | P windowsSandbox、environment、remoteControl | 协议定义/条件说明 | Windows 不适用 Linux；远程控制中继、认证、网络待核实 | Windows 条件保留；原生 remoteControl 的 auth.rs 明确拒绝 API key、要求 ChatGPT，因此当前远程控制路径排除；environment 其余配置待核实 |
| C32 云插件分享/内部测试入口 | core-plugins remote::ensure_chatgpt_auth、mock协议 | 已移除对应执行入口，保留定义 | 分享要求ChatGPT/workspace；内部测试非业务能力 | 排除对应路径；不阻断本地plugin/list/read/install及MCP |
| C33 云自动化/画布/闭源桌面专属 | 未找到该锁定版本适合本项目的公开入口 | 不伪造入口 | 闭源/私有或证据不足 | 待核实/超范围，不能把原生持续目标认作定时调度 |
| C34 多租户 | 现 Web 单 token、同 UID/env/CODEX_HOME，不是上游业务能力 | 当前个人服务，无租户 UI | 必须后端授权 + 密钥/文件/执行环境/配额隔离 | 当前未实现；单独范围工作，不将本次定向进程回收宣称租户隔离 |

最新证据见 [WEB_AUDIT.md](WEB_AUDIT.md) 和本轮 summary。排除路径由前后端校验，Web启动原生进程使用支持的关闭配置；这不等于OS出口策略、多租户隔离或任意命令/MCP的安全白名单。协议源定义176项保持原样，界面只列当前范围内操作；用户文件、历史、授权和Codex源包保留。

## DeepSeek 快速模式与生图的专门核验

用户已明确两者非必要，不新增适配层或替代模型。已读取官方 [Responses 兼容说明](https://api-docs.deepseek.com/guides/responses_api/)、[思考模式](https://api-docs.deepseek.com/guides/thinking_mode/) 和 [模型目录定义](https://api-docs.deepseek.com/api/list-models/)，并用当前凭据**直连实际 GET /models**，只保存非敏感字段到 [deepseek-model-capabilities.json](test-results/capability-audit-2026-10-26/deepseek-model-capabilities.json)。

- 原生快速档位使用 `service_tier`；DeepSeek 官方明确不支持该参数，且不支持的参数可能被忽略，因此“请求没有报错”不能证明快速生效。`low/high/max` 与 `none` 的思考控制是另一项能力，不伪装成优先档位；保留现有有效推理控件，不新增快速按钮。
- 当前实际 Flash/Pro 均返回 `output_modalities=[text]`；Flash 输入为 text/image，Pro 为 text。没有提供 DeepSeek 原生生图入口。外部 MCP 生图要另有符合网络/模型条件的真实配置，本轮未建设。内置 OpenAI imagegen 技能标明当前范围不可用，未删除其文件或已有配置。
- Flash **识图**已从网页真实上传本地测试图并正确识别红背景/蓝方块；这不作为生图证据。
