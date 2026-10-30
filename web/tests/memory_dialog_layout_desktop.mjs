// Read-only browser regression against an explicitly supplied independent server.
// Expected summary metadata must come from a genuine native extraction receipt.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const target=process.env.CODEX_WEB_URL,evidencePath=process.env.NATIVE_MEMORY_RECEIPT;
if(!target||!evidencePath)throw Error('Set CODEX_WEB_URL to an independent instance and NATIVE_MEMORY_RECEIPT to genuine extracted summary metadata');
const seed=JSON.parse(fs.readFileSync(evidencePath,'utf8')).records[0];assert(seed?.threadId);
const baseline=process.env.CODEX_LAYOUT_BASELINE==='1',phase=baseline?'before':'after',root=process.env.REPORT_DIR||'/tmp/codex-memory-dialog-layout',out=path.join(root,phase);fs.mkdirSync(out,{recursive:true});
const receipt={scope:'Read-only real memory/exploration dialogs, 1440 and 1024 desktop widths; no model, settings mutation or approvals',phase,viewports:[],nativeRequests:[],httpOperations:[],blocked:[],browserErrors:[]};
const scrub=value=>typeof value==='string'?value.replace(/(cookie|set-cookie|authorization):[^\r\n]*/gi,'$1: [REDACTED]'):value;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const contexts=[];let currentPage;
const operation=(response,name)=>{try{return response.url().endsWith('/api/databases/result')&&response.request().postDataJSON()?.nativeMemory?.operation===name;}catch{return false;}};
async function dialogReady(page){await page.waitForFunction(()=>{const dialog=document.querySelector('.analysis-memory-dialog');return dialog&&[...dialog.querySelectorAll('button')].find(button=>button.textContent==='关闭')?.disabled===false;});}
try{
 for(const [width,height] of [[1440,1000],[1024,900]]){
  const context=await browser.newContext({viewport:{width,height}});contexts.push(context);const page=await context.newPage();currentPage=page;
  page.on('pageerror',error=>receipt.browserErrors.push({width,message:error.message}));
  page.on('websocket',socket=>{if(socket.url().endsWith('/ws/rpc'))socket.on('framesent',frame=>{try{const value=JSON.parse(String(frame.payload));if(value.method)receipt.nativeRequests.push({width,method:value.method,threadId:value.params?.threadId});}catch{}});});
  await page.addInitScript(()=>{const original=WebSocket.prototype.send;WebSocket.prototype.send=function(value){let request;try{request=JSON.parse(value);}catch{}if(request?.method&&/^(?:turn\/|review\/start|thread\/(?:resume|start|fork|settings\/update|name\/set|goal\/set)|config\/(?:batchWrite|value\/write))/.test(request.method))throw Error('Readonly dialog audit blocked native mutation '+request.method);return original.call(this,value);};});
  await page.route('**/api/databases/**',async route=>{
   const request=route.request();if(request.method()!=='POST'){await route.continue();return;}
   let data;try{data=request.postDataJSON();}catch{}
   const memory=data?.nativeMemory,knowledge=data?.databaseKnowledge,learning=data?.learning;
   const allowed=request.url().endsWith('/api/databases/result')&&(memory&&['state','context','summary_search','summary_read'].includes(memory.operation)&&(memory.operation!=='summary_read'||memory.threadId===seed.threadId)||knowledge&&['state','exploration_status'].includes(knowledge.operation)||learning&&learning.operation==='queue');
   if(!allowed){receipt.blocked.push({width,path:new URL(request.url()).pathname,keys:Object.keys(data||{})});await route.abort();return;}
   receipt.httpOperations.push({width,kind:memory?'memory':knowledge?'knowledge':'learning',operation:(memory||knowledge||learning).operation});await route.continue();
  });
  await page.goto(target);await page.waitForFunction(()=>state.ready&&!state.threadLoading,null,{timeout:90000});assert.equal(await page.evaluate(()=>state.thread?.id||null),null);
  await page.locator('[data-view="settings"]').click();await page.getByRole('button',{name:'查看与编辑记忆',exact:true}).click();await dialogReady(page);
  const dialog=page.locator('dialog.analysis-memory-dialog'),history=dialog.locator('.analysis-native-history');
  const searchWait=page.waitForResponse(response=>operation(response,'summary_search'));await history.locator(':scope > summary').click();let listing=await(await searchWait).json(),selected=-1;
  for(let part=0;part<10;part++){selected=listing.records.findIndex(item=>item.threadId===seed.threadId);if(selected>=0)break;assert(listing.hasMore);const waiting=page.waitForResponse(response=>operation(response,'summary_search'));await history.getByRole('button',{name:'下一页',exact:true}).click();listing=await(await waiting).json();}
  assert(selected>=0,'Expected real seed summary missing');const readWait=page.waitForResponse(response=>operation(response,'summary_read'));await history.locator('.exploration-note-card').nth(selected).getByRole('button',{name:'查看全文',exact:true}).click();const summary=await(await readWait).json();assert.equal(summary.sha256,seed.summarySHA256);await dialogReady(page);
  const metrics=await dialog.evaluate(node=>{const style=getComputedStyle(node),input=node.querySelector('textarea'),bounds=input.getBoundingClientRect();return {display:style.display,overflowY:style.overflowY,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,editorHeight:bounds.height,editorRows:input.rows,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};});
  const result={width,height,memory:metrics,summaryCharacters:summary.characters,summarySHA256:summary.sha256};receipt.currentViewport=result;
  if(baseline){result.baselineIssueReproduced=metrics.display==='flex'&&metrics.overflowY==='hidden'&&metrics.editorHeight<80;assert(result.baselineIssueReproduced,'Expected original shrink/clipping issue was not reproduced');}
  else{
   assert.equal(metrics.display,'block');assert.equal(metrics.overflowY,'auto');assert.equal(metrics.editorRows,10);assert(metrics.editorHeight>=180,'Ten-row editor collapsed');assert(metrics.scrollHeight>metrics.clientHeight,'Long real summary did not exercise outer scroll');assert(metrics.scrollWidth<=width+1);
   await dialog.evaluate(node=>{node.scrollTop=0;});const heading=await dialog.locator(':scope > h2').boundingBox();await page.mouse.move(heading.x+50,heading.y+heading.height/2);await page.mouse.wheel(0,650);await page.waitForFunction(()=>document.querySelector('dialog.analysis-memory-dialog').scrollTop>0);result.userWheelScrollsDialog=true;
   result.reachableActions=[];
   for(const action of ['刷新','保存编辑',/^(暂停|启用)长期记忆$/,'清空长期记忆','关闭']){
    const control=dialog.getByRole('button',{name:action,exact:typeof action==='string'});await control.scrollIntoViewIfNeeded();const bounds=await control.boundingBox(),viewport=await dialog.boundingBox();assert(bounds&&bounds.y>=viewport.y&&bounds.y+bounds.height<=viewport.y+viewport.height);result.reachableActions.push(await control.textContent());
   }
   await dialog.locator('textarea').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'memory-editor-actions-'+width+'.png')});
   await history.locator(':scope > .db-toolbar').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'memory-summary-footer-'+width+'.png')});
  }
  if(baseline)await page.screenshot({path:path.join(out,'memory-collapsed-'+width+'.png')});
  await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('[data-view="databases"]').click();await page.locator('.db-card').first().waitFor();await page.locator('.db-card').first().getByRole('button',{name:'数据库探索',exact:true}).click();
  const exploration=page.locator('dialog.database-exploration-dialog.exploration-simple');await exploration.getByRole('button',{name:'关闭数据库探索',exact:true}).waitFor();await page.waitForFunction(()=>{const summary=document.querySelector('.exploration-simple .exploration-summary');return summary&&!summary.textContent.includes('正在加载资料');});
  result.exploration=await exploration.evaluate(node=>{const style=getComputedStyle(node),body=getComputedStyle(node.querySelector('.exploration-body'));return {display:style.display,overflowY:style.overflowY,maxHeight:style.maxHeight,padding:style.padding,bodyOverflowY:body.overflowY};});
  assert.equal(result.exploration.display,'flex');assert.equal(result.exploration.overflowY,'hidden');assert.equal(result.exploration.bodyOverflowY,'auto');
  if(!baseline){const earlier=JSON.parse(fs.readFileSync(path.join(root,'before/receipt.json'),'utf8')).viewports.find(item=>item.width===width);assert.deepEqual(result.exploration,earlier.exploration,'Exploration dialog computed layout changed');await page.screenshot({path:path.join(out,'exploration-unchanged-'+width+'.png')});}
  await exploration.getByRole('button',{name:'关闭数据库探索',exact:true}).click();assert.equal(await page.evaluate(()=>state.thread?.id||null),null);receipt.viewports.push(result);await context.close();
 }
 assert.equal(receipt.browserErrors.length,0);assert.equal(receipt.blocked.length,0);assert(!receipt.nativeRequests.some(request=>request.method==='thread/resume'||/^(?:turn\/|review\/start)/.test(request.method)));receipt.modelRequestCount=0;receipt.settingWriteCount=0;receipt.passed=true;
}catch(error){receipt.passed=false;receipt.error=scrub(error.message);receipt.errorStack=scrub(error.stack);if(currentPage&&!currentPage.isClosed())await currentPage.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;console.error(receipt.error);}
finally{fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,(_key,value)=>scrub(value),2));await browser.close();}
