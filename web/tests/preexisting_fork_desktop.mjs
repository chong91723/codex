// Regression for forks created through native stdio before the Web has seen them.
// The only model task is a disposable Flash parent; no storage writes/repair by Web.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {ready,call,prompt} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL;
const testHome=process.env.CODEX_TEST_HOME,testWorkspace=process.env.CODEX_TEST_WORKSPACE;
assert(base&&testHome&&testWorkspace,'Use explicit independent CODEX_WEB_URL/CODEX_TEST_HOME/CODEX_TEST_WORKSPACE');
assert(testHome.startsWith('/tmp/')&&testWorkspace.startsWith('/tmp/'),'Only disposable /tmp profiles are accepted');
const out=process.env.REPORT_DIR||'test-results/final-fixes-2026-10-26/forks';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
let context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),native,parentId,childId,childPath,parentPath,parentHash;
const records=[],errors=[],cleanup=[],owned=[],nonce=Date.now(),marker='FLASH_OLD_FORK_'+nonce,childName='旧分叉回归 '+nonce;
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const indexIds=()=>{const p=path.join(testHome,'web-state','known-forks.json');return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')).threadIds:[];};
const row=(id)=>page.locator(`.thread-row[data-thread-id="${id}"]`);
const rpc=(method,params)=>call(page,method,params);
const save=()=>fs.writeFileSync(path.join(out,'preexisting-fork-results.json'),JSON.stringify({model:'deepseek-flash',parentId,childId,origin:'Real Flash parent through browser; child fork created by separate unmodified native stdio, outside Web observer. Supplemental IDs confirmed by native thread/read.',records,cleanup,browserErrors:errors},null,2));
function observe(p){p.on('pageerror',error=>errors.push(error.message));}
observe(page);
async function check(name,fn){try{records.push({name,status:'passed',evidence:await fn()});console.log('PASS '+name);}catch(error){records.push({name,status:'failed',error:error.message});try{await page.screenshot({path:path.join(out,'preexisting-fork-failure-'+records.length+'.png'),mask:[page.locator('#messages')]});}catch{}throw error;}finally{save();}}
async function nativeClient(executable){
 const process=spawn(executable,['-c','features.image_generation=false','-c','features.fast_mode=false','app-server','--listen','stdio://'],{cwd:testWorkspace,env:{...globalThis.process.env,CODEX_HOME:testHome},stdio:['pipe','pipe','pipe']});
 const pending=new Map();let sequence=0,stderrBytes=0;
 process.stderr.on('data',chunk=>stderrBytes+=chunk.length);
 const lines=createInterface({input:process.stdout});lines.on('line',line=>{let message;try{message=JSON.parse(line);}catch{return;}if(message.method&&message.id!==undefined){process.stdin.write(JSON.stringify({id:message.id,error:{code:-32000,message:'Unexpected server request in storage-only regression'}})+'\n');return;}const waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);clearTimeout(waiter.timer);message.error?waiter.reject(Error(message.error.message)):waiter.resolve(message.result);});
 process.on('exit',code=>{for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(Error('Native storage process exited '+code));}pending.clear();});
 const call=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Native storage RPC timeout: '+method));},45000);pending.set(id,{resolve,reject,timer});process.stdin.write(JSON.stringify({id,method,params})+'\n');});
 await call('initialize',{clientInfo:{name:'codex_web_old_fork_regression',version:'1.0'},capabilities:{experimentalApi:true}});process.stdin.write(JSON.stringify({method:'initialized'})+'\n');
 return{call,async close(){if(process.exitCode!==null)return;process.stdin.end();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{process.kill('SIGTERM');reject(Error('Native storage process did not exit'));},10000);process.once('exit',()=>{clearTimeout(timer);resolve();});});lines.close();},stderrBytes:()=>stderrBytes};
}
try{
 await page.goto(base);await ready(page);
 assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),testHome);
 assert.equal(await page.evaluate(()=>state.status.workspace),testWorkspace);
 await check('真实Flash父会话建立可恢复历史',async()=>{
  await page.locator('#new-chat').click();await page.locator('#model').selectOption('deepseek-flash');
  const result=await prompt(page,'不要调用任何工具，只回复这一行：'+marker,false,180000);
  parentId=await page.evaluate(()=>state.thread.id);owned.push(parentId);assert.equal(result.settings.model,'deepseek-flash');
  assert(result.items.filter(i=>i.type==='agentMessage').some(i=>i.text.includes(marker)));
  const actual=(await rpc('thread/read',{threadId:parentId,includeTurns:false})).thread;
  parentPath=actual.path;assert(parentPath.startsWith(testHome+'/sessions/'));parentHash=digest(parentPath);
  return{threadId:parentId,model:result.settings.model,realModelMarker:true};
 });
 await check('独立原生连接创建未被Web观察且默认列表遗漏的真实分叉',async()=>{
  const status=await page.evaluate(()=>state.status);native=await nativeClient(status.runtimePath);
  const created=await native.call('thread/fork',{threadId:parentId,model:'deepseek-flash',modelProvider:'deepseek'});
  childId=created.thread.id;childPath=created.thread.path;assert(childPath.startsWith(testHome+'/sessions/'));owned.unshift(childId);
  assert.equal(created.thread.preview,'');assert.equal(created.thread.forkedFromId,parentId);
  await native.call('thread/name/set',{threadId:childId,name:childName});
  const list=await native.call('thread/list',{limit:100,sortKey:'created_at'});
  assert(!list.data.some(t=>t.id===childId),'Native default list must reproduce the missing fork');
  assert(!indexIds().includes(childId),'Web observer must never have observed the child');
  await native.close();native=null;
  return{childId,previewEmpty:true,parentId,nativeListOmitsFork:true,absentFromWebOwnedIndex:true};
 });
 await check('API只读发现旧分叉而不修改原生历史或Web已见索引',async()=>{
  const before=digest(childPath),response=await page.evaluate(async()=>{const response=await fetch('/api/known-forks');return{status:response.status,value:await response.json()};});
  assert.equal(response.status,200);assert(response.value.threadIds.includes(childId));assert(!indexIds().includes(childId));
  assert.equal(digest(childPath),before);assert.equal(digest(parentPath),parentHash);
  return{discoveredWithoutObservedIndex:true,nativeChildAndParentFilesUnchanged:true,noSyntheticTurn:true};
 });
 await check('全新浏览器首次进入即可搜索、打开并恢复继承历史',async()=>{
  await context.close();context=await browser.newContext({viewport:{width:1440,height:960}});page=await context.newPage();observe(page);
  await page.goto(base);await ready(page);await row(childId).waitFor({timeout:30000});assert.equal(await page.evaluate(()=>state.thread),null);
  await page.locator('#thread-search').fill(childName);await row(childId).waitFor();await row(childId).click();
  await page.waitForFunction(id=>state.thread?.id===id&&!state.threadLoading,childId,{timeout:45000});
  assert.equal(await page.locator('#page-title').innerText(),childName);
  assert((await page.locator('#messages').innerText()).includes(marker));
  await page.screenshot({path:path.join(out,'preexisting-fork-open.png'),mask:[page.locator('#messages')]});
  await page.reload();await ready(page);assert.equal(await page.evaluate(()=>state.thread.id),childId);await row(childId).waitFor();
  return{newContextNoSharedStorage:true,nameSearch:true,nativeHistoryRestored:true,refreshSameThread:true};
 });
 await check('旧分叉归档恢复删除保持一致，父历史未变',async()=>{
  await page.evaluate(()=>showView('chat'));await page.locator('#thread-action').selectOption('archive');await page.waitForFunction(()=>!state.thread);await page.waitForFunction(id=>!state.threads.some(t=>t.id===id),childId);
  await page.locator('#archive-toggle').click();await row(childId).waitFor();await row(childId).click();await page.waitForFunction(id=>state.thread?.id===id&&!state.threadLoading,childId);assert(await page.locator('#prompt').isDisabled());
  await page.locator('#thread-action').selectOption('unarchive');await page.waitForFunction(id=>state.thread?.id===id&&!state.threadArchived&&!state.threadLoading,childId,{timeout:45000});
  await page.locator('#thread-action').selectOption('delete');await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>!state.thread);await page.waitForFunction(id=>!state.threads.some(t=>t.id===id),childId);
  const response=await page.evaluate(async()=>{const r=await fetch('/api/known-forks');return r.json();});assert(!response.threadIds.includes(childId));assert.equal(digest(parentPath),parentHash);
  cleanup.push({entity:'ownedChild',id:childId,removed:true});owned.splice(owned.indexOf(childId),1);
  return{archivedReadOnly:true,unarchiveSameId:true,permanentDeleteRemovesDiscovery:true,parentNativeHistoryUnchanged:true};
 });
 assert.equal(errors.length,0);
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{
 if(native)try{await native.close();}catch(error){cleanup.push({entity:'nativeStorageProcess',removed:false,error:error.message});}
 for(const id of owned){try{await rpc('thread/delete',{threadId:id});cleanup.push({entity:'ownedThread',id,removed:true});}catch(error){cleanup.push({entity:'ownedThread',id,removed:false,error:error.message});}}
 save();await browser.close();console.log(JSON.stringify({passed:records.filter(r=>r.status==='passed').length,failed:records.filter(r=>r.status==='failed').length,browserErrors:errors,cleanup}));if(cleanup.some(c=>!c.removed))process.exitCode=1;
}
