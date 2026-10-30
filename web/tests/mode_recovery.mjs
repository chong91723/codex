// Actual navigation/hydration implementation; deterministic native transport replies.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const begin=source.indexOf('async function openThread('),end=source.indexOf('\nasync function ensureThread(',begin);assert(begin>=0&&end>begin);
const implementation=source.slice(source.indexOf('function renderThreadLoading('),source.indexOf('function renderInitialConversation('))+source.slice(source.indexOf('function isMemoryMaintenanceThread('),source.indexOf('function rememberMemoryMaintenance('))+source.slice(begin,end);
const reply=mode=>({model:'deepseek-flash',modelProvider:'deepseek',collaborationMode:{mode},thread:{id:'A',turns:[{id:'T',status:'completed',items:[]}]}});
function deferred(){let resolve;return {promise:new Promise(yes=>resolve=yes),resolve:value=>resolve(value)};}
function fixture(transport){
 const state={thread:{id:'A'},knownThreads:new Map(),archived:false,threads:[],navigationGeneration:0,nativeModes:new Map([['A','plan']]),threadSettings:new Map([['A',{modelProvider:'deepseek'}]]),items:new Map(),live:new Map(),activeTurns:new Map(),finishedTurns:new Set(),responseSequence:new WeakMap(),eventSequence:20,view:'chat'};
 const nodes=new Map(),noop=()=>{},node=selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:false,classList:{add:noop,remove:noop,toggle:noop},replaceChildren:noop,prepend:noop,remove:noop});return nodes.get(selector);};
 const context={state,$:node,$$:()=>[],closeThreadMenu:noop,rememberScroll:noop,saveComposer:noop,setThreadRoute:noop,updateSend:noop,showView:noop,el:()=>({setAttribute:noop}),button:noop,renderThreadList:noop,restoreScroll:noop,threadRuntimeConfig:()=>({}),nativeErrorMessage:error=>error.message,
  rpc:async()=>transport(state),adoptThread:thread=>{state.thread=thread;},upsertItem:noop,renderTurnOutcome:noop,restoreExecutionPlans:noop,renderNativeMode:noop,
  handleEvent:event=>{state.nativeModes.set(event.params.threadId,event.params.threadSettings.collaborationMode.mode);state.threadSettings.set(event.params.threadId,event.params.threadSettings);},
 };
 return {state,open:vm.runInNewContext(implementation+'\nopenThread;',context)};
}
test('late native resume reply cannot overwrite a newer navigation mode cache',async()=>{
 const gate=deferred();let requests=0;const f=fixture(async()=>++requests===1?gate.promise:reply('default'));
 const earlier=f.open('A');await f.open('A');assert.equal(f.state.nativeModes.get('A'),'default');
 gate.resolve(reply('plan'));await earlier;
 assert.equal(f.state.nativeModes.get('A'),'default');assert.equal(f.state.threadSettings.get('A').collaborationMode.mode,'default');assert.equal(f.state.navigationGeneration,2);
});
test('a real later settings event replay keeps priority over the successful resume snapshot',async()=>{
 const f=fixture(async state=>{const result=reply('default');state.responseSequence.set(result,10);state.hydration.events.push({method:'thread/settings/updated',sequence:15,params:{threadId:'A',threadSettings:{model:'deepseek-flash',modelProvider:'deepseek',collaborationMode:{mode:'plan'}}}});return result;});
 await f.open('A');assert.equal(f.state.restoreError,false);assert.equal(f.state.nativeModes.get('A'),'plan');assert.equal(f.state.threadSettings.get('A').collaborationMode.mode,'plan');
});
