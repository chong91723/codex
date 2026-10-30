"""Actual Flash spawn -> real native child command -> parent-page Stop -> native/OS proof."""
from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,time
BASE=Path('/tmp/codex-audit-20261030');MARKER='T30_CHILD_STOP_V3'
def utc():return datetime.now(timezone.utc).isoformat()
def controller(code,timeout=30):
 r=subprocess.run(['/usr/bin/python3','-B',str(BASE/'call_driver.py'),str(timeout)],input=code,text=True,capture_output=True,timeout=timeout+5);v=json.loads(r.stdout);assert v['ok'],v.get('error');return v['result']
def processes():
 result=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   args=(p/'cmdline').read_bytes().split(b'\0')
   if len(args)>3 and args[0] in (b'python3',b'/usr/bin/python3') and args[1:3]==[b'-u',b'-c'] and MARKER.encode() in args[3]:
    fields=(p/'stat').read_text().rsplit(')',1)[1].split();result.append({'pid':int(p.name),'birth':fields[19],'parent':int(fields[1])})
  except OSError:pass
 return result
prompt='这是原生子任务停止回归。用原生 spawn_agent 派发一个子任务，子任务必须实际执行 python3 -u -c "import os,time; print(\'T30_CHILD_STOP_V3\',os.getpid(),flush=True); time.sleep(300)" 并等待命令结束。主任务派发成功后立即简短回复并结束主回合，但不要关闭、取消子任务。用户随后会在父会话页面点击停止。不要查数据库、联网、写文件、安装软件或新增记忆。'
receipt={'case':'T30-003','startedAt':utc(),'model':'deepseek-flash','nativeChild':True,'marker':MARKER}
try:
 controller('await native.reload();await native.waitForFunction(()=>state.ready&&state.runtimeDefaults&&!state.threadLoading,null,{timeout:45000});if(await native.evaluate(()=>typeof executionStopTargets)!=="function")throw Error("New UI not loaded");await native.locator("#new-chat").click();await native.locator("#prompt").fill('+json.dumps(prompt)+');await native.locator("#send").click();return {sent:true};',60)
 deadline=time.monotonic()+120
 while time.monotonic()<deadline:
  found=processes()
  if found:break
  time.sleep(.1)
 assert found,'No actual child command was observed; no stop pass claimed'
 receipt.update(commandObservedAt=utc(),hostProcesses=found)
 before=controller('const e=(await status(native)).nativeRuntime.execution;globalThis.t03Root=stateUnavailable;return e;'.replace('globalThis.t03Root=stateUnavailable;','globalThis.t03Root=await native.evaluate(()=>state.thread?.id);'))
 receipt['before']=before
 assert any(t['threadId']!=before['ownerThreadId'] for t in before['activeTurns']),'No active native descendant'
 receipt['beforeBrowserClose']=controller('return {pid:(await status(native)).nativeRuntime.pid,root:await native.evaluate(()=>state.thread?.id)};')
 receipt['zeroPages']=controller('for(const p of pages)if(!p.isClosed())await p.close();return {actualPages:browser.contexts().reduce((n,c)=>n+c.pages().length,0),at:new Date().toISOString()};')
 assert receipt['zeroPages']['actualPages']==0
 time.sleep(1);receipt['commandsWithZeroPages']=processes();assert receipt['commandsWithZeroPages'],'Closing the actual browser pages killed native work'
 receipt['reopened']=controller('globalThis.native=await newPage();const identity='+json.dumps(before['ownerThreadId'])+';if(await native.evaluate(()=>state.thread?.id)!==identity)await native.evaluate(async id=>await openThread(id),identity);return {pid:(await status(native)).nativeRuntime.pid,snapshot:await snap(native)};',60)
 assert receipt['reopened']['pid']==receipt['beforeBrowserClose']['pid'],'Browser closure replaced native runtime'
 receipt['click']=controller('const ui=await snap(native),button=await native.locator("#send").evaluate(n=>({disabled:n.disabled,label:n.getAttribute("aria-label")}));if(button.disabled)throw Error("Parent Stop is disabled");await native.screenshot({path:"/tmp/codex-audit-20261030/T03-browser-lifecycle-stop.png"});await native.locator("#send").click();return {at:new Date().toISOString(),button,root:ui.threadId,parentStatus:ui.turns.at(-1)?.status};')
 deadline=time.monotonic()+55
 while time.monotonic()<deadline:
  value=controller('const value=(await status(native)).nativeRuntime.execution;return {execution:value,stop:await native.evaluate(()=>state.executionStopGroup?{status:state.executionStopGroup.status,error:state.executionStopGroup.error}:null)};')
  if value['execution']['status']=='idle':break
  time.sleep(.15)
 receipt['after']=value;receipt['processesAfter']=processes();assert value['execution']['status']=='idle','Native cleanup did not release execution'
 assert not receipt['processesAfter'],'Command process survived the native/UI completed state'
 targets=[t for t in before['activeTurns'] if t['threadId']!=before['ownerThreadId']]
 receipt['childHistories']=controller('const values=[];for(const id of '+json.dumps([t['threadId'] for t in targets])+')values.push(await raw(native,"thread/read",{threadId:id,includeTurns:true}));return values;')
 assert any(t.get('status')=='interrupted' for h in receipt['childHistories'] for t in h.get('result',{}).get('thread',{}).get('turns',[])),'No actual native child interrupted receipt'
 receipt['passed']=True
finally:
 receipt['finishedAt']=utc();(BASE/'T03-browser-lifecycle-regression.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in receipt.items() if k not in ('childHistories','before','after')},ensure_ascii=False))
