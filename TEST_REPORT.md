# 实际验收报告

验收日期：2026-10-25。官方源码基线：`970111f6cb62cc02fe36a82ea7d71b37a2889c97`。已重新获取官方 HEAD，确认仍为此提交。上游源码、未跟踪文件和忽略文件检查均干净；CLI、Code Mode Host、Linux bwrap 与 ripgrep 使用完整原生包布局。源码和执行程序导出的四组完整协议定义一致，共 176 个客户端方法。源码内版本号为 `0.0.0`，通过提交号和构建哈希标识实际版本，没有修改上游版本号。

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
