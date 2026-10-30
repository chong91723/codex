# Skill 验收入口

以下脚本必须针对独立测试实例和 `/tmp/` 下的专用配置、工作区执行，不能指向日常用户服务。浏览器与真实模型测试需串行执行，保留已有历史和测试证据。

- `uploaded_skills_state.mjs`：离线运行实际前端处理函数，检查上传边界、版本冲突、坏包隔离、草稿、结构化技能输入和安装器按钮行为。
- `skill_lifecycle_desktop.mjs`：真实浏览器检查四个内置技能的原生来源、启停与草稿恢复。安装器卡片只检查本地文件选择器，确认没有 `turn/start`、`turn/steer` 或上传请求。设置 `CODEX_SKILL_LIFECYCLE_MODEL=1` 后额外运行真实 `deepseek-flash` 的 `openai-docs` 离线参考读取。
- `native_builtin_skills_desktop.mjs`：真实 Flash 验证 `review-agent`、`skill-creator`、`openai-docs` 的结构化原生 Skill 调用；`skill-installer` 保留源码和原生启停，产品按钮仅打开本地选择器，不经模型触发 GitHub 下载。验证器命令使用 Python `-B`，不在运行时技能缓存生成字节码文件。

安装器卡片的文件选择测试不会选择或上传文件；完整的上传、原生解析、启用、使用与移除由上传功能验收单独执行。产品安装路径不提供公开 GitHub 在线下载，这不代表对 Agent 所有网络访问设置了出口防火墙。

```sh
/root/Codex/.toolchains/node24/bin/node web/tests/uploaded_skills_state.mjs

# 先在终端设置隔离实例信息，不在命令或报告中输出密钥。
export CODEX_WEB_URL=http://127.0.0.1:测试端口
export CODEX_TEST_HOME=/tmp/独立-audit/profile
export CODEX_TEST_WORKSPACE=/tmp/独立-audit/workspace
export PLAYWRIGHT_MODULE=/root/Codex/.toolchains/playwright/node_modules/playwright/index.mjs
export CHROMIUM_BIN=/root/Codex/.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome
/root/Codex/.toolchains/node24/bin/node web/tests/skill_lifecycle_desktop.mjs
CODEX_SKILL_LIFECYCLE_MODEL=1 /root/Codex/.toolchains/node24/bin/node web/tests/skill_lifecycle_desktop.mjs
/root/Codex/.toolchains/node24/bin/node web/tests/native_builtin_skills_desktop.mjs
```

构建、离线行为、浏览器文件选择和真实模型调用应分别记录结果；语法检查通过不能代替执行上述浏览器验收。
