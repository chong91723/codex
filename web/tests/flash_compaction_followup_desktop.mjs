// Real Flash compaction via existing UI. Global threshold is restored in finally.
import {threadAction} from './thread_menu_helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ready,prompt,call} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL||'http://127.0.0.1:8785';
const out=path.resolve(process.env.ARTIFACT_DIR||'/root/Codex/test-results/flash-followup-2026-10-26');
const workspace=process.env.CODEX_TEST_WORKSPACE;
assert(workspace?.startsWith('/tmp/'),'Independent /tmp workspace is required');
const mode=process.env.COMPACTION_ONLY||'manual';
assert(['manual','auto','both'].includes(mode));
assert(mode==='manual'||process.env.ALLOW_TEST_COMPACTION_THRESHOLD==='1','Automatic test requires an explicitly allowed isolated-config threshold change');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(30000);
const errors=[],sent=[],events=[],results=[];let home,originalThreshold,thresholdChanged=false;
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{
 socket.on('framesent',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method)sent.push({method:m.method,threadId:m.params?.threadId,model:m.params?.model,keyPath:m.params?.keyPath,value:m.params?.keyPath==='model_auto_compact_token_limit'?m.params?.value:undefined});}catch{}});
 socket.on('framereceived',frame=>{try{const m=JSON.parse(String(frame.payload));if(['thread/tokenUsage/updated','turn/started','turn/completed'].includes(m.method)||['item/started','item/completed'].includes(m.method)&&m.params?.item?.type==='contextCompaction')events.push(m);}catch{}});
});
async function chat(){await page.locator('#new-chat').click();await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');}
const persist=()=>fs.writeFileSync(path.join(out,'menu-compaction-'+mode+'.json'),JSON.stringify({scope:'Only real deepseek-flash; native manual/automatic compaction and marker continuation',base,workspace,home,originalThreshold,thresholdChanged,results,errors,sent,events},null,2));
async function check(name,fn){try{results.push({name,status:'passed',evidence:await fn()});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:error.stack||error.message});console.log('FAIL '+name+': '+error.message);await page.screenshot({path:path.join(out,'menu-compaction-'+mode+'-failure.png')}).catch(()=>{});}persist();}
try{
 await page.goto(base);await ready(page);
 home=await page.evaluate(()=>state.runtimeInfo.codexHome);assert(home.startsWith('/tmp/')&&/flash|audit|followup/.test(home));
 assert.equal(await page.evaluate(()=>state.status.workspace),workspace);
 assert(!fs.existsSync(path.join(home,'auth.json')));
 if(mode==='manual'||mode==='both')await check('Flash 手动压缩：真实 compact 请求和事件，后续仍记住标记',async()=>{
  await chat();const marker='FLASH_MANUAL_GINKGO_'+Date.now();
  await prompt(page,'请记住唯一测试标记 '+marker+'，只回复“已记住”，不要调用工具，不要复述填充。下面是无业务重复文本：\n'+('alpha beta gamma delta epsilon '.repeat(1400)),false,240000);
  const id=await page.evaluate(()=>state.thread.id),before=await page.evaluate(()=>contextSnapshot());
  const old=await page.evaluate(()=>[...state.items.keys()]);const start=sent.length;
  await threadAction(page,'compact');
  await page.waitForFunction(old=>[...state.items.values()].some(entry=>entry.item.type==='contextCompaction'&&entry.done&&!old.includes(entry.item.id)),old,{timeout:240000});
  await page.waitForFunction(()=>!state.activeTurns.has(state.thread.id),null,{timeout:240000});
  assert(sent.slice(start).some(message=>message.method==='thread/compact/start'));
  const compacted=await page.evaluate(()=>contextSnapshot());
  const turn=await prompt(page,'我刚才要求记住的唯一测试标记是什么？只回复标记，不调用工具。',false,240000);
  const answer=turn.items.filter(item=>item.type==='agentMessage').map(item=>item.text).join('\n');assert(answer.includes(marker),'Compacted conversation lost marker: '+answer);
  assert.equal(turn.settings.model,'deepseek-flash');assert.equal(turn.settings.modelProvider,'deepseek');
  await page.reload();await ready(page);assert.equal(await page.evaluate(()=>state.thread.id),id);
  assert((await page.locator('#messages').innerText()).includes(marker));
  return{threadId:id,model:'deepseek-flash',nativeCompaction:true,before:before?.used,after:compacted?.used,estimatedAfter:compacted?.estimated,markerRetained:true,historyRestored:true};
 });
 if(mode==='auto'||mode==='both')await check('Flash 自动压缩：隔离配置临时阈值，真实事件和标记续聊',async()=>{
  const config=await call(page,'config/read',{includeLayers:false,cwd:workspace});
  originalThreshold=config.config.model_auto_compact_token_limit??null;
  const threshold=20000;
  await call(page,'config/value/write',{keyPath:'model_auto_compact_token_limit',value:threshold,mergeStrategy:'replace',reloadUserConfig:true});thresholdChanged=true;
  const verified=await call(page,'config/read',{includeLayers:false,cwd:workspace});assert.equal(verified.config.model_auto_compact_token_limit,threshold);
  await chat();const marker='FLASH_AUTO_GINKGO_'+Date.now(),start=sent.length;
  await prompt(page,'只记住自动压缩测试标记 '+marker+'，回复“收到”，不要调用工具，不要复述以下无业务填充：\n'+('alpha beta gamma delta epsilon '.repeat(4200)),false,300000);
  const id=await page.evaluate(()=>state.thread.id);
  await page.waitForFunction(()=>[...state.items.values()].some(entry=>entry.item.type==='contextCompaction'&&entry.done),null,{timeout:240000});
  const usage=events.filter(event=>event.method==='thread/tokenUsage/updated'&&event.params.threadId===id).map(event=>event.params.tokenUsage);
  assert(usage.length,'No real token-usage events');
  const maximum=Math.max(...usage.map(value=>value.last.totalTokens));
  assert(maximum>=threshold,'Actual usage never crossed configured threshold');
  assert(!sent.slice(start).some(message=>message.method==='thread/compact/start'),'Automatic test used a manual compact request');
  const compacted=await page.evaluate(()=>contextSnapshot());
  assert(compacted?.used<maximum,'Context usage did not decrease after compaction');
  const turn=await prompt(page,'刚才要求记住的自动压缩测试标记是什么？只回复标记，不调用工具。',false,240000);
  const answer=turn.items.filter(item=>item.type==='agentMessage').map(item=>item.text).join('\n');assert(answer.includes(marker),'Automatic summary lost marker: '+answer);
  assert.equal(turn.settings.model,'deepseek-flash');assert.equal(turn.settings.modelProvider,'deepseek');
  return{threadId:id,model:'deepseek-flash',testThreshold:threshold,originalThreshold,maximumNativeUsage:maximum,after:compacted.used,nativeAutomaticCompaction:true,manualRequest:false,markerRetained:true};
 });
}finally{
 if(thresholdChanged){
  try{
   if(await page.locator('#dialog[open]').count())await page.locator('#dialog-cancel').click();
   await call(page,'config/value/write',{keyPath:'model_auto_compact_token_limit',value:originalThreshold,mergeStrategy:'replace',reloadUserConfig:true});
   const restored=await call(page,'config/read',{includeLayers:false,cwd:workspace});
   assert.equal(restored.config.model_auto_compact_token_limit??null,originalThreshold);thresholdChanged=false;
   results.push({name:'恢复测试阈值并原生读取确认',status:'passed',evidence:{restoredThreshold:originalThreshold}});
  }catch(error){results.push({name:'恢复测试阈值',status:'failed',error:error.message});}
 }
 persist();await browser.close();
 const summary={passed:results.filter(result=>result.status==='passed').length,failed:results.filter(result=>result.status==='failed').length,errors};console.log(JSON.stringify(summary));if(summary.failed||errors.length)process.exitCode=1;
}
