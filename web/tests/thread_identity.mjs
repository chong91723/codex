// Native identity must be observed on the current connection before resume.
import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const begin=source.indexOf('async function openThread('),end=source.indexOf('\nasync function hydrateThread(',begin);assert(begin>=0&&end>begin);
function fixture({failRead=false}={}){
 const calls=[],state={thread:{id:'A'},knownThreads:new Map(),archived:false,threads:[{id:'A',modelProvider:'stale-provider'}],threadSettings:new Map([['A',{modelProvider:'stale-provider'}]]),nativeModes:new Map(),navigationGeneration:0,items:new Map(),live:new Map(),responseSequence:new WeakMap()};let observed=false;
 const noop=()=>{},node={hidden:false,disabled:false,classList:{add:noop,remove:noop},replaceChildren:noop,prepend:noop};
 const context={state,$:()=>node,closeThreadMenu:noop,rememberScroll:noop,saveComposer:noop,setThreadRoute:noop,updateSend:noop,showView:noop,renderThreadList:noop,restoreScroll:noop,el:()=>({setAttribute:noop}),button:noop,nativeErrorMessage:e=>e.message,
  threadRuntimeConfig:provider=>({model_provider:provider}),adoptThread:thread=>{state.thread=thread;},hydrateThread:async()=>{},
  rpc:async(method,params)=>{calls.push({method,params});if(method==='thread/read'){assert.equal(params.includeTurns,false);if(failRead)throw Error('IDENTITY_UNAVAILABLE');observed=true;return {thread:{id:'A',modelProvider:'deepseek'}};}assert.equal(method,'thread/resume');assert(observed,'Current connection has not read the identity');assert.equal(params.config.model_provider,'deepseek');return {thread:{id:'A',modelProvider:'deepseek'},model:'deepseek-flash',modelProvider:'deepseek'};},
 };
 return {state,calls,open:vm.runInNewContext(source.slice(source.indexOf('function renderThreadLoading('),source.indexOf('function renderInitialConversation('))+source.slice(source.indexOf('function isMemoryMaintenanceThread('),source.indexOf('function rememberMemoryMaintenance('))+source.slice(begin,end)+'\nopenThread;',context),reconnect:()=>{observed=false;}};
}
test('reconnect re-reads authoritative identity despite cached UI provider',async()=>{const f=fixture();await f.open('A');f.reconnect();await f.open('A');assert.deepEqual(f.calls.map(c=>c.method),['thread/read','thread/resume','thread/read','thread/resume']);assert.equal(f.state.restoreError,false);});
test('an unreadable identity cannot resume or run unknown historical work',async()=>{const f=fixture({failRead:true});await f.open('A');assert.deepEqual(f.calls.map(c=>c.method),['thread/read']);assert.equal(f.state.restoreError,true);});
test('archived history reuses the metadata response without duplicate read or resume',async()=>{const f=fixture();await f.open('A',{archived:true});assert.deepEqual(f.calls.map(c=>c.method),['thread/read']);assert.equal(f.state.restoreError,false);});
