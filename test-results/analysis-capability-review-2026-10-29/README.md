# 本轮审查证据说明

业务代码基线：`d13af3351e3ac3f171def89521ef5cf797b41c10`。本轮只读审查并新增文档／证据；没有产品修复，没有真实模型请求、真实业务数据库操作或生产服务重启。

`INDEPENDENT_REVIEW.md` 为新 subagent 的独立原稿；根目录 `DATA_ANALYSIS_REVIEW_2026-10-29.md` 为主 Agent 汇总复核。

## 定向问题复现

这些脚本断言的是当前问题仍存在。返回成功不等于产品验收通过；以后修复后需要改成断言正确行为的正式回归测试。

| 问题 | 脚本 | 输出 | 实验边界 |
|---|---|---|---|
| DA-01 知识读取范围 | `knowledge_receipt_probe.py` | `knowledge-receipt.json` | 真实临时 SQLite；物理结构与连通性为显式夹具 |
| DA-02 连接版本竞争 | `probe_connection_versions.py` | `connection-version.json` | 真实临时 SQLite 并发写；仅连接探测显式替代 |
| DA-03 图表精度 | `chart_precision_probe.py` | `chart-precision.json` | 实际本机 ECharts MCP，合成数据 |
| DA-04 文件附件 | `attachments_probe.mjs` | `attachments.json` | 当前 readAttachments 函数，Node VM 与浏览器兼容 File；不是浏览器截图验收 |
| DA-05 探索容量 | `knowledge_capacity_probe.py` | `knowledge-capacity.json` | 真实临时 SQLite；合成结构及显式连通夹具 |
| DA-06 跨轮报告 | `probe_report_lineage.mjs` | `report-lineage.json` | 完整当前报告 JS；明确的两轮记录与凭据夹具，无服务器请求 |

脚本保留本机实际实验路径 `/root/Codex`。可在本机重放：

```sh
mkdir -p /tmp/codex-cross-feature-review-20261029
.toolchains/databases/bin/python -B test-results/analysis-capability-review-2026-10-29/knowledge_receipt_probe.py
.toolchains/databases/bin/python -B test-results/analysis-capability-review-2026-10-29/probe_connection_versions.py
.toolchains/databases/bin/python -B test-results/analysis-capability-review-2026-10-29/chart_precision_probe.py
.toolchains/databases/bin/python -B test-results/analysis-capability-review-2026-10-29/knowledge_capacity_probe.py
.toolchains/node24/bin/node test-results/analysis-capability-review-2026-10-29/attachments_probe.mjs
.toolchains/node24/bin/node test-results/analysis-capability-review-2026-10-29/probe_report_lineage.mjs
```

需要现有数据库测试环境和本机 ECharts MCP 运行依赖。Python 脚本自行清理临时注册表。连接竞争与报告脚本的重放输出写入上述 `/tmp`，不会覆盖此处保存的审查证据。

## 当前离线回归

```sh
.toolchains/databases/bin/python -B -m unittest discover -s web/tests -p 'test_analysis_learning.py'
.toolchains/databases/bin/python -B -m unittest discover -s web/tests -p 'test_knowledge_corrections.py'
.toolchains/databases/bin/python -B -m unittest discover -s web/tests -p 'test_metric_rules.py'
.toolchains/databases/bin/python -B -m unittest discover -s web/tests -p 'test_data_freshness.py'
.toolchains/databases/bin/python -B -m unittest discover -s web/tests -p 'test_memory_scheduler.py'
.toolchains/databases/bin/python -B -m unittest discover -s web/tests -p 'test_analysis_evidence.py'
```

当前六套共 86 项通过，合并运行结果见 `offline-regressions-supported-sandbox.log`。上面的按文件命令便于定位，未声称逐条重放过这些命令。

首次运行的外层工具沙箱不允许 bwrap 建立 NETLINK_ROUTE 命名空间，`offline-regressions.log` 保留 19 error＋1 failure。允许测试建立自己的隔离命名空间后，通过上述 86 项。没有禁用项目 Python 隔离或回退宿主执行。

## 证据范围

不包含 AOCI 的机器绑定交付 challenge／回执，开发工具运行记录仍在独立临时目录。没有复制真实用户对话、业务数据、凭据或服务环境。正式报告中提到的以往 Flash／MySQL／浏览器验证另有历史目录，本轮不重复标记通过。
