"""Controller-only helpers: submit once and correlate the actual native ACK."""
from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,time,uuid
B=Path('/tmp/codex-uploaded-skills-20261030')
BINDING_VERSION='native-test-submission/v1'
TERMINAL=('completed','failed','interrupted')
def utc():return datetime.now(timezone.utc).isoformat()
def ctl(code,t=40):
 p=subprocess.run(['python3','-B',str(B/'call_driver.py'),str(t)],input=code,text=True,capture_output=True,timeout=t+8)
 try:x=json.loads(p.stdout)
 except ValueError:raise RuntimeError('Controller response unavailable; retained request is not a product result and must not be replayed')
 if not x.get('ok'):raise RuntimeError(x.get('error'))
 return x['result']
def snap():return ctl('return await snap(native);')
def idle():
 v=ctl('return (await status(native)).nativeRuntime.execution;');assert v['status']=='idle',v;return v
def last_submission():return ctl('return globalThis.rootCaseSubmission??null;')
def require_ack(binding):
 if not isinstance(binding,dict) or binding.get('version')!=BINDING_VERSION:raise RuntimeError('No ACK-bound receipt; legacy submittedAt/old history is not a native turn ACK. Do not resubmit.')
 if binding.get('phase')!='acknowledged' or not binding.get('threadId') or not binding.get('turnId') or binding.get('requestId') is None:raise RuntimeError('This submission has no successful native ACK yet; inspect retained request, do not resubmit.')
 return binding
def acknowledge(binding,observation):
 """Pure correlation. None means no matching ACK; history is never an ACK."""
 if not isinstance(binding,dict) or binding.get('version')!=BINDING_VERSION:raise RuntimeError('Missing submission attempt identity')
 requests=observation.get('requests',[])
 if len(requests)>1:raise RuntimeError('Multiple native execution requests followed one UI submission; no target guessed')
 if not requests:return None
 request=requests[0];method=request['method'];params=request.get('params') or {}
 if method!=binding['expectedMethod']:raise RuntimeError('UI sent '+method+' instead of '+binding['expectedMethod'])
 thread=params.get('threadId')
 if not thread or binding.get('beforeThreadId') and thread!=binding['beforeThreadId']:raise RuntimeError('Native request targets a different thread')
 if method=='turn/steer' and params.get('expectedTurnId')!=binding.get('expectedTurnId'):raise RuntimeError('Steer targets a different active turn')
 replies=[x for x in observation.get('replies',[]) if x.get('id')==request.get('id')]
 if len(replies)>1:raise RuntimeError('Duplicate native ACK candidates')
 if not replies:return None
 reply=replies[0]
 if reply.get('error'):raise RuntimeError('Native submission rejected: '+json.dumps(reply['error'],ensure_ascii=False))
 result=reply.get('result') or {};turn=result.get('turnId') if method=='turn/steer' else (result.get('turn') or {}).get('id')
 if not turn:raise RuntimeError('ACK has no native turn identity')
 if method=='turn/start' and (turn in binding.get('beforeTurnIds',[]) or turn==binding.get('beforeTurnId')):raise RuntimeError('ACK returned a previous turn')
 if method=='turn/steer' and turn!=binding.get('expectedTurnId'):raise RuntimeError('Steer ACK belongs to another turn')
 return {**binding,'phase':'acknowledged','requestId':request['id'],'threadId':thread,'turnId':turn,'acknowledgedAt':reply.get('at'),'requestSentAt':request.get('at')}
def _ack_observation(binding):
 # Only identities and small ACK fields cross the controller pipe: not giant
 # filler input, complete configuration or historical/tool response bodies.
 return ctl('const b='+json.dumps(binding)+';const rows=wire.slice(b.wireStart);'
  'const requests=rows.filter(x=>x.direction==="sent"&&["turn/start","turn/steer"].includes(x.data?.method)).map(x=>({at:x.at,id:x.data.id,method:x.data.method,params:{threadId:x.data.params?.threadId,expectedTurnId:x.data.params?.expectedTurnId}}));'
  'const ids=new Set(requests.map(x=>x.id));const replies=rows.filter(x=>x.direction==="received"&&!x.data?.method&&ids.has(x.data?.id)).map(x=>({at:x.at,id:x.data.id,error:x.data.error,result:x.data.result?{turnId:x.data.result.turnId,turn:x.data.result.turn?{id:x.data.result.turn.id,status:x.data.result.turn.status}:undefined}:undefined}));return {requests,replies};')
