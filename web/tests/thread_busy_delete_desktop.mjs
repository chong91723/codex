// Real two-page native writer ownership and visible permanent-delete controls.
// Only fresh user-only storage fixtures are created; no model/tool turn is sent.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {openThreadMenu,threadAction} from './thread_menu_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const run=promisify(execFile),base=process.env.CODEX_WEB_URL,home=process.env.CODEX_TEST_HOME,workspace=process.env.CODEX_TEST_WORKSPACE;
assert(base&&home?.startsWith('/tmp/')&&workspace?.startsWith('/tmp/'),'Explicit independent /tmp instance required');
const out=path.resolve(process.env.REPORT_DIR||'test-results/session-actions-2026-10-27/busy-delete');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
let owner=await browser.newPage({viewport:{width:1440,height:960}}),observer=await browser.newPage({viewport:{width:1440,height:960}});
const calls=[],receipts=[],results=[],errors=[],cleanup=[],owned=new Set(),nonce='BUSY_DELETE_OWN_'+Date.now();
let seed,target,historyPath,historyBefore,fatalError=null;
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rpc=(page,method,params)=>page.evaluate(({method,params})=>rpc(method,params),{method,params});
const ready=page=>page.waitForFunction(()=>state.ready&&state.models.length&&!state.threadLoading,null,{timeout:60000});
const row=(page,id)=>page.locator(`.thread-row[data-thread-id="${id}"]`);
const snapshot=page=>page.evaluate(()=>({id:state.thread?.id,busy:state.threadBusy,generation:state.navigationGeneration,url:location.href,text:document.querySelector('#prompt').value,cwd:state.selectedCwd,model:document.querySelector('#model').value}));
function observe(page,origin){
 const pending=new Map();page.on('pageerror',error=>errors.push({origin,message:error.message}));
 page.on('websocket',socket=>{if(!socket.url().includes('/ws/rpc'))return;
  socket.on('framesent',frame=>{try{const value=JSON.parse(String(frame.payload));if(value.method){const call={origin,method:value.method,threadId:value.params?.threadId||null};calls.push(call);if(value.id!=null)pending.set(String(value.id),call);}}catch{}});
  socket.on('framereceived',frame=>{try{const value=JSON.parse(String(frame.payload)),call=pending.get(String(value.id));if(call&&value.id!=null){if(['thread/delete','thread/resume'].includes(call.method))receipts.push({...call,...(value.error?{error:value.error}:{resultThreadId:value.result?.thread?.id||null})});pending.delete(String(value.id));}}catch{}});
 });
}
observe(owner,'owner');observe(observer,'observer');
const modelCalls=()=>calls.filter(call=>['turn/start','turn/steer','review/start','thread/compact/start'].includes(call.method));
const deleteCalls=()=>calls.filter(call=>call.origin==='observer'&&call.method==='thread/delete'&&call.threadId===target);
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({origin:'Real browser pages each own a genuine native app-server connection. Fresh user-only native storage fixtures, no generated Agent answer, zero model requests. Only this run\'s owner page is closed; existing pages/processes are not touched.',base,home,workspace,results,calls,receipts,browserErrors:errors,fatalError,cleanup,modelRequests:calls.filter(call=>call.method==='turn/start').length},null,2)+'\n');
async function check(name,run){try{results.push({name,status:'passed',evidence:await run()});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:error.message});if(observer&&!observer.isClosed())await observer.screenshot({path:path.join(out,'failure-'+results.length+'.png')}).catch(()=>{});throw error;}finally{save();}}
async function assertInstance(page){assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),home);assert.equal(await page.evaluate(()=>state.status.workspace),workspace);}
async function select(page,id){await row(page,id).locator('[data-thread-open]').click();await page.waitForFunction(id=>state.thread?.id===id&&!state.threadLoading,id,{timeout:45000});}
const lockProbe=`import fcntl,json,pathlib,sys,time
p=pathlib.Path(sys.argv[1]);wait=sys.argv[2]=='wait';deadline=time.monotonic()+20
while True:
 try:f=p.open('rb')
 except FileNotFoundError:print(json.dumps({'released':True,'lockFilePresent':False}));break
 with f:
  try:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB);released=True
  except BlockingIOError:released=False
 if released or not wait:print(json.dumps({'released':released,'lockFilePresent':True}));break
 if time.monotonic()>deadline:raise TimeoutError('Own writer did not release after closing own browser page')
 time.sleep(.05)
`;
async function probeOwnLock(wait=false,id=target){assert(owned.has(id));return JSON.parse((await run('python3',['-c',lockProbe,path.join(home,'thread-writer-locks',id+'.lock'),wait?'wait':'once'])).stdout);}
try{
 await owner.goto(base);await ready(owner);await assertInstance(owner);await observer.goto(base);await ready(observer);await assertInstance(observer);
 await check('新建自有用户存储分叉并在owner打开，零模型请求',async()=>{
  seed=(await rpc(owner,'thread/start',{cwd:workspace,model:'deepseek-flash'})).thread.id;owned.add(seed);
  await rpc(owner,'thread/inject_items',{threadId:seed,items:[{type:'message',role:'user',content:[{type:'input_text',text:nonce+' storage-only user fixture; no model answer requested.'}]}]});
  target=(await rpc(owner,'thread/fork',{threadId:seed,model:'deepseek-flash'})).thread.id;owned.add(target);
  await rpc(owner,'thread/inject_items',{threadId:target,items:[{type:'message',role:'user',content:[{type:'input_text',text:nonce+' owned child storage fixture.'}]}]});
  await rpc(owner,'thread/name/set',{threadId:target,name:nonce});await owner.evaluate(()=>loadThreads());await select(owner,target);assert.equal(await owner.evaluate(()=>state.threadBusy),false);
  await owner.locator('#prompt').fill(nonce+'_OWNER_UNSENT');const meta=(await rpc(owner,'thread/read',{threadId:target,includeTurns:false})).thread;historyPath=meta.path;assert(historyPath.startsWith(home+'/sessions/'));assert(fs.readFileSync(historyPath,'utf8').includes(nonce));historyBefore=digest(historyPath);assert.equal((await probeOwnLock()).released,false);assert.equal(modelCalls().length,0);
  return{seed,target,persistedUserOnlyHistory:true,ownerWriterLocked:true,newModelRequests:0};
 });
 await check('observer实际恢复被writer拒绝后只读展示，删除入口仍可点开说明',async()=>{
  const url=new URL(base);url.searchParams.set('thread',target);await observer.goto(url.href);await ready(observer);await assertInstance(observer);await observer.waitForFunction(id=>state.thread?.id===id&&state.threadBusy&&!state.threadLoading,target,{timeout:60000});
  assert(await observer.locator('#prompt').isEnabled());assert(await observer.locator('#send').isDisabled());assert(await observer.locator('#composer-status').isVisible());assert.match(await observer.locator('#composer-status').innerText(),/占用.*只读/);assert.match(await observer.locator('#prompt').getAttribute('placeholder'),/只读/);await observer.locator('#prompt').fill(nonce+'_OBSERVER_UNSENT');await observer.locator('#prompt').press('Enter');assert.equal(modelCalls().length,0);assert.equal(await observer.locator('#prompt').inputValue(),nonce+'_OBSERVER_UNSENT');assert(await observer.locator('#send').isDisabled());assert(receipts.some(receipt=>receipt.origin==='observer'&&receipt.method==='thread/resume'&&receipt.threadId===target&&/active writer/i.test(receipt.error?.message||'')));
  const menu=await openThreadMenu(observer,{threadId:target,via:'contextmenu'});assert(await menu.locator('[data-thread-action=delete]').isEnabled());await observer.screenshot({path:path.join(out,'busy-delete-menu-enabled.png')});await observer.keyboard.press('Escape');assert.equal(modelCalls().length,0);
  return{threadId:target,genuineResumeWriterRejection:true,readOnlyHistory:true,commandInputEnabledButNormalChatStillBlocked:true,unsentObserverTextPreserved:true,deleteCanExplainAndRetry:true};
 });
 await check('占用时取消永久删除不发送请求、不删除历史、不打断owner草稿',async()=>{
  const before=deleteCalls().length,original=await snapshot(owner);await threadAction(observer,'delete',{threadId:target});await observer.getByRole('heading',{name:'永久删除会话',exact:true}).waitFor();const explanation=await observer.locator('#dialog-body').innerText();assert(explanation.includes(nonce));assert.match(explanation,/其他页面|Codex.*进程/);assert.match(explanation,/关闭|重试/);await observer.locator('#dialog-cancel').click();assert.equal(deleteCalls().length,before);assert.equal(digest(historyPath),historyBefore);assert.deepEqual(await snapshot(owner),original);assert.equal((await probeOwnLock()).released,false);
  return{cancelDeleteRequests:0,ownHistoryUnchanged:true,ownerDraftAndWriterPreserved:true};
 });
 await check('确认后原生拒绝删除，弹窗持久说明未删除并可重试',async()=>{
  const original=await snapshot(owner),before=deleteCalls().length;await threadAction(observer,'delete',{threadId:target});await observer.locator('#dialog-submit').click();const alert=observer.locator('#dialog-body .thread-removal-error[role=alert]');await alert.waitFor({state:'visible'});await observer.waitForFunction(()=>!document.querySelector('#dialog-submit').disabled);
  assert.equal(deleteCalls().length,before+1);assert(receipts.some(receipt=>receipt.origin==='observer'&&receipt.method==='thread/delete'&&receipt.threadId===target&&/active writer/i.test(receipt.error?.message||'')));assert.match(await alert.innerText(),/未删除|尚未删除/);assert.match(await alert.innerText(),/其他页面|Codex.*进程|active writer/i);assert(await observer.locator('#dialog').isVisible());assert(await observer.locator('#dialog-submit').isEnabled());assert.equal(digest(historyPath),historyBefore);assert.equal((await rpc(observer,'thread/read',{threadId:target,includeTurns:false})).thread.id,target);assert(await alert.isVisible());assert.deepEqual(await snapshot(owner),original);assert.equal((await probeOwnLock()).released,false);assert.equal(modelCalls().length,0);await observer.screenshot({path:path.join(out,'native-rejection-keeps-delete-dialog.png')});
  return{genuineDeleteRejection:true,exactlyOneNativeRequest:true,persistentVisibleError:true,ownHistoryUnchanged:true,ownerNotInterrupted:true,noFalseSuccess:true};
 });
 await check('只关闭本测试owner页面，observer不重开会话即可原地重试删除成功',async()=>{
  const original=await snapshot(observer),before=deleteCalls().length,start=calls.length;await owner.close();owner=null;const release=await probeOwnLock(true);assert(release.released);assert.deepEqual(await snapshot(observer),original);assert(await observer.locator('#dialog-body .thread-removal-error[role=alert]').isVisible());assert(await observer.locator('#dialog-submit').isEnabled());
  await observer.locator('#dialog-submit').click();await observer.locator('#dialog').waitFor({state:'hidden'});await observer.waitForFunction(()=>!state.thread);assert.equal(deleteCalls().length,before+1);assert.equal(calls.slice(start).filter(call=>call.origin==='observer'&&call.method==='thread/resume').length,0);assert(!fs.existsSync(historyPath));
  await assert.rejects(()=>rpc(observer,'thread/read',{threadId:target,includeTurns:false}),/not found|thread not loaded|no rollout|cannot find/i);assert.equal((await rpc(observer,'thread/read',{threadId:seed,includeTurns:false})).thread.id,seed);assert.equal(modelCalls().length,0);owned.delete(target);cleanup.push({id:target,removed:true,through:'visible retry in same native-confirmation dialog'});await observer.screenshot({path:path.join(out,'retry-after-own-writer-release-deleted.png')});
  return{closedOnlyOwnOwnerPage:true,waitedForOwnNativeLockRelease:release,zeroObserverResumeRequests:true,exactlyOneRetryRequest:true,targetHistoryActuallyRemoved:true,otherOwnConversationPreserved:true,newModelRequests:0};
 });
 assert.equal(errors.length,0);assert.equal(modelCalls().length,0);
}catch(error){fatalError=error.stack||String(error);console.error(fatalError);process.exitCode=1;}
finally{
 if(owner&&!owner.isClosed())await owner.close().catch(()=>{});
 if(observer&&!observer.isClosed())for(const id of [...owned].reverse()){
  try{await probeOwnLock(true,id);await rpc(observer,'thread/delete',{threadId:id});cleanup.push({id,removed:true,through:'own storage-only fixture cleanup'});owned.delete(id);}catch(error){cleanup.push({id,removed:false,error:error.message});process.exitCode=1;}
 }
 save();await browser.close();console.log(JSON.stringify({passed:results.filter(result=>result.status==='passed').length,failed:results.filter(result=>result.status==='failed').length,modelRequests:calls.filter(call=>call.method==='turn/start').length,browserErrors:errors,cleanup}));
 if(results.length!==5||results.some(result=>result.status==='failed')||cleanup.some(result=>!result.removed)||errors.length||modelCalls().length)process.exitCode=1;
}
