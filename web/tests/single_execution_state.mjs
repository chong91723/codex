// These tests exercise browser admission and lifecycle adapters. Native runtime
// integration and real Flash execution are verified separately by acceptance.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,start);return source.slice(a,b);}
const implementation=section('// BEGIN service-owned execution state.','// END service-owned execution state.');
const update=section('function updateSend() {','\n// A turn can finish');
const lifecycle=section('function warnBeforeLeavingAnalysis(','\nasync function connect(');
const connect=section('async function connect() {','\nfunction showConnectionError(');
const submission=section('async function submitPrompt(','\nfunction runtimeModelContext(');
const snap=(owner='A',status='running',turn='TA')=>({ownerThreadId:owner,status,activeTurns:turn?[{threadId:owner,turnId:turn}]:[],cleanupHolds:[],pendingCount:0});
function node(){return {textContent:'',value:'',children:[],disabled:false,title:'',attrs:{},dataset:{},classList:{toggle(){}},setAttribute(name,value){this.attrs[name]=value;},removeAttribute(name){delete this.attrs[name];},replaceChildren(...items){this.children=items;this.textContent=items.map(value=>typeof value==='string'?value:value.text||'').join('');},append(...items){this.children.push(...items);}};}
function fixture(){
  const nodes=new Map(),get=selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);};
  const draft={text:'KEEP_MY_DRAFT',attachments:[],loads:0,pending:false,revision:0};get('#prompt').value=draft.text;get('#model').value='deepseek-flash';get('#effort').value='high';
  const state={status:{nativeProcessLifetime:'web-service'},ready:true,execution:null,executionTurns:new Set(),activeTurns:new Map(),finishedTurns:new Set(),thread:{id:'B'},stopOperations:new Map(),interrupting:new Set(),composers:new Map([['B',draft]]),composerKey:'B',threadSettings:new Map(),selectedCwd:'/tmp/test',navigationGeneration:0,modelDetails:[],attachments:draft.attachments,requests:new Map(),pending:new Map(),threads:[]};
  const opened=[],calls=[],notices=[],storage=new Map();let currentStatus={nativeProcessLifetime:'web-service',nativeRuntime:{execution:snap(null,'idle',null)}};
  const c=vm.createContext({state,$:get,document:{createTextNode:text=>({text})},button:(text,fn)=>({text,fn,dataset:{}}),openThread:id=>opened.push(id),renderThreadList(){},refreshThreadMenu(){},composerState:()=>draft,currentMode:()=> 'default',renderRequests(){},setConnection(){},showConnectionError:text=>notices.push(text),closeCommandMenu(){},saveComposer(){draft.text=get('#prompt').value;return draft;},persistDrafts(){storage.set('draft',draft.text);},toast:text=>notices.push(text),sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},nativeErrorMessage:error=>error.message,rpc:async(method,params)=>{calls.push({method,params});return {turn:{id:'NATIVE_TURN',status:'inProgress'}};},fetchJSON:async()=>currentStatus,setTimeout:()=>1,clearTimeout(){},threadRoute:()=>({id:'B'}),fetch:async()=>({ok:true}),location:{protocol:'http:',host:'test.local'},AbortSignal:{timeout:()=>null},selectedModelProvider:()=> 'deepseek',modelProvider:()=> 'deepseek',isRemovedModel:()=>false,parsePlanPrompt:()=>null,validateComposerCommand(){},imageAttachmentInputs:()=>[],nativeSlashActions:()=>({}),turnCollaborationMode:()=>({mode:'default'}),nativeSlashCommand:async()=>false,ensureThread:async context=>context.thread,runtimeModelContext:()=>undefined,renderNativeMode(){},resizePrompt(){},renderAttachments(){},scrollMessages(){}});
  vm.runInContext(implementation+'\n'+update+'\n'+lifecycle+'\n'+submission,c);
  return {state,draft,nodes,get,c,opened,calls,notices,storage,setStatus:value=>currentStatus=value};
}
for(const status of ['starting','running','waitingForApproval','waitingForInput','reconciling','cleaningUp','cleanupFailed','backgroundRunning','conflicted'])test('other conversation is blocked during '+status,()=>{
  const f=fixture();f.c.receiveExecutionSnapshot(snap('A',status));const admission=f.c.executionSubmissionState();assert.equal(admission.blocked,true);assert.equal(admission.foreign,true);assert.equal(f.get('#send').disabled,true);assert.equal(f.get('#prompt').value,'KEEP_MY_DRAFT');assert.match(f.get('#composer-status').textContent,/同一用户一次只能在一个会话/);const link=f.get('#composer-status').children.find(value=>value.dataset?.executionOwner);assert.equal(link.dataset.executionOwner,'A');link.fn();assert.deepEqual(f.opened,['A']);
});
for(const status of ['starting','reconciling','cleaningUp','cleanupFailed','backgroundRunning','conflicted'])test('owner cannot submit a new message during '+status,async()=>{
  const f=fixture();f.state.thread={id:'A'};f.c.receiveExecutionSnapshot(snap('A',status,status==='starting'?null:'TA'));assert.equal(f.c.executionSubmissionState().blocked,true);await assert.rejects(f.c.submitPrompt(),/输入与附件已保留/);assert.deepEqual(f.calls,[]);assert.equal(f.draft.text,'KEEP_MY_DRAFT');
});
for(const status of ['running','waitingForApproval','waitingForInput'])test('owner can steer native turn during '+status,async()=>{
  const f=fixture();f.state.thread={id:'A'};f.c.receiveExecutionSnapshot(snap('A',status));assert.equal(f.c.executionSubmissionState().blocked,false);await f.c.submitPrompt();const call=f.calls.find(value=>value.method==='turn/steer');assert.equal(call.params.expectedTurnId,'TA');assert.equal(call.params.threadId,'A');assert.equal(f.calls.some(value=>value.method==='turn/start'),false);
});
test('idle execution permits another history or a new conversation and does not cap history count',()=>{
  const f=fixture();f.c.receiveExecutionSnapshot(snap(null,'idle',null));assert.equal(f.c.executionSubmissionState('B').blocked,false);assert.equal(f.c.executionSubmissionState(undefined).blocked,false);assert.equal(f.get('#send').disabled,false);
});
test('fresh execution snapshot releases prior snapshot turns and cannot revive a finished turn',()=>{
  const f=fixture();f.c.receiveExecutionSnapshot(snap());assert.equal(f.state.activeTurns.get('A'),'TA');f.state.finishedTurns.add('TA');f.c.receiveExecutionSnapshot(snap());assert.equal(f.state.activeTurns.has('A'),false);f.c.receiveExecutionSnapshot(snap(null,'idle',null));assert.equal(f.c.executionSubmissionState().blocked,false);
});
test('stale history inProgress cannot expose Stop or steer in a different executing conversation',async()=>{
  const f=fixture();f.c.receiveExecutionSnapshot(snap());f.state.activeTurns.set('B','OLD_HISTORY_TURN');f.c.updateSend();assert.equal(f.get('#send').disabled,true);assert.equal(f.get('#send').classList.running,undefined);assert.equal(f.get('#send').ariaLabel,'等待当前任务结束');await assert.rejects(f.c.submitPrompt(),/输入与附件已保留/);assert.equal(f.calls.length,0);
});
test('another tab winning while tools load aborts submission and preserves draft without native turn request',async()=>{
  const f=fixture();f.c.prepareAnalysisTools=async()=>f.c.receiveExecutionSnapshot(snap());await assert.rejects(f.c.submitPrompt(),/输入与附件已保留/);assert.equal(f.calls.length,0);assert.equal(f.get('#prompt').value,'KEEP_MY_DRAFT');assert.equal(f.draft.pending,false);
});
test('native rejection after initial idle admission preserves text and attachments',async()=>{
  const f=fixture();f.c.rpc=async()=>{throw Error('Native user execution slot already owned');};await assert.rejects(f.c.submitPrompt(),/already owned/);assert.equal(f.get('#prompt').value,'KEEP_MY_DRAFT');assert.equal(f.draft.pending,false);
});
test('service-owned tasks do not warn on navigation; an unresolved send acknowledgement still warns',()=>{
  const f=fixture();f.state.activeTurns.set('A','TA');let prevented=0;const event={preventDefault(){prevented++;}};f.c.warnBeforeLeavingAnalysis(event);assert.equal(prevented,0);f.draft.pending=true;f.c.warnBeforeLeavingAnalysis(event);assert.equal(prevented,1);f.draft.pending=false;f.state.status.nativeProcessLifetime='browser';f.c.warnBeforeLeavingAnalysis(event);assert.equal(prevented,2);
});
test('persistent disconnection interruption notice does not claim browser killed the native process',()=>{
  const f=fixture();f.state.thread={id:'A'};f.state.activeTurns.set('A','TA');f.c.rememberDepartingTurns();const text=f.c.departedTurnNotice({id:'TA',status:'interrupted'});assert.match(text,/后台任务由服务持续管理/);assert.doesNotMatch(text,/进程会随之关闭/);assert.match(text,/不会自动重发/);assert.equal(f.c.departedTurnNotice({id:'TA',status:'completed'}),'');
});
test('cleanup retry uses native thread/turn identities and refreshes actual service state',async()=>{
  const f=fixture(),snapshot=snap('B','cleanupFailed',null);snapshot.cleanupHolds=[{threadId:'B',turnId:'TB',error:'Native check timeout'}];f.c.receiveExecutionSnapshot(snapshot);const retry=f.get('#composer-status').children.find(value=>value.dataset?.executionCleanup);assert(retry);await retry.fn();assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'turn/interrupt');assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].params)),{threadId:'B',turnId:'TB'});assert.equal(f.state.execution.status,'idle');
});
test('native terminal interrupt response does not become fake cleanup success',async()=>{
  const f=fixture(),snapshot=snap('B','cleanupFailed',null);snapshot.cleanupHolds=[{threadId:'B',turnId:'TB',error:'Native check timeout'}];f.c.receiveExecutionSnapshot(snapshot);f.setStatus({nativeProcessLifetime:'web-service',nativeRuntime:{execution:snapshot}});f.c.rpc=async()=>{throw Error('Turn already completed');};await f.c.retryExecutionCleanup();assert.equal(f.state.execution.status,'cleanupFailed');assert.equal(f.get('#send').disabled,true);assert(f.notices.some(value=>/Turn already completed/.test(value)));
});
test('cleanup never guesses a command PID when native turn identity is missing',async()=>{
  const f=fixture(),snapshot=snap('B','cleanupFailed',null);snapshot.cleanupHolds=[{threadId:'B',holdId:"('B', 'TB')"}];f.c.receiveExecutionSnapshot(snapshot);await assert.rejects(f.c.retryExecutionCleanup(),/缺少原生回合标识/);assert.equal(f.calls.length,0);
});
function connectFixture(){
  const f=fixture(),sockets=[];
  class Socket{static OPEN=1;static CLOSED=3;constructor(){this.readyState=1;sockets.push(this);}send(value){(this.sent??=[]).push(value);}close(){this.readyState=3;}}
  Object.assign(f.c,{WebSocket:Socket,addEvent(){},handleEvent(){},renderThreadList(){},invalidateMcpCache(){},updateCommandMenu(){},closeCommandMenu(){}});f.state.ws=null;vm.runInContext(connect,f.c);return {...f,sockets};
}
test('native busy error carries authoritative execution state back into composer without a retry',async()=>{
  const f=connectFixture();await f.c.connect();const socket=f.sockets[0];let rejection;f.state.pending.set(9,{timer:1,reject:error=>rejection=error,resolve(){throw Error('Must reject');}});socket.onmessage({data:JSON.stringify({id:9,error:{code:-32003,message:'Busy',data:{execution:snap()}}})});assert.equal(rejection.message,'Busy');assert.equal(f.state.execution.ownerThreadId,'A');assert.equal(f.get('#send').disabled,true);assert.equal(socket.sent?.length||0,0);
});
test('bridge snapshot is processed before initialization and persistent disconnect never resends',async()=>{
  const f=connectFixture();await f.c.connect();const socket=f.sockets[0];socket.onmessage({data:JSON.stringify({bridge:'execution',execution:snap()})});assert.equal(f.state.execution.ownerThreadId,'A');socket.onclose();assert(f.notices.some(value=>/仅页面断连不会停止后台任务/.test(value)));assert.equal(socket.sent?.length||0,0);assert.equal(f.get('#prompt').value,'KEEP_MY_DRAFT');assert.equal(f.state.ready,false);
});

