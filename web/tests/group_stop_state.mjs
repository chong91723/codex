// Deterministic cancellation adapter tests; actual Flash/native child execution
// and OS process exit are separate acceptance evidence.
import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const source=fs.readFileSync(process.env.CODEX_APP_SOURCE||new URL('../public/app.js',import.meta.url),'utf8');
const section=(begin,end)=>source.slice(source.indexOf(begin),source.indexOf(end,source.indexOf(begin)));
const implementation=section('// BEGIN service-owned execution state.','// END service-owned execution state.');
const update=section('function updateSend() {','\n// A turn can finish');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const active=(turns=[{threadId:'child',turnId:'child-turn'}],extra={})=>({ownerThreadId:'root',blockedRootThreadIds:['root'],status:'cleaningUp',activeTurns:turns,cleanupHolds:[],observerReady:true,...extra});
const idle=extra=>({ownerThreadId:null,blockedRootThreadIds:[],status:'idle',activeTurns:[],cleanupHolds:[],observerReady:true,...extra});
function fixture(){
 const nodes=new Map();function node(){return {textContent:'',value:'KEEP_DRAFT',children:[],disabled:false,dataset:{},classList:{toggle(){}},setAttribute(k,v){this[k]=v;},removeAttribute(){},replaceChildren(...v){this.children=v;this.textContent=v.map(x=>x?.text||'').join('');},append(...v){this.children.push(...v);}};}
 const get=key=>{if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);};
 const state={status:{nativeProcessLifetime:'web-service'},thread:{id:'root'},ready:true,ws:new EventTarget(),execution:null,activeTurns:new Map(),finishedTurns:new Set(),executionTurns:new Set(),stopOperations:new Map(),interrupting:new Set(),requests:new Map(),threadSettings:new Map(),turns:[],items:new Map()};
 const calls=[],draft={text:'KEEP_DRAFT',attachments:[],pending:false};let rejectRpc=false;
 const c=vm.createContext({state,$:get,document:{createTextNode:text=>({text})},button:(text,fn)=>({text,fn,dataset:{}}),renderThreadList(){},refreshThreadMenu(){},composerState:()=>draft,currentMode:()=> 'default',nativeErrorMessage:e=>e.message,renderStopResult(){},openThread(){},fetchJSON:async()=>({}),setTimeout,clearTimeout,rpc:async(method,params)=>{calls.push({method,params:JSON.parse(JSON.stringify(params))});if(rejectRpc)throw Error('native child interrupt failed');return {};}});
 vm.runInContext(implementation+'\n'+update,c);return {state,c,calls,draft,get,rejectRpc:()=>rejectRpc=true};
}
test('completed parent still has a real Stop button while its native child runs',()=>{
 const f=fixture();f.c.receiveExecutionSnapshot(active());assert.equal(f.get('#send').disabled,false);assert.equal(f.get('#send').ariaLabel,'中断当前任务及子任务');assert.equal(f.get('#prompt').value,'KEEP_DRAFT');assert.equal(f.c.executionSubmissionState().blocked,true);
});
test('child native ACK is insufficient: wait for authoritative terminal and cleanup release',async()=>{
 const f=fixture();f.c.receiveExecutionSnapshot(active());const pending=f.c.interruptExecutionGroup('root');await tick();assert.deepEqual(f.calls,[{method:'turn/interrupt',params:{threadId:'child',turnId:'child-turn'}}]);assert.equal(f.state.executionStopGroup.status,'pending');
 f.c.receiveExecutionSnapshot(active([],{cleanupHolds:[{threadId:'root',turnId:'root-turn'}]}));await tick();assert.equal(f.state.executionStopGroup.status,'pending');f.c.receiveExecutionSnapshot(idle());await pending;assert.equal(f.state.executionStopGroup.status,'completed');assert.equal(f.draft.text,'KEEP_DRAFT');assert(f.calls.every(call=>call.method==='turn/interrupt'));
});
test('stop root and descendants once, including a child appearing during cancellation',async()=>{
 const f=fixture(),first=[{threadId:'root',turnId:'root-turn'},{threadId:'child',turnId:'child-turn'}];f.c.receiveExecutionSnapshot(active(first,{status:'running'}));const pending=f.c.interruptExecutionGroup('root');await tick();
 const next=[...first,{threadId:'late-child',turnId:'late-turn'}];f.c.receiveExecutionSnapshot(active(next));f.c.receiveExecutionSnapshot(active(next));await tick();assert.equal(f.calls.length,3);assert.deepEqual(new Set(f.calls.map(call=>call.params.threadId)),new Set(['root','child','late-child']));f.c.receiveExecutionSnapshot(idle());await pending;
});
test('foreign or conflicting roots never expose a group stop for the selected conversation',()=>{
 const f=fixture();f.state.thread.id='foreign';f.c.receiveExecutionSnapshot(active());assert.equal(f.c.executionStopTargets().length,0);assert.equal(f.get('#send').disabled,true);f.state.thread.id='root';f.c.receiveExecutionSnapshot(active(undefined,{blockedRootThreadIds:['root','another'],status:'conflicted'}));assert.equal(f.c.executionStopTargets().length,0);assert.deepEqual(f.calls,[]);
});
test('native interrupt failure remains diagnostic and does not release execution or replay',async()=>{
 const f=fixture();f.rejectRpc();f.c.receiveExecutionSnapshot(active());await assert.rejects(f.c.interruptExecutionGroup('root'),/native child interrupt failed/);assert.equal(f.state.executionStopGroup.status,'failed');assert.equal(f.state.execution.ownerThreadId,'root');f.c.receiveExecutionSnapshot(active());await tick();assert.equal(f.calls.length,1);assert.equal(f.draft.text,'KEEP_DRAFT');
});
test('connection loss fails the current stop without sending it through the replacement connection',async()=>{
 const f=fixture();f.c.receiveExecutionSnapshot(active());const pending=f.c.interruptExecutionGroup('root');await tick();f.state.ws.dispatchEvent(new Event('close'));await assert.rejects(pending,/连接已断开/);f.state.ws=new EventTarget();f.c.receiveExecutionSnapshot(active());await tick();assert.equal(f.calls.length,1);assert.equal(f.state.executionStopGroup.status,'failed');
});
test('an unready observer cannot prove a stop complete even when no owner is reported',async()=>{
 const f=fixture();f.c.receiveExecutionSnapshot(active());const pending=f.c.interruptExecutionGroup('root');await tick();f.c.receiveExecutionSnapshot(idle({observerReady:false}));assert.equal(f.state.executionStopGroup.status,'pending');f.c.receiveExecutionSnapshot(idle());await pending;assert.equal(f.state.executionStopGroup.status,'completed');
});
