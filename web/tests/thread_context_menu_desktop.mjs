import {imageFixture} from './image_fixture.mjs';
// Sidebar ownership, keyboard and storage regressions. User-only native fixtures,
// genuine app-server results, zero Agent/model requests and no user conversations.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {openThreadMenu,threadAction} from './thread_menu_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL,home=process.env.CODEX_TEST_HOME,workspace=process.env.CODEX_TEST_WORKSPACE;
assert(base&&home?.startsWith('/tmp/')&&workspace?.startsWith('/tmp/'),'Explicit independent /tmp test instance required');
const out=path.resolve(process.env.REPORT_DIR||'test-results/sidebar-menu-2026-10-27/context-menu');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true});
const calls=[],results=[],errors=[],cleanup=[],owned=new Set(),nonce='SIDEBAR_ONLY_'+Date.now();
let a,b,c,child,baseline;
const row=id=>page.locator(`.thread-row[data-thread-id="${id}"]`);
const menu=()=>page.locator('#thread-context-menu[role="menu"]');
const rpc=(method,params)=>page.evaluate(({method,params})=>rpc(method,params),{method,params});
const ready=()=>page.waitForFunction(()=>state.ready&&state.models.length&&!state.threadLoading,null,{timeout:60000});
const read=async id=>(await rpc('thread/read',{threadId:id,includeTurns:false})).thread;
const snapshot=()=>page.evaluate(()=>({id:state.thread?.id||null,composerKey:state.composerKey,text:document.querySelector('#prompt').value,attachments:state.attachments.map(value=>({name:value.name,input:value.input})),cwd:state.selectedCwd,project:state.selectedProject,model:document.querySelector('#model').value,effort:document.querySelector('#effort').value,url:location.href,generation:state.navigationGeneration,view:state.view}));
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({origin:'Real native storage API, visible sidebar context/ellipsis menu and genuine response gates. User-only storage fixtures; no simulated Agent answers, successful events or new model requests.',base,home,workspace,results,calls,browserErrors:errors,cleanup},null,2)+'\n');
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{if(!socket.url().includes('/ws/rpc'))return;socket.on('framesent',frame=>{try{const value=JSON.parse(String(frame.payload));if(value.method)calls.push({method:value.method,threadId:value.params?.threadId||null});}catch{}});});
async function check(name,run){try{const evidence=await run();results.push({name,status:'passed',evidence});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:error.message});await page.screenshot({path:path.join(out,'failure-'+results.length+'.png')}).catch(()=>{});throw error;}finally{save();}}
async function choose(id){await row(id).locator('[data-thread-open]').click();await page.waitForFunction(id=>state.thread?.id===id&&!state.threadLoading,id,{timeout:45000});}
async function notFound(id){try{await read(id);return false;}catch(error){assert.match(error.message,/not found|thread not loaded|no rollout|cannot find/i);return true;}}
function assertNoTaskOrNavigation(start){assert.deepEqual(calls.slice(start).filter(value=>['thread/resume','turn/start','turn/interrupt','review/start','thread/compact/start','thread/revert'].includes(value.method)),[]);}
async function assertUnchanged(){assert.deepEqual(await snapshot(),baseline);}
async function gate(method){await page.evaluate(method=>{const actual=rpc;window.__menuGate={method,held:false,attempts:0,releases:[]};rpc=function(name,...args){if(name!==method)return actual(name,...args);window.__menuGate.attempts++;return actual(name,...args).then(value=>new Promise(resolve=>{window.__menuGate.held=true;window.__menuGate.releases.push(()=>resolve(value));}));};window.__releaseMenuGate=()=>{rpc=actual;for(const release of window.__menuGate.releases)release();window.__menuGate.releases=[];};},method);}
async function release(){await page.evaluate(()=>window.__releaseMenuGate?.());}
try{
 await page.goto(base);await ready();assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),home);assert.equal(await page.evaluate(()=>state.status.workspace),workspace);
 await check('在独立原生存储中建立三个仅用户消息的会话，不调用模型',async()=>{
  // Native thread/list intentionally omits new non-fork empty-preview records.
  // Forks use the already-supported real discovery path without a model turn.
  const seed=(await rpc('thread/start',{cwd:workspace,model:'deepseek-flash'})).thread.id;owned.add(seed);
  await rpc('thread/inject_items',{threadId:seed,items:[{type:'message',role:'user',content:[{type:'input_text',text:nonce+'_SEED storage-only user fixture, no Agent answer requested.'}]}]});
  const ids=[];for(const label of ['A','B','C']){const id=(await rpc('thread/fork',{threadId:seed,model:'deepseek-flash'})).thread.id;owned.add(id);ids.push(id);await rpc('thread/inject_items',{threadId:id,items:[{type:'message',role:'user',content:[{type:'input_text',text:nonce+'_'+label+' storage-only user fixture, no Agent answer requested.'}]}]});await rpc('thread/name/set',{threadId:id,name:nonce+'_'+label});}
  [a,b,c]=ids;await rpc('thread/archive',{threadId:c});await page.evaluate(()=>loadThreads());await choose(a);
  await page.locator('#prompt').fill(nonce+'_A_UNSENT');await page.locator('#file-input').setInputFiles(imageFixture('sidebar-draft-a.png'));await page.waitForFunction(()=>!state.attachmentLoads&&state.attachments.length===1);baseline=await snapshot();
  assert.equal(calls.filter(value=>value.method==='turn/start').length,0);return{ownedUserOnlyThreadIds:ids,archivedFixture:c,newModelRequests:0};
 });
 await check('页面右上操作入口已移至侧栏，每行主按钮与菜单按钮互为兄弟',async()=>{
  assert.equal(await page.locator('#thread-action').count(),0);assert.equal(await page.locator('#thread-restore').count(),0);
  for(const id of [a,b]){assert.equal(await row(id).locator('button.thread-open[data-thread-open]').count(),1);assert.equal(await row(id).locator('button.menu-trigger[data-thread-menu]').count(),1);assert.equal(await row(id).locator('button button').count(),0);}
  return{oldPageActionsAbsent:true,noNestedButtons:true,eachThreadHasAccessibleMenu:true};
 });
 await check('右键非当前会话不切换会话、工作区、模型、草稿或附件',async()=>{
  const start=calls.length;await openThreadMenu(page,{threadId:b,via:'contextmenu'});assert.equal(await menu().getAttribute('data-thread-id'),b);await assertUnchanged();assertNoTaskOrNavigation(start);
  for(const action of ['compact','fork','export','review','revert'])assert.equal(await menu().locator(`[data-thread-action="${action}"]`).count(),0);
  for(const action of ['rename','archive','delete'])assert(await menu().locator(`[data-thread-action="${action}"]`).isEnabled());
  await page.keyboard.press('Escape');await menu().waitFor({state:'hidden'});await assertUnchanged();
  assert.equal(await page.evaluate(()=>document.activeElement.closest('[data-thread-id]')?.dataset.threadId),b);
  return{targetId:b,selectedId:a,unsentTextAndAttachmentPreserved:true,zeroResumeInterruptOrTurnRequests:true,sessionCommandsBelongToComposer:true,escapeRestoresRowFocus:true};
 });
 await check('省略号、Shift+F10及方向键可操作菜单，关闭后焦点回到所属会话',async()=>{
  await row(a).locator('[data-thread-open]').focus();await page.keyboard.press('Shift+F10');await menu().waitFor({state:'visible'});assert.equal(await menu().getAttribute('data-thread-id'),a);
  for(const key of ['ArrowDown','ArrowUp','Home','End']){await page.keyboard.press(key);assert(await page.evaluate(()=>document.activeElement.matches('#thread-context-menu [role="menuitem"]:not(:disabled)')));}
  await page.keyboard.press('Escape');await menu().waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement.closest('[data-thread-id]')?.dataset.threadId),a);
  await row(b).locator('[data-thread-menu]').focus();await page.keyboard.press('Enter');await menu().waitFor({state:'visible'});assert.equal(await menu().getAttribute('data-thread-id'),b);await page.locator('#page-title').click();await menu().waitFor({state:'hidden'});await assertUnchanged();
  return{shiftF10:true,arrowAndHomeEnd:true,ellipsisEnter:true,outsideClickDismisses:true,ownershipAndDraftPreserved:true};
 });
 await check('非当前重命名精准提交，原生响应等待期间重复确认不重复执行',async()=>{
  const start=calls.length;await threadAction(page,'rename',{threadId:b});assert.equal(await page.locator('#dialog-value').inputValue(),nonce+'_B');await page.locator('#dialog-value').fill(nonce+'_B_RENAMED');await gate('thread/name/set');await page.locator('#dialog-submit').click();await page.waitForFunction(()=>window.__menuGate.held);assert(await page.locator('#dialog-submit').isDisabled());
  // Two form submissions can arrive before a slow server response. The second
  // dispatch exercises the guard; all responses still originate from native.
  await page.locator('#dialog-form').dispatchEvent('submit',{bubbles:true,cancelable:true});assert.equal(await page.evaluate(()=>window.__menuGate.attempts),1);
  await page.locator('#dialog-cancel').click();await openThreadMenu(page,{threadId:b});assert.equal(await menu().locator('[role=menuitem]:not(:disabled)').count(),0);await page.keyboard.press('Escape');await menu().waitFor({state:'hidden'});
  await openThreadMenu(page,{threadId:b});await page.keyboard.press('Tab');await menu().waitFor({state:'hidden'});await release();await page.locator('#dialog').waitFor({state:'hidden'});await row(b).filter({hasText:nonce+'_B_RENAMED'}).waitFor();assert.equal((await read(b)).name,nonce+'_B_RENAMED');assert.equal((await read(a)).name,nonce+'_A');await assertUnchanged();assertNoTaskOrNavigation(start);assert.equal(calls.slice(start).filter(value=>value.method==='thread/name/set'&&value.threadId===b).length,1);
  return{renamedTargetId:b,currentThreadUnchanged:true,genuineNativeResponseHeld:true,duplicateFormSubmissionIgnored:true,allDisabledPendingMenuEscapeAndTabDismiss:true,newModelRequests:0};
 });
 await check('归档非当前会话保留真实历史，不改变当前选中会话和草稿',async()=>{
  const start=calls.length;await threadAction(page,'archive',{threadId:b});await page.waitForFunction(id=>!state.threads.some(thread=>thread.id===id),b);const stored=await read(b);assert(stored.path.startsWith(home+'/archived_sessions/'));assert(fs.readFileSync(stored.path,'utf8').includes(nonce+'_B'));await assertUnchanged();assertNoTaskOrNavigation(start);
  return{archivedTargetId:b,nativeArchivedFileExists:true,userRecordPreserved:true,currentThreadAndDraftUntouched:true};
 });
 await check('已归档行只提供恢复，恢复非当前会话不导航、不抢当前输入',async()=>{
  await page.locator('#archive-toggle').click();await row(c).waitFor();const start=calls.length;await openThreadMenu(page,{threadId:c});assert.equal(await menu().locator('[data-thread-action=archive]').count(),0);assert(await menu().locator('[data-thread-action=unarchive]').isEnabled());for(const action of ['compact','fork','export','review','revert'])assert.equal(await menu().locator(`[data-thread-action="${action}"]`).count(),0);
  await menu().locator('[data-thread-action=unarchive]').click();await menu().waitFor({state:'hidden'});await page.waitForFunction(id=>!state.threads.some(thread=>thread.id===id),c);assert((await read(c)).path.startsWith(home+'/sessions/'));await assertUnchanged();assertNoTaskOrNavigation(start);
  return{restoredTargetId:c,archiveActionAbsent:true,composerCommandsAbsentFromArchivedRows:true,zeroResumeRequests:true,selectedThreadRemains:a};
 });
 await check('非当前归档会话永久删除可取消，确认后仅删除目标原生历史',async()=>{
  const start=calls.length;await threadAction(page,'delete',{threadId:b});const description=await page.locator('#dialog-body').innerText();assert(description.includes(nonce+'_B_RENAMED'));assert(description.includes('无法撤销'));assert(!description.includes(nonce+'_A_UNSENT'));await page.locator('#dialog-cancel').click();assert.equal(calls.slice(start).filter(value=>value.method==='thread/delete').length,0);assert.equal(await notFound(b),false);await assertUnchanged();
  await threadAction(page,'delete',{threadId:b});await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});await page.waitForFunction(id=>!state.threads.some(thread=>thread.id===id),b);assert(await notFound(b));owned.delete(b);cleanup.push({id:b,removed:true,through:'visible non-current permanent-delete menu'});assert.equal(await notFound(a),false);assert.equal(await notFound(c),false);await assertUnchanged();assertNoTaskOrNavigation(start);
  return{cancelMakesZeroDeleteRequests:true,confirmedNativeTargetDeleted:b,currentThreadAndDraftPreserved:true,otherNativeConversationPreserved:true};
 });
 await check('桌面尺寸和深色菜单不越界，主页面不被会话管理操作遮挡',async()=>{
  await page.locator('#recent-toggle').click();await row(c).waitFor();
  // Presentation-only scroll content. It is never sent to native/model storage.
  await page.evaluate(()=>{const view=document.querySelector('#view-chat'),welcome=document.querySelector('#welcome');window.__menuScrollPresentation={empty:view.classList.contains('empty'),welcomeHidden:welcome.hidden};view.classList.remove('empty');welcome.hidden=true;const fixture=document.createElement('div');fixture.dataset.menuScrollFixture='';fixture.textContent='仅用于菜单滚动布局检查，非会话消息。';fixture.style.height='1800px';document.querySelector('#messages').append(fixture);});
  await openThreadMenu(page,{threadId:c,via:'contextmenu'});
  await page.evaluate(()=>{const scroller=document.querySelector('#conversation-scroll');window.__menuConversationScrolled=false;scroller.addEventListener('scroll',()=>window.__menuConversationScrolled=true,{once:true});scroller.scrollTop=scroller.scrollTop>100?0:120;});
  await page.waitForFunction(()=>window.__menuConversationScrolled);assert(await menu().isVisible(),'Conversation scrolling must not dismiss a menu anchored to the stationary sidebar');await page.keyboard.press('Escape');await page.evaluate(()=>{document.querySelector('[data-menu-scroll-fixture]').remove();document.querySelector('#view-chat').classList.toggle('empty',window.__menuScrollPresentation.empty);document.querySelector('#welcome').hidden=window.__menuScrollPresentation.welcomeHidden;});
  if(await page.locator('#toast').isVisible())await page.locator('#toast .toast-close').click();
  const dimensions=[];for(const viewport of [{width:1024,height:768},{width:1280,height:720},{width:1440,height:960}]){await page.setViewportSize(viewport);await openThreadMenu(page,{threadId:c,via:'contextmenu'});const box=await menu().boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height,JSON.stringify({viewport,box}));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'sidebar-menu-'+viewport.width+'.png')});dimensions.push({viewport,menu:box});await page.keyboard.press('Escape');}
  await page.locator('#theme-toggle').click();await openThreadMenu(page,{threadId:c});await page.screenshot({path:path.join(out,'sidebar-menu-dark.png')});await page.keyboard.press('Escape');await page.locator('#theme-toggle').click();await assertUnchanged();return{dimensions,darkThemeChecked:true,noPageWideOverflow:true,conversationScrollDoesNotDismissSidebarMenu:true,scrollPresentationFixtureOnly:true};
 });
 await check('当前会话永久删除清除自身草稿，其他会话仍可正常选择',async()=>{
  await threadAction(page,'delete',{threadId:a});await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>!state.thread&&!state.threadLoading);assert(await notFound(a));owned.delete(a);cleanup.push({id:a,removed:true,through:'visible current permanent-delete menu'});assert.equal(await page.evaluate(id=>state.composers.has(id),a),false);assert.equal(await page.evaluate(id=>Object.hasOwn(JSON.parse(sessionStorage.getItem('codex.drafts')||'{}'),id),a),false);await choose(c);assert.equal(await page.evaluate(()=>state.thread.id),c);assert.equal(calls.filter(value=>['turn/start','turn/steer','turn/interrupt','review/start','thread/compact/start'].includes(value.method)).length,0);assert.equal(errors.length,0);
  return{currentNativeHistoryDeleted:true,deletedDraftAndAttachmentsRemoved:true,otherConversationSelectable:true,newModelRequests:0,browserErrors:0};
 });
}catch(error){if(!results.some(value=>value.status==='failed'))results.push({name:'浏览器或测试环境初始化',status:'failed',error:error.message});console.error(error.stack);process.exitCode=1;}
finally{
 await release().catch(()=>{});if(await page.locator('#dialog[open]').count())await page.locator('#dialog-cancel').click().catch(()=>{});
 for(const id of [...owned].reverse()){try{await rpc('thread/delete',{threadId:id});cleanup.push({id,removed:true,through:'owned fixture cleanup'});}catch(error){cleanup.push({id,removed:false,error:error.message});process.exitCode=1;}}
 save();await browser.close();console.log(JSON.stringify({passed:results.filter(value=>value.status==='passed').length,failed:results.filter(value=>value.status==='failed').length,browserErrors:errors,cleanup}));
}
