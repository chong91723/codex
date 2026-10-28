// Actual web/stdio MCP/read-only PostgreSQL; transcript items are explicit UI fixtures.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const home=process.env.CODEX_TEST_HOME,base=process.env.CODEX_WEB_URL,pgPort=Number(process.env.CODEX_FRESHNESS_PG_PORT),out=path.resolve(process.env.REPORT_DIR||'test-results/evidence-followup-2026-10-28/browser');
assert(home?.startsWith('/tmp/')&&base&&pgPort);fs.mkdirSync(out,{recursive:true});
const root=path.resolve('.'),workspace=home+'/workspace';fs.mkdirSync(workspace,{recursive:true});
const env={PATH:process.env.PATH,CODEX_HOME:home,CODEX_WEB_DB_STATE:home+'/web-databases',CODEX_WEB_ANALYSIS_ROOTS:workspace};
const server=spawn('python3',['-B','web/server.py','--port',new URL(base).port,'--workspace',workspace],{env,stdio:'ignore'});
const mcp=spawn(root+'/.toolchains/databases/bin/python',['-B','web/database/mcp_server.py'],{env,stdio:['pipe','pipe','pipe']});
let seq=0,buffer='',threadId,turn='task-a',connectionId,otherId;const pending=new Map(),results=[],errors=[],nativeCalls=[],toolCalls=[];
mcp.stdout.on('data',chunk=>{buffer+=chunk;for(;;){const end=buffer.indexOf('\n');if(end<0)break;const response=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);const waiter=pending.get(response.id);if(waiter){pending.delete(response.id);response.error?waiter.reject(Error(response.error.message)):waiter.resolve(response.result);}}});
mcp.on('exit',code=>{for(const waiter of pending.values())waiter.reject(Error('Owned MCP exited '+code));pending.clear();});
function request(method,params){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
async function tool(name,args,expectError=false){toolCalls.push(name);const result=await request('tools/call',{name,arguments:args,_meta:{threadId,'x-codex-turn-metadata':{turn_id:turn}}});assert.equal(result.isError,expectError,result.content?.[0]?.text);return expectError?result.content[0].text:result.structuredContent;}
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('websocket',socket=>socket.on('framesent',event=>{try{const v=JSON.parse(event.payload);if(v.method)nativeCalls.push(v.method);}catch{}}));
const api=(action='',payload)=>page.evaluate(async({action,payload})=>databaseApi(action,payload),{action,payload});
const rpc=(method,params)=>page.evaluate(async({method,params})=>rpc(method,params),{method,params});
const save=()=>fs.writeFileSync(out+'/results.json',JSON.stringify({scope:'Actual isolated web, PostgreSQL, stdio MCP and Python; transcript events are fixtures, not model outputs. No user service, history or business data accessed.',results,errors,modelRequests:nativeCalls.filter(n=>['turn/start','turn/steer'].includes(n)).length,toolCalls},null,2)+'\n');
async function check(name,work){try{const detail=await work();results.push({name,status:'passed',...detail});save();}catch(error){results.push({name,status:'failed',error:error.message});save();throw error;}}
const card=()=>page.locator('[data-managed-connection-id="'+connectionId+'"]');
async function policy(value){await card().getByRole('button',{name:'数据时效',exact:true}).click();await page.locator('#db-max-age').fill(value);await page.locator('#dialog-submit').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);await card().waitFor();}
async function emit(id,text,turnId=turn){await api('result',{analysisEvidence:{action:'register',threadId,turnId}});await page.evaluate(({id,text,turnId})=>{const threadId=state.thread.id,item={id,type:'agentMessage',phase:'final_answer',text};handleEvent({method:'turn/started',params:{threadId,turn:{id:turnId,status:'inProgress',items:[]}}});handleEvent({method:'item/completed',params:{threadId,turnId,item}});handleEvent({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed',items:[item]}}});},{id,text,turnId});}
async function report(id,filename){const waiting=page.waitForEvent('download');await page.locator('[data-export-analysis-report="'+id+'"]').click();const download=await waiting;await download.saveAs(out+'/'+filename);return fs.readFileSync(out+'/'+filename,'utf8');}
let queried,derived,answer;
try{
 const deadline=Date.now()+60000;let ready=false;while(Date.now()<deadline){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready);
 const init=await request('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'freshness-fixture',version:'1'}});assert.equal(init.serverInfo.version,'1.1.0');
 await page.goto(base);await page.waitForFunction(()=>state.ready&&!state.threadLoading);assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),home);
 await check('数据源绑定时效输入，取消不写入，保存不改变连接版本或另一数据源',async()=>{
  const payload={engine:'postgresql',name:'时效验收数据源',host:'127.0.0.1',port:pgPort,database:'fixture',username:'reader',readOnly:true};connectionId=(await api('save',payload)).connection.id;assert((await api('test',{id:connectionId})).success);otherId=(await api('save',{...payload,name:'未设置规则的数据源'})).connection.id;
  await page.locator('[data-view=databases]').click();await card().waitFor();const before=(await api()).connections.find(c=>c.id===connectionId);
  await card().getByRole('button',{name:'数据时效',exact:true}).click();assert((await page.locator('#dialog-title').innerText()).includes('时效验收数据源'));await page.locator('#db-max-age').fill('30');await page.locator('#dialog-cancel').click();assert.equal((await api()).connections.find(c=>c.id===connectionId).maxAgeMinutes,null);
  await policy('30');const after=(await api()).connections;assert.equal(after.find(c=>c.id===connectionId).version,before.version);assert.equal(after.find(c=>c.id===connectionId).status,'connected');assert.equal(after.find(c=>c.id===otherId).maxAgeMinutes,null);assert((await card().innerText()).includes('30 分钟'));
  await page.reload();await page.waitForFunction(()=>state.ready&&!state.threadLoading);await page.locator('[data-view=databases]').click();await card().waitFor();assert((await card().innerText()).includes('30 分钟'));return{cancelPreserved:true,persistedAcrossReload:true,otherSourceUnchanged:true};
 });
 await check('真实只读查询与Python计算保留来源时间，时限内跨回合可复用',async()=>{
  threadId=(await rpc('thread/start',{cwd:workspace,model:'deepseek-flash'})).thread.id;await rpc('thread/inject_items',{threadId,items:[{type:'message',role:'user',content:[{type:'input_text',text:'Explicit evidence follow-up UI fixture'}]}]});
  queried=await tool('query_database',{connection_id:connectionId,query:'SELECT SUM(amount) AS amount, COUNT(*) AS count FROM orders'});assert.equal(queried.rowCount,1);assert.equal(queried.acquisition[0].connectionId,connectionId);
  derived=await tool('run_python',{code:"result=[{'amount':sum(row['amount'] for row in datasets[parameters['id']])}]",result_ids:[queried.resultId],parameters:{id:queried.resultId}});assert.deepEqual(derived.acquisition,queried.acquisition);
  turn='task-b';answer=await tool('publish_answer',{template:'金额 {{v}}',references:{v:{result_id:derived.resultId,row:0,column:'amount'}}});assert.equal(answer.text,'金额 3.50');assert.equal(answer.publicationChecks.freshness[0].status,'withinLimit');return{realSql:true,realIsolatedPython:true,originalTimePreserved:true,newTurnReuseAllowedWithinUserLimit:true};
 });
 await check('现存MCP立即读取更改规则，零仅当前任务；拒绝后原结果仍可下载，重新查询后可发布',async()=>{
  await policy('0');const input={template:'金额 {{v}}',references:{v:{result_id:derived.resultId,row:0,column:'amount'}}};assert((await tool('publish_answer',input,true)).includes('复用时长'));
  assert((await tool('read_result',{result_id:queried.resultId},true)).includes('复用时长'));
  const history=await api('result',{resultId:derived.resultId,offset:0,limit:1});assert.equal(history.rows[0].amount,'3.50');const response=await page.request.get(base+'/api/databases/results/'+derived.resultId+'.csv');assert(response.ok());assert((await response.text()).includes('3.50'));
  queried=await tool('query_database',{connection_id:connectionId,query:'SELECT SUM(amount) AS amount FROM orders'});answer=await tool('publish_answer',{template:'金额 {{v}}',references:{v:{result_id:queried.resultId,row:0,column:'amount'}}});assert.equal(answer.publicationChecks.freshness[0].status,'currentTask');return{sameMcpProcess:true,staleRejected:true,historyAndCsvRetained:true,realRequerySucceeded:true};
 });
 await check('清空时效恢复未设置状态；过时检查记录与legacy警示进入实际报告下载',async()=>{
  await policy('');assert.equal((await api()).connections.find(c=>c.id===connectionId).maxAgeMinutes,null);
  await page.locator('[data-view=chat]').click();await page.evaluate(id=>openThread(id),threadId);await page.waitForFunction(id=>state.thread?.id===id&&!state.threadLoading,threadId);
  answer=await tool('publish_answer',{template:'金额 {{v}}',references:{v:{result_id:queried.resultId,row:0,column:'amount'}}});await emit('actual-proof-answer',answer.text);await page.waitForFunction(()=>document.querySelector('[data-item=actual-proof-answer]')?.dataset.analysisVerification==='verified');
  const actual=await report('actual-proof-answer','actual-proof.md');assert(actual.includes('analysis-publication-v2'));assert(actual.includes('未设置复用时长'));assert(actual.includes(queried.acquisition[0].retrievedAt));assert(actual.includes('业务字段来源、公式口径'));
  // Explicit legacy transcript fixture, intentionally without strict registration.
  await page.evaluate(()=>{const threadId=state.thread.id,turnId='pre-policy-fixture',item={id:'legacy-fixture',type:'agentMessage',phase:'final_answer',text:'历史结果 123。'};handleEvent({method:'item/completed',params:{threadId,turnId,item}});handleEvent({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed',items:[item]}}});});await page.waitForFunction(()=>document.querySelector('[data-item=legacy-fixture]')?.dataset.analysisVerification==='legacy');const legacy=await report('legacy-fixture','legacy-warning.md');assert(legacy.includes('历史回答：未按当前数值规则核验'));assert(legacy.includes('123'));return{actualProofDownloaded:true,acquisitionTimeRetained:true,legacyWarningDownloaded:true};
 });
 await check('中文漏检和误判真实界面路径；未存证财务数字被拒，普通一致描述正常显示',async()=>{
  for(const [id,text]of [['bare-count','一共十二'],['financial-count','壹佰元']]){await emit(id,text);await page.waitForFunction(id=>document.querySelector('[data-item="'+id+'"]')?.dataset.analysisVerification==='rejected',id);assert.equal(await page.locator('[data-item="'+id+'"] [data-export-analysis-report]:visible').count(),0);}
  await emit('plain-consistency','字段为一致格式');assert((await page.locator('[data-item=plain-consistency]').innerText()).includes('字段为一致格式'));assert.equal(await page.locator('[data-item=plain-consistency]').getAttribute('data-analysis-verification'),null);return{bareAndFinancialRejected:true,ordinaryTextDisplayed:true};
 });
 await check('桌面明暗数据源时效窗口无遮挡，检查版本与来源记录可查看',async()=>{
  await page.locator('[data-view=databases]').click();await card().waitFor();await card().getByRole('button',{name:'数据时效',exact:true}).click();for(const width of [1440,1024]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#dialog').getBoundingClientRect().right<=innerWidth));await page.screenshot({path:out+'/freshness-'+width+'.png'});}await page.locator('#dialog-cancel').click();await page.locator('#theme-toggle').click();await card().getByRole('button',{name:'数据时效',exact:true}).click();await page.screenshot({path:out+'/freshness-dark-1024.png'});await page.locator('#dialog-cancel').click();return{desktopWidths:[1440,1024],dark:true};
 });
 assert.equal(errors.length,0);assert.equal(nativeCalls.filter(n=>['turn/start','turn/steer'].includes(n)).length,0);
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{try{if(threadId){await rpc('thread/delete',{threadId});await api('result',{analysisEvidence:{action:'remove_thread',threadId}});}for(const id of [connectionId,otherId].filter(Boolean))await api('remove',{id});}catch(error){errors.push('Owned cleanup: '+error.message);process.exitCode=1;}save();await browser.close();for(const child of [mcp,server]){if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}}console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,errors}));}
