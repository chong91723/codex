# 独立审视：数据分析协作能力与测试缺口

日期：2026-10-29。仓库 `/root/Codex`，基础 HEAD `d13af33`。保留上一轮未提交开发工具资产。本轮不改业务代码、不重启服务、不读取业务数据或凭据、零模型请求。排除多租户实现、手机、国际出口限制、ChatGPT 账号依赖、快速/生图、非原生技能。

已按 AGENTS 使用真实 AOCI stdio MCP 读取运行合同与完整 21 条核心概览，交付确认与 10/10 Challenge 通过；该索引仅覆盖指定子集，不代表全仓覆盖。CodeGraph 实际探索 Learning / DatabaseKnowledge / MetricRules，随后核对源码、现行测试。AOCI 日志仅位于本目录 mcp/，未复用上一批 response 文件。

## 本轮确认的问题

### R1 / P1：知识读取凭据只证明版本，未证明相关业务说明已经交付

- 类型：已用独立夹具复现的协作正确性缺口，不是源版本失效绕过。
- 根因：`web/database/database_knowledge.py:593` 允许 table/search 过滤，`:621` 对 accepted notes 分页。`web/database/mcp_server.py:120`–`:122` 对该分页结果调用 record_read；`web/database/learning.py:31`–`:39` 记录整个源的 stamp，`:48`–`:52` 仅校验源 token，不绑定已返回的对象、note IDs、分页或查询实际表字段。
- 复现：临时源有已采用 `orders.amount = Tax inclusive amount`；只调用 read_database_context(table='accounts', limit=1)，得到空 notes。随后 before_query(source) 通过。模型未看过 orders 的已确认定义。
- 影响：复杂多表、多主题或大知识列表中，模型漏读适用解释仍获得合法凭据，后续发布只能证明“版本没变”，不能证明相关知识已纳入本轮分析。源级业务补充 requiredBusinessContext 已单独交付，不属于本问题。
- 修复方向：保持按需读取；记录实际交付的 source/table/field/note 范围，并按实际 SQL 依赖要求补齐适用已确认规则。不能靠强制每次把全库所有笔记塞进上下文解决。至少准确声明凭据的版本边界。
- 验收：先读无关表/空分页，查询有关表应要求补读；同表第二页有必需规则也不遗漏；有关规则更新仍使旧凭据失效，读取无关知识不使合法结果误失效。
- 证据：`knowledge_receipt_probe.py`、`knowledge-receipt.json`。真实临时 SQLite 与管理/工具代码；结构采集和连接探测明确使用夹具，无数据库执行和模型。

### R2 / P1：数据表与图表可显示不同数值

- 类型：已复现数值精度 Bug。
- 根因：`web/database/charts.py:74`–`:81` 对 numeric 字段执行 float()，无无损检查。`web/database/snapshots.py:63`–`:64` 已把超安全整数保留字符串，但绘图再丢精度；ECharts MCP 只校验被转换后的 dataset 与 option 一致，无法恢复原数。
- 复现：合成金额 9007199254740993 经真实本机 ECharts MCP 校验生成 option，其 dataset 为 9007199254740992；返回原始 rows 仍保留原数。
- 影响：高精度金额/大整数的图表坐标和默认 tooltip 可与表格、CSV 和发布正文不一致；这是显示计算链问题，不需要证明任意业务公式。
- 修复方向：保留原始精确值供 tooltip/下载，显式处理坐标近似；不能无损时要求明确单位缩放或拒绝并说明。不要静默把近似 option 标成完全精确。
- 验收：安全整数边界上下、十进制长尾、负数、null；图表/表格/发布/CSV/离线 SVG 同值或清楚标注坐标近似。以真正 ECharts 生成及浏览器 tooltip 共同验收。
- 证据：`chart_precision_probe.py`、`chart-precision.json`。真实本地 MCP、合成数据，未用业务 DB、模型。

### R3 / P2：本地文件附件尚未形成可追踪的数据分析入口，XLSX 被误读

