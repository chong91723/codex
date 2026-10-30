import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const context=vm.createContext({Map,Set});vm.runInContext(fs.readFileSync(new URL('../public/subagents.js',import.meta.url),'utf8'),context);const plain=value=>JSON.parse(JSON.stringify(value));
test('native spawn completion preserves pending child state rather than claiming task success',()=>{
 const records=plain(context.subagentRecords([{tool:'spawnAgent',status:'completed',model:'deepseek-flash',receiverThreadIds:['child-a'],prompt:'分担分析',agentsStates:{'child-a':{status:'pendingInit',message:null}}}]));
 assert.equal(records[0].status,'pendingInit');assert.equal(records[0].model,'deepseek-flash');assert.equal(context.subagentStatus(records[0].status),'正在初始化');
});
test('partial wait and sent correction keep independent child states and native model identity',()=>{
 const records=plain(context.subagentRecords([
 {tool:'spawnAgent',status:'completed',model:'deepseek-flash',receiverThreadIds:['a'],prompt:'月度任务',agentsStates:{a:{status:'pendingInit'}}},
 {tool:'spawnAgent',status:'completed',model:'deepseek-flash',receiverThreadIds:['b'],prompt:'区域任务',agentsStates:{b:{status:'running'}}},
 {tool:'wait',status:'completed',model:null,receiverThreadIds:['a','b'],agentsStates:{a:{status:'completed',message:'A返回实际引用'}}},
 {tool:'sendInput',status:'completed',receiverThreadIds:['b'],agentsStates:{b:{status:'interrupted'}}}
 ]));assert.equal(records[0].status,'completed');assert.equal(records[1].status,'interrupted');assert.equal(records[1].model,'deepseek-flash');assert.equal(records[0].message,'A返回实际引用');assert.equal(records.length,2);
});
test('unavailable and failed states remain visible rather than using successful RPC status',()=>{
 for(const status of ['errored','notFound','shutdown']){const record=context.subagentRecords([{tool:'closeAgent',status:'completed',receiverThreadIds:['a'],agentsStates:{a:{status}}}])[0];assert.equal(record.status,status);assert.notEqual(context.subagentStatus(status),'已完成');}
});
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');const start=app.indexOf('function warnBeforeLeavingAnalysis('),end=app.indexOf('\nfunction rememberDepartingTurns(',start);assert(start>=0&&end>start);
test('leaving warning follows native active turns or unacknowledged submissions, including another local conversation',()=>{
 const state={activeTurns:new Map(),composers:new Map()},c=vm.createContext({state});vm.runInContext(app.slice(start,end),c);let warnings=0;const event={preventDefault(){warnings++;}};c.warnBeforeLeavingAnalysis(event);assert.equal(warnings,0);state.activeTurns.set('other-thread','native-turn');c.warnBeforeLeavingAnalysis(event);assert.equal(warnings,1);state.activeTurns.clear();state.composers.set('draft',{pending:true});c.warnBeforeLeavingAnalysis(event);assert.equal(warnings,2);state.composers.get('draft').pending=false;c.warnBeforeLeavingAnalysis(event);assert.equal(warnings,2);
});

test('actual child read updates a pending summary until a newer native state event arrives',()=>{
 const native={id:'spawn',tool:'spawnAgent',status:'completed',receiverThreadIds:['read-child'],agentsStates:{'read-child':{status:'pendingInit'}}};
 const original=context.subagentRecords([native])[0];
 context.__key=original.stateEvent;vm.runInContext("subagentReadStates.set('read-child',{status:'running',stateEvent:__key})",context);
 assert.equal(context.subagentRecords([native])[0].status,'running');
 const later={id:'wait-new',tool:'wait',status:'completed',receiverThreadIds:['read-child'],agentsStates:{'read-child':{status:'completed',message:'已返回'}}};
 assert.equal(context.subagentRecords([native,later])[0].status,'completed');
});

test('later native close across parent turns remains authoritative over historical read',()=>{
 const spawn={id:'spawn-close',tool:'spawnAgent',status:'completed',receiverThreadIds:['closed-child'],agentsStates:{'closed-child':{status:'pendingInit'}}};
 const close={id:'closed',tool:'closeAgent',status:'completed',receiverThreadIds:['closed-child'],agentsStates:{'closed-child':{status:'shutdown'}}};
 const record=context.subagentRecords([spawn],[spawn,close])[0];
 context.__closeKey=record.stateEvent;vm.runInContext("subagentReadStates.set('closed-child',{status:'completed',stateEvent:__closeKey})",context);
 assert.equal(context.subagentRecords([spawn],[spawn,close])[0].status,'shutdown');
});
test('departure explanation is retained only for the affected interrupted native turn',()=>{
 const entries=new Map(),state={thread:{id:'a'},activeTurns:new Map([['a','a-turn'],['b','b-turn']])};
 const sessionStorage={getItem:key=>entries.get(key),setItem:(key,val)=>entries.set(key,val)};
 const c=vm.createContext({state,sessionStorage});
 const begin=app.indexOf('function rememberDepartingTurns('),finish=app.indexOf('\nasync function connect(',begin);vm.runInContext(app.slice(begin,finish),c);
 c.rememberDepartingTurns();assert.match(c.departedTurnNotice({id:'a-turn',status:'interrupted'}),/不会自动重发/);
 assert.equal(c.departedTurnNotice({id:'b-turn',status:'interrupted'}),'');assert.equal(c.departedTurnNotice({id:'a-turn',status:'completed'}),'');
 assert.equal(c.departedTurnNotice({id:'other-turn',status:'interrupted'}),'');
});
