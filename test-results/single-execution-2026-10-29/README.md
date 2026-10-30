# 单执行会话增量验收 · 2026-10-29

两个 tester 使用同一独立配置空间、只读 AdventureWorks MySQL 与真实 deepseek-flash，依次操作产品。A 结束且原生执行空闲后才开始 B；自由探索分别 102.927 秒、237.061 秒。此处记录产品机制、实际协议与产物，不由根 Agent 判定业务答案谁对谁错。

- A：[总结](serial-a/summary.json)、[操作记录](serial-a/observations.md)、[用例](serial-a/cases.json)。保留首次 closed child 清理失败及修复后新 child 的真实清理证明。
- B：[总结](serial-b/summary.json)、[用例](serial-b/cases.json)、[操作与限制](serial-b/observations.json)。审批 decline 后工具 failed/result=null，后续采用为另一调用；知识和时效冲突 HTTP400 留稿；文件哈希改变拒绝旧计算；停止清理期间拒绝另一 root；刷新及全部页面关闭后恢复无重发。
- 真实报告与下载位于各 tester 的 exports；统一结果、ECharts、CSV/PNG/Markdown/HTML/JSON 以实际导出文件及收据为准。
- 工程：[后端418项，414通过、4条件跳过](repository-backend-final-current.log)；[JS 19文件308例](js-verified-results.json)；[语法221份](syntax-current.json)；[原生内容完整性](upstream-integrity-current.log)。工程检查不替代真实模型验收。
- [自然一小时历史提取](natural-memory-receipt.json)与[后续定时检查安排](scheduled/launch-receipt.json)分开记录。安排不等于全局记忆已合并或读取语义通过；未来结果在 `/root/Codex/.local-state/global-memory-2026-10-30/once/result.json`。

明确未覆盖：真实 SQL 执行窗口内修改依赖；历史目标/队列自动恢复的完整竞争；B 原生 child 停止和独立用户输入等待。A 已覆盖原生 children 和 request_user_input，不扩写成 B 覆盖。B 盲测控制器曾意外看到同用户列表预览，未输入产品模型提示；详见其 observations。首次模型未执行、选择器/控制器失败、命令自然完成未算停止成功等均保留。

`manifest.json` 给出每个文件的 SHA256；`.gz` 为原始 JSON/JSONL 的无损压缩并附原文哈希。凭据、配置空间、私有临时标记文件和控制器请求文件不在归档中。完整历史、笔记与结果继续保留在测试实例，未为验收清空。此测试不证明生产多租户、并发容量或任意 shell 文件锁。
