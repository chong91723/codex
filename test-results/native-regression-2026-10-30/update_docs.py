from pathlib import Path
import hashlib,json
r=Path('/root/Codex');b=Path('/tmp/codex-audit-20261030');s=b/'docs-stage';s.mkdir(exist_ok=True);items={}
def stage(rel,content):
 p=r/rel;items[rel]=hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None;(s/p.name).write_text(content)
stage('AUDIT_2026-10-30.md',(b/'AUDIT_2026-10-30.md').read_text())
p=r/'TEST_REPORT.md';text=p.read_text();line=text.index('\n')+1;addition='''
## 当前补测与修复（2026-10-30）

详见[完整问题、能力协作与实际验收](AUDIT_2026-10-30.md)及[证据](test-results/native-regression-2026-10-30/)。固定 Codex／deepseek-flash／原生子任务；单 root 仅为资源准入规则。已修复父回合结束后 child 无法停止、Linux Web 强退遗留原生进程、宽明细整页失败及 MCP 分页说明丢失、Decimal 绘图类型指引和查询期连接变更诊断。真实 Flash 子任务停止、零网页后台继续／重开停止、Web SIGKILL 前后、真正待确认 ACK 丢失、原生 goal／queue 冷恢复竞争及 request_user_input 后端准入矩阵均有独立证据。

PG／CH／ES 使用同一 AdventureWorks 只读复制完成实际探索／补充／查询／计算／图表／报告；真实源绑定一分钟时效过期拒绝，原生四个保留技能完成本地指定流程。记忆暂停、恢复、用户编辑跨会话读取与独立原生清空已测试。03:45 的此前定时全局摘要检查已完成；编辑后再次合并另受原生冷却，16:40 有界检查仅为已安排，不算通过。保留全部历史与已保存 notes。

最终后端430项：426通过、4条件跳过；这4项在独立原生实例启用后另4/4通过。JavaScript 20文件315行为测试；97 Python AST、128 JS／MJS语法通过；固定源码／发行文件哈希、176方法及四套schema一致。没有前端打包／TypeScript编译。实际截图与离线HTML图片加载另有记录；不承诺业务自由论述、模型偏好遵循、任意Skill在线安装或生产容量。本节更新下方旧批次的待测状态，不删除历史失败。

''';stage('TEST_REPORT.md',text[:line]+addition+text[line:])
p=r/'REPORT_MEMORY_LOOP.md';text=p.read_text();line=text.index('\n')+1;addition='''
## 2026-10-30 补充：已完成检查与仍待原生冷却的阶段

最新结果见[AUDIT_2026-10-30.md](AUDIT_2026-10-30.md)和[证据](test-results/native-regression-2026-10-30/)。下方“未验证全局合并／已安排03:45”是10月29日阶段记录：该定时检查现已执行，观察到新的原生全局合并与文件变化，新 Flash thread 注入摘要的全文哈希一致并作答；不冒称它调用了专用 read 工具，也不认证任意语义全覆盖。

本轮独立实例实际测试了用户编辑、旧版本保存拒绝、暂停时检索拒绝且新 thread summary=null、启用后分段按 hash 读取当前编辑文档，以及清空后记忆为空而原生对话历史保留。编辑后的新报告有采用新标题的实例；另一次 PG 报告未完全遵循已经传入的标题偏好，模型遵循的限制保留。清空期间遇到有效原生整理租约会真实拒绝，须等实际结束，不能伪造租约或显示假成功。

编辑内容即时跨会话读取与再次合并全局摘要分别计账：本轮新 profile 仍处原生六小时冷却，已保留全部 notes、历史和服务，安排北京时间10月30日16:40一次有界核验；当前只是 scheduledNotYetVerified。未来结果 `/tmp/codex-audit-20261030/edited-memory-once/result.json`，服务 PID 变化或重启可使检查中止，不承诺自动通知。

''';stage('REPORT_MEMORY_LOOP.md',text[:line]+addition+text[line:])
p=r/'USER_WORKFLOWS.md';text=p.read_text();old='单 root 执行规则的本轮实际通过状态以 MULTI_SESSION_AUDIT_2026-10-29.md 的新验收记录为准，不能沿用旧双 root 测试的通过结论。';assert old in text;text=text.replace(old,'当前实际补测与问题修复以 [2026-10-30 验收](AUDIT_2026-10-30.md)为准；下方保留的10月29日验证时间表是阶段记录，不以旧双 root 通过结论代替当前资源准入验证。')
old='  NB --> NC[主任务回收结果并继续检查实际依据]';new=old+'\n  NB --> NX[父回合已结束但 child 仍运行：当前 root 保留占用和 Stop]\n  NX --> NY[点击同一 Stop：原生中断活动回合与 children]\n  NY --> T';assert old in text;text=text.replace(old,new)
old='| 暂停和继续 | 执行中点击停止→等待停止及清理确认→修改要求后发送 |';assert old in text;text=text.replace(old,'| 暂停和继续 | 父任务或 child 执行时点击输入框内同一 Stop→等待停止及清理确认→修改要求后发送 |')
old='原生 `thread/start`／`thread/resume` 建立各连接的线程订阅';text=text.replace(old,'Linux 的 Web 宿主异常退出会触发启动边界的进程死亡绑定，避免本服务创建的原生进程遗留；不是浏览器连接的生命周期。运行时错误／回执未知仍须核对，显式恢复不重发任务，不承诺跨平台或任意脱离原生管理的进程已回收。\n\n'+old)
stage('USER_WORKFLOWS.md',text)
(s/'preimages.json').write_text(json.dumps(items,indent=2))