- 类型：已复现附件格式 Bug + 文件分析功能缺口。
- 根因：`web/public/index.html:86` 的 file input 无格式限制；`web/public/app.js:1048`–`:1054` 除图片/音频外全部 file.text()，直接作为 text 输入。CSV 没有生成 documentId。真正证据导入 `web/database/analysis_tools.py:82`–`:90` 仅接收服务端允许目录下的 CSV/JSON/text 文件。
- 复现：调用当前 readAttachments，浏览器兼容 File 包装的 CSV 变成 text、无 documentId；XLSX ZIP 头及非法 UTF-8 字节变成含 replacement character 的文本，仍接受，无错误。不是完整 XLSX 解析测试，已足以证明二进制被误读。
- 影响：分析人员点“添加文件或图片”上传 Excel 没有明确拒绝；CSV 与数据库/Python 联算不能直接沿原始文件对象进入现有文档证据链。模型只能看到原文，若转抄进 Python，来源仍不是已导入原始文件。
- 修复方向：至少明确拒绝未支持二进制；CSV/JSON 上传后由后端保存不可变文档、哈希和格式/编码校验，生成 documentId，接通 run_python。Excel 可列为条件增强，不应继续假装文本支持。大文件需总预算、保留输入和可执行的缩小建议。
- 验收：CSV（中文、逗号、换行、空值、大整数、不同编码）→Python→数据库联算→ECharts→正文/下载；XLSX 明确支持或明确拒绝；刷新/失败保留文件状态，绝不把整个大文件无界塞模型上下文。
- 证据：`attachments_probe.mjs`、`attachments.json`。实际当前 JS 函数在独立 Node VM、浏览器兼容 File；无浏览器/后端/模型调用。

### R4 / P2：自动探索可占满知识历史容量，阻断随后的人工纠错

- 类型：已复现探索→纠错协作阻断；同时缺少可恢复的知识生命周期管理。
- 根因：`web/database/database_knowledge.py:12` 的 MAX_NOTES=500 既计自动 observed，也计 accepted/rejected/superseded 全历史；`:267`–`:285` 探索先写入最多 500 自动注释；`:210`–`:211` 的统一容量检查用于 `:396` 新修订。当前管理 API 没有历史归档或容量恢复路径，仅让用户联系维护人员。
- 复现：合成合法结构共 514 字段，含超过 500 条注释；一键探索存满 500 notes。采用 orders.amount 的自动说明后，对其提交一条纠正，报“知识历史已达到容量上限”。SQLite 真实保存，没改 MAX_NOTES。
- 影响：不必长期用到 500 次，一次有注释的中型库探索就能让主要纠错功能不可用；与越用越懂业务的目标冲突。拒绝/停用记录仍计数，不能由现有 UI 恢复。
- 修复方向：原始结构观察与知识修订历史分层，自动观察不要抢全部可编辑知识预算；保留不可变原文/决定，用分页和归档解决容量，避免静默删除历史。
- 验收：>500 注释首次探索后仍能补充、纠正、拒绝、再次纠正；新会话读当前有效值，Agent 可查前后历史，重新探索不复活被拒绝项。
- 证据：`knowledge_capacity_probe.py`、`knowledge-capacity.json`。真实临时 SQLite；采集/连通明确夹具，无模型/业务 DB。

## 陈旧验收脚本（现行代码依据，无需模型即可确认）

- `web/tests/native_builtin_skills_desktop.mjs:48`–`:53` 仍输入 `/skill-name` 并等 data-skill-name 菜单；当前 `web/public/native-ui.js:152` 仅有 /plan，`:187`–`:192` 不会生成该技能项。`skills_mcp_desktop.mjs` 和 `flash_compat_entry.mjs:12` 仍转发这套“current real tests”。它会停在旧入口，不代表真实技能执行错误，更不能用历史通过证明新入口已验收。
- `web/tests/database_desktop.mjs:9` 写死内置数据库 MCP 为 7 工具；当前直接读取 TOOLS 实际为 21。应该按必要能力集合与版本断言，而非旧数量。
- `web/tests/metric_demo_desktop.mjs:31`–`:36` 直接给真实 stdio MCP 发送指定工具调用，`:46` 明确声明对话呈现为夹具，`:169` 保证模型请求为零。它验证执行器、UI 和规则版本，不证明 Flash 能自主选择正确规则、参数并与计划/知识纠错协同。

## 分层覆盖与需要补的协作验收

