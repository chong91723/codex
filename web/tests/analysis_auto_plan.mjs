// Actual adapter functions with controlled native transport/event/clock fixtures.
// No browser, model or database is called; a supplied proposal is model-decision
// test input and is never counted as a real DeepSeek decision or plan execution.
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../public/analysis-workspace.js',import.meta.url),'utf8');
const proposal='<proposed_plan>确认销售口径，再查询真实数据并生成图表。</proposed_plan>';
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
class FixtureConnection{
  constructor(){this.handlers=new Map();}
  addEventListener(name,callback){if(!this.handlers.has(name))this.handlers.set(name,new Set());this.handlers.get(name).add(callback);}
  removeEventListener(name,callback){this.handlers.get(name)?.delete(callback);}
  close(){for(const callback of [...(this.handlers.get('close')||[])])callback();}
}
function fixture(){
  const calls=[],queued=[],timers=new Map(),changes=[],gate=deferred(),connection=new FixtureConnection();let timerId=0;
  const state={ready:true,ws:connection,thread:{id:'A'},activeTurns:new Map(),threadSettings:new Map([['A',{model:'deepseek-flash',modelProvider:'deepseek'}]]),runtimeDefaults:{model:'deepseek-flash'},items:new Map(),turns:[]};
  const context={state,queueMicrotask:callback=>queued.push(callback),setTimeout:(callback,delay)=>{const id=++timerId;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),rpc:(method,params)=>{calls.push({method,params});assert.equal(method,'thread/settings/update','The adapter must never start/steer a model turn');return gate.promise;},renderNativeMode:()=>changes.push('mode'),updateSend:()=>changes.push('send'),nativeErrorMessage:error=>error.message,$$:()=>[],el:()=>({}),renderProposedPlan:()=>({dataset:{},append(){}})};
  const api=vm.runInNewContext(source+'\n({extractAnalysisProposal,recordAnalysisSubmission,analysisUIEvent,maybeEnterAnalysisPlan,analysisModeChangeBlocked,renderAutomaticAnalysisPlan,owned:analysisOwnedTurns,live:analysisLiveTurns,operations:analysisModeChanges});',context);
  const f={state,calls,gate,connection,timers,changes,...api,
    register:(id='T',mode='default',threadId='A')=>api.recordAnalysisSubmission(threadId,{id,status:'inProgress'},{mode,model:'deepseek-flash',effort:'low'}),
    item:(text=proposal,{id='T',threadId='A',phase='final_answer',itemId='P'}={})=>api.analysisUIEvent({method:'item/completed',params:{threadId,turnId:id,item:{id:itemId,type:'agentMessage',phase,text}}}),
    complete:(status='completed',{id='T',threadId='A'}={})=>api.analysisUIEvent({method:'turn/completed',params:{threadId,turn:{id,status}}}),
    confirm:(threadId='A')=>api.analysisUIEvent({method:'thread/settings/updated',params:{threadId,threadSettings:{collaborationMode:{mode:'plan'}}}}),
    async flush(){while(queued.length)queued.shift()();for(let n=0;n<16;n++)await Promise.resolve();},
    async begin(){f.register();f.item();f.complete();await f.flush();},
    async finish(){gate.resolve({});f.confirm();await f.flush();},
    async timeout(){assert.equal(timers.size,1);const entry=[...timers.values()][0];assert.equal(entry.delay,15000);entry.callback();await f.flush();},
  };return f;
}
const operation=(f,threadId='A')=>f.operations.get(threadId);

