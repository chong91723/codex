// Actual analyst journey on a task-owned read-only AdventureWorks source.
// No model response, database result or user approval is fabricated.
import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/root/Codex/.toolchains/playwright/node_modules/playwright/index.mjs');
assert.equal(process.env.CODEX_CONFIRM_LIVE_MODEL_TEST,'1');
const fixturePath=process.env.CODEX_DISCOVERY_FIXTURE||'/tmp/codex-aw-user-audit.json';assert(fixturePath.startsWith('/tmp/'));
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8')),receipt=process.env.CODEX_AUDIT_SOURCE||'/tmp/codex-aw-audit-source.json';assert(receipt.startsWith('/tmp/'));
const {sourceId}=JSON.parse(fs.readFileSync(receipt,'utf8')),phase=process.env.CODEX_AUDIT_PHASE||'corrections';
assert(['corrections','analysis','manual-plan','reject-query','resilience','running-cancel','report-presentation','configuration','cleanup-source'].includes(phase));
const out=process.env.REPORT_DIR||'/root/Codex/test-results/adventureworks-user-audit-2026-10-28';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN||'/root/Codex/.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome',args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
page.setDefaultTimeout(30000);const checks=[],errors=[],events=[],calls=[],approvals=[],threads=new Set(),results=new Set();let threadId;
page.on('pageerror',e=>errors.push(e.message));page.on('websocket',socket=>{if(!socket.url().includes('/ws/rpc'))return;socket.on('framereceived',f=>{try{const m=JSON.parse(String(f.payload));if(threads.has(m.params?.threadId)&&['turn/completed','turn/started','turn/plan/updated','item/started','item/completed','error'].includes(m.method))events.push(m);}catch{}});socket.on('framesent',f=>{try{const m=JSON.parse(String(f.payload));if(threads.has(m.params?.threadId)&&['turn/start','turn/interrupt','thread/settings/update'].includes(m.method))calls.push(m);}catch{}});});
const api=(action,payload)=>page.evaluate(({action,payload})=>databaseApi(action,payload),{action,payload});
const rpc=(method,params)=>page.evaluate(({method,params})=>rpc(method,params),{method,params});
const knowledge=p=>api('result',{databaseKnowledge:{sourceId,...p}}),stateFor=()=>knowledge({operation:'state'}),dialog=()=>page.locator('dialog.database-exploration-dialog');
const arg=i=>typeof i.arguments==='string'?JSON.parse(i.arguments):i.arguments||{},content=i=>{if(i.result?.structuredContent)return i.result.structuredContent;const text=i.result?.content?.find(c=>c.type==='text')?.text||'{}';try{return JSON.parse(text);}catch{return {toolError:text};}};
function evidenceReplacer(key,value){if(value?.type==='mcpToolCall'&&value.tool==='list_databases'){const data=content(value);return {...value,result:{structuredContent:{...data,connections:(data.connections||[]).filter(c=>c.id===sourceId)}}};}return value;}
function save(){fs.writeFileSync(out+'/'+phase+'.json',JSON.stringify({scope:'Real current web, native DeepSeek Flash, own read-only public MySQL AdventureWorks. Explicit browser actions simulate this test user. No old user threads read. Stop/continue is a new turn, not a transaction checkpoint.',sourceId,phase,checks,errors,events,calls,approvals},evidenceReplacer,2)+'\n');}
async function check(name,fn){try{const evidence=await fn();checks.push({name,passed:true,evidence});console.log('PASS '+name);return evidence;}catch(e){checks.push({name,passed:false,error:e.stack});await page.screenshot({path:out+'/'+phase+'-failure.png',mask:[page.locator('aside')]}).catch(()=>{});throw e;}finally{save();}}
async function fresh(){const v=await rpc('thread/start',{cwd:await page.evaluate(()=>state.status.workspace),model:'deepseek-flash',config:{model_provider:'deepseek','tools.update_plan.enabled':true,'mcp_servers.codex_web_databases.tools.query_database.approval_mode':'prompt'}});threadId=v.thread.id;threads.add(threadId);assert.equal(v.model,'deepseek-flash');assert.equal(v.modelProvider,'deepseek');await page.evaluate(v=>{resetChat();state.threadSettings.set(v.thread.id,{model:v.model,modelProvider:v.modelProvider,collaborationMode:v.collaborationMode,approvalPolicy:v.approvalPolicy,sandboxPolicy:v.sandbox,effort:v.reasoningEffort});adoptThread(v.thread);showView('chat');$('#model').value='deepseek-flash';$('#effort').value='low';},v);return threadId;}
async function send(text){const before=calls.length;await page.locator('#prompt').fill(text);await page.locator('#send').click();await page.waitForFunction(()=>!composerState().pending,null,{timeout:45000});const sent=calls.slice(before).find(m=>m.method==='turn/start');assert(sent,'No native turn/start');await page.waitForFunction(()=>state.activeTurns.has(state.thread.id)||state.turns.length>0,null,{timeout:45000});return sent;}
async function requests({allowQueries=false,declineQueries=false}={}){for(const card of await page.locator('#requests .request-card').all()){
 const allow=card.getByRole('button',{name:'允许本次 MCP 调用',exact:true});if(await allow.isVisible()&&await allow.isEnabled()){
  const request=JSON.parse(await card.locator('pre').first().innerText()),params=request._meta?.tool_params||{};assert(JSON.stringify(request).includes('codex_web_databases'));
  if(params.connection_id)assert.equal(params.connection_id,sourceId,'Unexpected unrelated source');
  if(params.query){if(declineQueries){await card.getByRole('button',{name:'拒绝 MCP 请求',exact:true}).click();approvals.push({threadId,query:params.query,decision:'decline'});continue;}assert(allowQueries,'Unexpected business query before plan approval: '+params.query);}
  await allow.click();approvals.push({threadId,params,decision:'accept'});
 }
 const question=card.getByRole('button',{name:'提交回答',exact:true});if(await question.isVisible()){
  const request=JSON.parse(await card.locator('pre').first().innerText()),answers=[];
  for(const [index,q]of request.questions.entries()){
   const text=q.question+' '+q.id;let answer;
   if(/年度范围|year_scope|哪些.*年/.test(text)){const years=oracle();answer='只比较 '+years[1].year+' 年与 '+years[0].year+' 年。';}
   else if(/客单价|aov_definition/.test(text))answer='按每笔有效线上订单：订单头 SubTotal 合计除以去重订单数。';
   else if(/复购|repeat_definition/.test(text))answer='年度复购客户率：同一自然年同一 CustomerID 至少两个不同有效线上订单的客户数，除以该年度有有效线上订单的去重客户数。';
   else if(/季度|趋势/.test(text))answer='按已确认的比较期与基期，展示各自然季度趋势并做同季度同比。';
   else if(/区域|图表|输出|报告|明细|范围|对照|展示|变化|对比/.test(text)&&q.options?.length)answer=q.options.find(o=>/Recommended|推荐/.test(o.label))?.label||q.options[0].label;
   else if(q.options?.length&&!q.isSecret)answer=q.options.find(o=>/Recommended|推荐/.test(o.label))?.label||q.options[0].label;
   else throw Error('Unspecified clarification: '+q.question);
   await card.locator('.question').nth(index).getByPlaceholder('输入你的回答').fill(answer);answers.push({question:q.question,answer});
  }
  approvals.push({threadId,kind:'clarification',answers});await question.click();
 }
 if(await card.getByRole('button',{name:'允许一次',exact:true}).isVisible())throw Error('Unexpected shell approval');
}}
async function finish({allowQueries=false,declineQueries=false,after=0,timeout=420000}={}){const end=Date.now()+timeout;let lastSave=0;while(Date.now()<end){if(Date.now()-lastSave>5000){save();lastSave=Date.now();}await requests({allowQueries,declineQueries});const terminal=events.slice(after).find(e=>e.method==='turn/completed'&&e.params.threadId===threadId);if(terminal){const turn=terminal.params.turn;const items=await page.evaluate(id=>[...state.items.values()].filter(v=>v.turnId===id).map(v=>v.item),turn.id);for(const i of items)if(i.type==='mcpToolCall'){if(arg(i).connection_id)assert.equal(arg(i).connection_id,sourceId);if(i.status==='completed'&&!i.result?.isError){const c=content(i);if(c.resultId)results.add(c.resultId);}}save();assert.equal(turn.status,'completed',JSON.stringify(turn.error));return {threadId,turnId:turn.id,items,answer:items.filter(i=>i.type==='agentMessage'&&i.phase!=='commentary').at(-1)?.text,plans:items.filter(i=>i.type==='plan').map(i=>i.text)};}await page.waitForTimeout(150);}throw Error('Native Flash task timeout in '+phase);}
async function openDetails(){await close();await page.locator('[data-view=databases]').click();await page.locator(`[data-managed-connection-id="${sourceId}"]`).getByRole('button',{name:'数据库探索',exact:true}).click();await dialog().getByRole('button',{name:'查看结构、解释与历史记录',exact:true}).click();await idle();}
async function idle(){await page.waitForFunction(()=>!document.querySelector('dialog.database-exploration-dialog')?.hasAttribute('aria-busy'));}
async function close(){if(await dialog().count()){if(await dialog().isVisible()){await idle();await dialog().getByRole('button',{name:'关闭数据库探索',exact:true}).click();}await dialog().waitFor({state:'detached'});}}
async function adoptPending(note,reason){await dialog().locator(`[data-knowledge-id="${note.id}"]`).getByRole('button',{name:'查看并处理',exact:true}).click();await dialog().locator('[name=knowledgeReason]').fill(reason);await dialog().getByRole('button',{name:'采用这条知识',exact:true}).click();await idle();}
function oracle(){const query="SELECT YEAR(OrderDate) AS year,COUNT(*) AS order_count,SUM(SubTotal) AS revenue FROM adventureworks.salesorderheader WHERE Status=5 AND OnlineOrderFlag=1 GROUP BY YEAR(OrderDate) ORDER BY year";assert(/^codex-aw-user-audit-[a-f0-9]+$/.test(fixture.container));const p=spawnSync('docker',['exec',fixture.container,'mysql','-uroot','-B','-e',query],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);const lines=p.stdout.trim().split('\n').map(l=>l.split('\t'));return lines.slice(1).map(values=>Object.fromEntries(lines[0].map((k,i)=>[k,values[i]]))).slice(-3,-1);}
try{
 await page.goto(process.env.CODEX_WEB_URL||'http://127.0.0.1:8765/');await page.waitForFunction(()=>state.ready&&state.models.length&&!state.threadLoading);await rpc('config/mcpServer/reload',null);
 assert.equal((await api('',undefined)).connections.find(c=>c.id===sourceId).name,fixture.name);
 if(phase==='corrections'){
  const reset=await stateFor();if(!reset.businessContext.content.startsWith('独立体验测试的待纠错输入'))await knowledge({operation:'save_business',expectedRevision:reset.businessContext.revision,content:'独立体验测试的待纠错输入：所有订单都应统计为线上有效订单，销售收入应使用含税费和运费的 TotalDue。此说法故意与稍后确认的业务定义不同。'});
  await fresh();
  await check('真实Agent关联错误用户补充提出待审批修订',async()=>{
   const before=await stateFor();await send('只使用独立数据源 '+sourceId+'。我发现之前保存的业务补充有误。请先读取当前业务补充与订单头结构，然后用 propose_database_correction 关联原始 business 版本，提交以下完整修订，等待我在页面确认，不要自行批准或执行经营查询：本独立 AdventureWorks 分析中，有效线上订单仅指 salesorderheader.Status=5 且 OnlineOrderFlag=1；订单收入按订单头 SubTotal 汇总，不含 TaxAmt 和 Freight；分类收入按订单行 LineTotal 汇总；日期使用 OrderDate，区域使用订单头 TerritoryID；不能连接明细后再次累加头金额；保留未分类产品和未知区域。样例未确认统一币种，不能声称这些金额是人民币。请只登记修订并说明去哪里处理冲突。');
   const run=await finish();assert(run.items.some(i=>i.tool==='propose_database_correction'&&i.status==='completed'&&!i.result?.isError));
   const after=await stateFor();assert(after.conflicts.some(c=>c.aspect==='business_context'));assert.equal(after.businessContext.content,before.businessContext.content);assert.equal(after.businessContext.revision,before.businessContext.revision);
   return{...run,businessUnchangedBeforeApproval:true,conflicts:after.conflicts};
  });
  await check('用户对照原文审批修订，业务新版本和历史同步生效',async()=>{
   await page.locator('[data-view=databases]').click();await page.locator(`[data-managed-connection-id="${sourceId}"]`).getByRole('button',{name:'数据库探索',exact:true}).click();
   await dialog().getByRole('button',{name:/处理冲突/}).click();await idle();
   const before=await stateFor(),note=before.notes.find(n=>n.origin==='agent'&&n.status==='pending'&&n.correctionOf?.kind==='business');assert(note);
   await adoptPending(note,'模拟数据负责人核对字段与演示分析目标，明确采信本次完整修订。');
   const after=await stateFor();assert.equal(after.businessContext.revision,before.businessContext.revision+1);assert.equal(after.businessContext.content,note.content);assert(!after.conflicts.some(c=>c.aspect==='business_context'));
   const history=await knowledge({operation:'business_history'});assert(history.records.some(r=>r.content===before.businessContext.content));
   await dialog().screenshot({path:out+'/approved-business-correction.png'});await close();return{before:before.businessContext,after:after.businessContext,history:history.records};
  });
  await check('用户纠正实际Agent探索候选，保留原文并明确采用',async()=>{
   const initial=await stateFor(),original=initial.notes.find(n=>n.origin==='agent'&&n.aspect==='row_identity');assert(original,'Baseline must include actual Agent candidate');
   await openDetails();await dialog().getByRole('tab',{name:'业务知识',exact:true}).click();await dialog().locator(`[data-knowledge-id="${original.id}"]`).getByRole('button',{name:'纠正此说明',exact:true}).click();
   const corrected='复合主键保证 SalesOrderID 与 SalesOrderDetailID 的组合唯一；仅凭该声明，不能认定 SalesOrderDetailID 在现有数据中一定重复，也不能认定它有独立唯一约束。订单行分析保留组合标识；如需单字段关联，须另核实约束与实际重复情况。';
   await dialog().locator('[name=knowledgeCorrection]').fill(corrected);await dialog().getByRole('button',{name:'提交纠正并核对',exact:true}).click();await idle();
   assert((await stateFor()).conflicts.some(c=>c.key===original.key));await dialog().locator('[name=knowledgeReason]').fill('复核物理约束与数据事实的区别，防止从复合主键推出不存在的重复事实。');await dialog().getByRole('button',{name:'采用这条知识',exact:true}).click();await idle();
   const after=await stateFor();assert(after.notes.some(n=>n.content===corrected&&n.status==='accepted'&&n.correctionOf?.id===original.id));assert.equal(after.notes.find(n=>n.id===original.id).status,'rejected');await close();return{original,corrected,snapshotUnchanged:initial.snapshot.id===after.snapshot.id};
  });
  await check('用户纠正自动工具检查的解释，不改写实际结构',async()=>{
   await openDetails();const observations=dialog().locator('.exploration-observation').filter({has:page.locator('[data-finding-id]')});await observations.locator('summary').click();
   const card=dialog().locator('[data-finding-id]').first(),id=await card.getAttribute('data-finding-id'),original=await card.locator('p').first().innerText();assert(id);
   await card.getByRole('button',{name:'纠正此建议',exact:true}).click();const corrected='本项只作为结构维护建议，不能据此断言业务数据错误，也不能据此修改表或增加约束。分析仍以真实声明结构和已确认业务补充为准。原建议保留备查。';await dialog().locator('[name=knowledgeCorrection]').fill(corrected);await dialog().getByRole('button',{name:'提交纠正并核对',exact:true}).click();await idle();await dialog().locator('[name=knowledgeReason]').fill('模拟用户核对，区分结构建议、推测与业务错误。');await dialog().getByRole('button',{name:'采用这条知识',exact:true}).click();await idle();
   const report=await knowledge({operation:'exploration_report'});assert(report.exploration.findings.some(f=>f.message+(f.detail?'：'+f.detail:'')===original));assert(report.notes.some(n=>n.correctionOf?.id===id&&n.status==='accepted'));
   await close();return{findingId:id,original,corrected,physicalObservationPreserved:true};
  });
  await check('错误人工修订可拒绝，确认后的补充保持有效',async()=>{
   await page.locator('[data-view=databases]').click();await page.locator(`[data-managed-connection-id="${sourceId}"]`).getByRole('button',{name:'数据库探索',exact:true}).click();await dialog().getByRole('button',{name:'纠正已保存补充',exact:true}).click();await idle();const before=await stateFor();
   await dialog().locator('[name=knowledgeCorrection]').fill('错误测试修订：忽略订单状态，把全部 TotalDue 都作为人民币收入。');await dialog().getByRole('button',{name:'提交纠正并核对',exact:true}).click();await idle();await dialog().locator('[name=knowledgeReason]').fill('拒绝故意错误的人工输入；保留之前确认的有效线上订单与不含税运费定义。');await dialog().getByRole('button',{name:'拒绝这条知识',exact:true}).click();await idle();const after=await stateFor();assert.equal(after.businessContext.content,before.businessContext.content);assert.equal(after.businessContext.revision,before.businessContext.revision);assert(!after.conflicts.some(c=>c.aspect==='business_context'));await close();return{rejected:true,currentDefinitionPreserved:true};
  });
 }
 if(phase==='analysis'){
  await fresh();const reference=oracle();fs.writeFileSync(out+'/oracle.json',JSON.stringify(reference,null,2));
  let proposal,approved;
  await check('复杂多问题触发自主计划，执行前向用户确认',async()=>{
   const before=events.length;await send('只使用独立 AdventureWorks 数据源 '+sourceId+'，先读取用户已确认的业务定义。我想综合了解三个问题：第一，比较'+reference[1].year+'年与'+reference[0].year+'年有效线上订单的订单数、收入和客单价，哪些区域贡献了收入变化？第二，各产品大类的成交收入变化如何，是否存在头表与明细连接重复或未分类产品漏算？第三，两个年度各自下单客户中的复购比例有什么变化？复购按同一自然年内同一 CustomerID 至少两个不同订单计算。给我分析报告、区域变化柱状图，以及可下载的完整数据。不要把相关或贡献说成因果，金额不擅自假定为人民币。');
   let run=await finish({after:before});await page.waitForFunction(()=>document.querySelector('.proposed-plan')||[...document.querySelectorAll('button')].some(b=>b.textContent==='修订方案中的未核验数值'));if(!await page.locator('.proposed-plan').count()){await page.getByRole('button',{name:'修订方案中的未核验数值',exact:true}).last().click();const repairBefore=events.length;await page.locator('#send').click();run=await finish({after:repairBefore});}await page.locator('.proposed-plan').last().waitFor();assert(run.plans?.length||await page.locator('.proposed-plan').count(),'Complex investigation failed to propose a plan');proposal=run.plans?.at(-1)||run.answer;await page.locator('.proposed-plan').last().waitFor();await page.screenshot({path:out+'/automatic-plan.png',mask:[page.locator('aside')]});return{...run,reference,modelSelectedPlanning:true};
  });
  await check('计划讨论支持用户修改，保留未分类与未知区域',async()=>{
   await page.locator('.proposed-plan').last().getByRole('button',{name:'修改分析方案',exact:true}).click();const before=events.length;
   await send('修改方案：保留未知区域和未分类，不能用内连接静默排除。头表收入与品类的行金额要分开对账，差额如实解释，不强行相等。复购分母是该年度有有效线上订单的去重客户数，客单价是订单头小计合计除以去重订单数。图表只保留区域对比柱状图，产品大类用表格。我还没有批准执行，请先展示修改后的最终方案。');
   const run=await finish({after:before});assert(run.plans?.length||await page.locator('.proposed-plan').count());proposal=run.plans?.at(-1)||run.answer;assert(/未知|未分类/.test(proposal));return run;
  });
  await check('确认计划后展示真实进度，中途停止确实中断本轮',async()=>{
   const before=events.length,callBefore=calls.length;await page.locator('.proposed-plan').last().getByRole('button',{name:'确认并执行分析',exact:true}).click();await page.locator('#approved-plan').fill(proposal);await page.locator('#dialog-submit').click();await page.waitForFunction(()=>!composerState().pending&&!state.nativeModePending,null,{timeout:45000});
   const deadline=Date.now()+240000;let paused=false,queryCount=0,pendingQuery;
   while(Date.now()<deadline){
    queryCount=events.slice(before).filter(e=>e.method==='item/completed'&&e.params.item?.tool==='query_database'&&e.params.item.status==='completed'&&!e.params.item.result?.isError).length;
    const cards=await page.locator('#requests .request-card').all();for(const card of cards){const allow=card.getByRole('button',{name:'允许本次 MCP 调用',exact:true});if(!await allow.isVisible()||!await allow.isEnabled())continue;const request=JSON.parse(await card.locator('pre').first().innerText()),params=request._meta?.tool_params||{};assert(JSON.stringify(request).includes('codex_web_databases'));if(params.connection_id)assert.equal(params.connection_id,sourceId);if(params.query&&queryCount>0){pendingQuery=params.query;paused=true;break;}await allow.click();approvals.push({threadId,params,decision:'accept-before-pause'});}
    if(paused)break;if(events.slice(before).some(e=>e.method==='turn/completed'))throw Error('Execution finished before pause checkpoint');await page.waitForTimeout(150);
   }
   assert(paused,'No genuine later query approval observed');const plans=events.slice(before).filter(e=>e.method==='turn/plan/updated');assert(plans.length,'No actual native execution progress');
   await page.locator('#execution-progress-banner').waitFor();await page.locator('#execution-progress-banner').screenshot({path:out+'/real-execution-progress.png'});
   for(const e of events.slice(before))if(e.params?.item?.type==='mcpToolCall'){const v=content(e.params.item);if(v.resultId)results.add(v.resultId);}
   await page.locator('#send').click();await page.waitForFunction(()=>!state.activeTurns.has(state.thread.id),null,{timeout:15000});assert(calls.slice(callBefore).some(c=>c.method==='turn/interrupt'));
   const stopped=events.slice(before).find(e=>e.method==='turn/completed');assert.equal(stopped?.params.turn.status,'interrupted');approved={proposal,firstQueryCount:queryCount,interruptedTurnId:stopped.params.turn.id};
   return{nativePlanUpdates:plans,queriesCompletedBeforeStop:queryCount,pendingQuery,actualInterruptSent:true,terminalStatus:stopped.params.turn.status};
  });
  await check('暂停后修改输出并继续执行，回答全部问题且与独立SQL一致',async()=>{
   const before=events.length;await send('刚才是我主动暂停。现确认继续执行已经批准的方案；补充修改：结论中明确区分各年度有效线上订单总数、订单头收入、客单价、区域贡献、产品大类收入及复购比例，不遗漏任何一个问题。保留原始查询结果；如果必须重新查询要说明原因。区域图仍用 ECharts 柱状图，分类只用表格，不生成其他图片。继续当前分析，无须重新给计划让我再次确认。');
   const run=await finish({after:before,allowQueries:true,timeout:600000});assert(run.answer,'No final answer');
   const verification=await api('result',{analysisEvidence:{action:'verify',threadId,turnId:run.turnId,text:run.answer,requireEvidence:true}});
   checks.push({name:'数值对照前保留完整回答和执行证据',passed:true,evidence:{...run,verification}});save();
   assert.equal(verification.status,'verified');const numeric=verification.evidence.map(e=>Number(String(e.value).replaceAll(',','')));
   for(const row of reference){assert(numeric.some(n=>n===Number(row.order_count)),'Final response omitted or misstated annual order count '+row.year);assert(numeric.some(n=>Math.abs(n-Number(row.revenue))<.02),'Annual revenue differs from independent fixed SQL '+row.year);}
   assert(/区域/.test(run.answer)&&/复购/.test(run.answer)&&/品类|类别|大类/.test(run.answer));assert(run.items.some(i=>i.tool==='create_chart'&&i.status==='completed'&&!i.result?.isError));
   await page.waitForFunction(()=>document.querySelector('[data-analysis-verification="verified"]'));
   const exportButton=page.getByRole('button',{name:'下载结论',exact:true}).last();await exportButton.waitFor();const downloaded=page.waitForEvent('download');await exportButton.click();const download=await downloaded;await download.saveAs(out+'/analysis-report.md');const exported=fs.readFileSync(out+'/analysis-report.md','utf8');assert(exported.includes('数值已匹配'));
   const cards=page.locator('.unified-analysis-result');let chartCard;for(const card of await cards.all())if(await card.getByRole('tab',{name:'图表',exact:true}).isEnabled())chartCard=card;
   if(chartCard){await chartCard.getByRole('tab',{name:'数据',exact:true}).click();assert(await chartCard.locator('table').isVisible());await chartCard.getByRole('tab',{name:'图表',exact:true}).click();assert(await chartCard.locator('canvas').count()>0);}
   await page.screenshot({path:out+'/complex-analysis-answer.png',mask:[page.locator('aside')]});return{...run,verification,independentAnnualTotalsMatched:true,reportDownloaded:true,sameTaskContinued:true};
  });
 }
 if(phase==='manual-plan'){
  await fresh();await check('用户主动用斜杠plan生成方案，等待确认期间不执行汇总',async()=>{const before=events.length;await send('/plan 请使用独立数据源 '+sourceId+'，按已经确认的有效线上订单定义，设计比较年度客单价、季度趋势与复购的分析方案，解释头表与明细如何避免重复；不要执行经营查询，等待我确认。');const run=await finish({after:before});assert(run.plans?.length||await page.locator('.proposed-plan').count());assert(!run.items.some(i=>i.tool==='query_database'&&i.status==='completed'));assert.equal(await page.evaluate(()=>currentMode()),'plan');await page.screenshot({path:out+'/manual-plan.png',mask:[page.locator('aside')]});return run;});
 }
 if(phase==='reject-query'){
  await fresh();await check('用户拒绝查询审批，模型不能显示查询成功或伪造结果',async()=>{const before=events.length;await send('只使用独立数据源 '+sourceId+'，查询 salesorderheader 的订单总数，统计列别名用 approval_probe。这是简单查询，不需要计划。如果查询审批被我拒绝，请立即停止，不要重试，也不要估算数字，只说明操作被拒绝，尚未得到查询结果。');const run=await finish({after:before,declineQueries:true});assert(approvals.some(a=>a.decision==='decline'));assert(!run.items.some(i=>i.tool==='query_database'&&i.status==='completed'&&!i.result?.isError));assert(/拒绝|取消|未获|未执行/.test(run.answer));return run;});
 }
 if(phase==='resilience'){
  await fresh();let resultId;
  await check('自然语言生成实际订单明细，分页跳转并下载完整CSV',async()=>{
   const before=events.length;await send('只使用独立数据源 '+sourceId+'，请生成订单收入最高的六十五条有效线上订单明细，字段为订单号、订单日期、客户号和订单头 SubTotal，按金额降序、订单号稳定排序，保留原始字段名以便复核。这是简单明细查询，无须计划，不需要图表。让我在结果卡片翻页和下载完整CSV。正文只简短说明数据已经准备好，不重复明细或统计，也不要另算合计。');
   const run=await finish({after:before,allowQueries:true});const query=run.items.find(i=>i.tool==='query_database'&&i.status==='completed'&&!i.result?.isError&&(content(i).rowCount===65||content(i).results?.some(r=>r.rowCount===65)));assert(query);const output=content(query);resultId=output.resultId||output.results?.[0]?.resultId;assert(resultId);
   const card=page.locator('[data-analysis-result-id="'+resultId+'"]:visible');await card.waitFor();await card.getByRole('tab',{name:'数据',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-analysis-result-id="'+id+'"] .analysis-result-pagination')?.textContent.includes('1 / 4'),resultId);
   assert.equal(await card.locator('tbody tr').count(),20);await card.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-analysis-result-id="'+id+'"] .analysis-result-pagination')?.textContent.includes('2 / 4'),resultId);
   await card.getByRole('spinbutton',{name:'结果页码',exact:true}).fill('4');await card.getByRole('button',{name:'跳转',exact:true}).click();await page.waitForFunction(id=>document.querySelector('[data-analysis-result-id="'+id+'"] .analysis-result-pagination')?.textContent.includes('4 / 4'),resultId);assert.equal(await card.locator('tbody tr').count(),5);
   await card.getByRole('spinbutton',{name:'结果页码',exact:true}).fill('5');await card.getByRole('button',{name:'跳转',exact:true}).click();assert.match(await card.locator('.analysis-result-status').innerText(),/整数页码/);assert.equal(await card.locator('tbody tr').count(),5);
   const downloaded=page.waitForEvent('download');await card.getByRole('link',{name:'下载完整 CSV',exact:true}).click();const download=await downloaded;await download.saveAs(out+'/top-orders.csv');assert.equal(fs.readFileSync(out+'/top-orders.csv','utf8').trim().split(/\r?\n/).length,66);
   for(const width of [1024,1440]){await page.setViewportSize({width,height:1000});const bounds=await card.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width);await page.screenshot({path:out+'/orders-'+width+'.png',mask:[page.locator('aside')]});}
   return{...run,resultId,rows:65,pageSize:20,lastPageRows:5,invalidPagePreservesData:true,csvRows:65};
  });
  await check('刷新和断线重连恢复同一分析，草稿保留且不重发模型任务',async()=>{
   const before=calls.filter(c=>c.method==='turn/start').length;const draft='尚未发送的后续问题：请继续解释这些订单';await page.locator('#prompt').fill(draft);await page.locator('#prompt').dispatchEvent('input');await page.reload();await page.waitForFunction(id=>state.ready&&state.thread?.id===id&&!state.threadLoading,threadId,{timeout:60000});assert.equal(await page.locator('#prompt').inputValue(),draft);await page.locator('[data-analysis-result-id="'+resultId+'"]:visible').waitFor();
   await page.evaluate(()=>{window.__auditOldSocket=state.ws;state.ws.close();});await page.waitForFunction(()=>state.ws!==window.__auditOldSocket&&state.ready,null,{timeout:45000});assert.equal(await page.evaluate(()=>state.thread?.id),threadId);assert.equal(await page.locator('#prompt').inputValue(),draft);assert.equal(calls.filter(c=>c.method==='turn/start').length,before);return{sameThread:true,draftPreserved:true,noRepeatedSubmission:true,resultRecovered:true};
  });
 }
 if(phase==='cleanup-source'){await api('remove',{id:sourceId});checks.push({name:'Remove only owned audit source; knowledge history retained by policy',passed:true});}
 if(phase==='configuration'){
  await check('实际MCP新增工具可见，原生保留技能可读取',async()=>{const status=await rpc('mcpServerStatus/list',{limit:100,detail:'toolsAndAuthOnly'});const server=status.data.find(s=>s.name==='codex_web_databases');assert(server);const names=Object.keys(server.tools);assert(names.some(n=>n==='propose_database_correction'||n.endsWith('__propose_database_correction')));const skills=await rpc('skills/list',{cwds:[await page.evaluate(()=>state.status.workspace)],forceReload:true});const retained=(skills.data||[]).flatMap(d=>d.skills||[]).filter(s=>s.scope==='system'&&['openai-docs','review-agent','skill-creator','skill-installer'].includes(s.name));assert(retained.length);return{managedToolNames:names,retainedNativeSkills:retained.map(s=>({name:s.name,enabled:s.enabled,scope:s.scope})),configurationNotChanged:true,skillExecutionNotTested:true};});
  await check('重新探索相同数据库后保留已采用纠正与业务定义',async()=>{const before=await stateFor();await page.locator('[data-view=databases]').click();await page.locator(`[data-managed-connection-id="${sourceId}"]`).getByRole('button',{name:'数据库探索',exact:true}).click();const previousJob=await knowledge({operation:'exploration_status'});await dialog().getByRole('button',{name:'重新探索',exact:true}).click();let currentJob;const deadline=Date.now()+150000;while(Date.now()<deadline){currentJob=await knowledge({operation:'exploration_status'});if(currentJob.id!==previousJob?.id&&currentJob.status==='completed')break;if(currentJob.status==='failed')throw Error(currentJob.error);await page.waitForTimeout(150);}assert(currentJob.id!==previousJob?.id&&currentJob.status==='completed','No newly completed exploration');const after=await stateFor();assert.notEqual(after.snapshot.id,before.snapshot.id);assert.equal(after.snapshot.schemaHash,before.snapshot.schemaHash);assert.equal(after.businessContext.content,before.businessContext.content);for(const note of before.notes.filter(n=>n.status==='accepted'&&!n.stale))assert(after.notes.some(n=>n.id===note.id&&n.status==='accepted'&&!n.stale));await dialog().screenshot({path:out+'/reexploration-preserves-decisions.png'});await close();return{previousSnapshot:before.snapshot.id,newSnapshot:after.snapshot.id,sameSchemaHash:true,userDecisionsPreserved:true};});
 }
 if(phase==='running-cancel'){
  await fresh();await check('实际执行中的MySQL只读查询停止后退出，之后可在同一任务继续',async()=>{
   const active=()=>{const p=spawnSync('docker',['exec',fixture.container,'mysql','-uroot','-N','-e',"SELECT COUNT(*) FROM INFORMATION_SCHEMA.PROCESSLIST WHERE USER='exploration_reader' AND DB='adventureworks' AND INFO LIKE '%audit_cancel_marker%'"],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);return Number(p.stdout.trim());};
   const before=events.length;await send('这是独立数据库的受控取消验收，我会在实际查询运行时点击停止，不做经营分析，不要规划。只在数据源 '+sourceId+' 执行以下只读 SQL，禁止改写、分批或加 LIMIT：SELECT SUM(a.SalesOrderDetailID * b.SalesOrderDetailID) AS audit_cancel_marker FROM salesorderdetail a CROSS JOIN salesorderdetail b。不要访问其他数据源或使用命令工具。');
   const deadline=Date.now()+90000;let running=false;while(Date.now()<deadline){await requests({allowQueries:true});if(active()>0){running=true;break;}if(events.slice(before).some(e=>e.method==='turn/completed'))break;await page.waitForTimeout(100);}assert(running,'Owned query never observed executing on MySQL');
   const stoppedAt=Date.now();await page.locator('#send').click();await page.waitForFunction(()=>!state.activeTurns.has(state.thread.id),null,{timeout:15000});const end=Date.now()+7000;while(active()>0&&Date.now()<end)await page.waitForTimeout(100);assert.equal(active(),0,'Database query still executing after interrupt');const cancelMs=Date.now()-stoppedAt;
   const terminal=events.slice(before).find(e=>e.method==='turn/completed');assert.equal(terminal?.params.turn.status,'interrupted');assert(!events.slice(before).some(e=>e.method==='item/completed'&&e.params.item?.tool==='query_database'&&e.params.item.status==='completed'&&!e.params.item.result?.isError));
   const continued=events.length;await send('刚才是我主动取消数据库查询。不要重试，也不调用工具，只回复：已停止，可以继续。');const run=await finish({after:continued});assert(run.answer.includes('已停止'));return{controlledStressQuery:true,observedExecutingOnServer:true,serverQueryExited:true,cancelMs,nativeStatus:terminal.params.turn.status,noCompletedQueryArtifact:true,continuedThreadId:threadId,continuation:run.answer};
  });
 }
 if(phase==='report-presentation'){
  await fresh();await check('新任务实际复用修订定义，短结论不暴露内部结果编号',async()=>{const before=events.length;await send('只使用独立数据源 '+sourceId+'，根据已经确认的口径，告诉我目前有效线上订单总数和订单收入合计。只需简短结论，说明收入是否包含税和运费，不需要图表或计划。');const run=await finish({after:before,allowQueries:true});assert(run.answer);const verified=await api('result',{analysisEvidence:{action:'verify',threadId,turnId:run.turnId,text:run.answer,requireEvidence:true}});assert.equal(verified.status,'verified');assert(!/\b[a-f0-9]{24,64}\b/i.test(run.answer));assert(/税/.test(run.answer)&&/运费/.test(run.answer));const contexts=run.items.filter(i=>i.tool==='read_database_context'&&i.status==='completed').map(content);assert(contexts.some(c=>c.notes?.some(n=>n.aspect==='business_context'&&n.businessRevision)),'Corrected definition was not read in new task');return{...run,verified,noInternalIdsInConclusion:true};});
 }
 assert.deepEqual(errors,[]);
}catch(e){if(!checks.some(c=>!c.passed))checks.push({name:'Prerequisite or flow failure',passed:false,error:e.stack});console.error(e.stack);process.exitCode=1;}
finally{for(const event of events){const item=event.params?.item;if(event.method==='item/completed'&&item?.type==='mcpToolCall'&&item.status==='completed'&&!item.result?.isError){const data=content(item);if(data.resultId)results.add(data.resultId);for(const result of data.results||[])if(result.resultId)results.add(result.resultId);}}for(const id of threads){try{await page.evaluate(async id=>{const turn=state.activeTurns.get(id);if(turn)await interruptTurn(id,turn);},id);await rpc('thread/delete',{threadId:id});}catch(e){checks.push({name:'Owned thread cleanup',passed:false,error:e.message});process.exitCode=1;}}for(const id of results)await api('clear_result',{resultId:id}).catch(()=>{});save();await browser.close();console.log(JSON.stringify({phase,checks:checks.map(c=>({name:c.name,passed:c.passed})),errors}));}
