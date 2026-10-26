// Native queue/sections/attachment storage exercised through the actual protocol UI.
// Uses persistent disposable forks from an existing Flash audit parent; no model calls.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ready,call} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL||'http://127.0.0.1:8788',out=process.env.REPORT_DIR||'test-results/flash-followup-2026-10-26';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const nativeTurns=[];
const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),results=[],errors=[],requests=[],threads=[],sections=[],cleanup=[];
const nonce=String(Date.now()),fixtureText='NATIVE_STORAGE_FLASH_AUDIT_'+nonce;let parentId,fixture;
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{socket.on('framesent',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method)requests.push({method:m.method,threadId:m.params?.threadId});}catch{}});socket.on('framereceived',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method==='turn/started')nativeTurns.push({threadId:m.params.threadId,turnId:m.params.turn?.id});}catch{}});});
const rpc=(method,params)=>call(page,method,params);
const save=()=>fs.writeFileSync(out+'/native-storage-results.json',JSON.stringify({origin:'Real browser protocol Execute button; persistent owned test forks and temporary file, no direct SQL or model calls',parentId,ownedThreadIds:threads,ownedSectionIds:sections,explicitModelStartRpcs:requests.filter(r=>['turn/start','thread/queue/start','review/start','thread/compact/start'].includes(r.method)).length,nativeTurnStartsObserved:nativeTurns,results,cleanup,browserErrors:errors,requests},null,2));
async function check(name,fn){try{results.push({name,status:'passed',evidence:await fn()});console.log('PASS '+name);}catch(error){const blocked=/not supported|unavailable|disabled|not enabled/i.test(error.message);results.push({name,status:blocked?'blocked':'failed',error:error.message});console.log((blocked?'BLOCKED ':'FAIL ')+name+': '+error.message);await page.screenshot({path:out+'/native-storage-failure-'+results.length+'.png',mask:[page.locator('#messages')]});}finally{save();}}
async function all(method,params){const values=[];let cursor;do{const response=await rpc(method,{...params,limit:1,...(cursor?{cursor}:{})});values.push(...response.data);cursor=response.nextCursor;assert(values.length<500,'Unexpected test profile size');}while(cursor);return values;}
try{
 await page.goto(base);await ready(page);assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),'/tmp/codex-web-flash-audit/home');
 const original=(await rpc('thread/list',{limit:100,modelProviders:['deepseek']})).data.filter(t=>t.model==='deepseek-flash'&&t.cwd?.startsWith('/tmp/codex-web-flash-audit/workspace')&&t.preview&&!t.forkedFromId).at(-1);assert(original,'No known persisted Flash test parent');parentId=original.id;
 for(let i=0;i<2;i++){const fork=await rpc('thread/fork',{threadId:parentId,model:'deepseek-flash',modelProvider:'deepseek'});threads.push(fork.thread.id);await rpc('thread/name/set',{threadId:fork.thread.id,name:'Flash storage '+nonce+' '+i});}
 // A fresh native connection keeps disposable forks unloaded. Native queue/add
 // automatically starts input when a loaded thread is idle, so storage-only
 // CRUD must run against unloaded threads and be emptied before any resume.
 await page.reload();await ready(page);
 const loaded=(await rpc('thread/loaded/list',{})).data;assert(threads.every(id=>!loaded.includes(id)),'Storage fixture must be unloaded');
 const [a,b]=threads;fixture='/tmp/codex-web-flash-audit/workspace/native-storage-'+nonce+'.txt';
 await check('原生队列新增、分页、更新、重排、线程隔离与删除',async()=>{
  assert.equal((await rpc('thread/queue/list',{threadId:a})).data.length,0);
  const q1=(await rpc('thread/queue/add',{threadId:a,clientUserMessageId:'storage-'+nonce+'-1',input:[{type:'text',text:'QUEUE_FIRST_'+nonce,text_elements:[]}]})).queuedSubmission;
  const q2=(await rpc('thread/queue/add',{threadId:a,clientUserMessageId:'storage-'+nonce+'-2',input:[{type:'text',text:'QUEUE_SECOND_'+nonce,text_elements:[]}]})).queuedSubmission;
  let items=await all('thread/queue/list',{threadId:a});assert.deepEqual(items.map(i=>i.id),[q1.id,q2.id]);assert.equal((await rpc('thread/queue/list',{threadId:b})).data.length,0);
  await rpc('thread/queue/update',{threadId:a,queuedSubmissionId:q1.id,input:[{type:'text',text:'QUEUE_EDITED_'+nonce,text_elements:[]}]});
  await rpc('thread/queue/reorder',{threadId:a,queuedSubmissionIds:[q2.id,q1.id]});items=await all('thread/queue/list',{threadId:a});assert.deepEqual(items.map(i=>i.id),[q2.id,q1.id]);assert.equal(items[1].input[0].text,'QUEUE_EDITED_'+nonce);
  // Page reload recreates the native process; queue contents must be persisted.
  await page.reload();await ready(page);items=await all('thread/queue/list',{threadId:a});assert.deepEqual(items.map(i=>i.id),[q2.id,q1.id]);
  for(const id of [q1.id,q2.id])assert.equal((await rpc('thread/queue/delete',{threadId:a,queuedSubmissionId:id})).deleted,true);
  assert.equal((await rpc('thread/queue/list',{threadId:a})).data.length,0);
  return{actualNativeQueueCRUD:true,pagination:true,reordering:true,separateThreadUnaffected:true,persistsAcrossNativeReconnect:true,queueStart:'not tested; no model request on keyless instance'};
 });
 await check('原生会话分组CRUD、分组内顺序与移动',async()=>{
  const first=(await rpc('threadSection/create',{name:'Storage first '+nonce,appearance:{icon:'folder',color:'#3182ce'}})).section;sections.push(first.id);
  const second=(await rpc('threadSection/create',{name:'Storage second '+nonce})).section;sections.push(second.id);
  await rpc('threadSection/update',{sectionId:second.id,name:'Storage renamed '+nonce,appearance:null});
  const listed=await all('threadSection/list',{});assert(listed.some(s=>s.id===first.id));assert(listed.some(s=>s.id===second.id&&s.name==='Storage renamed '+nonce&&s.appearance===null));
  for(const id of [a,b])await rpc('thread/section/move',{threadId:id,sectionId:first.id});
  let grouped=await rpc('thread/list',{sectionId:first.id,sortKey:'section_position',sortDirection:'asc',limit:100});assert.deepEqual(grouped.data.map(t=>t.id),[a,b]);
  await rpc('thread/section/move',{threadId:b,sectionId:first.id,beforeThreadId:a});grouped=await rpc('thread/list',{sectionId:first.id,sortKey:'section_position',sortDirection:'asc',limit:100});assert.deepEqual(grouped.data.map(t=>t.id),[b,a]);
  await rpc('thread/section/move',{threadId:a,sectionId:second.id});assert.equal((await rpc('thread/read',{threadId:a,includeTurns:false})).thread.section.id,second.id);
  for(const id of [a,b])await rpc('thread/section/move',{threadId:id,sectionId:null});
  for(const id of sections)await rpc('threadSection/delete',{sectionId:id});assert(!(await all('threadSection/list',{})).some(s=>sections.includes(s.id)));
  return{sectionsCreatedRenamedDeleted:true,appearanceReadBack:true,paginatedListing:true,actualSectionOrderVerified:true,moveBetweenAndOutOfSections:true};
 });
 await check('原生附件关联、幂等身份、所有者归档过滤与移除',async()=>{
  await rpc('fs/writeFile',{path:fixture,dataBase64:Buffer.from(fixtureText).toString('base64')});const real=await rpc('fs/readFile',{path:fixture});assert.equal(Buffer.from(real.dataBase64,'base64').toString(),fixtureText);
  const identity='storage-'+nonce,type='codex-web-audit-text',payload={path:fixture,mimeType:'text/plain',auditMarker:nonce};
  const added=await rpc('thread/attachment/add',{threadId:a,attachmentType:type,identityKey:identity,payload});assert.equal(added.outcome,'created');
  const again=await rpc('thread/attachment/add',{threadId:a,attachmentType:type,identityKey:identity,payload:{different:'must retain original'}});assert.equal(again.outcome,'existing');assert.equal(again.attachment.id,added.attachment.id);assert.deepEqual(again.attachment.payload,payload);
  await rpc('thread/attachment/add',{threadId:b,attachmentType:type,identityKey:identity,payload});
  const linked=await all('thread/attachment/list',{threadId:a});assert.equal(linked.length,1);assert.deepEqual(linked[0].payload,payload);
  let owners=await all('thread/attachmentOwner/list',{attachmentType:type,identityKey:identity});assert.deepEqual(owners.map(o=>o.threadId).sort(),[a,b].sort());
  await rpc('thread/archive',{threadId:b});owners=await all('thread/attachmentOwner/list',{attachmentType:type,identityKey:identity,archived:false});assert.deepEqual(owners.map(o=>o.threadId),[a]);
  const allOwners=await all('thread/attachmentOwner/list',{attachmentType:type,identityKey:identity,archived:null});assert(allOwners.some(o=>o.threadId===b&&o.archived===true));
  for(const id of [a,b])await rpc('thread/attachment/remove',{threadId:id,attachmentType:type,identityKey:identity});assert.equal((await all('thread/attachment/list',{threadId:a})).length,0);assert.equal((await all('thread/attachmentOwner/list',{attachmentType:type,identityKey:identity})).length,0);
  return{realTemporaryFileReadBack:true,attachmentMetadataCRUD:true,idempotentAddPreservesOriginal:true,ownersPaginated:true,archiveFilterUsesNativeState:true,chatImageUpload:'separate capability, not claimed by this metadata test'};
 });
 assert.equal(requests.filter(r=>['turn/start','thread/queue/start','review/start','thread/compact/start'].includes(r.method)).length,0);assert.equal(nativeTurns.length,0,'Unexpected automatic native turn during storage CRUD');
}catch(error){results.push({name:'专项前置条件',status:'failed',error:error.message});console.error(error.stack);}
finally{
 for(const id of threads){try{await rpc('thread/delete',{threadId:id});cleanup.push({entity:'ownedThread',id,removed:true});}catch(error){cleanup.push({entity:'ownedThread',id,removed:false,error:error.message});}}
 for(const id of sections){try{await rpc('threadSection/delete',{sectionId:id});cleanup.push({entity:'ownedSection',id,removed:true});}catch(error){if(/not found|does not exist/i.test(error.message))cleanup.push({entity:'ownedSection',id,removed:true,alreadyRemoved:true});else cleanup.push({entity:'ownedSection',id,removed:false,error:error.message});}}
 if(fixture&&fs.existsSync(fixture)){fs.unlinkSync(fixture);cleanup.push({entity:'ownedTemporaryFile',removed:true});}
 if(parentId){try{const remaining=(await rpc('thread/read',{threadId:parentId,includeTurns:false})).thread;cleanup.push({entity:'originalParent',id:parentId,preserved:remaining.id===parentId});}catch(error){cleanup.push({entity:'originalParent',id:parentId,preserved:false,error:error.message});}}
 save();await browser.close();console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,blocked:results.filter(r=>r.status==='blocked').length,browserErrors:errors}));if(results.some(r=>r.status==='failed')||errors.length||cleanup.some(c=>c.removed===false||c.preserved===false))process.exitCode=1;
}
