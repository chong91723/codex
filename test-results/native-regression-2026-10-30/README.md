# 2026-10-30 原生能力回归证据

能力、问题与验证说明见 [主报告](../../AUDIT_2026-10-30.md)。`cases.json` 是本轮范围表；工程回归、真实 Flash、实际数据库、浏览器和原生故障分别记录，不互相替代。

本目录只归档明确允许的测试证据和控制脚本；不含 profile、连接密码、浏览器 cookie、服务环境或日志。模型调用仅 deepseek-flash；所有历史与 notes 保留。T01/T01B 为真实网关和 MySQL 窗口测试，明确没有模型；T07 使用同一 AdventureWorks 订单数据的新 PG/CH/ES 自有夹具，不复制已有连接凭据。

`backend-final-tests.log`：430项，426通过、4条件跳过；`opt-in-final.log`：上述4项实际启用4/4。`js-behavior-summary.json`：20文件315项。`native-integrity.log`：固定源与发行包未改、176方法／完整schema一致。新增的状态、页预算和 Linux 进程测试在仓库 web/tests 中。

宽明细最终真实 Flash 证据 `T07-final-paging-proof.json` 明确请求20行、返回8行、nextOffset8和预算说明；初次网关实现尚未透传说明的证据保留在 ES 完整记录。原始协议和资源样本 gzip 无损压缩，manifest 同时记录原文与压缩哈希。首次资源采样认证失效数据不纳入最终一小时结论；最终采样包括故意崩溃期间的不可用样本，不能当生产容量或恒定内存证明。

第一轮 child 命令自然完成、首轮测试图表引用形状错误、原生故障后闭合 socket 的控制器超时、Web 重启端口未就绪时刷新失败及意外浏览器退出均保留，不将这些尝试冒称通过。清空记忆首次被真实运行租约拒绝，待任务实际结束后成功。

此前03:45全局记忆定时结果已执行并记录于 T06-previous-timer-result.json；编辑后再合并16:40检查当前只算已安排。未来状态在运行目录 /tmp/codex-audit-20261030/edited-memory-once/，不在本归档中伪造完成。
