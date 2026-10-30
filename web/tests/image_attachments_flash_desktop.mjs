// Real browser -> Web scope -> native Codex -> deepseek-flash. Isolated profile only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.env.CODEX_TEST_ROOT||path.resolve(import.meta.dirname,'../..'),out=process.env.REPORT_DIR;
assert.equal(process.env.CODEX_CONFIRM_LIVE_MODEL_TEST,'1');assert(out);
fs.mkdirSync(out,{recursive:true});
const {chromium}=await import(root+'/.toolchains/playwright/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:root+'/.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),checks=[],errors=[],requests=[],owned=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>socket.on('framesent',frame=>{try{const value=JSON.parse(String(frame.payload));if(['turn/start','turn/steer'].includes(value.method))requests.push({method:value.method,threadId:value.params.threadId,model:value.params.model,inputs:value.params.input.map(item=>({type:item.type,mime:item.url?.split(';')[0],text:item.type==='text'?item.text:undefined}))});}catch{}}));
const rpc=(method,params)=>page.evaluate(({method,params})=>rpc(method,params),{method,params});
const save=()=>fs.writeFileSync(out+'/image-results.json',JSON.stringify({scope:'Actual browser, native runtime and deepseek-flash; separate profile; no credential access',checks,errors,requests},null,2));
async function check(name,body){try{const evidence=await body();checks.push({name,passed:true,evidence});console.log('PASS '+name);}catch(error){checks.push({name,passed:false,error:error.stack});await page.screenshot({path:out+'/images-failure.png'}).catch(()=>{});throw error;}finally{save();}}
async function finished(previous){await page.waitForFunction(previous=>!!state.turns.at(-1)&&state.turns.at(-1).id!==previous&&state.turns.at(-1)?.status!=='inProgress'&&!composerState().pending,previous,{timeout:240000});const result=await page.evaluate(()=>({threadId:state.thread.id,settings:state.threadSettings.get(state.thread.id),turn:state.turns.at(-1),items:[...state.items.values()].filter(entry=>entry.turnId===state.turns.at(-1).id).map(entry=>entry.item)}));assert.equal(result.turn.status,'completed',JSON.stringify(result.turn.error));assert.equal(result.settings.model,'deepseek-flash');assert.equal(result.settings.modelProvider,'deepseek');return result;}
async function attach(name,mimeType,buffer){await page.locator('#file-input').setInputFiles({name,mimeType,buffer});await page.waitForFunction(()=>!state.attachmentLoads);}
try{
 await page.goto(process.env.CODEX_WEB_URL);await page.waitForFunction(()=>state.ready&&state.models.length&&!state.threadLoading,null,{timeout:45000});
 const status=await page.evaluate(()=>({home:state.runtimeInfo.codexHome,workspace:state.status.workspace,model:state.runtimeDefaults.model,details:state.modelDetails.find(item=>item.model==='deepseek-flash')}));assert(status.home.startsWith('/tmp/codex-images-live-audit-'));assert(status.details.inputModalities.includes('image'));
 const thread=await rpc('thread/start',{cwd:status.workspace,model:'deepseek-flash',config:{model_provider:'deepseek',model_reasoning_effort:'low','features.memories':false,'memories.generate_memories':false}});owned.push(thread.thread.id);
 await page.evaluate(value=>{resetChat();state.threadSettings.set(value.thread.id,{model:value.model,modelProvider:value.modelProvider,collaborationMode:value.collaborationMode,sandboxPolicy:value.sandbox,approvalPolicy:value.approvalPolicy,effort:'low'});adoptThread(value.thread);showView('chat');$('#model').value='deepseek-flash';$('#effort').value='low';},thread);
 await check('普通文本对话仍通过真实 Flash 完成',async()=>{const previous=await page.evaluate(()=>state.turns.at(-1)?.id||null);await page.locator('#prompt').fill('请仅回答：准备就绪。无需使用工具。');await page.locator('#send').click();const result=await finished(previous);assert(result.items.some(item=>item.type==='agentMessage'&&item.text.includes('准备就绪')));return {threadId:result.threadId,model:result.settings.model,completed:true};});
 const images=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=600;canvas.height=420;const context=canvas.getContext('2d');context.fillStyle='#ffe36e';context.fillRect(0,0,600,420);context.fillStyle='#7529a5';context.beginPath();context.moveTo(300,45);context.lineTo(115,280);context.lineTo(485,280);context.closePath();context.fill();context.font='bold 54px sans-serif';context.textAlign='center';context.fillStyle='#111';context.fillText('CEDAR',300,365);return Object.fromEntries(['png','jpeg','webp'].map(format=>[format,canvas.toDataURL('image/'+format).split(',')[1]]));});
 await check('全部非图片、伪装图片和损坏图片被拒绝且草稿保留',async()=>{
  await page.locator('#prompt').fill('未发送的分析问题');
  for(const name of ['data.xlsx','data.xls','data.csv','data.txt','data.md','data.markdown','data.json','data.sql','audio.mp3','file.pdf','vector.svg','fake.png']){await attach(name,'image/png',Buffer.from('document payload'));assert.equal(await page.evaluate(()=>composerState().attachments.length),0);assert.equal(await page.locator('#prompt').inputValue(),'未发送的分析问题');}
  await attach('truncated.png','image/png',Buffer.from(images.png,'base64').subarray(0,24));assert.equal(await page.evaluate(()=>composerState().attachments.length),0);assert((await page.locator('#toast').textContent()).includes('无法解码'));
  assert((await page.locator('#file-input').getAttribute('accept')).includes('.webp'));
  const before=await page.evaluate(()=>state.turns.length);
  for(const method of ['turn/start','turn/steer','thread/queue/add','thread/queue/update'])for(const input of [{type:'audio',url:'data:audio/wav;base64,AAAA'},{type:'image',url:'data:image/png;base64,ZG9jdW1lbnQ='}]){await assert.rejects(rpc(method,{threadId:thread.thread.id,input:[input]}),/图片|格式/);}
  assert.equal(await page.evaluate(()=>state.turns.length),before);
  const retired=await page.evaluate(async()=>{const response=await fetch('/api/databases/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({analysisEvidence:{action:'upload',threadId:'test',name:'data.csv',format:'csv',text:'x\n999'}})});return {status:response.status,body:await response.json()};});assert.equal(retired.status,400);assert(retired.body.error);
  const oversized=await page.evaluate(async()=>{const response=await fetch('/api/databases/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({analysisEvidence:{action:'upload',text:'x'.repeat(129*1024)}})});return response.status;});assert.equal(oversized,413);
  return {nonImageTypesRejected:12,truncatedImageDecodeRejected:true,rawWebSocketRejected:true,oldUploadEndpoint:retired.status,oldLargeBodyAllowance:oversized,nativeTurnsUnchanged:true};
 });
 await check('支持格式可预览和移除，图片草稿刷新恢复，旧文件草稿不再加载',async()=>{
  for(const format of ['png','jpeg','webp'])await attach('reference.'+format,'image/'+format,Buffer.from(images[format],'base64'));
  await attach('transparent.gif','image/gif',Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));
  assert.equal(await page.locator('#attachments img').count(),4);assert(await page.locator('#attachments img').evaluateAll(images=>images.every(image=>image.naturalWidth>0)));
  await page.locator('#attachments .attachment').last().getByRole('button').click();await page.locator('#attachments .attachment').last().getByRole('button').click();assert.equal(await page.locator('#attachments img').count(),2);
  await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('codex-analysis-attachments-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put([{name:'retired.csv',payload:'old unsupported document'}],'legacy-test');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);}));
  await page.reload();await page.waitForFunction(()=>state.ready&&!state.threadLoading&&!state.attachmentLoads&&composerState().attachments.length===2,null,{timeout:45000});assert.equal(await page.locator('#prompt').inputValue(),'未发送的分析问题');
  assert.equal(await page.evaluate(async()=>(await indexedDB.databases()).some(item=>item.name==='codex-analysis-attachments-v1')),false);
  await page.screenshot({path:out+'/image-draft-restored.png'});return {formatsDecoded:['png','jpeg','webp','gif'],removed:2,restored:2,oldNonImageDraftStoreRemoved:true};
 });
 await check('真实后台拒绝保留图片与问题，再次发送由 Flash 实际识图',async()=>{
  const question='请读取图片中的英文单词，并描述背景颜色和中央图形的形状、颜色。只依据图片，使用“英文单词：…；背景颜色：…；图形：…”的格式回答，不计数，无需工具。';await page.locator('#prompt').fill(question);
  await page.evaluate(()=>{const original=rpc;let first=true;rpc=async(method,params,...rest)=>{if(first&&method==='turn/start'){first=false;return original(method,{...params,input:[{type:'image',url:'data:image/png;base64,ZG9jdW1lbnQ='}]},...rest);}return original(method,params,...rest);};});
  const before=await page.evaluate(()=>state.turns.at(-1)?.id||null);await page.locator('#send').click();await page.waitForFunction(()=>!composerState().pending&&document.querySelector('#toast').textContent.includes('格式'),null,{timeout:45000});assert.equal(await page.locator('#prompt').inputValue(),question);assert.equal(await page.evaluate(()=>composerState().attachments.length),2);assert.equal(await page.evaluate(()=>state.turns.at(-1)?.id||null),before);
  await page.reload();await page.waitForFunction(()=>state.ready&&!state.threadLoading&&!state.attachmentLoads&&composerState().attachments.length===2,null,{timeout:45000});assert.equal(await page.locator('#prompt').inputValue(),question);
  await page.locator('#send').click();const result=await finished(before),answer=result.items.filter(item=>item.type==='agentMessage').map(item=>item.text).join('\n');assert.match(answer,/CEDAR/i);assert.match(answer,/黄/);assert.match(answer,/紫/);assert.match(answer,/三角/);assert.equal(await page.evaluate(()=>composerState().attachments.length),0);
  await page.screenshot({path:out+'/flash-image-answer.png'});return {model:result.settings.model,provider:result.settings.modelProvider,turnId:result.turn.id,actualAnswer:answer,imagesSent:2,failedRequestPreservedDraft:true,successfulRequestClearedSentImages:true};
 });
 await check('识图历史恢复且发送后图片草稿已清理',async()=>{await page.reload();await page.waitForFunction(()=>state.ready&&!state.threadLoading&&!state.attachmentLoads,null,{timeout:45000});assert.equal(await page.evaluate(()=>composerState().attachments.length),0);assert.equal(await page.locator('#prompt').inputValue(),'');await page.waitForFunction(()=>document.querySelector('#messages').innerText.includes('CEDAR'),null,{timeout:30000});return {historyRestored:true,unsentImages:0};});
 await check('图片草稿按会话隔离，读取中切换和中文输入不触发任务',async()=>{
  await page.locator('#prompt').fill('会话原有草稿');await attach('owned-a.png','image/png',Buffer.from(images.png,'base64'));
  await page.locator('#new-chat').click();assert.equal(await page.locator('#attachments img').count(),0);await page.locator('#prompt').fill('新分析草稿');await attach('owned-new.jpeg','image/jpeg',Buffer.from(images.jpeg,'base64'));
  const select=async()=>{await page.locator('.thread-row[data-thread-id="'+thread.thread.id+'"]').click();await page.waitForFunction(id=>state.thread?.id===id&&!state.threadLoading&&!state.attachmentLoads,thread.thread.id);};
  await select();assert.equal(await page.locator('#prompt').inputValue(),'会话原有草稿');assert.equal(await page.locator('#attachments .attachment').count(),1);assert((await page.locator('#attachments').innerText()).includes('owned-a.png'));
  await page.evaluate(()=>{const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){File.prototype.arrayBuffer=original;return original.call(this).then(value=>new Promise(resolve=>{window.releaseOwnedImageRead=()=>resolve(value);}));};});
  await page.locator('#file-input').setInputFiles({name:'late-a.png',mimeType:'image/png',buffer:Buffer.from(images.png,'base64')});await page.waitForFunction(()=>!!window.releaseOwnedImageRead);await page.locator('#new-chat').click();await page.evaluate(()=>window.releaseOwnedImageRead());await page.waitForFunction(()=>[...state.composers.values()].every(draft=>!draft.loads));
  assert.equal(await page.locator('#prompt').inputValue(),'新分析草稿');assert.equal(await page.locator('#attachments .attachment').count(),1);assert((await page.locator('#attachments').innerText()).includes('owned-new.jpeg'));
  await select();assert.equal(await page.locator('#attachments .attachment').count(),2);
  const before=requests.length;await page.locator('#prompt').dispatchEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});await page.locator('#prompt').press('Shift+Enter');assert.equal(requests.length,before);assert((await page.locator('#prompt').inputValue()).includes('\n'));
  while(await page.locator('#attachments .attachment').count())await page.locator('#attachments .attachment').first().getByRole('button').click();await page.locator('#prompt').fill('');return {draftIsolation:true,lateReadStaysWithOriginalThread:true,imeDoesNotSend:true,shiftEnterDoesNotSend:true};
 });
 assert.deepEqual(errors,[]);
}finally{
 for(const threadId of owned)try{await page.evaluate(()=>resetChat());await rpc('thread/unsubscribe',{threadId});await rpc('thread/delete',{threadId});}catch(error){errors.push('Owned test thread cleanup: '+error.message);}
 save();await browser.close();
}
