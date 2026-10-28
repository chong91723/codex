// Actual web, MySQL, SchemaCrawler and optionally one native DeepSeek turn.
import fs from 'node:fs';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
assert.equal(process.env.CODEX_CONFIRM_LIVE_MODEL_TEST,'1','Explicit live-service test authorization required');
const fixture=JSON.parse(fs.readFileSync(process.env.CODEX_DISCOVERY_FIXTURE,'utf8')),out=process.env.REPORT_DIR;
assert(process.env.CODEX_DISCOVERY_FIXTURE.startsWith('/tmp/'));fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(30000);const checks=[],errors=[],events=[],ownedResults=new Set();let sourceId,threadId;
page.on('pageerror',e=>errors.push(e.message));page.on('websocket',socket=>{if(!socket.url().includes('/ws/rpc'))return;socket.on('framereceived',f=>{try{const m=JSON.parse(String(f.payload));if(threadId&&m.params?.threadId===threadId&&['turn/completed','error'].includes(m.method))events.push(m);}catch{}});});
const api=(action,payload)=>page.evaluate(({action,payload})=>databaseApi(action,payload),{action,payload}),rpc=(method,params)=>page.evaluate(({method,params})=>rpc(method,params),{method,params});
const knowledge=operation=>api('result',{databaseKnowledge:{sourceId,operation}}),dialog=()=>page.locator('dialog.database-exploration-dialog');
function save(){fs.writeFileSync(out+'/results.json',JSON.stringify({scope:'Actual AdventureWorks MySQL 8.4, SchemaCrawler CLI and current web. One owned native DeepSeek Flash task. Only owned test resources are mutated.',checks,pageErrors:errors},null,2)+'\n');}
try{
 await page.goto(process.env.CODEX_WEB_URL);await page.waitForFunction(()=>state.ready&&state.models.length&&!state.threadLoading);
 await rpc('config/mcpServer/reload',null);
 const payload=Object.fromEntries(Object.entries(fixture).filter(([k])=>!['expected','container'].includes(k)));sourceId=(await api('save',payload)).connection.id;assert((await api('test',{id:sourceId})).success);
 await page.locator('[data-view=databases]').click();await page.locator('[data-managed-connection-id="'+sourceId+'"]').getByRole('button',{name:'数据库探索',exact:true}).click();
 const business='本独立 AdventureWorks 演示中，有效线上订单仅指 salesorderheader.Status=5 且 OnlineOrderFlag=1；订单收入使用 SubTotal，不含 TaxAmt 和 Freight。这里暂不将不同币种的金额解释为统一币种指标。';
 await dialog().locator('[name=businessContext]').fill(business);await dialog().getByRole('button',{name:'保存并用于分析',exact:true}).click();await page.getByText('业务补充已保存，将按需用于当前及新会话的分析。',{exact:true}).waitFor();
 await dialog().getByRole('button',{name:'一键探索',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.exploration-job-status')?.textContent==='探索完成，已可用于对话分析',null,{timeout:150000});
 const prepared=await knowledge('state');assert.equal(prepared.snapshot.tableCount,70);assert.equal(prepared.snapshot.columnCount,479);assert.equal(prepared.snapshot.exploration.tool,'SchemaCrawler CLI');assert(prepared.snapshot.exploration.findingCount>0);assert.equal(prepared.businessContext.content,business);
 await dialog().screenshot({path:out+'/one-click-preparation.png'});
 const downloaded=page.waitForEvent('download');await dialog().getByRole('button',{name:'下载探索资料',exact:true}).click();const download=await downloaded;await download.saveAs(out+'/exploration-report.json');const report=JSON.parse(fs.readFileSync(out+'/exploration-report.json','utf8'));assert.equal(report.catalog.tables.length,70);assert.equal(report.catalog.tables.reduce((n,t)=>n+t.foreignKeys.length,0),81);assert.equal(report.businessContext.content,business);
 checks.push({name:'实际页面一键探索及资料下载',passed:true,snapshotId:prepared.snapshot.id,tableCount:70,columnCount:479,declaredForeignKeys:81,tool:prepared.snapshot.exploration});save();
 await dialog().getByRole('button',{name:'关闭数据库探索',exact:true}).click();await dialog().waitFor({state:'detached'});
 const cwd=await page.evaluate(()=>state.status.workspace),created=await rpc('thread/start',{cwd,model:'deepseek-flash',config:{model_provider:'deepseek','tools.update_plan.enabled':true}});threadId=created.thread.id;assert.equal(created.model,'deepseek-flash');assert.equal(created.modelProvider,'deepseek');
 await page.evaluate(v=>{resetChat();state.threadSettings.set(v.thread.id,{model:v.model,modelProvider:v.modelProvider,collaborationMode:v.collaborationMode,approvalPolicy:v.approvalPolicy,sandboxPolicy:v.sandbox,effort:v.reasoningEffort});adoptThread(v.thread);showView('chat');$('#model').value='deepseek-flash';$('#effort').value='low';},created);
 await page.locator('#prompt').fill('这是独立测试数据源「'+fixture.name+'」，连接编号为 '+sourceId+'。请先读取这个数据源已有的探索资料和用户已保存的业务补充，再用单次汇总回答：符合定义的有效线上订单总数，以及订单收入合计分别是多少？这是明确的直接查询，不需要规划、不需要图表。仅使用该连接，不重新探索全库。不要假定金额币种，解释统计条件和金额字段；没有确认指标口径就说明这一限制。');await page.locator('#send').click();
 const deadline=Date.now()+360000;let terminal;
 while(Date.now()<deadline){
  terminal=events.find(e=>e.method==='turn/completed');if(terminal)break;
  for(const card of await page.locator('#requests .request-card').all()){
   const allow=card.getByRole('button',{name:'允许本次 MCP 调用',exact:true});if(await allow.isVisible()&&await allow.isEnabled()){assert((await card.locator('pre').first().innerText()).includes('codex_web_databases'));await allow.click();}
   if(await card.getByRole('button',{name:'允许一次',exact:true}).isVisible())throw Error('Unexpected shell approval');
  }
  await page.waitForTimeout(250);
 }
 assert(terminal,'Native model task timed out');assert.equal(terminal.params.turn.status,'completed',JSON.stringify(terminal.params.turn.error));
 const turnId=terminal.params.turn.id,items=await page.evaluate(id=>[...state.items.values()].filter(v=>v.turnId===id).map(v=>v.item),turnId);
 const content=i=>i.result?.structuredContent||JSON.parse(i.result?.content?.find(c=>c.type==='text')?.text||'{}');
 const tools=items.filter(i=>i.type==='mcpToolCall');for(const item of tools){const args=typeof item.arguments==='string'?JSON.parse(item.arguments):item.arguments;if(args?.connection_id)assert.equal(args.connection_id,sourceId);if(item.status==='completed'&&!item.result?.isError){const value=content(item);if(value.resultId)ownedResults.add(value.resultId);}}
 for(const name of ['explore_database','read_database_context','query_database','publish_answer'])assert(tools.some(i=>i.tool===name&&i.status==='completed'&&!i.result?.isError),'Missing actual tool '+name);
 const answer=items.filter(i=>i.type==='agentMessage'&&i.phase!=='commentary').at(-1)?.text;assert(answer);
 const verification=await api('result',{analysisEvidence:{action:'verify',threadId,turnId,text:answer,requireEvidence:true}});assert.equal(verification.status,'verified');
 checks.push({name:'模型执行结果与独立口径核对前记录',passed:true,answer,verification,queries:tools.filter(i=>i.tool==='query_database').map(i=>i.arguments)});save();
 const values=verification.evidence.map(v=>String(v.value).replaceAll(',',''));for(const expected of Object.values(fixture.expected)){assert(values.some(v=>Math.abs(Number(v)-Number(expected))<=0.005),'Executed answer disagrees with independent MySQL oracle: '+expected);}
 const after=await knowledge('state');assert.equal(after.snapshot.id,prepared.snapshot.id);assert.equal(after.revision,prepared.revision);
 checks.push({name:'新会话 DeepSeek Flash 使用探索成果和用户补充，真实查询并核验数值',passed:true,model:created.model,modelProvider:created.modelProvider,answer,verification,tools:tools.map(i=>({tool:i.tool,status:i.status,isError:i.result?.isError||false})),snapshotUnchanged:true});save();
 await page.screenshot({path:out+'/new-task-answer.png',mask:[page.locator('aside')]});assert.deepEqual(errors,[]);
}catch(error){checks.push({name:'Execution failure',passed:false,error:error.stack,dialogText:await dialog().innerText().catch(()=>null)});await dialog().screenshot({path:out+'/failure.png'}).catch(()=>{});save();process.exitCode=1;console.error(error.stack);}
finally{
 if(threadId)try{await rpc('thread/delete',{threadId});}catch(e){checks.push({name:'owned thread cleanup',passed:false,error:e.message});process.exitCode=1;}
 for(const id of ownedResults)try{await api('clear_result',{resultId:id});}catch(e){checks.push({name:'owned result cleanup',passed:false,error:e.message});process.exitCode=1;}
 if(sourceId)try{await api('remove',{id:sourceId});checks.push({name:'owned source cleanup',passed:true,knowledgeHistoryRetained:true});}catch(e){checks.push({name:'owned source cleanup',passed:false,error:e.message});process.exitCode=1;}
 save();await browser.close();console.log(JSON.stringify({checks:checks.map(c=>({name:c.name,passed:c.passed})),pageErrors:errors}));
}