| 协作链 | 已有证据层次 | 当前缺口/建议补测 |
|---|---|---|
| 探索→用户补充/纠错→SQL→Python→图表→发布→新会话解释 | 现行后端回归；历史独立 Flash/MySQL 真实闭环（不是本轮新实测） | 本轮 R1/R4 未被既有套件检出；补多表分页、500注释、两个页面决定与执行/发布竞争 |
| 手动/自主计划→修改/批准→步骤→停止→修改继续 | 历史真实 Flash+MySQL/PG 与协议/状态测试 | 计划执行中改知识/口径/数据源、刷新/断线/服务重启与依赖变化组合；不要把后续新 turn 重新规划称事务级暂停恢复 |
| 已确认口径→真实执行→派生→发布→停用/修改 | 当前 metric_rules 单测较细、历史真实 PG+MCP+UI 但零模型 | 用 Flash 自主发现多个候选规则、问清含糊日期/单位、使用正确参数；执行中规则停用、改业务知识、Python派生后的证明范围必须准确 |
| 普通 SQL/Python→ECharts→表格→导出 | 现行证据测试、历史真实 DB/浏览器 | 本轮 R2；高精度、时区、空结果、超大输出、大库预算以及导出缺失对象/失败反馈，不能用小额 3.50 示例代替 |
| 本地附件/API + 两个不同数据库→Python联算→报告 | 工具层 file/API/Python 有离线回归，同服务跨库已有旧专项 | R3；当前端到端本地上传缺链。跨 MySQL/PG 或数据库+用户文件的主体/键/单位/日期对齐需独立基准；未找到当前一体化真实模型证据，不能直接说不可用 |
| 跨会话记忆→最新源知识→纠正历史→重新分析 | 当前 scheduler/learning 单测；历史即时笔记跨会话及离线合并完成 | 新后台自然闲置满一小时的历史提取仍未完成真实验收；生产服务重启中断与失败重试；即时偏好模型仍可能漏记。记忆不能自动批准源知识 |
| Skills/MCP启停→新会话真实调用→分析证据 | 历史四内置技能执行、代表远端MCP；最近 configuration 仅读目录 | 修陈旧脚本，真实使用当前 Skills 页启停后开新任务；MCP停用/重载发生在计划与工具运行中，保留错误/输入，验证恢复；第三方 MCP 返回数据怎样进入可追踪计算需明确 |
| 多轮继续分析→最终报告/证据→下载→历史复核 | 当前 source knowledge 版本检查与导出夹具、历史真实报告导出 | 主代理正在核验跨轮成果关联、知识/指标/时效状态和历史提示；不要只测单轮新图表导出 |

## 优先验收顺序

1. 正确性：R1 相关知识实际交付；R2 表图精度；并行配置更新与结果失效由主代理独立复现。
2. 一条完整分析链：独立 AdventureWorks + Flash，自主计划→用户修改/批准→多表/多页解释→实际查询/Python→执行中纠正定义→对话外决定→旧结果拒绝/按新定义重算→新会话解释变化→最终报告与历史图表导出。
3. 容量与文件：R4 的中型注释库；R3 的本地CSV+数据库联算，未支持的XLSX明确报错。
4. 流程恢复：同链在 SQL/图表/发布/审批四个阶段分别停止、断线、刷新；生产服务重启另在独立服务验证，不动现有用户实例。
5. 记忆：不用修改原生时间戳，准备自然满足一小时的历史，关闭所有测试浏览器，重启隔离服务后确认实际历史提取、合并/冷却/失败状态，再开新分析查证。
6. 扩展协作：修当前测试入口后，Skills/MCP 启停/重载与新会话及证据链联合验收，不能以目录存在代替实际执行。

## 本轮实际执行的回归

执行当前六套：test_analysis_learning、test_knowledge_corrections、test_metric_rules、test_data_freshness、test_memory_scheduler、test_analysis_evidence，共 **86 项通过**。这些是独立临时存储/显式连接夹具与本地工具测试，不能替代新 Flash、真实数据库或浏览器验收。

第一次受外层工具沙箱限制，Python bwrap 无法建立 NETLINK_ROUTE，产生 19 error + 1 failure（共 86 项）；保留 offline-regressions.log。按受支持 require_escalated 方式允许测试正常建立自身隔离命名空间后，86/86 通过，日志 offline-regressions-supported-sandbox.log。未关闭或弱化项目 Python 隔离机制。

独立新复现四类均作为审查发现保留，未改生产代码，也不将演示脚本“复现成功”标成产品验收成功。
