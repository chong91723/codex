# 实际验收报告

验收日期：2026-10-25。官方源码基线：`970111f6cb62cc02fe36a82ea7d71b37a2889c97`。已重新获取官方 HEAD，确认仍为此提交。上游源码、未跟踪文件和忽略文件检查均干净；CLI、Code Mode Host、Linux bwrap 与 ripgrep 使用完整原生包布局。源码和执行程序导出的四组完整协议定义一致，共 176 个客户端方法。源码内版本号为 `0.0.0`，通过提交号和构建哈希标识实际版本，没有修改上游版本号。

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
