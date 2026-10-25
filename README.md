# Codex Web Native

参照 Codex 桌面端布局实现的本地 Web 工作台。代理内核直接从最新 Codex 开源源码编译；Web 层只做界面与协议传输。上游源码以子模块保存在 `upstream/`，禁止在该目录修改源码。

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

- 会话：新建、恢复、搜索、分页、重命名、分叉、归档、上下文压缩、历史回退、代码审查、JSON 导出。
- 对话：模型与推理强度、流式回答、推理摘要、工具执行、文件差异、计划、子代理事件、中断与执行中补充输入、图片和文本附件。
- 交互：命令与文件修改审批、权限请求、用户问题；任意服务端请求均保留自定义 JSON 响应入口；原生 Guardian 审核结果可显示并由用户确认被拒绝的具体操作。
- 扩展：原生技能发现、启停、调用；MCP 服务器、OAuth、工具与资源；插件和应用目录。
- 设置：原生配置读取、按项写入、沙箱和审批策略、账户登录与额度。
- **原生能力面板**：启动时从实际源码编译的程序导出完整实验性 JSON Schema；全部客户端方法可选择、查看参数、生成必填参数模板并原样调用，所有事件可查看。未做专用界面的开源功能也通过此入口使用。
- **原生 CLI 终端**：使用真实 PTY 和本地 xterm.js 运行同一源码编译的 `codex`。参数以字符串 JSON 数组输入，例如 `["--help"]`、`["mcp", "list"]`、`["resume"]`。支持键盘输入、控制键、终端尺寸变化和退出状态。

RPC/CLI 能力来自 Codex 本身。账户套餐、外部服务、操作系统和模型是否支持某项功能，仍由原生程序决定；界面显示真实结果与错误。未实现闭源桌面专有功能或自建云调度服务。

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

可选浏览器检查：`PLAYWRIGHT_MODULE=/绝对路径/playwright/index.mjs CHROMIUM_BIN=/绝对路径/chromium node web/tests/browser.mjs`。启动 Web 服务后再运行；截图默认保存到 `/tmp/codex-web-screenshots/`。

界面中的“回退”仅调用原生历史回退接口，不撤销磁盘文件改动。原生能力面板和终端能执行本机操作，按本地开发工具方式使用。

## 参考与许可

- [Codex 开源仓库](https://github.com/openai/codex)
- [OpenAI app-server 文档](https://developers.openai.com/codex/app-server)
- [DeepSeek 原生 Codex 集成说明](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/)
- xterm.js 6.0.0：MIT，许可证保存在 `web/public/vendor/XTERM-LICENSE`。

本项目为独立 Web 界面，不是 OpenAI 官方桌面产品。
