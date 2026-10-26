// Exercise the actual hydration replay boundary with deterministic protocol events.
// No model request or generated conversation result is involved.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const begin=source.indexOf('async function hydrateThread('),end=source.indexOf('\nasync function ensureThread(',begin);
assert(begin>=0&&end>begin,'Exercise the real hydrateThread implementation');
const implementation=source.slice(begin,end);
function fixture(events=[],turns=[],options={}){
  const thread={id:'thread-A',name:'Original thread',turns:[]};
  const state={thread,navigationGeneration:7,eventSequence:40,responseSequence:new WeakMap(),turns:[{id:'previous'}],items:new Map(),activeTurns:new Map(),finishedTurns:new Set(),hydration:{threadId:thread.id,generation:7,events}};
  const dom=new Map(),replayed=[],outcomes=[],upserts=[];let pageRequest;
  const node=selector=>{if(!dom.has(selector))dom.set(selector,{hidden:false,textContent:'',replaceCount:0,replaceChildren(){this.replaceCount++;},classList:{toggle(){}}});return dom.get(selector);};
  const upsertItem=(item,done,turnId)=>{state.items.set(item.id,{item,done,turnId});upserts.push(item.id);};
  const handleEvent=event=>{
    replayed.push(event);
    const p=event.params;
    if(event.method==='thread/tokenUsage/updated')state.usage=p.tokenUsage;
    if(event.method==='thread/settings/updated')state.settings=p.threadSettings;
    if(event.method==='item/completed')upsertItem(p.item,true,p.turnId);
    if(event.method==='turn/completed'){
      const index=state.turns.findIndex(turn=>turn.id===p.turn.id);
      if(index<0)state.turns.push(p.turn);else state.turns[index]=p.turn;
    }
  };
  const paged=async(method,params,onPage)=>{
    pageRequest={method,params};
    if(options.beforePages)await options.beforePages(state);
    for(const sequence of options.pageSequences||[20]){const page={};state.responseSequence.set(page,sequence);onPage(page);}
    return turns;
  };
  const hydrate=vm.runInNewContext(implementation+'\nhydrateThread;',{
    state,$:node,paged,upsertItem,renderTurnOutcome:turn=>outcomes.push(turn.id),handleEvent,
    updateSend(){},restoreExecutionPlans(){},renderNativeMode(){},
  });
  return {state,thread,dom,replayed,outcomes,upserts,hydrate,request:()=>pageRequest};
}
const event=(method,sequence,params)=>({method,sequence,params:{threadId:'thread-A',...params}});
test('usage before the final turns page survives resume without embedded turns',async()=>{
  const usage={total:{inputTokens:640,cachedInputTokens:128,outputTokens:32},last:{inputTokens:640,cachedInputTokens:128,outputTokens:32},modelContextWindow:1000};
  const early=event('thread/tokenUsage/updated',8,{turnId:'turn-A',tokenUsage:usage});
  const f=fixture([early],[],{pageSequences:[12,30]});
  await f.hydrate(f.thread,7,10);
  assert.equal(f.request().method,'thread/turns/list');
  assert.equal(f.request().params.itemsView,'full');
  assert.deepEqual(f.replayed,[early]);
  assert.equal(f.state.usage,usage,'Turn snapshots have no usage field to replace this notification');
});
test('snapshot-covered deltas are not replayed; full terminal items and turns remain idempotent',async()=>{
  const item={id:'message-A',type:'agentMessage',text:'stream already in snapshot'};
  const turn={id:'turn-A',status:'completed',items:[item]};
  const oldDelta=event('item/agentMessage/delta',15,{turnId:turn.id,itemId:item.id,delta:'stream already in snapshot'});
  const terminal=event('item/completed',16,{turnId:turn.id,item});
  const complete=event('turn/completed',17,{turn});
  const newDelta=event('item/agentMessage/delta',31,{turnId:'turn-B',itemId:'message-B',delta:'after snapshot'});
  const f=fixture([oldDelta,terminal,complete,newDelta],[turn],{pageSequences:[20,30]});
  await f.hydrate(f.thread,7,10);
  assert.deepEqual(f.replayed,[terminal,complete,newDelta]);
  assert.equal(f.state.items.size,1,'A terminal replay must update the existing item identity');
  assert.equal(f.state.items.get(item.id).item.text,item.text);
  assert.equal(f.state.turns.length,1,'A completed-turn replay must retain one turn identity');
  assert.equal(f.state.turns[0].id,turn.id);
  assert.deepEqual(f.upserts,[item.id,item.id]);
});
test('settings use the resume snapshot boundary rather than the later turn-page boundary',async()=>{
  const beforeResume=event('thread/settings/updated',9,{threadSettings:{model:'deepseek-flash',effort:'low'}});
  const afterResume=event('thread/settings/updated',15,{threadSettings:{model:'deepseek-flash',effort:'high'}});
  const f=fixture([beforeResume,afterResume],[],{pageSequences:[20,30]});
  f.state.settings={model:'deepseek-flash',effort:'max'};
  await f.hydrate(f.thread,7,10);
  assert.deepEqual(f.replayed,[afterResume]);
  assert.equal(f.state.settings.effort,'high');
});
test('navigation generation change cancels an old hydration even when the same thread is selected again',async()=>{
  let resolvePages;
  const gate=new Promise(resolve=>{resolvePages=resolve;});
  const early=event('thread/tokenUsage/updated',8,{tokenUsage:{total:{inputTokens:1,cachedInputTokens:0,outputTokens:1}}});
  const f=fixture([early],[{id:'old-turn',status:'completed',items:[]}],{beforePages:()=>gate});
  const pending=f.hydrate(f.thread,7,10);
  f.state.navigationGeneration=8;
  const newHydration={threadId:f.thread.id,generation:8,events:[]};f.state.hydration=newHydration;
  f.state.turns=[{id:'new-navigation'}];
  resolvePages();await pending;
  assert.equal(f.state.turns[0].id,'new-navigation');
  assert.equal(f.state.hydration,newHydration,'Old completion must not clear the replacement hydration');
  assert.equal(f.dom.size,0,'Stale hydration must not touch visible DOM');
  assert.deepEqual(f.replayed,[]);
});
