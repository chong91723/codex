from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,gzip,re
B=Path('/tmp/codex-memory-management-20261030');O=Path('/root/Codex/test-results/memory-management-2026-10-30');O.mkdir(parents=True,exist_ok=True)
selected={p:p.relative_to(B) for p in B.iterdir() if p.is_file() and p.suffix in ('.json','.png','.log') and p.name!='context.json'}
selected.update({p:p.relative_to(B) for p in (B/'background').glob('*.png')})
selected.update({p:Path('review')/p.name for p in (B/'review').glob('*.json')})
for n in ('browser_driver.mjs','call_driver.py','case_helpers.py','collect_background_proof.py','observe_background.py','test_save_flash.py','test_read_flash.py','test_corrected_read_flash.py','test_corrected_read_flash_after.py','test_read_after_delete.py','test_delete_ui.py','test_ui_edit_cas.py','test_ui_adjacent.py','daily_smoke_controller.py','cleanup_labs.py','restart_daily.py','run_js_units.py','js-unit-files.txt','run_static_checks.py'):selected[B/n]=Path('controllers')/n
for n in ('result.json','recall-receipt.json','native-summary-binding.json','recall-started.json','recall-thread.json','fired.json'):
 p=Path('/tmp/codex-audit-20261030/edited-memory-once')/n
 if p.is_file():selected[p]=Path('scheduled')/n
selected[B/'wire.jsonl']=Path('test-instance-wire.jsonl')
for p in B.glob('aoci-*'):
 if p.is_file() and p.suffix in ('.json','.txt','.log'):selected[p]=Path('developer-index')/p.name
selected[B/'codegraph-status.txt']=Path('developer-index/codegraph-status.txt')
selected[B/'archive_public.py']=Path('controllers/archive_public.py')
secret=re.compile(r'password|authorization|cookie|(?:^|_)api_?key|access_?token|(?:^|_)secret|codex_web_token',re.I);redactions=0;removedDailyWireRows=0
def clean(v):
 global redactions
 if isinstance(v,list):return [clean(x) for x in v]
 if isinstance(v,dict):
  out={}
  for k,x in v.items():
   if secret.search(k) and isinstance(x,str) and x and x not in ('[REDACTED]','[redacted]','string','boolean','object') and k!='env_key':out[k]='[REDACTED]';redactions+=1
   else:out[k]=clean(x)
  return out
 if isinstance(v,str):
  out,n=re.subn(r'\bsk-[A-Za-z0-9_-]{20,}','[REDACTED]',v);redactions+=n
  out,n=re.subn(r'Bearer\s+[^\s"<>]+','Bearer [REDACTED]',out,flags=re.I);redactions+=n
  out,n=re.subn(r'(https?://)[^\s/@:]+:[^\s/@]+@',r'\1[REDACTED]@',out);redactions+=n
  return out
 return v
manifest=[]
for source,rel in sorted(selected.items(),key=lambda x:str(x[1])):
 if not source.is_file():continue
 raw=source.read_bytes();before=redactions;data=raw
 if source.suffix=='.json':data=(json.dumps(clean(json.loads(raw)),ensure_ascii=False,indent=2)+'\n').encode()
 elif source.suffix=='.jsonl':
  rows=[]
  for line in raw.decode().splitlines():
   if not line:continue
   v=json.loads(line)
   if v.get('page')=='daily-readonly':removedDailyWireRows+=1;continue
   rows.append(json.dumps(clean(v),ensure_ascii=False))
  data=('\n'.join(rows)+'\n').encode()
 elif source.suffix in ('.log','.txt'):data=clean(raw.decode()).encode()
 target=O/rel;target.parent.mkdir(parents=True,exist_ok=True)
 if len(data)>600000:target=target.with_name(target.name+'.gz');data=gzip.compress(data,mtime=0)
 target.write_bytes(data);manifest.append({'source':str(source),'artifact':str(target.relative_to(O)),'sourceBytes':len(raw),'storedBytes':len(data),'sourceSha256':hashlib.sha256(raw).hexdigest(),'storedSha256':hashlib.sha256(data).hexdigest(),'redactions':redactions-before})
