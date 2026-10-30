from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,time,os,signal,urllib.request,http.cookiejar
B=Path('/tmp/codex-audit-20261030');cfg=json.loads((B/'context.json').read_text());tag=os.environ.get('AUDIT_WEB_CRASH_TAG','before');marker='T30_WEB_CRASH_'+tag.upper()
def utc():return datetime.now(timezone.utc).isoformat()
def birth(pid):
 try:
  f=Path('/proc',str(pid),'stat').read_text().rsplit(')',1)[1].split();return None if f[0] in ('Z','X') else f[19]
 except OSError:return None
def ctl(code,t=45):
 p=subprocess.run(['python3','-B',str(B/'call_driver.py'),str(t)],input=code,text=True,capture_output=True,timeout=t+5);x=json.loads(p.stdout);assert x['ok'],x.get('error');return x['result']
def cmds():
 result=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   a=(p/'cmdline').read_bytes().split(b'\0')
   if a[0] in (b'python3',b'/usr/bin/python3') and a[1:3]==[b'-u',b'-c'] and marker.encode() in a[3] and birth(p.name):result.append({'pid':int(p.name),'birth':birth(p.name)})
  except (OSError,IndexError):pass
 return result
r={'case':'T30-004C','phase':tag,'startedAt':utc(),'model':'deepseek-flash','fault':'SIGKILL owned Web during actual native command'};env=None;args=None
try:
 assert ctl('return (await status(native)).nativeRuntime.execution.status;')=='idle'
 prompt='这是独立 Web 进程崩溃验收。实际执行 python3 -u -c "import time; print(\''+marker+'\',flush=True); time.sleep(180)" 并等待结束。不要查数据库、联网、改文件或新增记忆。'
 ctl('await native.locator("#new-chat").click();await native.locator("#prompt").fill('+json.dumps(prompt)+');await native.locator("#send").click();return {sent:true};')
 deadline=time.monotonic()+90
 while not cmds() and time.monotonic()<deadline:time.sleep(.1)
 r['commandsBefore']=cmds();assert r['commandsBefore'],'Actual command absent, no crash injection'
 s=ctl('return await status(native);');r['root']=s['nativeRuntime']['execution']['ownerThreadId'];npid=s['nativeRuntime']['pid'];r['nativeBefore']={'pid':npid,'birth':birth(npid)};pid=s['pid'];p=Path('/proc',str(pid));args=[v.decode() for v in (p/'cmdline').read_bytes().split(b'\0') if v];assert cfg['workspace'] in args and '/root/Codex/web/server.py' in args;env=dict(v.decode().split('=',1) for v in (p/'environ').read_bytes().split(b'\0') if b'=' in v);assert env['CODEX_HOME']==cfg['home'];assert os.readlink(Path('/proc',str(npid),'cwd'))==cfg['workspace'];r['faultAt']=utc();os.kill(pid,signal.SIGKILL)
 deadline=time.monotonic()+8
 while time.monotonic()<deadline and (birth(npid) or cmds()):time.sleep(.1)
 r['nativeAliveAfter8s']=bool(birth(npid));r['commandsAfter8s']=cmds();r['automaticOwnerCleanupPassed']=not r['nativeAliveAfter8s'] and not r['commandsAfter8s'];(B/('T04-web-crash-'+tag+'.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2))
 if birth(npid):
  # Only this exact native PID is cleaned up, before starting another runtime.
  assert birth(npid)==r['nativeBefore']['birth'];os.kill(npid,signal.SIGKILL);r['manualOwnedNativeCleanupRequired']=True
 deadline=time.monotonic()+10
 while (birth(npid) or cmds()) and time.monotonic()<deadline:time.sleep(.1)
 assert not birth(npid) and not cmds(),'Old native work not proven gone; do not overlap a restart'
finally:
 if env is not None and args:
  with (B/'live/service.log').open('ab',buffering=0) as log:new=subprocess.Popen(args,cwd='/root/Codex',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  del env;cfg['pid']=new.pid;(B/'context.json').write_text(json.dumps(cfg,indent=2));(B/('T04-web-crash-'+tag+'.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2))
  deadline=time.monotonic()+30
  while time.monotonic()<deadline:
   try:
    urllib.request.urlopen(cfg['url']+'/',timeout=2).close();break
   except OSError:time.sleep(.1)
  r['recovery']=ctl('await native.reload();await native.waitForFunction(()=>state.ready&&state.runtimeDefaults&&!state.threadLoading,null,{timeout:45000});return {history:await raw(native,"thread/read",{threadId:'+json.dumps(r['root'])+',includeTurns:true}),execution:(await status(native)).nativeRuntime.execution};',60);r['restartedPid']=new.pid
 r['finishedAt']=utc();(B/('T04-web-crash-'+tag+'.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in r.items() if k!='recovery'},ensure_ascii=False))
