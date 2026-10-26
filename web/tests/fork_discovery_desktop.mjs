// Real browser/native empty-fork discovery; no turn/model request is allowed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ready,call} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL||'http://127.0.0.1:8788';
const out=process.env.REPORT_DIR||'test-results/flash-followup-2026-10-26';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const results=[],errors=[],requests=[];let context=await browser.newContext({viewport:{width:1440,height:960}}),page,childId,parentId,parentBefore,childName='Flash 分叉发现验收 '+Date.now(),deleted=false;
const row=(p,id)=>p.locator(`.thread-row[data-thread-id="${id}"]`);
function observe(p){p.on('pageerror',error=>errors.push(error.message));p.on('websocket',socket=>socket.on('framesent',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method){requests.push({method:m.method,threadId:m.params?.threadId});if(m.method==='turn/start')errors.push('Unexpected model request');}}catch{}}));}
async function check(name,fn){try{const evidence=await fn();results.push({name,status:'passed',evidence});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:error.message});if(page&&!page.isClosed())await page.screenshot({path:out+'/fork-browser-failure-'+results.length+'.png',mask:[page.locator('#messages')]});throw error;}finally{save();}}
function save(){fs.writeFileSync(out+'/fork-browser-results.json',JSON.stringify({origin:'Real desktop UI controls and native protocol Execute buttons; native responses only, one explicitly delayed genuine list response',modelRequests:requests.filter(r=>r.method==='turn/start').length,parentId,childId,childName,results,browserErrors:errors,requests},null,2));}
async function screenshot(name){await page.screenshot({path:out+'/fork-browser-'+name+'.png',mask:[page.locator('#messages')]});}
async function index(p=page){return p.evaluate(async()=>{const response=await fetch('/api/known-forks');if(!response.ok)throw Error('known-forks HTTP '+response.status);return response.json();});}
async function search(text){await page.locator('#thread-search').fill(text);await page.waitForFunction(({id,text})=>document.querySelector('#thread-search').value===text&&state.threads.some(t=>t.id===id),{id:childId,text},{timeout:15000});}
async function chooseChild(){await row(page,childId).click();await page.waitForFunction(id=>state.thread?.id===id&&!state.threadLoading,childId,{timeout:30000});}
try{
 page=await context.newPage();observe(page);await page.goto(base);await ready(page);assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),'/tmp/codex-web-flash-audit/home');assert.equal(await page.evaluate(()=>state.status.knownForksSupported),true);
 const listing=await call(page,'thread/list',{limit:100,modelProviders:['deepseek'],sortKey:'updated_at'});
 const eligible=listing.data.filter(t=>t.model==='deepseek-flash'&&t.cwd?.startsWith('/tmp/codex-web-flash-audit/workspace')&&t.preview&&!t.forkedFromId);
 assert(eligible.length,'No persisted Flash audit parent available');const parent=eligible.find(t=>t.name)||eligible.at(-1);parentId=parent.id;parentBefore={id:parent.id,name:parent.name??null,updatedAt:parent.updatedAt,previewLength:parent.preview.length};
 await page.goto(base+'/?thread='+encodeURIComponent(parentId));await ready(page);assert.equal(await page.evaluate(()=>state.thread.id),parentId);assert.equal(await page.evaluate(()=>state.thread.modelProvider),'deepseek');
 await check('原生空预览分叉通过会话操作创建，并写入Web发现索引',async()=>{
  await page.locator('#thread-action').selectOption('fork');await page.waitForFunction(parent=>state.thread?.id&&state.thread.id!==parent&&!state.threadLoading,parentId,{timeout:45000});childId=await page.evaluate(()=>state.thread.id);
  const actual=await call(page,'thread/read',{threadId:childId,includeTurns:false});assert.equal(actual.thread.preview,'');assert.equal(actual.thread.forkedFromId,parentId);assert((await index()).threadIds.includes(childId));
  await page.evaluate(()=>showView('chat'));await page.locator('#thread-action').selectOption('rename');await page.locator('#dialog-value').fill(childName);await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});await row(page,childId).waitFor();await screenshot('created');return{createdBy:'thread-action fork',nativePreviewEmpty:true,nativeParentId:parentId,indexContainsFork:true};
 });
 await check('离开当前分叉、刷新及全新浏览器上下文仍能发现',async()=>{
  await page.locator('#new-chat').click();await row(page,childId).waitFor();assert.equal(await page.evaluate(()=>state.thread),null);
  await page.reload();await ready(page);await row(page,childId).waitFor();assert.equal(await page.evaluate(()=>state.thread),null);
  const isolated=await browser.newContext({viewport:{width:1440,height:960}});const fresh=await isolated.newPage();observe(fresh);await fresh.goto(base);await ready(fresh);assert.equal(await fresh.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.includes('thread')).length),0);await row(fresh,childId).waitFor();assert.equal(await fresh.evaluate(()=>state.thread),null);
  await context.close();context=isolated;page=fresh;await screenshot('fresh-context');return{leavingKeepsRow:true,reloadWithoutSelectedRoute:true,freshContextNoSharedStorage:true};
 });
 await check('分叉名称搜索及不匹配筛选采用真实原生元数据',async()=>{
  await search(childName);assert.equal(await row(page,childId).count(),1);await page.locator('#thread-search').fill('不存在的分叉匹配-'+Date.now());await page.waitForFunction(id=>!state.threads.some(t=>t.id===id),childId);assert.equal(await row(page,childId).count(),0);
  await search(childName);await chooseChild();assert.equal(await page.locator('#page-title').innerText(),childName);return{renamePersisted:true,matchingSearchFindsFork:true,nonmatchingSearchExcludesFork:true};
 });
 await check('归档过滤、取消归档与删除均保持原生状态一致',async()=>{
  await page.locator('#thread-action').selectOption('archive');await page.waitForFunction(()=>!state.thread);await page.waitForFunction(id=>!state.threads.some(t=>t.id===id),childId);assert.equal(await row(page,childId).count(),0);
  await page.locator('#archive-toggle').click();await row(page,childId).waitFor();await chooseChild();assert(await page.locator('#prompt').isDisabled());const archivedPath=await page.evaluate(()=>state.thread.path);assert(archivedPath.split('/').includes('archived_sessions'));await screenshot('archived');
  await page.locator('#thread-action').selectOption('unarchive');await page.waitForFunction(id=>state.thread?.id===id&&!state.threadArchived&&!state.threadLoading,childId);assert.equal(await page.locator('#prompt').isDisabled(),false);assert(!(await page.evaluate(()=>state.thread.path)).split('/').includes('archived_sessions'));assert.equal(await row(page,childId).count(),1);
  return{archiveAbsentFromNormal:true,archiveVisibleInArchiveList:true,archivedInputDisabled:true,unarchiveResumesSameId:true,indexRetainsDiscoverableId:(await index()).threadIds.includes(childId)};
 });
 await check('晚到的真实列表响应不会把旧归档状态写回新列表',async()=>{
  await page.locator('#new-chat').click();await page.locator('#thread-search').fill('');await page.waitForFunction(()=>document.querySelector('#thread-search').value==='');
  // Hold one genuine list result after native execution; subsequent UI requests run normally.
  await page.evaluate(()=>{const original=rpc,originalLoad=loadThreads;window.__delayedForkListSettled=false;loadThreads=function(...args){loadThreads=originalLoad;return originalLoad(...args).finally(()=>window.__delayedForkListSettled=true);};rpc=function(method,...args){const result=original(method,...args);if(method==='thread/list'){rpc=original;return result.then(async value=>{window.__forkNativeListReceived=true;await new Promise(resolve=>window.__releaseForkNativeList=resolve);return value;});}return result;};window.__forkNativeListReceived=false;});
  await page.locator('#archive-toggle').click();await page.waitForFunction(()=>window.__forkNativeListReceived);
  await page.locator('#recent-toggle').click();await row(page,childId).waitFor();await page.evaluate(()=>window.__releaseForkNativeList());await page.waitForFunction(()=>window.__delayedForkListSettled);assert.equal(await page.evaluate(()=>state.archived),false);assert.equal(await row(page,childId).count(),1);assert.equal(await page.locator('#thread-list-label').innerText(),'最近会话');return{genuineNativeResultDelayed:true,currentArchiveSelectionPreserved:true,noDuplicateRows:true};
 });
 await check('永久删除移除原生历史和索引，原父会话保留',async()=>{
  await search(childName);await chooseChild();await page.locator('#thread-action').selectOption('delete');await page.getByRole('heading',{name:'永久删除会话',exact:true}).waitFor();await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>!state.thread);await page.waitForFunction(id=>!state.threads.some(t=>t.id===id),childId);deleted=true;assert(!(await index()).threadIds.includes(childId));
  let absent=false;try{await call(page,'thread/read',{threadId:childId,includeTurns:false});}catch(error){assert(/thread not loaded|thread not found|no rollout|cannot find/i.test(error.message));absent=true;}assert(absent);
  const actualParent=(await call(page,'thread/read',{threadId:parentId,includeTurns:false})).thread;assert.equal(actualParent.id,parentBefore.id);assert.equal(actualParent.name??null,parentBefore.name);assert.equal(actualParent.preview.length,parentBefore.previewLength);assert.equal(actualParent.updatedAt,parentBefore.updatedAt);await page.evaluate(()=>showView('chat'));await screenshot('deleted');return{nativeChildReadFails:true,indexRetired:true,parentMetadataUnchanged:true};
 });
 assert.equal(requests.filter(r=>r.method==='turn/start').length,0);assert.equal(errors.length,0);
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{
 if(childId&&!deleted&&page&&!page.isClosed()){
  try{await call(page,'thread/delete',{threadId:childId});deleted=true;results.push({name:'失败后仅清理本次创建的子分叉',status:'passed',evidence:{childDeleted:true}});}catch(error){results.push({name:'测试子分叉清理',status:'failed',error:error.message});}
 }
 save();await browser.close();console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,modelRequests:requests.filter(r=>r.method==='turn/start').length,browserErrors:errors}));
}