test('completed owner with active native child cannot start a second root turn',async()=>{
  const f=fixture(),snapshot=snap('B','running',null);snapshot.activeTurns=[{threadId:'B-child',turnId:'CHILD_TURN'}];f.c.receiveExecutionSnapshot(snapshot);assert.equal(f.c.executionActiveTurn('B'),undefined);assert.equal(f.c.executionSubmissionState().blocked,true);await assert.rejects(f.c.submitPrompt(),/任务及子任务/);assert.equal(f.calls.length,0);
});
test('replayed native terminal turn does not remain steerable while service reconciles',()=>{
  const f=fixture();f.state.thread={id:'A'};f.state.finishedTurns.add('TA');f.c.receiveExecutionSnapshot(snap());assert.equal(f.c.executionActiveTurn(),undefined);assert.equal(f.c.executionSubmissionState().blocked,true);
});
test('repeated cleanup click while native request is pending submits only once',async()=>{
  const f=fixture(),snapshot=snap('B','cleanupFailed',null);snapshot.cleanupHolds=[{threadId:'B',turnId:'TB'}];f.c.receiveExecutionSnapshot(snapshot);let finish;const pending=new Promise(resolve=>finish=resolve);f.c.rpc=async(method,params)=>{f.calls.push({method,params});await pending;return {};};const first=f.c.retryExecutionCleanup();await f.c.retryExecutionCleanup();assert.equal(f.calls.length,1);assert.equal(f.state.executionCleanupPending,true);finish();await first;assert.equal(f.state.executionCleanupPending,false);
});
function historyFixture({race=false}={}){
 const f=fixture();
 Object.assign(f.state,{knownThreads:new Map(),archived:false,threads:[],nativeModes:new Map(),responseSequence:new WeakMap(),items:new Map(),live:new Map(),turns:[],deferredResumes:new Set()});
 for(const selector of ['#view-chat','#messages','#welcome','#page-title','#jump-latest','#prompt'])Object.assign(f.get(selector).classList,{add(){},remove(){}});
 const thread={id:'B',modelProvider:'deepseek',cwd:'/tmp/test',turns:[]};
 const config={thread,model:'deepseek-flash',modelProvider:'deepseek',collaborationMode:{mode:'plan'},approvalPolicy:'on-request',approvalsReviewer:'user',sandbox:{type:'workspaceWrite'},reasoningEffort:'high'};
 let nativeRace=race;
 Object.assign(f.c,{
  closeThreadMenu(){},rememberScroll(){},setThreadRoute(){},showView(){},el:(tag,cls,text)=>({tag,text,append(){},dataset:{},setAttribute(){}}),
  restoreScroll(){},finishHistoryRender(){},renderHistoryMore(){},restoreExecutionPlans(){},
  threadRuntimeConfig:()=>({}),adoptThread:(value,archived,busy)=>{f.state.thread=value;f.state.threadArchived=archived;f.state.threadBusy=busy;f.get('#prompt').disabled=archived||busy;},
  permissionsFromSnapshot:()=>f.state.permissionConfirmed=true,
  currentMode:()=>f.state.threadSettings.get(f.state.thread?.id)?.collaborationMode?.mode||'default',
  turnCollaborationMode:mode=>({mode}),
  rpc:async(method,params)=>{
   f.calls.push({method,params});
   if(method==='thread/read')return {thread};
   if(method==='thread/resume'){
    if(nativeRace){nativeRace=false;throw Object.assign(Error('Native execution eligibility held'),{nativeError:{data:{execution:snap('A')}}});}
    return config;
   }
   if(method==='thread/turns/list')return {data:[],nextCursor:null};
   if(method==='turn/start')return {turn:{id:'NATIVE_NEW_B',status:'inProgress'}};
   throw Error('Unexpected RPC '+method);
  },
 });
 vm.runInContext(section('function renderThreadLoading(','function renderInitialConversation(')+'\n'+section('function isMemoryMaintenanceThread(','function rememberMemoryMaintenance(')+'\n'+section('async function hydrateThread(','\nasync function ensureThread(')+'\n'+section('async function openThread(','\nfunction finishHistoryRender('),f.c);
 return f;
}
test('opening another conversation during a native task reads history without native resume and keeps its draft editable',async()=>{
 const f=historyFixture();f.c.receiveExecutionSnapshot(snap('A'));await f.c.openThread('B');
 assert.deepEqual(f.calls.map(value=>value.method),['thread/read','thread/turns/list']);assert.equal(f.state.thread.id,'B');assert.equal(f.state.restoreError,false);assert.equal(f.state.deferredResumes.has('B'),true);assert.equal(f.get('#prompt').disabled,false);assert.equal(f.get('#prompt').value,'KEEP_MY_DRAFT');assert.equal(f.get('#send').disabled,true);
});
test('native resume race rejection falls back to history instead of falsely showing restore failure',async()=>{
 const f=historyFixture({race:true});await f.c.openThread('B');
 assert.deepEqual(f.calls.map(value=>value.method),['thread/read','thread/resume','thread/turns/list']);assert.equal(f.state.thread.id,'B');assert.equal(f.state.restoreError,false);assert.equal(f.state.execution.ownerThreadId,'A');assert.equal(f.state.deferredResumes.has('B'),true);assert.equal(f.get('#prompt').disabled,false);
});
test('deferred conversation native mode and permissions are restored before later submission',async()=>{
 const f=historyFixture();f.c.receiveExecutionSnapshot(snap('A'));await f.c.openThread('B');f.c.permissionSubmissionBlocked=()=>!f.state.permissionConfirmed;
 f.c.receiveExecutionSnapshot(snap(null,'idle',null));assert.match(f.get('#composer-status').textContent,/发送前将恢复/);
 await f.c.submitPrompt();
 const methods=f.calls.map(value=>value.method),resume=methods.indexOf('thread/resume'),start=methods.indexOf('turn/start');assert(resume>=0&&start>resume);assert.equal(f.state.deferredResumes.has('B'),false);assert.equal(f.state.permissionConfirmed,true);const request=f.calls[start];assert.equal(request.params.collaborationMode.mode,'plan');assert.equal(request.params.threadId,'B');assert.equal(request.params.input[0].text,'KEEP_MY_DRAFT');
});
test('losing the slot again during deferred resume never submits and preserves draft',async()=>{
 const f=historyFixture({race:true});f.state.deferredResumes.add('B');
 await assert.rejects(f.c.submitPrompt(),/尚未恢复为可执行状态/);assert.equal(f.calls.some(value=>value.method==='turn/start'),false);assert.equal(f.get('#prompt').value,'KEEP_MY_DRAFT');assert.equal(f.draft.pending,false);assert.equal(f.state.deferredResumes.has('B'),true);
});
test('successful ordinary resume removes an obsolete deferred marker',async()=>{
 const f=historyFixture();f.state.deferredResumes.add('B');await f.c.openThread('B');assert.equal(f.state.deferredResumes.has('B'),false);assert.equal(f.state.threadSettings.get('B').collaborationMode.mode,'plan');assert.equal(f.state.permissionConfirmed,true);
});
for(const status of ['acknowledgementUnknown','observationFailed'])test('uncertain '+status+' blocks same-owner steering, keeps known-turn Stop, and displays native diagnostic',async()=>{
 const f=fixture();f.state.thread={id:'A'};const snapshot=snap('A',status);snapshot.pendingNativeAcks=[{threadId:'A',method:'turn/steer',requestId:7,error:'NATIVE_ACK_DRAIN_FAILED'}];if(status==='observationFailed')snapshot.observerError='NATIVE_OBSERVER_FAILED';f.c.receiveExecutionSnapshot(snapshot);
 assert.equal(f.c.executionSubmissionState().blocked,true);assert.match(f.get('#composer-status').textContent,/NATIVE_ACK_DRAIN_FAILED/);if(status==='observationFailed')assert.match(f.get('#composer-status').textContent,/NATIVE_OBSERVER_FAILED/);
 assert.equal(f.get('#send').disabled,false);assert.equal(f.get('#send').ariaLabel,'中断当前任务');await assert.rejects(f.c.submitPrompt(),/输入.*保留/);assert.equal(f.calls.length,0);assert.equal(f.get('#prompt').value,'KEEP_MY_DRAFT');
});
for(const status of ['acknowledgementUnknown','observationFailed'])test('uncertain '+status+' without known native turn cannot open a second execution',async()=>{
 const f=fixture(),snapshot=snap(status==='observationFailed'?null:'B',status,null);snapshot.pendingNativeAcks=[{error:'UNCONFIRMED_NATIVE_REPLY'}];snapshot.observerError=status==='observationFailed'?'OBSERVER_CONNECTION_CLOSED':null;f.c.receiveExecutionSnapshot(snapshot);
 assert.equal(f.c.executionSubmissionState().blocked,true);assert.equal(f.get('#send').disabled,true);await assert.rejects(f.c.submitPrompt(),/输入.*保留/);assert.equal(f.calls.length,0);
});
test('an unrecognized execution state stays stoppable with a known turn but cannot steer',async()=>{
 const f=fixture();f.state.thread={id:'A'};f.c.receiveExecutionSnapshot(snap('A','futureNativeState'));assert.equal(f.c.executionSubmissionState().blocked,true);assert.equal(f.get('#send').ariaLabel,'中断当前任务');assert.equal(f.get('#send').disabled,false);await assert.rejects(f.c.submitPrompt(),/状态尚待确认/);assert.equal(f.calls.length,0);
});

