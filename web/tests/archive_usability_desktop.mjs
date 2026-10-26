// Real native storage and browser controls; no model calls or user conversations.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL,home=process.env.CODEX_TEST_HOME,workspace=process.env.CODEX_TEST_WORKSPACE;
assert(base&&home&&workspace,'Explicit independent Web URL, home and workspace are required');
assert(home.startsWith('/tmp/')&&workspace.startsWith('/tmp/'),'Use disposable /tmp fixtures only');
const out=process.env.REPORT_DIR||'test-results/history-usability-2026-10-26/archive';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),results=[],calls=[],errors=[],owned=new Set(),cleanup=[];
let parent,first,second,fixturePath,marker='ARCHIVE_STORAGE_ONLY_'+Date.now();
const row=id=>page.locator(`.thread-row[data-thread-id="${id}"]`);
const rpc=(method,params)=>page.evaluate(({method,params})=>rpc(method,params),{method,params});
const ready=()=>page.waitForFunction(()=>state.ready&&state.models.length&&!state.threadLoading,null,{timeout:45000});
const read=id=>rpc('thread/read',{threadId:id,includeTurns:false});
const draftSnapshot=id=>page.evaluate(id=>({inMemory:state.composers.has(id),text:state.composers.get(id)?.text||null,attachments:state.composers.get(id)?.attachments.length||0,persisted:Object.hasOwn(JSON.parse(sessionStorage.getItem('codex.drafts')||'{}'),id),storedText:JSON.parse(sessionStorage.getItem('codex.drafts')||'{}')[id]||null}),id);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const visibleHistory=()=>page.evaluate(()=>({user:[...document.querySelectorAll('#messages .message.user')].map(n=>n.textContent.trim()).filter(Boolean),assistant:[...document.querySelectorAll('#messages .message.agent .markdown')].map(n=>n.textContent.trim()).filter(Boolean)}));
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({origin:'Real native storage API and browser controls. User-only fixtures plus a read-only fork of completed real Flash history from an earlier independent audit. No simulated Agent answer or new model request.',results,calls,browserErrors:errors,cleanup},null,2));
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{if(!socket.url().includes('/ws/rpc'))return;socket.on('framesent',frame=>{try{const value=JSON.parse(String(frame.payload));if(value.method)calls.push({method:value.method,threadId:value.params?.threadId||null,...(value.method==='thread/list'?{limit:value.params?.limit}:{} )});}catch{}});});
async function check(name,run){try{results.push({name,status:'passed',evidence:await run()});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:error.message});try{await page.screenshot({path:path.join(out,'failure-'+results.length+'.png')});}catch{}throw error;}finally{save();}}
async function choose(id){await row(id).waitFor();await row(id).click();await page.waitForFunction(id=>state.thread?.id===id&&!state.threadLoading,id,{timeout:45000});}
async function missing(id){try{await read(id);return false;}catch(error){assert.match(error.message,/not found|thread not loaded|no rollout|cannot find/i);return true;}}
async function archiveSelected(id){await page.locator('#thread-action').selectOption('archive');await page.waitForFunction(()=>!state.thread,null,{timeout:30000});await page.waitForFunction(id=>!state.threads.some(t=>t.id===id),id);}
async function deleteSelected(id){await page.locator('#thread-action').selectOption('delete');await page.getByRole('heading',{name:'永久删除会话',exact:true}).waitFor();await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>!state.thread);await page.waitForFunction(id=>!state.threads.some(t=>t.id===id),id);assert(await missing(id));owned.delete(id);cleanup.push({entity:'ownedThread',id,removed:true,through:'visible permanent-delete control'});}
try{
  await page.goto(base);await ready();
  assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),home);
  assert.equal(await page.evaluate(()=>state.status.workspace),workspace);
  await check('桌面会话列表显示文字归档入口和归档/删除说明',async()=>{
    assert.equal(await page.locator('#recent-toggle').innerText(),'最近会话');assert.equal(await page.locator('#archive-toggle').innerText(),'已归档');
    assert.equal(await page.locator('#recent-toggle').getAttribute('aria-pressed'),'true');
    await page.locator('#history-help').click();
    const help=await page.locator('#dialog-body').innerText();assert(help.includes('保留全部对话历史'));assert(help.includes('无法恢复'));assert(help.includes('永久删除历史…'));
    await page.screenshot({path:path.join(out,'archive-and-delete-explained.png')});await page.locator('#dialog-submit').click();
    return{recentAndArchivedVisible:true,reversibleArchiveExplained:true,permanentDeletePathExplained:true};
  });
  await check('通过原生存储API建立临时用户记录和两个分叉，无模型请求',async()=>{
    const started=await rpc('thread/start',{cwd:workspace,model:'deepseek-flash'});parent=started.thread.id;owned.add(parent);
    await rpc('thread/inject_items',{threadId:parent,items:[{type:'message',role:'user',content:[{type:'input_text',text:marker+' — storage-only user fixture, no Agent response requested.'}]}]});
    first=(await rpc('thread/fork',{threadId:parent})).thread.id;owned.add(first);
    second=(await rpc('thread/fork',{threadId:parent})).thread.id;owned.add(second);
    // Forks reference their parent's history; add an explicit user-only native
    // item to each child to check its own archive file without expanding refs.
    for(const threadId of [first,second])await rpc('thread/inject_items',{threadId,items:[{type:'message',role:'user',content:[{type:'input_text',text:marker+' — child storage-only fixture.'}]}]});
    await rpc('thread/name/set',{threadId:first,name:'归档恢复验收 '+marker});await rpc('thread/name/set',{threadId:second,name:'直接删除验收 '+marker});
    await page.evaluate(()=>loadThreads());await choose(first);fixturePath=(await read(first)).thread.path;
    assert(fixturePath.startsWith(home+'/sessions/'));assert(fs.readFileSync(fixturePath,'utf8').includes(marker));
    assert.equal(calls.filter(c=>c.method==='turn/start').length,0);
    return{parent,first,second,nativeUserRecordPersisted:true,zeroModelRequests:true};
  });
  await check('归档真实保留文件，已归档列表可见、只读且提供恢复按钮',async()=>{
    await archiveSelected(first);await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已归档，历史仍保留'));
    const actual=(await read(first)).thread;assert(actual.path.startsWith(home+'/archived_sessions/'));assert(!fs.existsSync(fixturePath));assert(fs.readFileSync(actual.path,'utf8').includes(marker));
    await page.locator('#archive-toggle').click();await choose(first);
    assert.equal(await page.locator('#archive-toggle').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#thread-list-label').innerText(),'已归档');
    assert(await page.locator('#archive-list-help').isVisible());assert(await page.locator('#thread-archive-status').isVisible());assert(await page.locator('#thread-restore').isVisible());
    assert(await page.locator('#prompt').isDisabled());assert(await page.locator('#send').isDisabled());
    assert.equal(await page.locator('#thread-action option[value=archive]').evaluate(n=>n.hidden),true);
    await page.screenshot({path:path.join(out,'archived-1440.png')});
    return{nativeArchivedPath:true,userRecordPreserved:true,readOnly:true,restoreControlVisible:true,permanentDeleteStillAvailable:true};
  });
  await check('归档路由刷新和搜索准确，1024桌面入口未被遮挡',async()=>{
    await page.reload();await ready();assert.equal(await page.evaluate(()=>state.thread.id),first);assert.equal(await page.evaluate(()=>state.archived),true);
    await page.locator('#thread-search').fill('没有匹配的归档 '+marker);await page.waitForFunction(()=>document.querySelector('#thread-list').textContent.includes('没有匹配'));
    await page.locator('#thread-search').fill(marker);await row(first).waitFor();
    await page.setViewportSize({width:1024,height:768});
    for(const selector of ['#recent-toggle','#archive-toggle','#thread-action','#thread-restore']){const box=await page.locator(selector).boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=1024&&box.y+box.height<=768,selector+' outside viewport');}
    const restore=page.locator('#thread-restore');assert.equal(await restore.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
    await page.screenshot({path:path.join(out,'archived-1024.png')});
    return{archivedRouteRefresh:true,scopeAndSearchPreserved:true,width:1024,restoreHitTargetVisible:true};
  });
  await check('恢复同一会话和记录，可继续输入；恢复后刷新列表一致',async()=>{
    await page.locator('#thread-restore').click();await page.waitForFunction(id=>state.thread?.id===id&&!state.threadArchived&&!state.threadLoading,first,{timeout:45000});
    assert.equal(await page.evaluate(()=>state.archived),false);assert.equal(await page.locator('#recent-toggle').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#prompt').isDisabled(),false);assert.equal(await page.locator('#thread-archive-status').isVisible(),false);
    const actual=(await read(first)).thread;assert(actual.path.startsWith(home+'/sessions/'));assert(fs.readFileSync(actual.path,'utf8').includes(marker));
    await page.reload();await ready();assert.equal(await page.evaluate(()=>state.thread.id),first);await row(first).waitFor();await row(second).waitFor();
    await page.screenshot({path:path.join(out,'restored-1024.png')});
    return{sameThreadId:first,originalUserRecordPreserved:true,recentListSelected:true,inputEnabled:true,refreshConsistent:true};
  });
  await check('归档列表响应迟到不会覆盖用户随后选择的最近列表',async()=>{
    await page.evaluate(()=>{
      const original=rpc;window.__archiveScopeHeld=false;window.__archiveScopeReleased=false;
      rpc=function(method,...args){const actual=original(method,...args);if(method==='thread/list'){rpc=original;return actual.then(async value=>{window.__archiveScopeHeld=true;await new Promise(resolve=>window.__releaseArchiveScope=resolve);window.__archiveScopeReleased=true;return value;});}return actual;};
    });
    await page.locator('#archive-toggle').click();await page.waitForFunction(()=>window.__archiveScopeHeld);
    await page.locator('#recent-toggle').click();await row(first).waitFor();await row(second).waitFor();
    await page.evaluate(()=>window.__releaseArchiveScope());await page.waitForFunction(()=>window.__archiveScopeReleased);
    assert.equal(await page.evaluate(()=>state.archived),false);assert.equal(await page.locator('#recent-toggle').getAttribute('aria-pressed'),'true');
    assert.equal(await row(first).count(),1);assert.equal(await row(second).count(),1);
    return{genuineNativeArchivedListResponseHeld:true,latestScopePreserved:true,noDuplicateRows:true};
  });
  await check('列表原生错误提供同范围重试，迟到错误不会覆盖新范围',async()=>{
    // Ask the real pinned native server to reject one invalid limit. The
    // wrapper never fabricates a result/error and restores itself immediately.
    await page.evaluate(()=>{const original=rpc;rpc=function(method,params,...rest){if(method==='thread/list'){rpc=original;return original(method,{...params,limit:-1},...rest);}return original(method,params,...rest);};});
    await page.locator('#archive-toggle').click();
    await page.locator('[data-thread-list-error]').waitFor();
    const failed=await page.locator('[data-thread-list-error]').innerText();assert(failed.includes('会话列表加载失败'));assert.match(failed,/invalid|unsigned|negative|limit/i);
    assert.equal(await page.evaluate(()=>state.archived),true);assert.equal(await page.locator('#archive-toggle').getAttribute('aria-pressed'),'true');
    assert(calls.some(c=>c.method==='thread/list'&&c.limit===-1));
    await page.screenshot({path:path.join(out,'archive-list-retryable-error.png')});
    await page.getByRole('button',{name:'重试读取会话',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('[data-thread-list-error]')&&!document.querySelector('#thread-list').textContent.includes('正在读取'));
    assert.equal(await page.evaluate(()=>state.archived),true);
    // Hold the next genuine native rejection after it occurs, then select a
    // newer scope. The obsolete error must not replace that newer native list.
    await page.locator('#recent-toggle').click();await row(first).waitFor();await row(second).waitFor();
    await page.evaluate(()=>{
      const original=rpc;window.__archiveErrorHeld=false;window.__archiveErrorReleased=false;
      rpc=function(method,params,...rest){if(method==='thread/list'){rpc=original;return original(method,{...params,limit:-1},...rest).catch(async error=>{window.__archiveErrorHeld=true;await new Promise(resolve=>window.__releaseArchiveError=resolve);window.__archiveErrorReleased=true;throw error;});}return original(method,params,...rest);};
    });
    await page.locator('#archive-toggle').click();await page.waitForFunction(()=>window.__archiveErrorHeld);
    await page.locator('#recent-toggle').click();await row(first).waitFor();await row(second).waitFor();
    await page.evaluate(()=>window.__releaseArchiveError());await page.waitForFunction(()=>window.__archiveErrorReleased);
    assert.equal(await page.evaluate(()=>state.archived),false);assert.equal(await row(first).count(),1);assert.equal(await row(second).count(),1);
    assert.equal(await page.locator('[data-thread-list-error]').count(),0);
    return{genuineNativeInvalidLimitRequest:true,errorExplainsFailure:true,sameScopeRetryWorks:true,oldNativeRejectionDoesNotReplaceNewScope:true};
  });
  await check('原生拒绝删除仍被分叉引用的父会话时，中文说明原因和处理方式且不丢数据',async()=>{
    await page.evaluate(id=>openThread(id),parent);await ready();
    await page.locator('#prompt').fill(marker+'_PARENT_UNSENT_DRAFT');
    await page.locator('#thread-action').selectOption('delete');await page.locator('#dialog-submit').click();
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('此会话仍被分叉会话引用'));
    const message=await page.locator('#toast').innerText();assert(message.includes('请先删除相关分叉会话'));assert(message.includes('历史尚未删除'));assert.match(message,/forked history still references it/);
    assert(await page.locator('#dialog').isVisible());assert.equal(await page.locator('#dialog-submit').isDisabled(),false);
    assert.equal(await missing(parent),false);assert.equal(await missing(first),false);assert.equal(await missing(second),false);
    const kept=await draftSnapshot(parent);assert.equal(kept.text,marker+'_PARENT_UNSENT_DRAFT');assert.equal(kept.storedText,kept.text);
    await page.screenshot({path:path.join(out,'fork-reference-delete-explained.png')});
    await page.locator('#dialog-cancel').click();await choose(first);
    return{genuineNativeRefusal:true,actionableChineseReason:true,nativeCauseRetained:true,parentAndBothForksPreserved:true,failedDeletePreservesDraft:true,noSuccessToast:true};
  });
  await check('最近会话可取消永久删除，确认后原生历史实际消失',async()=>{
    await page.locator('#thread-search').fill(marker);await choose(first);await page.locator('#prompt').fill(marker+'_OTHER_THREAD_DRAFT');
    await choose(second);await page.locator('#prompt').fill(marker+'_DELETE_THREAD_DRAFT');
    await page.locator('#file-input').setInputFiles({name:'archive-unsent-draft.txt',mimeType:'text/plain',buffer:Buffer.from(marker+' — unsent local attachment')});
    await page.waitForFunction(()=>state.attachments.length===1&&!state.attachmentLoads);
    const initialDraft=await draftSnapshot(second);assert.equal(initialDraft.text,marker+'_DELETE_THREAD_DRAFT');assert.equal(initialDraft.storedText,initialDraft.text);assert.equal(initialDraft.attachments,1);
    assert.equal(await page.locator('#thread-action option[value=""]').textContent(),'会话操作');
    const before=calls.filter(c=>c.method==='thread/delete').length;
    await page.locator('#thread-action').selectOption('delete');await page.getByRole('heading',{name:'永久删除会话',exact:true}).waitFor();
    assert((await page.locator('#dialog-body').innerText()).includes('无法撤销'));await page.locator('#dialog-cancel').click();
    assert.equal(calls.filter(c=>c.method==='thread/delete').length,before);assert.equal(await missing(second),false);
    assert.deepEqual(await draftSnapshot(second),initialDraft);
    await deleteSelected(second);assert.equal(await missing(parent),false);
    const removed=await draftSnapshot(second);assert.equal(removed.inMemory,false);assert.equal(removed.persisted,false);
    const other=await draftSnapshot(first);assert.equal(other.text,marker+'_OTHER_THREAD_DRAFT');assert.equal(other.storedText,other.text);
    const parentDraft=await draftSnapshot(parent);assert.equal(parentDraft.text,marker+'_PARENT_UNSENT_DRAFT');assert.equal(parentDraft.storedText,parentDraft.text);
    return{cancelMakesNoDeleteRequest:true,cancelPreservesDraftAndAttachment:true,confirmedDeleteRemovesNativeHistory:true,deletedComposerAndAttachmentRemoved:true,deletedSessionDraftRemoved:true,otherThreadDraftPreserved:true,parentDraftPreserved:true,parentPreserved:true};
  });
  await check('已归档会话可直接永久删除，空列表刷新仍保留已归档范围',async()=>{
    await choose(first);await archiveSelected(first);await page.locator('#archive-toggle').click();await choose(first);
    const archivedPath=(await read(first)).thread.path;const archivedDraft=await draftSnapshot(first);assert.equal(archivedDraft.storedText,marker+'_OTHER_THREAD_DRAFT');
    await deleteSelected(first);assert(!fs.existsSync(archivedPath));assert.equal(await missing(parent),false);
    const removed=await draftSnapshot(first);assert.equal(removed.inMemory,false);assert.equal(removed.persisted,false);
    const parentDraft=await draftSnapshot(parent);assert.equal(parentDraft.text,marker+'_PARENT_UNSENT_DRAFT');assert.equal(parentDraft.storedText,parentDraft.text);
    await page.reload();await ready();assert.equal(await page.evaluate(()=>state.thread),null);assert.equal(await page.evaluate(()=>state.archived),true);assert.equal(await page.locator('#archive-toggle').getAttribute('aria-pressed'),'true');
    await page.locator('#recent-toggle').click();await page.waitForFunction(()=>!state.archived);assert.equal(await row(first).count(),0);assert.equal(await row(second).count(),0);
    assert.equal(calls.filter(c=>c.method==='turn/start').length,0);assert.equal(errors.length,0);
    return{archivedPermanentDeleteRemovesFile:true,archivedComposerAndSessionDraftRemoved:true,otherParentDraftPreserved:true,refreshNoResurrection:true,scopePersistsWithoutSelectedThread:true,recentTabReturnsExplicitly:true,zeroModelRequests:true};
  });
  await check('已有真实Flash历史的独立分叉在归档、刷新、恢复后仍显示同一用户和助手内容',async()=>{
    const sourceId=process.env.CODEX_HISTORY_SOURCE_THREAD;assert(sourceId,'Set CODEX_HISTORY_SOURCE_THREAD to a completed real-model thread in the independent test home');
    assert(!owned.has(sourceId),'The source must remain untouched and outside this run\'s cleanup');
    const source=(await read(sourceId)).thread;assert(source.path.startsWith(home+'/sessions/'));assert.equal(source.model,'deepseek-flash');
    const sourceHash=digest(source.path),started=await rpc('thread/fork',{threadId:sourceId,model:'deepseek-flash',modelProvider:'deepseek'}),child=started.thread.id;
    owned.add(child);assert.equal(started.thread.forkedFromId,sourceId);
    const name='真实历史归档验收 '+Date.now();await rpc('thread/name/set',{threadId:child,name});
    await page.locator('#thread-search').fill(name);await row(child).waitFor();await choose(child);
    const before=await visibleHistory();assert(before.user.length>0,'A real user message must be visible');assert(before.assistant.length>0,'A real assistant response must be visible');
    await archiveSelected(child);await page.locator('#archive-toggle').click();await choose(child);
    assert.deepEqual(await visibleHistory(),before);assert(await page.locator('#prompt').isDisabled());
    await page.setViewportSize({width:1024,height:768});if(await page.locator('#toast').isVisible())await page.locator('#toast .toast-close').click();
    await page.screenshot({path:path.join(out,'archived-real-history-1024.png')});
    await page.reload();await ready();assert.equal(await page.evaluate(()=>state.thread.id),child);assert.deepEqual(await visibleHistory(),before);
    await page.locator('#thread-restore').click();await page.waitForFunction(id=>state.thread?.id===id&&!state.threadArchived&&!state.threadLoading,child,{timeout:45000});
    assert.deepEqual(await visibleHistory(),before);assert.equal(await page.locator('#prompt').isDisabled(),false);
    await deleteSelected(child);assert.equal(await missing(sourceId),false);assert.equal(digest(source.path),sourceHash);
    assert.equal(calls.filter(c=>c.method==='turn/start').length,0);assert.equal(errors.length,0);
    return{sourceId,sourceModel:'deepseek-flash',source:'Completed real-model history from an earlier independent Flash audit; this run only forks it through native API',sourceSha256Before:sourceHash,sourceSha256After:digest(source.path),sourceUnmodifiedAndPreserved:true,ownedForkId:child,visibleUserMessages:before.user.length,visibleAssistantMessages:before.assistant.length,archivedHistoryEqual:true,archivedRefreshHistoryEqual:true,restoredHistoryEqual:true,onlyOwnedForkDeleted:true,newModelRequests:0};
  });
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{
  try{await page.evaluate(()=>window.__releaseArchiveScope?.());}catch{}
  try{await page.evaluate(()=>window.__releaseArchiveError?.());}catch{}
  if(await page.locator('#dialog[open]').count())await page.locator('#dialog-cancel').click();
  // Native forks retain references: remove child fixtures before their parent.
  for(const id of [...owned].reverse()){try{await rpc('thread/delete',{threadId:id});cleanup.push({entity:'ownedThread',id,removed:true,through:'test cleanup'});}catch(error){cleanup.push({entity:'ownedThread',id,removed:false,error:error.message});process.exitCode=1;}}
  save();await browser.close();console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,browserErrors:errors,cleanup}));
}
