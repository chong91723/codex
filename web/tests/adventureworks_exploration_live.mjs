import fs from 'node:fs';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/root/Codex/.toolchains/playwright/node_modules/playwright/index.mjs');
assert.equal(process.env.CODEX_CONFIRM_LIVE_MODEL_TEST,'1');const fixturePath=process.env.CODEX_DISCOVERY_FIXTURE,receipt=process.env.CODEX_AUDIT_SOURCE;assert(fixturePath?.startsWith('/tmp/')&&receipt?.startsWith('/tmp/'));const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8')),out=process.env.REPORT_DIR;fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN||'/root/Codex/.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome',args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:1000}});
const events=[],errors=[],checks=[];let sourceId,threadId;
page.on('pageerror',e=>errors.push(e.message));page.on('websocket',s=>s.on('framereceived',f=>{try{let m=JSON.parse(String(f.payload));if(m.params?.threadId===threadId&&['turn/completed','item/completed'].includes(m.method))events.push(m);}catch{}}));
const api=(action,payload)=>page.evaluate(({action,payload})=>databaseApi(action,payload),{action,payload});
const rpc=(method,params)=>page.evaluate(({method,params})=>rpc(method,params),{method,params});
const knowledge=p=>api('result',{databaseKnowledge:{sourceId,...p}});
function save(){fs.writeFileSync(out+'/baseline.json',JSON.stringify({scope:'Actual browser, independent MySQL AdventureWorks, native DeepSeek Flash. Wrong user content is a deliberate test input, never a business fact.',sourceId,threadId,checks,errors,events},null,2));}
try{
 await page.goto(process.env.CODEX_WEB_URL);await page.waitForFunction(()=>state.ready&&state.models.length&&!state.threadLoading);
 await rpc('config/mcpServer/reload',null);
 sourceId=(await api('save',Object.fromEntries(Object.entries(fixture).filter(([k])=>k!=='container')))).connection.id;
 assert((await api('test',{id:sourceId})).success);
 fs.writeFileSync(receipt,JSON.stringify({sourceId}));
 await page.locator('[data-view=databases]').click();await page.locator(`[data-managed-connection-id="${sourceId}"]`).getByRole('button',{name:'数据库探索',exact:true}).click();
 const dialog=page.locator('dialog.database-exploration-dialog');
 await dialog.locator('[name=businessContext]').fill('独立体验测试的待纠错输入：所有订单都应统计为线上有效订单，销售收入应使用含税费和运费的 TotalDue。此说法故意与稍后确认的业务定义不同，不能擅自更改数据库。');
 await dialog.getByRole('button',{name:'保存并用于分析',exact:true}).click();await page.getByText('业务补充已保存，将按需用于当前及新会话的分析。',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'一键探索',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.exploration-job-status')?.textContent==='探索完成，已可用于对话分析',null,{timeout:150000});
 const stateBefore=await knowledge({operation:'state'});assert.equal(stateBefore.snapshot.tableCount,70);
 await dialog.screenshot({path:out+'/baseline-preparation.png'});await dialog.getByRole('button',{name:'关闭数据库探索',exact:true}).click();await dialog.waitFor({state:'detached'});
 const created=await rpc('thread/start',{cwd:await page.evaluate(()=>state.status.workspace),model:'deepseek-flash',config:{features:{memories:false},model_provider:'deepseek','tools.update_plan.enabled':true}});threadId=created.thread.id;
 await page.evaluate(v=>{resetChat();state.threadSettings.set(v.thread.id,{model:v.model,modelProvider:v.modelProvider,collaborationMode:v.collaborationMode,approvalPolicy:v.approvalPolicy,sandboxPolicy:v.sandbox,effort:v.reasoningEffort});adoptThread(v.thread);showView('chat');$('#model').value='deepseek-flash';$('#effort').value='low';},created);
 await page.locator('#prompt').fill('请把我当作刚接触陌生数据库的分析师。只使用独立数据源 '+sourceId+'，先读取已保存探索资料、业务补充。调查 salesorderheader、salesorderdetail、product、productsubcategory、productcategory、customer、salesterritory 的结构和关联，向我提出最可能导致重复汇总、无效订单混入、错误收入定义的风险，生成待我确认的业务候选，不做经营汇总，不执行全库扫描，不写数据库。不要重新采集结构。使用已有 MCP 工具。只作前置探索，不生成分析执行计划。最终用不含具体数值的文字总结哪些还需要我的定义。');await page.locator('#send').click();
 let terminal;const end=Date.now()+420000;
 while(Date.now()<end){terminal=events.find(e=>e.method==='turn/completed');if(terminal)break;for(const card of await page.locator('#requests .request-card').all()){const allow=card.getByRole('button',{name:'允许本次 MCP 调用',exact:true});if(await allow.isVisible()&&await allow.isEnabled()){assert((await card.locator('pre').first().innerText()).includes('codex_web_databases'));await allow.click();}}await page.waitForTimeout(200);}
 assert(terminal,'Actual Flash exploration timed out');assert.equal(terminal.params.turn.status,'completed');
 const after=await knowledge({operation:'state'});checks.push({name:'实际用户一键结构探索和真实 Flash 业务探索',passed:true,before:stateBefore,after});
 await page.screenshot({path:out+'/baseline-agent-exploration.png',mask:[page.locator('aside')]});save();
}catch(e){checks.push({name:'baseline failure',passed:false,error:e.stack});save();console.error(e.stack);process.exitCode=1;}
finally{if(threadId)await rpc('thread/delete',{threadId}).catch(()=>{});save();await browser.close();}