// History/approval recovery must not depend on loading personal memory. Actual
// native task submission still performs that fresh preflight and fails closed.
test('archived history stays readable when analysis memory preparation is unavailable',async()=>{
 const f=historyFixture();let checks=0;
 f.c.prepareAnalysisMemory=async()=>{checks++;throw Error('MEMORY_CONTEXT_UNAVAILABLE');};
 await f.c.openThread('B',{archived:true});
 assert.equal(checks,0);assert.equal(f.state.restoreError,false);assert.equal(f.state.thread.id,'B');
 assert.deepEqual(f.calls.map(call=>call.method),['thread/read','thread/turns/list']);
 assert.equal(f.state.threadArchived,true);assert.equal(f.get('#prompt').value,'KEEP_MY_DRAFT');
});
test('own pending approval can restore through native resume without memory prefetch',async()=>{
 const f=historyFixture();let checks=0;
 f.c.prepareAnalysisMemory=async()=>{checks++;throw Error('MEMORY_CONTEXT_UNAVAILABLE');};
 f.c.receiveExecutionSnapshot(snap('B','waitingForApproval','TB'));
 await f.c.openThread('B');
 assert.equal(checks,0);assert.equal(f.state.restoreError,false);assert.equal(f.state.thread.id,'B');
 assert.deepEqual(f.calls.map(call=>call.method),['thread/read','thread/resume','thread/turns/list']);
 assert.equal(f.state.execution.status,'waitingForApproval');assert.equal(f.c.executionActiveTurn('B'),'TB');
 assert.equal(f.calls.some(call=>['turn/start','turn/steer'].includes(call.method)),false);
});
test('submitting a real task waits for current memory preparation before native execution',async()=>{
 const f=fixture();let release,checks=0;
 const pendingMemory=new Promise(resolve=>release=resolve);
 f.c.prepareAnalysisMemory=async()=>{checks++;await pendingMemory;};
 const submission=f.c.submitPrompt();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(checks,1);assert.equal(f.draft.pending,true);assert.equal(f.calls.length,0);
 assert.equal(f.get('#prompt').value,'KEEP_MY_DRAFT');
 release();await submission;
 assert.equal(f.calls.filter(call=>call.method==='turn/start').length,1);assert.equal(f.draft.pending,false);
});
test('failed memory preparation blocks native task submission and retains its draft',async()=>{
 const f=fixture();let checks=0;
 f.c.prepareAnalysisMemory=async()=>{checks++;throw Error('CURRENT_MEMORY_PREPARATION_FAILED');};
 await assert.rejects(f.c.submitPrompt(),/CURRENT_MEMORY_PREPARATION_FAILED/);
 assert.equal(checks,1);assert.equal(f.calls.length,0);assert.equal(f.draft.pending,false);
 assert.equal(f.get('#prompt').value,'KEEP_MY_DRAFT');assert.equal(f.draft.text,'KEEP_MY_DRAFT');
});
