# Codex Web Native

基于 Codex 原生运行时的个人 AI 网页助手，页面与交互参考 ChatGPT 网页端。完整保留 Codex 的技能、MCP、文件、沙箱、审批、CLI 及全部原生协议入口。代理内核直接从最新 Codex 开源源码编译；Web 层只做界面与协议传输。上游源码以子模块保存在 `upstream/`，禁止在该目录修改源码。

## 获取与运行

```sh
git clone --recurse-submodules --branch codex/web-native-desktop git@github.com:chong91723/codex.git Codex
cd Codex
# 安装 upstream/codex-rs/rust-toolchain.toml 指定的 Rust 版本。
python3 web/scripts/build_native.py --jobs 2
python3 web/start.py
```

浏览器打开 <http://127.0.0.1:8765>。默认使用本机 Codex 配置和登录信息。Web 服务仅依赖 Python 3.11+ 标准库，不需要 Node、npm、前端打包或 CDN；可选浏览器验收需要 Playwright。

当前原生构建脚本针对 Linux x86_64。编译需要 C/C++ 编译器、pkg-config、CMake，以及 OpenSSL、ALSA、DBus 和 libcap 开发头文件。构建脚本同时编译 CLI、code-mode host 和源码自带的 bwrap，再调用未修改的上游打包器组装标准目录及 ripgrep；不能只复制 CLI 单个可执行文件。若已安装 ripgrep，可传入 `--rg-bin /绝对路径/rg`。

使用 DeepSeek 测试或运行：

```sh
python3 web/start.py --deepseek
```

启动时隐藏输入 API 密钥，也可通过 `DEEPSEEK_API_KEY` 环境变量提供。密钥只进入进程环境，不保存到源码、Git、配置文件或访问日志。这个模式使用 `.local-state/deepseek/` 中的独立原生配置，不覆盖现有 `~/.codex` 配置；模型为 `deepseek-flash`，接口为原生 Responses。

可使用 `--port 8766`、`--workspace /绝对/项目路径`。需要远程访问时先设置 `CODEX_WEB_TOKEN`，然后使用 `--bind 0.0.0.0`；首次访问 `/?token=设置的令牌` 建立 HttpOnly 会话，页面随即移除 URL 中的令牌。跨设备访问应使用 HTTPS 反向代理或 SSH 本地端口转发。

## 非 ChatGPT 模型

DeepSeek 模式不需要 ChatGPT 登录。网页不会给会话、文件、沙箱、审批、技能、MCP、本地插件、历史和 CLI 添加 OpenAI 账号检查；是否需要认证由当前原生模型提供方决定。这些功能已使用真实 DeepSeek 从网页验收。

其他服务沿用原生 Codex 的 `model_providers` 配置，要求服务实现 Codex 支持的 Responses 协议、模型和工具格式。可以使用独立的 `CODEX_HOME`，再运行 `python3 web/start.py`；也可以在网页“设置 → 高级配置”中编辑原生用户配置层。密钥应通过提供方的 `env_key` 对应的环境变量注入。

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

## 原生能力入口

- 会话：新建、恢复、搜索、分页、重命名、分叉、归档、永久删除、上下文压缩、历史回退、代码审查、JSON 导出。选中的会话保存在当前标签页 URL 中，刷新、书签及浏览器前进/后退可直接恢复；恢复失败会明确显示错误并阻止静默新建。同一会话被另一页面占用时显示只读历史，关闭占用页面后可重试继续。
- 对话：输入框下方并排选择模型与思考强度，通过左下角“＋”添加图片或文本文件（支持多选、预览与移除）；流式回答、推理摘要、工具执行、文件差异、计划、子代理事件、中断与执行中补充输入、图片和文本附件。每个任务的思考、过程说明、命令、文件更改及工具过程整体默认折叠，最终回答独立显示并可复制；支持 Markdown 表格、列表、链接与代码块，宽表在回答内部横向滚动。人工确认继续直接显示。
- 交互：命令与文件修改审批、权限请求、用户问题；任意服务端请求均保留自定义 JSON 响应入口；原生 Guardian 审核结果可显示并由用户确认被拒绝的具体操作。
- 扩展：原生技能发现、启停、调用；从本机上传自定义 `SKILL.md` 或完整 Skill 文件夹；添加 stdio / Streamable HTTP MCP、启停、OAuth、工具与资源；插件和应用目录。
- 设置：原生配置读取、按项写入、沙箱和审批策略、账户登录与额度。
- **原生能力面板**：启动时从实际源码编译的程序导出完整实验性 JSON Schema；全部客户端方法可选择、查看参数、生成必填参数模板并原样调用，所有事件可查看。未做专用界面的开源功能也通过此入口使用。
- **原生 CLI 终端**：使用真实 PTY 和本地 xterm.js 运行同一源码编译的 `codex`。参数以字符串 JSON 数组输入，例如 `["--help"]`、`["mcp", "list"]`、`["resume"]`。先点击“启动 CLI”进入原生命令行；支持中英文键盘输入、控制键、终端尺寸变化和退出状态，可展开/还原面板。终端按实际字体尺寸自动适配行列，保留底部输入行和面板边界。

