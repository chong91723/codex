# 本地开发辅助工具

这两个工具只服务于本仓库的代码开发，不加入 Web 分析应用的内置 MCP，不读取业务数据库，也不改变模型和 Agent 执行机制。

## 版本与职责

| 工具 | 固定版本 | 用途 | 项目资产 |
|---|---|---|---|
| [CodeGraph](https://github.com/colbymchenry/codegraph) | 1.6.2（沿用本机已有安装） | AST 符号、调用、引用和修改影响定位 | `codegraph.json`；本地 `.codegraph/` 不入 Git |
| [AOCI](https://github.com/aoci-spec/aoci-code) | 0.1.0-rc22；提交 `0a0584f58aa823f8a18236dd8f181ccfbff3f184` | 维护经过源码核对的核心架构、关系、契约和约束 | `aoci*.txt`、`.aoci/config.json`、Baseline；私有运行记录按 `.aoci/.gitignore` 排除 |

AOCI 官方 Linux amd64 压缩包 SHA256 为 `ba6ded5629dc387d0717140bcf18ed849922d571b30bf0cc356f2f3b561f40bb`，已与该版本 GitHub Release API digest 和 `SHA256SUMS` 核对；未进行 Sigstore 发布者签名验证。版本目录为 `~/.local/share/aoci/v0.1.0-rc22/`，命令链接为 `~/.local/bin/aoci`。

## 范围与数据边界

CodeGraph 只索引自有 `web/` 源码和测试，排除 `web/public/vendor/`、`web/runtime-schema/` 和已移除功能的测试存档。`include` 在此版本中是覆盖 Git 忽略的入口，不能当成范围白名单；实际范围用 `exclude` 规则限制，已检查索引文件列表。

AOCI 是核心架构试点，只覆盖 `.aoci/config.json` 显式列出的文件，包含启动、传输、分析 MCP、证据、知识纠错、指标、记忆、报告和关键测试。其覆盖率只表示这个受管子集，不代表整个仓库；其他源码仍通过 CodeGraph、rg 和测试检查。不开启 AOCI 的数据库认知，也不配置独立 AI endpoint。

两者都排除 `upstream/`、`native/`、工具链、工作区、运行状态、凭据与大体积历史验收产物。AOCI 的结构化认知由当前编程 Agent 阅读实际证据后维护，不从文件名或 AST 自动拼出业务解释。两个索引都不能代替源码、回归测试或真实运行验证。

## 开发会话接入

本机 Codex 桌面用户配置已提供 CodeGraph；AOCI 使用固定可执行文件、明确绑定本仓库的独立 MCP 条目。配置在编程用 `~/.codex/config.toml`，不写入项目 `.codex/config.toml`，以免被下属分析工作区继承。当前 Web 的独立 DeepSeek 配置空间不加载这项开发配置。新开本仓库的编程会话后可发现 AOCI 工具；现有会话已用真实 stdio MCP 连接验收，不需要重启 Web。

CodeGraph 配置保持 `DO_NOT_TRACK=1`、`CODEGRAPH_TELEMETRY=0`，命令额外指定 `CODEGRAPH_NO_UPDATE_CHECK=1`。已有 MCP 以 `--no-watch`、`CODEGRAPH_NO_DAEMON=1` 运行，避免持续监听大仓库；修改源码后显式同步，不宣称自动更新。未安装 Git hooks 或额外后台守护进程。

```sh
cd /root/Codex
DO_NOT_TRACK=1 CODEGRAPH_TELEMETRY=0 CODEGRAPH_NO_UPDATE_CHECK=1 codegraph sync /root/Codex
DO_NOT_TRACK=1 CODEGRAPH_TELEMETRY=0 CODEGRAPH_NO_UPDATE_CHECK=1 codegraph status /root/Codex
aoci --repo /root/Codex doctor --json
aoci --repo /root/Codex index agent guide --agent codex --json
```

在其他机器上，先按上游文档安装同一版本，再在编程宿主添加 MCP，`command` 指向本机 AOCI 绝对路径，`args` 为 `["--repo", "本仓库绝对路径", "mcp"]`。不要复制本机绝对路径配置到业务应用或 Git。

## 使用与维护

1. 修改前：CodeGraph `codegraph_explore` 查看相关实现和调用关系，必要时 `codegraph_impact` 找关联测试；动态协议和浏览器事件还需核对实际代码。
2. 新开发会话：按根 `AGENTS.md` 获取 AOCI 规则及当前完整概览；完整工具合同按需获取，不复制到分析工作区的父目录指令中。概览和校验只代表当前受管范围。
3. 修改稳定后：同步 CodeGraph；受 AOCI 管理文件有变动时，按实时 Guide 领取完整候选批次，由当前 Agent 依据源码维护，再执行 Verify、Check 和 Guide。中间编辑不逐次维护，纯只读工作不重复写索引。
4. 把正式认知和必要配置随代码评审；不提交 SQLite 索引、Ledger、下载包、机器绑定的宿主配置或运行凭据。不要通过重置 Baseline 消除真实漂移。

安装和初始化需要下载公开发行包；完成后，这两项工具本身的本地查询、索引和维护不要求远端模型服务。当前编程 Agent 使用的服务保持原有配置。


## 首轮实测与限制

- CodeGraph 实际 MCP 探索了 `Learning.before_query` 的查询／发布链路，impact 定位了网关、指标执行、MCP 与关联测试。索引内 193 个文件全部位于自有 Web 范围，无解析错误，约 21.9 MiB。初始化全程 28.17 秒，子进程最大 RSS 约 533 MiB（不是所有进程的内存合计）；这不是业务问答延迟测试。
- AOCI 首批 21 个核心文件已通过官方 Stage 的校验、差异审计与原子写入；Verify、聚合 Check 和 Guide 均确认没有缺失、漂移或格式问题。使用受支持的单文件索引布局，语义内容由当前编程模型逐项阅读证据后撰写；未启用独立模型端点、数据库读取或常驻 UI。
- 根据结构图定位的知识协作与记忆调度测试实际运行 19 项，全部通过；使用独立临时注册表／快照和明确的连接／原生会话夹具，不冒充真实模型验收。本轮不修改业务实现，不启动额外 Web 实例或重新测试全部产品功能。
- AOCI 此版本在“已变更且尚无 Entry”的 README 上生成了重复候选，CLI 在正式写入前拒绝。仅去除相同路径、哈希、内容的重复项后，全量 21 个对象通过；未修改工具源码或缩减受管范围。以后遇到相同情况须确认完全一致，不能把有冲突的候选当作可合并重复项。
- AOCI 覆盖率仅对应 21 个受管对象，CodeGraph 对动态 RPC、字符串分发和浏览器事件的结构推断仍需实际追踪。两者均不承诺自动理解全部业务或免除回归验证。