def await_submission(submission=None,timeout=60):
 binding=submission if submission is not None else last_submission()
 if not isinstance(binding,dict) or binding.get('version')!=BINDING_VERSION:require_ack(binding)
 if binding.get('phase')=='acknowledged':return require_ack(binding)
 end=time.monotonic()+timeout
 while True:
  result=acknowledge(binding,_ack_observation(binding))
  if result:
   ctl('const b='+json.dumps(result)+';if(globalThis.rootCaseSubmission?.submissionId!==b.submissionId)throw Error("Another submission replaced pending binding");globalThis.rootCaseSubmission=b;return b;')
   return result
  if time.monotonic()>=end:raise TimeoutError('No ACK for this submitted request; pending binding retained. Do not resubmit.')
  time.sleep(.2)
def terminal_once(*,submission=None,snapshot=None):
 binding=require_ack(submission if submission is not None else last_submission());s=snapshot if snapshot is not None else snap()
 if s.get('threadId')!=binding['threadId']:raise RuntimeError('Browser selected another thread')
 turns=s.get('turns') or [];target=next((x for x in turns if x.get('id')==binding['turnId']),None)
 if target is None:return None
 # Legacy callers use turns[-1]; never hand them a different newest turn.
 if turns[-1].get('id')!=binding['turnId']:raise RuntimeError('Newer native turn superseded this receipt')
 if target.get('status') in TERMINAL and (s.get('execution') or {}).get('status')=='idle':return {**s,'controllerSubmission':binding}
 return None
def terminal(timeout=240,*,submission=None):
 end=time.monotonic()+timeout;binding=await_submission(submission,timeout=max(0,end-time.monotonic()))
 while time.monotonic()<end:
  result=terminal_once(submission=binding)
  if result is not None:return result
  time.sleep(1)
 raise TimeoutError('Bound native turn not terminal; do not resubmit')
def fresh():
 idle();return ctl('await native.locator("#new-chat").click();await native.evaluate(()=>showView("chat"));return {newDraft:true};')
def submit(text,*,ack_timeout=60,expected_turn_id=None,attempt_id=None):
 """One Enter; bind a turn/start ACK, or an explicitly requested steer ACK."""
 seed={'version':BINDING_VERSION,'submissionId':attempt_id or uuid.uuid4().hex,'phase':'pending','expectedMethod':'turn/steer' if expected_turn_id else 'turn/start','expectedTurnId':expected_turn_id}
 binding=ctl('const before=await native.evaluate(()=>{const id=state.thread?.id??null;return {threadId:id,turnIds:state.turns.map(t=>t.id),oldTurnId:state.turns.at(-1)?.id??null,activeTurnId:(typeof executionActiveTurn==="function"?executionActiveTurn(id):state.activeTurns.get(id))??null,executionStatus:state.execution?.status};});'
  'const b={...'+json.dumps(seed)+',wireStart:wire.length,beforeThreadId:before.threadId,beforeTurnId:before.oldTurnId,beforeTurnIds:before.turnIds,submittedAt:new Date().toISOString()};'
  'if(b.expectedMethod==="turn/start"&&(before.activeTurnId||before.executionStatus&&before.executionStatus!=="idle"))throw Error("Existing execution active; no new task submitted");'
  'if(b.expectedMethod==="turn/steer"&&before.activeTurnId!==b.expectedTurnId)throw Error("Expected turn not active; no steer submitted");'
  'globalThis.rootCaseStart=b.wireStart;globalThis.rootCaseSubmission=b;'
  'await native.locator("#prompt").fill('+json.dumps(text)+');await native.locator("#prompt").press("Enter");return b;')
 return await_submission(binding,timeout=ack_timeout)
def messages(s):return '\n'.join(x['item'].get('text','') for x in s.get('items',[]) if x['item']['type']=='agentMessage' and x['item'].get('phase')!='commentary')
def tools(s):return [x['item'] for x in s.get('items',[]) if x['item']['type']=='mcpToolCall']
def save(name,v):(B/(name+'.json')).write_text(json.dumps(v,ensure_ascii=False,indent=2))
def wire(*,submission=None):
 if submission is None:return ctl('return wire.slice(rootCaseStart);')
 binding=require_ack(submission);return ctl('return wire.slice('+str(int(binding['wireStart']))+');')