RPC/CLI 能力来自 Codex 本身。账户套餐、外部服务、操作系统和模型是否支持某项功能，仍由原生程序决定；界面显示真实结果与错误。未实现闭源桌面专有功能或自建云调度服务。

不同会话可在同一个页面中同时执行：任务 A 开始后点击“新建会话”启动 B，再从侧栏切换查看。运行中的会话有动态圆点。刷新或关闭整个页面会断开该页面的原生进程并影响它运行中的任务；切换会话不会断开进程。同一会话不能由两个页面同时写入。多个会话使用相同工作目录时会操作同一批文件；需要分离文件修改时使用不同项目目录或工作树。

“会话操作 → 永久删除会话”调用原生 `thread/delete`，确认后删除该会话及其创建的子代理会话历史，无法撤销。归档会话也可删除；当前任务会被停止。被其他页面占用时先关闭占用页面。其他会话引用等原生约束会原样返回错误，不会绕过。

## 原生生图与图片显示

在“技能”中找到 `imagegen`，点击“使用 ChatGPT 原生生图”。网页通过原生 `thread/start` 创建独立的 OpenAI 会话，并附带原生生图技能。当前默认辅助模型为 `gpt-5.6-luna`，原生扩展调用 `gpt-image-2`；新建普通对话仍使用原先默认模型（如 DeepSeek）。模型选择显示当前会话实际模型和提供方，不会用 Codex 品牌推断底层模型。

当前 DeepSeek 提供方没有原生 `image_gen`。原生生图会话使用同一 `CODEX_HOME` 下有效的 ChatGPT 授权，不需要将 DeepSeek 密钥填作 OpenAI 密钥；需要登录时从网页账户页完成原生登录。独立测试访问会话会到期，长期使用应在该运行实例完成自己的原生登录。所有授权文件都留在原生配置目录，不进入 Git；原始账号授权文件未修改。

支持上传图预览、原生生成图片、以及 Markdown 引用的服务器本地图片。图片可放大、下载，刷新后从原生历史恢复。生成图独立于折叠的执行过程显示；回答重复引用同一张图片时复用预览入口。服务器文件通过原生 `fs/readFile` 读取，没有新增任意文件下载接口。

服务器直连 OpenAI 不通时，可以复用已配置的 HTTP 代理。以下仅为网络地址，不是模型配置；保留 DeepSeek 直连：

```sh
HTTP_PROXY=http://127.0.0.1:15236 \
HTTPS_PROXY=http://127.0.0.1:15236 \
ALL_PROXY=http://127.0.0.1:15236 \
NO_PROXY=localhost,127.0.0.1,::1,api.deepseek.com,.deepseek.com \
python3 web/start.py --deepseek --state-dir .local-state/acceptance --port 8765 --workspace /root/Codex/workspaces/acceptance
```

代理地址按实际服务器配置填写；不能仅凭转发端口判断它的出口是否经过本机 VPN。代理环境在服务启动时读取，变更后需在任务结束时重启服务。

## 沙箱网络与模型身份

“设置 → 沙箱网络访问”使用原生配置开关 `sandbox_workspace_write.network_access`；不会切换 `approval_policy` 或 `sandbox_mode`。开启后普通联网命令可在工作区沙箱内执行，工作区外的写入限制和原生危险操作审批仍保留。当前选中且可写的 workspace-write 会话会同步该网络设置。其他历史会话保留原生权限快照，若与全局设置不同，设置页显示“应用到当前会话”，只同步网络字段并保留其他权限。

DeepSeek 生成目录的身份提示已经适配实际提供方，工具和权限指令保持完整。网页还通过原生 `turn/start.additionalContext` 提供实际提供方和模型 ID，避免旧会话继承的 OpenAI 身份提示导致错误自述。应以原生请求及会话设置为准确认底层模型。

## 自定义 Skill 与 MCP

