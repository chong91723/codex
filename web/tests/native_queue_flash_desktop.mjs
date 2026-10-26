// Final queue delivery through the actual Web/native UI; Flash only, at most two owned threads.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ready,call,prompt} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL||'http://127.0.0.1:8789',out=process.env.REPORT_DIR||'test-results/flash-followup-2026-10-26';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),results=[],errors=[],requests=[],nativeTurns=[],owned=[],cleanup=[];
const nonce=String(Date.now()),autoMarker='QUEUE_FLASH_AUTO_'+nonce,startMarker='QUEUE_FLASH_MANUAL_'+nonce,holdMarker='QUEUE_FLASH_HOLD_'+nonce;
let workspace,autoFile,holdFile,tailFile;
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{socket.on('framesent',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method)requests.push({method:m.method,threadId:m.params?.threadId,model:m.params?.model});}catch{}});socket.on('framereceived',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method==='turn/started'||m.method==='turn/completed')nativeTurns.push({event:m.method,threadId:m.params.threadId,turnId:m.params.turn?.id,status:m.params.turn?.status,error:m.params.turn?.error?.message||null});}catch{}});});
const rpc=(method,params)=>call(page,method,params);
function save(){fs.writeFileSync(out+'/native-queue-flash-results.json',JSON.stringify({origin:'Real desktop chat setup, native protocol Execute buttons for queue APIs, actual stop button, native history/settings and filesystem reads; no credentials accessed',provider:'deepseek',model:'deepseek-flash',ownedThreadIds:owned,results,cleanup,browserErrors:errors,requests,nativeTurns},null,2));}
async function check(name,fn){try{results.push({name,status:'passed',evidence:await fn()});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:error.message});await page.screenshot({path:out+'/native-queue-flash-failure-'+results.length+'.png',mask:[page.locator('#messages')]});throw error;}finally{save();}}
async function lastHistory(id){const data=(await rpc('thread/turns/list',{threadId:id,itemsView:'full',sortDirection:'asc',limit:100})).data;return data.at(-1);}
async function nativeSettings(id){const result=await rpc('thread/resume',{threadId:id,excludeTurns:true});assert.equal(result.model,'deepseek-flash');assert.equal(result.modelProvider,'deepseek');return{model:result.model,modelProvider:result.modelProvider,effort:result.reasoningEffort};}
async function waitForNewTurn(id,previous,timeout=180000){await page.waitForFunction(({id,previous})=>state.thread?.id===id&&state.turns.at(-1)?.id!==previous&&state.turns.at(-1)?.status&&state.turns.at(-1).status!=='inProgress'&&!state.activeTurns.has(id),{id,previous},{timeout});const turn=await lastHistory(id);assert.equal(turn.status,'completed',JSON.stringify(turn.error));return turn;}
try{
 await page.goto(base);await ready(page);assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),'/tmp/codex-web-flash-final-audit/home');workspace=await page.evaluate(()=>state.selectedCwd);assert.equal(workspace,'/tmp/codex-web-flash-final-audit/workspace');autoFile=workspace+'/queue-auto-'+nonce+'.txt';holdFile=workspace+'/queue-hold-'+nonce+'.txt';tailFile=workspace+'/queue-tail-'+nonce+'.txt';
 await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');
 await check('loaded idle线程queue/add自动启动Flash，真实命令写入文件并完成',async()=>{
  await page.locator('#new-chat').click();const primed=await prompt(page,'只回复 QUEUE_PRIME_'+nonce+'，不使用工具。');assert.equal(primed.settings.model,'deepseek-flash');assert.equal(primed.settings.modelProvider,'deepseek');const id=await page.evaluate(()=>state.thread.id);owned.push(id);const previous=primed.turn.id;
  const code=`from pathlib import Path; Path(${JSON.stringify(autoFile)}).write_text(${JSON.stringify(autoMarker)}); print(${JSON.stringify(autoMarker)})`;
  const instruction=`Use exec_command to run exactly python3 -c ${JSON.stringify(code)} with sandbox_permissions="use_default", without justification or prefix_rule. Do not change any other file. Report ${autoMarker} only after the actual command succeeds.`;
  const added=await rpc('thread/queue/add',{threadId:id,clientUserMessageId:'queue-auto-'+nonce,input:[{type:'text',text:instruction,text_elements:[]}]});assert(added.queuedSubmission.id);
  const turn=await waitForNewTurn(id,previous);assert(turn.items.some(item=>item.type==='commandExecution'&&item.exitCode===0&&JSON.stringify(item).includes(autoMarker)),'Actual successful queue command missing from native history');assert(turn.items.some(item=>item.type==='agentMessage'&&item.text.includes(autoMarker)));
  const file=await rpc('fs/readFile',{path:autoFile});assert.equal(Buffer.from(file.dataBase64,'base64').toString(),autoMarker);assert.equal((await rpc('thread/queue/list',{threadId:id})).data.length,0);const settings=await nativeSettings(id);
  return{threadId:id,queuedSubmissionId:added.queuedSubmission.id,automaticTurnId:turn.id,actualCommandExitCode:0,actualFileMarkerReadBack:true,queueEmptyAfterNativeConsumption:true,settings};
 });
 await check('忙碌时queue/start明确拒绝且保留消息；停止后手动start使用Flash完成',async()=>{
  await page.evaluate(()=>showView('chat'));await page.locator('#new-chat').click();await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');
  const code=`from pathlib import Path; import time; Path(${JSON.stringify(holdFile)}).write_text(${JSON.stringify(holdMarker)}); print(${JSON.stringify(holdMarker)},flush=True); time.sleep(90); Path(${JSON.stringify(tailFile)}).write_text("UNEXPECTED_TAIL")`;
  await page.locator('#prompt').fill(`Use exec_command to run exactly python3 -c ${JSON.stringify(code)} with yield_time_ms=1000, sandbox_permissions="use_default", without justification or prefix_rule. Wait for it to finish with write_stdin as needed. Do not run any other command.`);await page.locator('#prompt').press('Enter');
  await page.waitForFunction(()=>state.thread&&state.activeTurns.has(state.thread.id)&&[...state.items.values()].some(entry=>entry.item.type==='commandExecution'&&JSON.stringify(entry.item).includes('QUEUE_FLASH_HOLD_')),null,{timeout:90000});
  const id=await page.evaluate(()=>state.thread.id);owned.push(id);const holdTurn=await page.evaluate(id=>state.activeTurns.get(id),id);const held=await rpc('fs/readFile',{path:holdFile});assert.equal(Buffer.from(held.dataBase64,'base64').toString(),holdMarker);
  const added=await rpc('thread/queue/add',{threadId:id,clientUserMessageId:'queue-manual-'+nonce,input:[{type:'text',text:'只回复 '+startMarker+'，不使用工具，不做其他任务。',text_elements:[]}]});assert.equal((await rpc('thread/queue/list',{threadId:id})).data.length,1);
  let busyError;try{await rpc('thread/queue/start',{threadId:id,queuedSubmissionId:added.queuedSubmission.id});}catch(error){busyError=error.message;}assert(busyError&&/active|pending|idle/i.test(busyError),'Busy queue start must return a native actionable error');assert.equal((await rpc('thread/queue/list',{threadId:id})).data[0].id,added.queuedSubmission.id);
  await page.evaluate(()=>showView('chat'));await page.locator('#send').click();await page.waitForFunction(turnId=>state.stopOperations.get(turnId)?.status==='completed',holdTurn,{timeout:45000});assert.equal((await rpc('thread/backgroundTerminals/list',{threadId:id,limit:100})).data.length,0);assert.equal((await rpc('thread/queue/list',{threadId:id})).data[0].id,added.queuedSubmission.id);
  const started=await rpc('thread/queue/start',{threadId:id,queuedSubmissionId:added.queuedSubmission.id});assert(started.turn.id);const turn=await waitForNewTurn(id,holdTurn);assert.equal(turn.id,started.turn.id);assert(turn.items.some(item=>item.type==='agentMessage'&&item.text.includes(startMarker)));assert.equal((await rpc('thread/queue/list',{threadId:id})).data.length,0);
  const listing=await rpc('fs/readDirectory',{path:workspace});assert(!listing.entries.some(entry=>entry.name===tailFile.split('/').at(-1)),'Interrupted hold command continued to its tail');const settings=await nativeSettings(id);
  return{threadId:id,queuedSubmissionId:added.queuedSubmission.id,busyNativeError:busyError,busyStartRetainsMessage:true,interruptedHoldTurn:holdTurn,actualCommandCleanupConfirmed:true,manualQueueTurnId:turn.id,uniqueFlashReply:true,queueEmptyAfterStart:true,settings};
 });
 assert.equal(errors.length,0);assert(requests.filter(r=>r.method==='turn/start').every(r=>r.model==='deepseek-flash'));
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{
 for(const id of owned){try{const active=await page.evaluate(id=>state.activeTurns.has(id),id);if(active&&await page.evaluate(id=>state.thread?.id===id,id)){await page.evaluate(()=>showView('chat'));await page.locator('#send').click();await page.waitForFunction(id=>!state.activeTurns.has(id)&&![...state.stopOperations.values()].some(op=>op.threadId===id&&op.status==='pending'),id,{timeout:45000});}await rpc('thread/delete',{threadId:id});cleanup.push({entity:'ownedThread',id,removed:true});}catch(error){cleanup.push({entity:'ownedThread',id,removed:false,error:error.message});}}
 for(const path of [autoFile,holdFile,tailFile].filter(Boolean)){try{await rpc('fs/remove',{path,recursive:false,force:true});cleanup.push({entity:'ownedTemporaryFile',filename:path.split('/').at(-1),removed:true});}catch(error){cleanup.push({entity:'ownedTemporaryFile',filename:path.split('/').at(-1),removed:false,error:error.message});}}
 save();await browser.close();console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,model:'deepseek-flash',browserErrors:errors}));if(results.some(r=>r.status==='failed')||cleanup.some(c=>c.removed===false))process.exitCode=1;
}
