// Read-only genuine existing-thread replay. Optional native pagination is enabled
// by changing the actual supported request parameter, never by faking a response.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ready} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL,home=process.env.CODEX_TEST_HOME,threadId=process.env.CODEX_TEST_THREAD;
assert(base&&home?.startsWith('/tmp/')&&threadId,'An exact independent profile and completed test thread are required');
const out=path.resolve(process.env.ARTIFACT_DIR||'test-results/final-fixes-2026-10-26/context');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const results=[],errors=[],sent=[],received=[];let page;
const save=()=>fs.writeFileSync(path.join(out,'context-readonly-results.json'),JSON.stringify({scope:'Existing independent deepseek-flash completed test history only. No model call or configuration write.',base,home,threadId,results,errors,sent,received},null,2));
async function inspect(mode,step){
 const value=await page.evaluate(()=>({home:state.runtimeInfo.codexHome,threadId:state.thread?.id,settings:{model:state.threadSettings.get(state.thread?.id)?.model,modelProvider:state.threadSettings.get(state.thread?.id)?.modelProvider},snapshot:contextSnapshot(),badge:{hidden:document.querySelector('#usage-label').hidden,text:document.querySelector('#usage-label').textContent,title:document.querySelector('#usage-label').title},statuses:state.turns.map(t=>t.status)}));
 assert.equal(value.home,home);assert.equal(value.threadId,threadId);assert.equal(value.settings.model,'deepseek-flash');assert(value.statuses.every(status=>status!=='inProgress'),'The reference history must remain idle');
 const actual=received.filter(item=>item.mode===mode&&item.method==='thread/tokenUsage/updated'&&item.params.threadId===threadId).at(-1);assert(actual,'No real tokenUsage replay');
 assert(value.snapshot,'Native tokenUsage replay was received but hydration discarded it');
 assert.equal(value.snapshot.used,actual.params.tokenUsage.last.totalTokens);assert.equal(value.snapshot.nativeLimit,actual.params.tokenUsage.modelContextWindow);assert.equal(value.snapshot.limit,1048576);assert.equal(value.snapshot.physical,true);assert.equal(value.badge.hidden,false);assert.equal(value.badge.text,(value.snapshot.used/1048576*100).toFixed(1)+'%');assert.match(value.badge.title,/最近采样/);assert.match(value.badge.title,/不是实时精确/);
 return {mode,step,numerator:value.snapshot.used,denominator:value.snapshot.limit,nativeAvailableWindow:value.snapshot.nativeLimit,cumulativeBillingNotUsed:actual.params.tokenUsage.total.totalTokens,badge:value.badge.text,actualUsageEvent:true};
}
try{
 for(const mode of ['normal','pagination']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();
  if(mode==='pagination')await page.addInitScript(()=>{const nativeSend=WebSocket.prototype.send;WebSocket.prototype.send=function(data){let request;try{request=JSON.parse(data);}catch{}if(request?.method==='thread/resume'){request.params={...request.params,excludeTurns:true};data=JSON.stringify(request);}return nativeSend.call(this,data);};});
  page.on('pageerror',error=>errors.push(error.message));page.on('websocket',socket=>{socket.on('framesent',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method)sent.push({mode,id:m.id,method:m.method,threadId:m.params?.threadId,excludeTurns:m.params?.excludeTurns});}catch{}});socket.on('framereceived',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method==='thread/tokenUsage/updated')received.push({mode,...m});}catch{}});});
  for(const step of ['open','reload']){
   if(step==='open')await page.goto(base+'/?thread='+encodeURIComponent(threadId));else await page.reload();await ready(page);
   const evidence=await inspect(mode,step);results.push({name:mode+' '+step,status:'passed',evidence});console.log('PASS '+mode+' '+step);save();
  }
  await page.locator('#usage-label').click();const dialog=await page.locator('#dialog').innerText();assert.match(dialog,/最近采样输入与输出总量/);assert.match(dialog,/原生可用窗口/);assert.match(dialog,/缓存输入仍占窗口/);assert.match(dialog,/累计消耗不作分子/);await page.screenshot({path:path.join(out,'context-'+mode+'-desktop.png')});await page.locator('#dialog-cancel').click();
  if(mode==='pagination'){assert(sent.some(m=>m.mode===mode&&m.method==='thread/resume'&&m.excludeTurns===true));assert(sent.some(m=>m.mode===mode&&m.method==='thread/turns/list'));}
  await context.close();
 }
 assert(!sent.some(m=>/^(turn\/(start|steer)|review\/start|thread\/(goal\/set|compact\/start|queue\/(add|start))|config\/(value|batchWrite))/.test(m.method)),'Read-only audit started model work or mutated configuration');assert.equal(errors.length,0);
}catch(error){results.push({name:'Readonly context audit',status:'failed',error:error.stack||error.message});console.error(error.stack);}
finally{save();await browser.close();console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,errors,newModelRequests:sent.filter(m=>/^(turn\/(start|steer)|review\/start|thread\/(goal\/set|compact\/start|queue\/(add|start)))/.test(m.method)).length}));if(results.length!==4||results.some(r=>r.status==='failed')||errors.length)process.exitCode=1;}
