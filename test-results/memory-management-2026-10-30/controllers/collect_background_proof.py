"""Read-only proof from the isolated memory acceptance profile; exports no credentials."""
from datetime import datetime,timezone
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import urllib.request
sys.path.insert(0,'/root/Codex/web')
from native_memory import NativeMemory
from memory_scheduler import notes_token,generated_token
from memory_maintenance import process_alive
BASE=Path('/tmp/codex-memory-management-20261030')
context=json.loads((BASE/'background/context.json').read_text());home=Path(context['home'])
assert home==BASE/'background/live/profile'
thread='01a18bf7-6a64-7812-bc66-313ef7ffd7d9'
memory=NativeMemory('/root/Codex/native/bin/codex',home);snapshot=memory.snapshot()
progress=json.loads((home/'web-memory/scheduler-progress.json').read_text())
registry=snapshot['maintenanceSessions'];assert snapshot['maintenanceSessionIds']==[thread]
assert len(registry)==1 and registry[0]['threadId']==thread
record=registry[0]
assert record['removed'] and record['cleanupStatus']=='removed'
assert snapshot['consolidationState']['state']=='completed'
assert snapshot['consolidationState']['currentReceiptMatches']
assert progress['nativeWorker']==thread and progress['nativeTurnId']==record['turnId']
assert progress['notesToken']==notes_token(home) and progress['generatedToken']==generated_token(home)
summary=(home/'memories_v2/memory_summary.md').read_text()
assert '清泉验收' in summary
with sqlite3.connect((home/'memories_v2_1.sqlite').as_uri()+'?mode=ro',uri=True) as db:
 job=db.execute("SELECT kind,status,worker_id,started_at,finished_at,last_error FROM jobs WHERE kind='memory_consolidate_global' AND job_key='global'").fetchone()
 assert job[1]=='done' and job[2]==thread and job[5] is None
 native_jobs=[dict(zip(('kind','status','workerId','startedAt','finishedAt','lastError'),job))]
with sqlite3.connect((home/'state_5.sqlite').as_uri()+'?mode=ro',uri=True) as db:
 native_present=bool(db.execute('SELECT count(*) FROM threads WHERE id=?',(thread,)).fetchone()[0]);assert not native_present
with sqlite3.connect((home/'web-memory/maintenance-sessions.sqlite').as_uri()+'?mode=ro',uri=True) as db:
 registry_count=db.execute('SELECT count(*) FROM sessions').fetchone()[0];assert registry_count==1
with sqlite3.connect((home/'logs_2.sqlite').as_uri()+'?mode=ro',uri=True) as db:
 # Export only recognized model identifiers and counts, never request bodies,
 # headers, authorization values, environment or configuration documents.
 rows=db.execute("SELECT target,feedback_log_body,thread_id FROM logs WHERE feedback_log_body LIKE '%deepseek-flash%'").fetchall()
 request_rows=[row for row in rows if row[0]=='codex_http_client::client']
 request_model_matches=sum(len(re.findall(r'(?:model)[ =:\\\"]+(deepseek-flash)',row[1])) for row in request_rows)
 assert request_model_matches>0
log_proof={'source':'native logs_2.sqlite read-only; raw bodies withheld','configuredModel':context['model'],'provider':context['provider'],
           'nativeHttpClientRowsWithFlash':len(request_rows),'nativeModelFieldFlashMatches':request_model_matches,
           'nativeThreadIdsWithModelLog':sorted({row[2] for row in request_rows if row[2]})}
jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
client.open(context['url']+'/',timeout=10).close()
with client.open(context['url']+'/api/status',timeout=10) as response:status=json.load(response)
assert status['pid']==context['pid'] and status['workspace']==context['workspace']
with client.open(context['url']+'/api/memory-maintenance',timeout=10) as response:api_registry=json.load(response)
assert api_registry['threadIds']==[thread] and len(api_registry['sessions'])==1
workers=[]
for proc in Path('/proc').iterdir():
 if not proc.name.isdigit():continue
 try:args=proc.joinpath('cmdline').read_bytes().split(b'\0')
 except OSError:continue
 if b'/root/Codex/web/memory_scheduler.py' in args and b'--home' in args:
  try:matches=args[args.index(b'--home')+1]==str(home).encode()
  except IndexError:matches=False
  if matches:workers.append(int(proc.name))
assert workers==[record['schedulerPid']],workers
closed=json.loads((BASE/'background-browser-closed.json').read_text())[0]
close_time=datetime.fromisoformat(closed['closedAtLatest']).timestamp()
cleanup_time=datetime.fromisoformat(record['updatedAt']).timestamp()
assert closed['allPagesAtBackgroundOrigin']==0 and cleanup_time>close_time
proof={'passed':True,'checkedAt':datetime.now(timezone.utc).isoformat(),'scope':'Isolated real Flash native memory lifecycle; read-only final verification',
       'profile':str(home),'port':context['port'],'webPid':status['pid'],
       'preferenceState':snapshot['preferenceState'],'consolidationState':snapshot['consolidationState'],'nativeControl':snapshot['nativeControl'],
       'progressReceipt':progress,'registryCount':registry_count,'registeredThreadId':thread,'registryRecord':record,
       'sameProfileSchedulerPids':workers,'duplicateMaintenanceRegistration':False,'nativeJobs':native_jobs,'nativeThreadPresentAfterCleanup':native_present,
       'maintenanceProcessStillAlive':process_alive(record['pid'],record['birth']),
       'summary':{'path':'memories_v2/memory_summary.md','bytes':len(summary.encode()),'sha256':hashlib.sha256(summary.encode()).hexdigest(),'marker':'清泉验收','markerPresent':True},
       'modelEvidence':log_proof,'maintenanceApiMatchesRegistry':True,
       'browserClosure':{'closedAtLatest':closed['closedAtLatest'],'allPagesAtBackgroundOrigin':0,'nativeJobFinishedAtSeconds':job[4],
          'cleanupRecordedAt':record['updatedAt'],'cleanupObservedAfterBrowserClosure':True,'wholeNativeJobRanWithoutBrowser':'not_proven',
          'limitation':'浏览器关闭与原生job完成记录处于同一秒，不能证明整个job在无浏览器期间运行；仅维护会话清理时间明确晚于关闭。'},
       'noNewModelRequests':True,'noSourceOrNativeStateEdits':True,'noEnvironmentOrConfigurationExported':True}
assert not proof['maintenanceProcessStillAlive']
output=BASE/'background-final-proof.json';output.write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'proof':str(output),'passed':proof['passed'],'state':proof['consolidationState']['state'],'receiptMatches':proof['consolidationState']['currentReceiptMatches'],'registryCount':registry_count,'schedulerCount':len(workers),'nativeThreadRemoved':not native_present,'summaryMarkerPresent':True,'nativeHttpModelFlashMatches':request_model_matches,'browserBoundary':proof['browserClosure']['limitation']},ensure_ascii=False))
