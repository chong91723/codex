# Tester A 最终实际用户记录

A 已于 **2026-10-29T12:51:35.123Z** 结束全部产品操作并关闭测试浏览器。最终公共原生 execution 为 idle；activeTurns、pendingChildThreadIds、cleanupHolds、backgroundCommands、pendingNativeAcks 均为空，第二原生 child 有 closedThreadHistory 清理证明。根 Agent 核对并明确 GO-B 后，B 才可操作。

GO-A：12:08:29.788Z；定向 UI：12:09:26.604Z—12:49:13.137Z。其中12:22:30.380Z—12:37:41.269Z为机制Bug修复暂停，无产品操作。自由窗口12:49:13.159Z—12:50:56.086Z，**102.927秒**，deadline12:54:13.159Z，最后新操作12:50:56.079Z；随后仅最终状态核验和浏览器清理。

## 已真实完成的链路

- 用户测试连接→主动一键探索，job completed，70对象479字段；业务补充savedByUser，实际结构分页可查看。
- 原生Plan两轮request_user_input、用户修订方案、UI核对最终正文并确认进入default执行；已结束方案卡等点击不当作活动slot。
- 原root真实派发两个deepseek-flash native children，schema/check各自独立目录，主线程独占final目录。真实spawn/wait/complete/close与ancestry留有原生证据，不把外部tester当child。
- 真实query→Python→两张ECharts→publish_answer。最终JSON verification=verified，scope=referenced-fields，7个结果、2张图；不认证正文所有解释或业务真理。
- 同tester第2tab在真实blocking用户输入期间显示唯一root占用并保留草稿。未构造绕过UI的第二turn/start，因此只观察到UI项，不把它冒充服务端完整拒绝验收。
- 管理页在真实query之后将业务补充rev1→2；旧result run_python于12:38:32.520实际拒绝“业务知识已变化…不能继续计算、绘图或发布”；模型重读当前context后重查，最终使用rev2。
- 主线程query_database start12:18:39.108Z时关闭全部两页，12:18:39.591Z页数为0；真实类别结果读取12:18:48.744112Z，重开12:18:50.962Z，恢复原thread12:19:31.340Z。离线期间query完成，原turn未重发，结果表和CSV可用。
- 最终CSV、两张PNG、Markdown/HTML/依据JSON实际下载；HTML离线打开并渲染两张静态图及来源记录。基础确认门尚未publish时的rejected原始导出另行保留，没有包装为最终报告通过。
- 单独线程明确临时标记/限制不保存；原生memories.add_ad_hoc_note成功{}，memories.read实际读回，内容仅中文与报告开头读取时间/限制偏好。新thread配置generate_memories=false，features/use/dedicated_tools启用。新草稿为空；跨会话检索与不知道临时条件留给B独立验证。

## 首次机制失败与真实回归

首次schema child完成并close/notLoaded后，回收逻辑仍向它列终端，返回thread not found并保守占位。UI“重试回收后台命令”仅点一次，未绕过slot。公共snapshot A-cleanupFailed-public-snapshot.json：无active turns/children/backgroundCommands，唯一cleanupHold指向已关闭child，backgroundTerminals=[]，remainingTerminals=null，error为thread not found。

根 Agent 修复并加载后，A接续同root，不重做探索/Plan。服务重启清掉旧hold没有被当成回归通过。**第二check child真实执行、独立核对、completed→closeAgent后**，公共execution产生closedThreadHistory proof，包含closure事件和54个已观察命令ID，最终slot idle；见 A-report-final-idle-status.json / A-final-cleanup-status.json。首次失败证据未删除。

## 边界与未覆盖

- 未赶上query执行窗内修改，in-flight依赖变化未覆盖；已覆盖query后、派生前版本变化拒绝。
- check child实际import_data_file，但未受控改写文件触发hash拒绝；不能以知识CAS代替文件冲突证明。
- 第二root服务端绕过按钮的拒绝、其他执行入口矩阵未由A完整覆盖。
- 原生后台历史抽取/全局合并没有加速等待、修改时间戳或租约，未声称本窗口完成合并。
- check child早期进行了多条运行时/工具入口shell调查并有失败；后续恢复本轮结果和文件核对。用户通过原root补充了仅核本次分析资料、禁止探索运行时/凭据的范围约束；失败原文保留。
- 专用memory调用未出现在Web工具活动计数中，实际调用以该thread原生rollout过滤function_call/output收据核验；没有用模型口头自述替代证据。
- 任意shell并不天然服从Web文件锁；独立所有权由root明确分配，实际产物路径可查，不声称通用文件写CAS。

## 证据与交接

- summary.json / cases.json / timeline.json：最终状态、逐项覆盖、时间线。
- wire.jsonl：实际HTTP/WS证据，cookie、鉴权、连接秘密及env脱敏。
- A-08-native-memory-receipts.jsonl：原生memory第一次filename格式失败、成功重试及读回收据。临时标记未在note中。
- exports/final-report.md、final-report.html、final-report.json；CSV、2张PNG；screenshots/。
- handoff-to-b.json：仅共享source/版本、显式偏好、A报告入口；不含临时标记或临时限制。

A-private-temporary-marker.json和memory线程原文属于A临时隔离证据，不放进B的操作说明。A memory线程经UI重命名为“A 显式偏好与线程隔离验证”，避免侧栏自动标题暴露标记；历史正文保留。
