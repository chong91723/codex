"""Prepare durable native goals/queue only via Codex RPC while the owned Web is idle/offline."""
from pathlib import Path
import json,os,signal,subprocess,sys,time,threading,http.cookiejar,urllib.request,uuid
from unittest.mock import patch
BASE=Path('/tmp/codex-audit-20261030');ROOT=Path('/root/Codex');cfg=json.loads((BASE/'context.json').read_text());ids=json.loads((BASE/'T02-identities.json').read_text())
def birth(pid):
 try:
  f=Path('/proc',str(pid),'stat').read_text().rsplit(')',1)[1].split();return None if f[0] in ('Z','X') else f[19]
 except (OSError,IndexError):return None
c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def status():
 c.open(cfg['url']+'/').close()
 with c.open(cfg['url']+'/api/status',timeout=5) as r:return json.load(r)
old=status();assert old['nativeRuntime']['execution']['status']=='idle';pid=old['pid'];stamp=birth(pid);proc=Path('/proc',str(pid));argv=[v.decode() for v in (proc/'cmdline').read_bytes().split(b'\0') if v];assert cfg['workspace'] in argv and '/root/Codex/web/server.py' in argv
env=dict(v.decode().split('=',1) for v in (proc/'environ').read_bytes().split(b'\0') if b'=' in v);assert env['CODEX_HOME']==cfg['home']
assert birth(pid)==stamp;os.kill(pid,signal.SIGINT)
deadline=time.monotonic()+30
while birth(pid)==stamp and time.monotonic()<deadline:time.sleep(.1)
assert birth(pid)!=stamp,'Owned Web did not stop; no extra runtime started'
sys.path.insert(0,str(ROOT/'web'));from memory_scheduler import NativeSession
receipt={'kind':'nativeProtocolOnlyUnloadedGoalQueuePreparation','rootA':ids['rootA'],'rootB':ids['rootB'],'noSQLiteJobOrTimestampWrites':True,'historyDeleted':False,'environmentInheritedOnlyInMemory':True};session=None
try:
 with patch.dict(os.environ,env,clear=True):session=NativeSession(str(ROOT/'native/bin/codex'),Path(cfg['home']),os.getpid(),threading.Event())
 receipt['initialize']=session.call('initialize',{'clientInfo':{'name':'native_autowork_setup','version':'1'},'capabilities':{'experimentalApi':True}})
 session.process.stdin.write('{"method":"initialized"}\n');session.process.stdin.flush()
 receipt['before']=session.call('thread/read',{'threadId':ids['rootA'],'includeTurns':False})
 receipt['goal']=session.call('thread/goal/set',{'threadId':ids['rootA'],'origin':'user','objective':'只读原生恢复验收：处理队列后回答 GOAL_RESUME_CHECK 并将目标标为完成。不要查询数据库、联网、改文件或新增记忆。','status':'active','tokenBudget':3000})
 receipt['queued']=session.call('thread/queue/add',{'threadId':ids['rootA'],'input':[{'type':'text','text':'这是原生持久队列恢复验收。仅回复 NATIVE_QUEUE_RESUMED，不使用工具、不新增记忆。'}],'clientUserMessageId':str(uuid.uuid4())})
 receipt['after']=session.call('thread/read',{'threadId':ids['rootA'],'includeTurns':False})
 receipt['goalRead']=session.call('thread/goal/get',{'threadId':ids['rootA']});receipt['queueRead']=session.call('thread/queue/list',{'threadId':ids['rootA'],'limit':100})
 assert receipt['after']['thread']['status']['type']=='notLoaded','Setup unexpectedly loaded the root'
finally:
 if session:session.close()
 (BASE/'T02-native-durable-setup.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
 with (BASE/'live/service.log').open('ab',buffering=0) as log:new=subprocess.Popen(argv,cwd=str(ROOT),env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 del env
 for _ in range(150):
  try:
   current=status()
   if current['pid']==new.pid:break
  except OSError:pass
  time.sleep(.1)
 cfg['pid']=new.pid;(BASE/'context.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2))
 print(json.dumps({'webRestarted':True,'pid':new.pid,'rootA':ids['rootA'],'nativePrepared':bool(receipt.get('queueRead')),'oldHistoriesDeleted':False}))
