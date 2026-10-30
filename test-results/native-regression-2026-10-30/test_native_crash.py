from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,time,os,signal,http.cookiejar,urllib.request
BASE=Path('/tmp/codex-audit-20261030');cfg=json.loads((BASE/'context.json').read_text());marker='T30_NATIVE_CRASH_COMMAND'
def utc():return datetime.now(timezone.utc).isoformat()
def ctl(code,t=40):
 r=subprocess.run(['python3','-B',str(BASE/'call_driver.py'),str(t)],input=code,text=True,capture_output=True,timeout=t+5);v=json.loads(r.stdout);assert v['ok'],v.get('error');return v['result']
def birth(pid):
 try:
  f=Path('/proc',str(pid),'stat').read_text().rsplit(')',1)[1].split();return None if f[0] in ('Z','X') else f[19]
 except OSError:return None
c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def status():
 c.open(cfg['url']+'/',timeout=3).close()
 with c.open(cfg['url']+'/api/status',timeout=4) as r:return json.load(r)
def command():
 out=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   a=(p/'cmdline').read_bytes().split(b'\0')
   if a[0] in (b'python3',b'/usr/bin/python3') and a[1:3]==[b'-u',b'-c'] and marker.encode() in a[3]:out.append({'pid':int(p.name),'birth':birth(p.name)})
  except (OSError,IndexError):pass
 return out
receipt={'case':'T30-004A','startedAt':utc(),'model':'deepseek-flash','nativeProcessFault':True,'automaticReplayAllowed':False}
try:
 assert status()['nativeRuntime']['execution']['status']=='idle'
 prompt='这是独立运行时故障验收。请实际执行 python3 -u -c "import time; print(\'T30_NATIVE_CRASH_COMMAND\',flush=True); time.sleep(180)" 并等待命令结束。不要查库、联网、写文件或新增记忆。'
 ctl('await native.locator("#new-chat").click();const sw=native.locator("#exit-plan-mode");if(await sw.count()&&await sw.getAttribute("aria-checked")==="true")await sw.click();await native.locator("#prompt").fill('+json.dumps(prompt)+');await native.locator("#send").click();return {sent:true};')
 deadline=time.monotonic()+100
 while not command() and time.monotonic()<deadline:time.sleep(.1)
 receipt['commandsBefore']=command();assert receipt['commandsBefore'],'No actual command; fault not injected'
 before=status();receipt['before']=before['nativeRuntime'];receipt['root']=before['nativeRuntime']['execution']['ownerThreadId'];npid=before['nativeRuntime']['pid'];nproc=Path('/proc',str(npid));argv=(nproc/'cmdline').read_bytes().split(b'\0');assert b'/root/Codex/native/bin/codex' in argv and b'app-server' in argv;assert os.readlink(nproc/'cwd')==cfg['workspace']
 receipt['nativePid']=npid;receipt['faultAt']=utc();os.kill(npid,signal.SIGKILL)
 time.sleep(.8);receipt['afterFault']=status()['nativeRuntime'];receipt['competitor']=ctl('return await raw(native,"turn/start",{threadId:rootB,input:[{type:"text",text:"T30_CRASH_COMPETITOR_MUST_NOT_RUN"}]});')
 assert 'error' in receipt['competitor'],'Competitor accepted after real native crash'
 deadline=time.monotonic()+20
 while command() and time.monotonic()<deadline:time.sleep(.1)
 receipt['commandsAfterFault']=command();assert not receipt['commandsAfterFault'],'Native command survived native process exit; do not restart over it'
 receipt['uiAfterFault']=ctl('return {snapshot:await snap(native),button:await native.locator("#send").evaluate(n=>({disabled:n.disabled,label:n.getAttribute("aria-label")}))};')
 pid=before['pid'];stamp=birth(pid);p=Path('/proc',str(pid));args=[v.decode() for v in (p/'cmdline').read_bytes().split(b'\0') if v];assert cfg['workspace'] in args and '/root/Codex/web/server.py' in args;env=dict(v.decode().split('=',1) for v in (p/'environ').read_bytes().split(b'\0') if b'=' in v);assert env['CODEX_HOME']==cfg['home'];os.kill(pid,signal.SIGINT)
 deadline=time.monotonic()+30
 while birth(pid)==stamp and time.monotonic()<deadline:time.sleep(.1)
 assert birth(pid)!=stamp
 with (BASE/'live/service.log').open('ab',buffering=0) as log:new=subprocess.Popen(args,cwd='/root/Codex',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 del env;cfg['pid']=new.pid;(BASE/'context.json').write_text(json.dumps(cfg,indent=2))
 deadline=time.monotonic()+30
 while time.monotonic()<deadline:
  try:
   if status()['pid']==new.pid:break
  except OSError:pass
  time.sleep(.1)
 receipt['restartedPid']=new.pid;receipt['reconnected']=ctl('await native.reload();await native.waitForFunction(()=>state.ready&&state.runtimeDefaults&&!state.threadLoading,null,{timeout:45000});return {history:await raw(native,"thread/read",{threadId:'+json.dumps(receipt['root'])+',includeTurns:true}),status:(await status(native)).nativeRuntime};',60)
 receipt['commandAfterReconnect']=command();receipt['recoveredNativeStatuses']=[t['status'] for t in receipt['reconnected']['history'].get('result',{}).get('thread',{}).get('turns',[])];receipt['passedNoReplay']=not receipt['commandAfterReconnect'];receipt['passedFailClosed']='error' in receipt['competitor'];receipt['historyPreserved']=bool(receipt['recoveredNativeStatuses'])
finally:
 receipt['finishedAt']=utc();(BASE/'T04-native-crash.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in receipt.items() if k not in ('before','afterFault','uiAfterFault','reconnected')},ensure_ascii=False))
