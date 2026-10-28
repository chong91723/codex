// Real isolated web, PostgreSQL and MCP. Chat transcript events below are explicit UI fixtures.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const home = process.env.CODEX_TEST_HOME, base = process.env.CODEX_WEB_URL;
const pgPort = Number(process.env.CODEX_METRIC_PG_PORT);
const out = path.resolve(process.env.REPORT_DIR || 'test-results/metric-governance-2026-10-28/browser');
assert(home?.startsWith('/tmp/') && base && pgPort);
fs.mkdirSync(out, {recursive:true});
const root = path.resolve('.'), workspace = home + '/workspace';
fs.mkdirSync(workspace, {recursive:true});
const examples = JSON.parse(fs.readFileSync(root + '/examples/metric-governance/rule.json', 'utf8'));
const expected = JSON.parse(fs.readFileSync(root + '/examples/metric-governance/expected.json', 'utf8'));
const env = {PATH:process.env.PATH, CODEX_HOME:home, CODEX_WEB_DB_STATE:home+'/web-databases', CODEX_WEB_ANALYSIS_ROOTS:workspace};
const serverLog = fs.openSync(out+'/web.log','w'), mcpLog=fs.openSync(out+'/mcp.log','w');
const server = spawn('python3', ['-B','web/server.py','--port',new URL(base).port,'--workspace',workspace], {env,stdio:['ignore',serverLog,serverLog]});
const mcp = spawn(root+'/.toolchains/databases/bin/python', ['-B','web/database/mcp_server.py'], {env,stdio:['pipe','pipe',mcpLog]});
let sequence=0, buffer='', threadId, connectionId, otherId, turn='metric-demo-task';
const pending=new Map(), results=[], errors=[], nativeCalls=[], toolCalls=[], rules={};
mcp.stdout.on('data',chunk=>{
 buffer+=chunk;
 for(;;){const end=buffer.indexOf('\n');if(end<0)break;const response=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);const waiter=pending.get(response.id);if(waiter){pending.delete(response.id);clearTimeout(waiter.timer);response.error?waiter.reject(Error(response.error.message)):waiter.resolve(response.result);}}
});
mcp.on('exit',code=>{for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(Error('Owned MCP exited '+code));}pending.clear();});
function request(method,params){
 const id=++sequence;
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP request timed out: '+method));},60000);pending.set(id,{resolve,reject,timer});mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
}
async function tool(name,args={},expectError=false){
 const started=performance.now();
 const result=await request('tools/call',{name,arguments:args,_meta:{threadId,'x-codex-turn-metadata':{turn_id:turn}}});
 toolCalls.push({name,elapsedMs:Number((performance.now()-started).toFixed(3)),rejected:!!result.isError});
 assert.equal(result.isError,expectError,result.content?.[0]?.text);
 return expectError?result.content[0].text:result.structuredContent;
}
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30000);
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>socket.on('framesent',event=>{try{const value=JSON.parse(event.payload);if(value.method)nativeCalls.push(value.method);}catch{}}));
const api=(action='',payload)=>page.evaluate(async({action,payload})=>databaseApi(action,payload),{action,payload});
const rpc=(method,params)=>page.evaluate(async({method,params})=>rpc(method,params),{method,params});
const manage=payload=>api('result',{metricRules:payload});
const dialog=()=>page.locator('dialog.metric-rules-dialog');
const save=()=>fs.writeFileSync(out+'/results.json',JSON.stringify({scope:'Actual owned PostgreSQL, web, native app-server and stdio MCP. Fictional business records only. Chat rendering events are fixtures, not model output.',results,errors,modelRequests:nativeCalls.filter(name=>['turn/start','turn/steer'].includes(name)).length,toolCalls},null,2)+'\n');
async function check(name,work){try{const detail=await work();results.push({name,status:'passed',...detail});save();}catch(error){results.push({name,status:'failed',error:error.stack});save();throw error;}}
async function openRules(){await page.locator('[data-view=databases]').click();await page.locator('[data-managed-connection-id="'+connectionId+'"]').getByRole('button',{name:'指标口径',exact:true}).click();await dialog().getByRole('button',{name:'新增口径草稿',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('dialog.metric-rules-dialog')?.hasAttribute('aria-busy'));}
async function closeRules(){if(await dialog().count())await dialog().getByRole('button',{name:'关闭指标口径',exact:true}).click();}
async function createRule(key){
 await dialog().getByRole('button',{name:'新增口径草稿',exact:true}).click();
 await dialog().locator('[name=metricRuleDefinition]').fill(JSON.stringify(examples.rules.find(rule=>rule.key===key).definition,null,2));
 await dialog().getByRole('button',{name:'预览口径说明',exact:true}).click();
 assert(await dialog().locator('.metric-rule-preview .metric-rule-summary').count());
 await dialog().getByRole('button',{name:'保存草稿',exact:true}).click();
 await dialog().getByRole('button',{name:'核对并确认此版本',exact:true}).waitFor();
 const values=(await manage({operation:'list',sourceId:connectionId})).rules;
 return values.find(rule=>rule.definition.table.name===examples.rules.find(rule=>rule.key===key).definition.table.name);
}
async function confirmRule(){
 await dialog().getByRole('button',{name:'核对并确认此版本',exact:true}).click();
 await dialog().locator('[name=businessOwner]').fill('演示业务负责人（测试声明）');
 await dialog().locator('[name=dataSteward]').fill('演示数据维护人员（测试声明）');
 await dialog().locator('[name=note]').fill('仅确认独立虚构示例；已核对字段、日期范围、退款归属、单位、舍入和零分母。不是客户生产口径或身份审批。');
 await dialog().locator('[name=metricRuleAcknowledged]').check();
 await dialog().getByRole('button',{name:'确认并启用此版本',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.metric-rules-message')?.textContent.includes('此版本已确认'));
}
async function emit(id,text){
 await api('result',{analysisEvidence:{action:'register',threadId,turnId:turn}});
 await page.evaluate(({id,text,turnId})=>{const threadId=state.thread.id,item={id,type:'agentMessage',phase:'final_answer',text};handleEvent({method:'turn/started',params:{threadId,turn:{id:turnId,status:'inProgress',items:[]}}});handleEvent({method:'item/completed',params:{threadId,turnId,item}});handleEvent({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed',items:[item]}}});},{id,text,turnId:turn});
}
async function report(id,name){const pendingDownload=page.waitForEvent('download');await page.locator('[data-export-analysis-report="'+id+'"]').click();const download=await pendingDownload;await download.saveAs(out+'/'+name);return fs.readFileSync(out+'/'+name,'utf8');}
let january,answer,freeAnswer,freeResult;
try{
 const deadline=Date.now()+60000;let ready=false;
 while(Date.now()<deadline){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert(ready,'Owned web server startup');
 await request('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'metric-demo-fixture',version:'1'}});
 await page.goto(base);await page.waitForFunction(()=>state.ready&&!state.threadLoading);assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),home);
 await check('真实连接独立只读数据库，口径管理按数据源隔离',async()=>{
  const payload={engine:'postgresql',name:'虚构业务指标验收',host:'127.0.0.1',port:pgPort,database:'fixture',username:'reader',readOnly:true};
  connectionId=(await api('save',payload)).connection.id;assert((await api('test',{id:connectionId})).success);
  otherId=(await api('save',{...payload,name:'另一数据源（保持无口径）'})).connection.id;
  threadId=(await rpc('thread/start',{cwd:workspace,model:'deepseek-flash'})).thread.id;
  await rpc('thread/inject_items',{threadId,items:[{type:'message',role:'user',content:[{type:'input_text',text:'Explicit metric demo fixture: no model request.'}]}]});
  await openRules();assert((await dialog().innerText()).includes('虚构业务指标验收'));
  assert.equal((await manage({operation:'list',sourceId:otherId})).rules.length,0);
  return{realDatabase:true,readOnlyAccount:true,modelRequests:0};
 });
 await check('浏览器保存草稿不会自动确认，工具拒绝执行未确认口径',async()=>{
  rules.ecommerce=await createRule('ecommerce');assert.equal(rules.ecommerce.status,'draft');
  const rejected=await tool('execute_metric',{rule_id:rules.ecommerce.id,version:rules.ecommerce.version,parameters:expected.cases[0].parameters},true);
  assert(rejected.length>0);
  assert.equal((await manage({operation:'list',sourceId:otherId})).rules.length,0);
  return{status:'passed',draftRejected:true,otherSourceUnchanged:true};
 });
 await check('用户确认后真实执行订单指标，正确处理取消、退款和日期右边界',async()=>{
  await confirmRule();rules.ecommerce=(await manage({operation:'list',sourceId:connectionId})).rules.find(rule=>rule.id===rules.ecommerce.id);assert.equal(rules.ecommerce.status,'confirmed');
  const listing=await tool('list_metric_rules',{source_id:connectionId});assert(JSON.stringify(listing).includes(rules.ecommerce.id));
  january=await tool('execute_metric',{rule_id:rules.ecommerce.id,version:rules.ecommerce.version,parameters:expected.cases[0].parameters});
  const data=await tool('read_result',{result_id:january.resultId});assert.equal(data.rowCount,1);
  for(const [key,value]of Object.entries(expected.cases[0].row))assert.equal(String(data.rows[0][key]),String(value),key);
  return{resultId:january.resultId,actual:data.rows[0],ruleVersion:rules.ecommerce.version};
 });
 await check('零分母与零分子使用不同结果，非法日期参数被拒绝',async()=>{
  const actual=[];
  for(const sample of expected.cases.filter(sample=>['zero_denominator','zero_numerator'].includes(sample.name))){const result=await tool('execute_metric',{rule_id:rules.ecommerce.id,version:rules.ecommerce.version,parameters:sample.parameters});const data=await tool('read_result',{result_id:result.resultId});for(const [key,value]of Object.entries(sample.row))assert.equal(value===null?data.rows[0][key]:String(data.rows[0][key]),value===null?null:String(value),sample.name+':'+key);actual.push({name:sample.name,row:data.rows[0]});}
  assert((await tool('execute_metric',{rule_id:rules.ecommerce.id,version:rules.ecommerce.version,parameters:{start_date:'2026-02-01',end_date:'2026-01-01'}},true)).length);
  return{actual,invalidRangeRejected:true};
 });
 await check('第二套服务效率配置无需修改引擎，聚合后计算满足率',async()=>{
  await dialog().getByRole('button',{name:'返回列表',exact:true}).click();rules.service=await createRule('service');await confirmRule();rules.service=(await manage({operation:'list',sourceId:connectionId})).rules.find(rule=>rule.id===rules.service.id);
  const sample=expected.cases.find(sample=>sample.rule==='service'),result=await tool('execute_metric',{rule_id:rules.service.id,version:rules.service.version,parameters:sample.parameters}),data=await tool('read_result',{result_id:result.resultId});
  for(const [key,value]of Object.entries(sample.row))assert.equal(String(data.rows[0][key]),String(value),key);
  return{actual:data.rows[0],sameTools:true};
 });
 await check('发布真实指标证据，任意Python派生结果不继承口径证明',async()=>{
  answer=await tool('publish_answer',{template:'演示订单净收款为 {{revenue}}，贡献利润为 {{profit}}，贡献利润率为 {{margin}}%。',references:{revenue:{result_id:january.resultId,row:0,column:'net_revenue'},profit:{result_id:january.resultId,row:0,column:'profit'},margin:{result_id:january.resultId,row:0,column:'margin_percent'}}});
  freeResult=await tool('run_python',{result_ids:[january.resultId],parameters:{id:january.resultId},code:"result=[{'value':datasets[parameters['id']][0]['profit']}]"});
  freeAnswer=await tool('publish_answer',{template:'普通计算值为 {{value}}。',references:{value:{result_id:freeResult.resultId,row:0,column:'value'}}});
  await closeRules();await page.locator('[data-view=chat]').click();await page.evaluate(id=>openThread(id),threadId);await page.waitForFunction(id=>state.thread?.id===id&&!state.threadLoading,threadId);
  await emit('metric-proof-fixture',answer.text);await page.waitForFunction(()=>document.querySelector('[data-item=metric-proof-fixture]')?.dataset.analysisVerification==='verified');
  const evidence=page.locator('[data-item=metric-proof-fixture] .analysis-metric-evidence');await evidence.waitFor();await evidence.locator('summary').click();assert((await evidence.innerText()).includes('贡献利润'));
  const exported=await report('metric-proof-fixture','metric-proof.md');assert(exported.includes('口径与推导检查'));assert(exported.includes(rules.ecommerce.id));assert(exported.includes(rules.ecommerce.hash));
  const completeDownload=page.waitForEvent('download');await evidence.getByRole('button',{name:'下载完整推导记录',exact:true}).click();const completeFile=await completeDownload;await completeFile.saveAs(out+'/full-derivation.json');
  const complete=JSON.parse(fs.readFileSync(out+'/full-derivation.json','utf8'));assert.equal(complete.proof.resultId,january.resultId);assert.equal(complete.proof.definitionHash,rules.ecommerce.hash);assert.deepEqual(complete.proof.parameters,expected.cases[0].parameters);assert.deepEqual(complete.proof.executionContext,{threadId,turnId:turn});assert.equal(complete.proof.steps.length,1);assert.equal(complete.proof.steps[0].sourceRows.length,3);assert.equal(complete.proof.steps[0].nodes.margin_percent.expression,'profit / net_revenue * 100');assert.equal(complete.proof.steps[0].nodes.profit.expression,'net_revenue - net_cost');assert.equal(complete.proof.steps[0].nodes.margin_percent.display,'56.71');assert.equal(complete.proof.steps[0].nodes.collected_total.sourceColumn,'collected_amount');assert(complete.proof.source.query.includes('demo_orders'));
  assert(await evidence.locator('pre').evaluateAll(nodes=>nodes.every(node=>{const bounds=node.getBoundingClientRect(),style=getComputedStyle(node);return bounds.right<=innerWidth+1&&(node.scrollWidth<=node.clientWidth+1||['auto','scroll'].includes(style.overflowX));})), 'Expanded proof must wrap or scroll within the message');
  await page.locator('[data-item=metric-proof-fixture]').evaluate(node=>node.scrollIntoView({block:'start'}));await page.screenshot({path:out+'/metric-proof-expanded.png'});
  await evidence.locator('summary').click();await page.locator('[data-item=metric-proof-fixture]').evaluate(node=>node.scrollIntoView({block:'start'}));await page.screenshot({path:out+'/metric-proof-summary.png'});
  await emit('free-result-fixture',freeAnswer.text);await page.waitForFunction(()=>document.querySelector('[data-item=free-result-fixture]')?.dataset.analysisVerification==='verified');assert.equal(await page.locator('[data-item=free-result-fixture] .analysis-metric-evidence').count(),0);
  const ordinary=await report('free-result-fixture','ordinary-execution-only.md');assert(!ordinary.includes('部分指标引用另有口径与推导检查'));
  return{actualToolPublished:true,chatEvents:'explicit UI fixtures',metricProofDownloaded:true,fullDerivationDownloaded:true,actualExecutionContext:true,intermediateFormulaChain:true,ordinaryPythonNotUpgraded:true};
 });
 await check('同一小型夹具测量本地执行开销，不冒充模型端到端耗时',async()=>{
  const ordinary=[],governed=[];
  for(let repetition=0;repetition<5;repetition++){
   const sql="SELECT SUM(collected_amount-refunded_amount) AS net_revenue, SUM(fulfilment_cost-recovered_cost) AS net_cost FROM demo_orders WHERE status='completed' AND booked_on >= DATE '2026-01-01' AND booked_on < DATE '2026-02-01'";
   let started=performance.now();await tool('query_database',{connection_id:connectionId,query:sql});ordinary.push(Number((performance.now()-started).toFixed(3)));
   started=performance.now();await tool('execute_metric',{rule_id:rules.ecommerce.id,version:rules.ecommerce.version,parameters:expected.cases[0].parameters});governed.push(Number((performance.now()-started).toFixed(3)));
  }
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  return{scope:'Local MCP on synthetic seven-row table; direct SQL aggregate versus governed query+all configured formulas+proof. Not equal-work or model-latency benchmark.',ordinarySqlMs:ordinary,governedMetricMs:governed,medianOrdinarySqlMs:median(ordinary),medianGovernedMetricMs:median(governed),extraModelCalls:0};
 });
 await check('桌面宽度与主题可查看配置和证据，刷新保留规则',async()=>{
  await openRules();await dialog().locator('.metric-rule-card').filter({hasText:rules.ecommerce.definition.name}).getByRole('button',{name:'查看口径',exact:true}).click();
  for(const width of [1440,1024]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>{const d=document.querySelector('dialog.metric-rules-dialog').getBoundingClientRect();return d.left>=0&&d.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth+1;}));await page.screenshot({path:out+'/metric-rule-'+width+'.png'});}
  await closeRules();await page.locator('#theme-toggle').click();await openRules();await dialog().locator('.metric-rule-card').filter({hasText:rules.ecommerce.definition.name}).getByRole('button',{name:'查看口径',exact:true}).click();await page.screenshot({path:out+'/metric-rule-dark-1024.png'});await closeRules();
  await page.reload();await page.waitForFunction(()=>state.ready&&!state.threadLoading);await openRules();assert((await dialog().innerText()).includes(rules.ecommerce.definition.name));
  return{desktopWidths:[1440,1024],dark:true,persistedAfterReload:true};
 });
 await check('保存新草稿不会沿用旧版确认，冲突保存被拒；停用阻止后续执行且历史可读',async()=>{
  await dialog().locator('.metric-rule-card').filter({hasText:rules.ecommerce.definition.name}).getByRole('button',{name:'查看口径',exact:true}).click();await dialog().getByRole('button',{name:'编辑为新草稿',exact:true}).click();
  const changed=structuredClone(rules.ecommerce.definition);changed.description+=' 此文本仅作为独立测试的新版本说明。';await dialog().locator('[name=metricRuleDefinition]').fill(JSON.stringify(changed,null,2));await dialog().getByRole('button',{name:'保存草稿',exact:true}).click();await dialog().getByRole('button',{name:'核对并确认此版本',exact:true}).waitFor();
  const current=(await manage({operation:'list',sourceId:connectionId})).rules.find(rule=>rule.id===rules.ecommerce.id);assert.equal(current.version,rules.ecommerce.version+1);assert.equal(current.status,'draft');
  await tool('execute_metric',{rule_id:current.id,version:current.version,parameters:expected.cases[0].parameters},true);
  await tool('execute_metric',{rule_id:rules.ecommerce.id,version:rules.ecommerce.version,parameters:expected.cases[0].parameters},true);
  await tool('publish_answer',{template:'旧版本贡献利润为 {{value}}。',references:{value:{result_id:january.resultId,row:0,column:'profit'}}},true);
  await assert.rejects(()=>manage({operation:'save',sourceId:connectionId,id:current.id,expectedVersion:rules.ecommerce.version,definition:changed}));
  await confirmRule();rules.ecommerce=(await manage({operation:'list',sourceId:connectionId})).rules.find(rule=>rule.id===current.id);
  const next=await tool('execute_metric',{rule_id:rules.ecommerce.id,version:rules.ecommerce.version,parameters:expected.cases[0].parameters});assert.equal(next.rowCount,1);
  await dialog().getByRole('button',{name:'停用此口径',exact:true}).click();await dialog().getByRole('button',{name:'确认停用',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.metric-rules-message')?.textContent.includes('已停用'));
  await tool('execute_metric',{rule_id:rules.ecommerce.id,version:rules.ecommerce.version,parameters:expected.cases[0].parameters},true);
  await tool('publish_answer',{template:'新发布的值为 {{value}}。',references:{value:{result_id:next.resultId,row:0,column:'profit'}}},true);
  const history=await api('result',{resultId:january.resultId,offset:0,limit:1});assert.equal(String(history.rows[0].profit),'170.30');
  const historicalProof=await manage({operation:'proof',resultId:january.resultId});assert.equal(historicalProof.proof.resultId,january.resultId);assert.equal(historicalProof.proof.steps[0].nodes.profit.display,'170.30');
  const csv=await page.request.get(base+'/api/databases/results/'+january.resultId+'.csv');assert(csv.ok());assert((await csv.text()).includes('170.30'));
  return{newVersionDraft:true,staleSaveRejected:true,disabledExecutionAndNewPublicationRejected:true,historyReadable:true,csvReadable:true,historicalProofReadable:true};
 });
 assert.equal(errors.length,0);assert.equal(nativeCalls.filter(name=>['turn/start','turn/steer'].includes(name)).length,0);
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{
 try{await closeRules();if(threadId){await rpc('thread/delete',{threadId});await api('result',{analysisEvidence:{action:'remove_thread',threadId}});}for(const id of [connectionId,otherId].filter(Boolean))await api('remove',{id});}catch(error){errors.push('Owned cleanup: '+error.message);process.exitCode=1;}
 save();await browser.close();
 for(const child of [mcp,server])if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(()=>{child.kill('SIGKILL');resolve();},5000))]);}
 fs.closeSync(serverLog);fs.closeSync(mcpLog);
 console.log(JSON.stringify({passed:results.filter(result=>result.status==='passed').length,failed:results.filter(result=>result.status==='failed').length,errors}));
}