(O/'manifest.json').write_text(json.dumps({'at':datetime.now(timezone.utc).isoformat(),'scope':'Explicit public receipts/controllers/screenshots only; no profile, config, env, cookie, private service logs. Daily raw wire entirely excluded. Large evidence gzip.','files':manifest,'redactions':redactions,'dailyWireRowsExcluded':removedDailyWireRows},ensure_ascii=False,indent=2))
cases={'model':'deepseek-flash','provider':'deepseek','nativeSourceCommit':'970111f6cb62cc02fe36a82ea7d71b37a2889c97','realWorkflowCases':[{'workflow':w,'status':'passed','evidence':e} for w,e in [
 ('原生笔记保存明确偏好','flash-save-preference.json'),('新会话读取已保存偏好','flash-new-analysis-read.json'),('两页CAS及状态轮询保留草稿','ui-edit-cas.json'),('纠正后原生完整上下文与Flash读取','flash-corrected-analysis-read-after-context-fix.json'),('原生独立维护合并及清理','background-final-proof.json'),('维护已清理直链与完成卡片','ui-background-completed-direct-link.json'),('永久删除原聊天并保留独立偏好','ui-delete-independent-memory.json'),('删除后新Flash仍读取偏好','flash-read-after-original-chat-deleted.json'),('同名用户会话、原生启停及桌面尺寸','ui-memory-adjacent.json'),('日常空闲重启/配置对齐/零模型只读','daily-smoke.json'),('原定16:40自然冷却后全局合并与Flash读取','scheduled-recall-reviewed.json')]],
 'retainedFailures':[{'evidence':'flash-corrected-analysis-read.json','type':'confirmed product defect','cause':'Native per-value middle truncation omitted the new user preference; fixed, real retry separate.'},{'evidence':'ui-memory-adjacent-first-controller-timing.json','type':'controller timing','cause':'Awaited early label change, not completion; corrected wait and separate retry.'},{'evidence':'daily-smoke-first-observation.json','type':'deployment configuration condition','cause':'Old native generate_memories=true; per-thread policy was already false. Native single-key CAS alignment and final readback retained.'}],
 'engineering':{'python':'python-full-summary.json','nativeOptIn':'native-optin-summary.json','javascript':'js-summary.json','static':'static-checks-summary.json','nativeIntegrity':'upstream-native-verification-summary.json'},
 'limits':['No new business-database or source-adjudication end-to-end run in this memory-only batch.','Browser closure and native job completion occur in the same second; only later cleanup without the page is proven here.','No claim that deletion synchronously retracts already-injected global context or that all model memory interpretation is perfect.','Real new model flow covers turn/start; steer context propagation is protocol/source and behavior-test coverage.','Maintenance sessions predating exact registration are not classified or deleted by title.','One user root policy is retained; no production multitenancy/capacity certification.']}
(O/'cases.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2))
(O/'README.md').write_text('# 会话与记忆管理验收\n\n[流程与结果](cases.json)、[原始文件哈希](manifest.json)、[问题清单](../../AUDIT_2026-10-30.md)、[分层报告](../../TEST_REPORT.md)。\n\n本轮保留临时上下文隔离和确认业务知识管理，使用原生会话、笔记和合并。真实Flash、浏览器、无模型原生协议及离线夹具分别记账；首次真实偏好传输失败及控制器时序失败保留。日常实例只做空闲更新和只读检查；未清除历史、记忆或知识。\n\n公开产物不包含测试profile、用户配置、环境或凭据；日常原始WebSocket流不归档。test-instance-wire.jsonl.gz仅为隔离测试实例。原16:40定时检查的独立结果位于scheduled，不改写旧批次的当时状态。\n')
print(json.dumps({'directory':str(O),'files':len(manifest),'redactions':redactions,'dailyWireRowsExcluded':removedDailyWireRows,'storedBytes':sum(x['storedBytes'] for x in manifest)},ensure_ascii=False))