test('only one complete nonempty proposal block is an autonomous mode decision',()=>{
  const f=fixture();assert.equal(f.extractAnalysisProposal(' \n'+proposal+'\n '),'确认销售口径，再查询真实数据并生成图表。');
  for(const value of [null,'','plain plan','<proposed_plan></proposed_plan>','before '+proposal,proposal+' after','```xml\n'+proposal+'\n```','<proposed_plan>A<proposed_plan>B</proposed_plan></proposed_plan>','<proposed_plan>A</proposed_plan> extra </proposed_plan>','<proposed_plan>one</proposed_plan><proposed_plan>two</proposed_plan>'])assert.equal(f.extractAnalysisProposal(value),null,String(value));assert.equal(f.calls.length,0);
});
test('rendering a historical model proposal does not issue settings or task requests',()=>{
  const f=fixture(),card=f.renderAutomaticAnalysisPlan({id:'historical-item',text:proposal},true);assert(card);assert.equal(f.calls.length,0);assert.equal(f.owned.size,0);assert.equal(f.operations.size,0);
});
test('a live proposal without an owned web submission cannot switch modes',async()=>{
  const f=fixture();f.item();f.complete();await f.flush();assert.equal(f.calls.length,0);assert.equal(f.operations.size,0);
});
test('native Plan submissions are not registered for default-to-Plan adaptation',async()=>{
  const f=fixture();f.register('T','plan');f.item();f.complete();await f.flush();assert.equal(f.owned.size,0);assert.equal(f.calls.length,0);
});
for(const status of ['failed','interrupted'])test(status+' default turn does not enter native Plan',async()=>{
  const f=fixture();f.register();f.item();f.complete(status);await f.flush();assert.equal(f.calls.length,0);assert.equal(f.operations.size,0);
});
test('commentary and ordinary final answers are not mode decisions',async()=>{
  for(const [text,phase]of [[proposal,'commentary'],['这是普通结论','final_answer']]){const f=fixture();f.register();f.item(text,{phase});f.complete();await f.flush();assert.equal(f.calls.length,0);assert.equal(f.operations.size,0);}
});
test('a completed proposal waits for turn completion instead of changing an active turn',async()=>{
  const f=fixture();f.register();f.state.activeTurns.set('A','T');f.item();await f.flush();assert.equal(f.calls.length,0);f.state.activeTurns.delete('A');f.complete();await f.flush();assert.equal(f.calls.length,1);await f.finish();assert.equal(operation(f).status,'applied');
});
test('ACK alone cannot claim native Plan; only a matching real-event fixture confirms it',async()=>{
  const f=fixture();await f.begin();assert.equal(f.calls.length,1);assert.equal(f.calls[0].params.threadId,'A');assert.equal(f.calls[0].params.collaborationMode.mode,'plan');assert.equal(f.calls[0].params.collaborationMode.settings.model,'deepseek-flash');assert.equal(f.analysisModeChangeBlocked('A'),true);f.gate.resolve({});await f.flush();assert.equal(operation(f).status,'pending');f.confirm('B');await f.flush();assert.equal(operation(f).status,'pending');f.confirm();await f.flush();assert.equal(operation(f).status,'applied');assert.equal(f.analysisModeChangeBlocked('A'),false);assert.equal(f.timers.size,0);
});
test('matching settings notification before delayed ACK resolves without waiting or later reversal',async()=>{
  const f=fixture();await f.begin();f.confirm();await f.flush();assert.equal(operation(f).status,'applied');assert.equal(f.timers.size,0);f.gate.reject(new Error('OWN_LATE_ACK_REJECTION'));await f.flush();assert.equal(operation(f).status,'applied');assert.equal(f.calls.length,1);
});
test('duplicated item and turn completion events make only one native settings request',async()=>{
  const f=fixture();await f.begin();f.item();f.complete();f.complete();await f.flush();assert.equal(f.calls.length,1);await f.finish();f.item();f.complete();await f.flush();assert.equal(f.calls.length,1);
});
test('real completion events arriving before submission ACK are associated after ownership registration',async()=>{
  const f=fixture();f.item();f.complete();await f.flush();assert.equal(f.calls.length,0);f.register();await f.flush();assert.equal(f.calls.length,1);await f.finish();assert.equal(operation(f).status,'applied');
});
test('native settings rejection preserves the proposal and never retries or starts a model task',async()=>{
  const f=fixture();await f.begin();f.gate.reject(new Error('OWN_NATIVE_REJECTION'));await f.flush();assert.equal(operation(f).status,'failed');assert.match(operation(f).error,/OWN_NATIVE_REJECTION/);assert.equal(operation(f).proposal.text,'确认销售口径，再查询真实数据并生成图表。');assert.equal(f.analysisModeChangeBlocked('A'),false);f.complete();await f.flush();assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);
});
test('connection close fails pending adaptation; a late ACK cannot display success',async()=>{
  const f=fixture();await f.begin();f.connection.close();await f.flush();assert.equal(operation(f).status,'failed');assert.match(operation(f).error,/连接已断开/);f.gate.resolve({});f.confirm();await f.flush();assert.equal(operation(f).status,'failed');assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);
});
test('confirmation deadline preserves a diagnostic without automatic resend or fake success',async()=>{
  const f=fixture();await f.begin();f.gate.resolve({});await f.flush();await f.timeout();assert.equal(operation(f).status,'failed');assert.match(operation(f).error,/尚未收到原生计划模式确认/);f.confirm();await f.flush();assert.equal(operation(f).status,'failed');assert.equal(f.calls.length,1);
});
test('an owner connection replaced before adaptation makes no settings request',async()=>{
  const f=fixture();f.register();f.state.ws=new FixtureConnection();f.item();f.complete();await f.flush();assert.equal(f.calls.length,0);assert.equal(operation(f).status,'failed');assert.match(operation(f).error,/连接已改变/);
});
test('a disconnected runtime cannot apply a queued proposal',async()=>{
  const f=fixture();f.register();f.state.ready=false;f.item();f.complete();await f.flush();assert.equal(f.calls.length,0);assert.equal(operation(f).status,'failed');
});
test('a newer active task prevents retroactively changing that task to Plan',async()=>{
  const f=fixture();f.register();f.item();f.state.activeTurns.set('A','NEW_TASK');f.complete();await f.flush();assert.equal(f.calls.length,0);assert.equal(operation(f).status,'failed');assert.match(operation(f).error,/已有新任务运行/);assert.equal(f.state.activeTurns.get('A'),'NEW_TASK');
});
test('switching visible analysis B keeps background A adaptation and pending ownership on A only',async()=>{
  const f=fixture();f.register();f.state.thread={id:'B'};f.item();f.complete();await f.flush();assert.equal(f.calls.length,1);assert.equal(f.calls[0].params.threadId,'A');assert.equal(f.analysisModeChangeBlocked('A'),true);assert.equal(f.analysisModeChangeBlocked('B'),false);f.gate.resolve({});f.confirm('B');await f.flush();assert.equal(operation(f).status,'pending');f.confirm('A');await f.flush();assert.equal(operation(f).status,'applied');assert.equal(f.state.thread.id,'B');assert.equal(f.operations.has('B'),false);
});
test('events from another thread cannot associate their proposal with the owned task',async()=>{
  const f=fixture();f.register();f.item(proposal,{threadId:'B'});f.complete('completed',{threadId:'B'});await f.flush();assert.equal(f.calls.length,0);assert.equal(f.operations.size,0);
});
test('the last final answer must itself be a proposal; a superseding ordinary answer cancels adaptation',async()=>{
  const f=fixture();f.register();f.item();f.item('最终只回答简单问题，不再提交分析方案',{itemId:'FINAL_ANSWER'});f.complete();await f.flush();assert.equal(f.calls.length,0);assert.equal(f.operations.size,0);
});