在“技能 → 导入自定义 Skill”中，选择浏览器所在电脑上的 `SKILL.md` 或以 `SKILL.md` 为根文件的完整文件夹。文件通过原生文件接口保存到当前运行实例的 `CODEX_HOME/skills/<目录名>/`，由 Codex 原生校验并加载。脚本与资源保留相对目录；不会执行导入的脚本。同名目录拒绝覆盖，无效 Skill 会清理本次新建目录。单个文件上限 16 MiB，总大小 64 MiB，最多 1000 个文件。

导入后可直接启用、停用或“在会话中使用”。停用状态写入原生 `skills/config/write`，停用后不能通过技能卡片加入任务。

在“MCP 服务 → 添加自定义 MCP”中选择 stdio 或 HTTP。stdio 支持启动命令、JSON 参数数组、工作目录及环境变量；命令在服务器上运行。HTTP 支持服务 URL、Bearer Token 环境变量名、固定请求头及从环境变量读取请求头。需要 OAuth 的服务添加后可点击登录。服务添加及启停使用原生配置写入和 MCP 重载；停用后仍保留卡片及原配置，可重新启用。从下一次任务开始应用更新，正在执行的调用遵循原生运行时的处理。

MCP 要求用户确认时，网页显示原生确认请求，用户选择后才继续。添加自定义扩展不会改变现有审批策略或开放沙箱网络；凭据只保存在本机原生配置或环境中，不进入项目源码。

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

详细的真实验收记录见 [TEST_REPORT.md](TEST_REPORT.md)。服务器上的 ChatGPT 登录应使用原生账户页；远程浏览器可选择设备码登录。测试中的账号访问会话放在独立的忽略目录，未写入仓库。

完整功能验收均由真实网页控件发起，包括网页内的 CLI 终端；无需 ChatGPT 登录的 DeepSeek 流程、HTTP MCP OAuth 及 Guardian 已实际验证。账户云端条件限制和三项按用户要求跳过的操作见验收报告。

新增专项可使用独立实例运行，避免影响日常会话：

```sh
python3 web/start.py --deepseek --state-dir .local-state/custom-tools-acceptance --port 8767 --workspace /绝对路径/测试工作区
# 另一个终端设置 Playwright 环境变量后运行：
node web/tests/custom_tools_desktop.mjs

python3 web/start.py --deepseek --state-dir .local-state/activity-turn-acceptance --port 8768 --workspace /绝对路径/测试工作区
node web/tests/activity_desktop.mjs
node web/tests/thread_lifecycle_desktop.mjs

python3 web/start.py --deepseek --state-dir .local-state/chat-ui-acceptance --port 8769 --workspace /绝对路径/独立测试工作区
CODEX_WEB_URL=http://127.0.0.1:8769 node web/tests/chat_layout_desktop.mjs
CODEX_WEB_URL=http://127.0.0.1:8769 node web/tests/render_network_desktop.mjs
# 生图专项要求该独立配置目录有有效 ChatGPT 原生授权及到 OpenAI 的网络连接。
CODEX_WEB_URL=http://127.0.0.1:8769 node web/tests/images_desktop.mjs
```

并发和删除专项只会删除本次新建的测试会话，要求使用上述独立配置目录。

可选浏览器检查：`PLAYWRIGHT_MODULE=/绝对路径/playwright/index.mjs CHROMIUM_BIN=/绝对路径/chromium node web/tests/browser.mjs`。启动 Web 服务后再运行；截图默认保存到 `/tmp/codex-web-screenshots/`。

界面中的“回退”仅调用原生历史回退接口，不撤销磁盘文件改动。原生能力面板和终端能执行本机操作，按本地开发工具方式使用。

## 参考与许可

- [Codex 开源仓库](https://github.com/openai/codex)
- [OpenAI app-server 文档](https://developers.openai.com/codex/app-server)
- [DeepSeek 原生 Codex 集成说明](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/)
- Markdown：[Marked](https://marked.js.org/) 18.1.1（MIT）与 [DOMPurify](https://github.com/cure53/DOMPurify) 3.4.17（Apache-2.0 / MPL-2.0）；静态组件、许可证和 npm 完整性记录保存在 `web/public/vendor/`。
- xterm.js 6.0.0 与官方 @xterm/addon-fit 0.11.0：MIT，许可证分别保存在 `web/public/vendor/XTERM-LICENSE` 和 `XTERM-FIT-LICENSE`。所有组件随页面本地提供，无需 CDN。

本项目为独立 Web 界面，不是 OpenAI 官方桌面产品。
