// A real anonymous read-only mainland remote MCP, through the Web UI and native Flash runtime.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {call,prompt} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL||'http://127.0.0.1:8789';
const workspace=process.env.CODEX_TEST_WORKSPACE;
assert(workspace?.startsWith('/tmp/'),'Requires an independent /tmp workspace');
const out=path.resolve(process.env.ARTIFACT_DIR||'test-results/mainland-services-2026-10-26/mcp');
fs.mkdirSync(out,{recursive:true});
const endpoint='https://mcp.24haowan.com/mcp',documentation='https://mcp.24haowan.com/';
const name=process.env.CODEX_TEST_MCP_NAME||'mainland24_'+Date.now()+'_'+process.pid;
assert(/^(?:lifecycle_|mainland24_)[A-Za-z0-9_]+$/.test(name),'A unique acceptance-only MCP name is required');
const results=[],errors=[],calls=[],mcpItems=[];let created=false,baselinePolicy,baselineMcp,threadId;
const reusedPage=globalThis.__remoteMcpPage,browser=reusedPage?reusedPage.context().browser():await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=reusedPage||await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30000);
const ready=()=>page.waitForFunction(()=>state.ready&&state.runtimeDefaults&&state.models.length&&!state.threadLoading,null,{timeout:60000,polling:100});
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{
 socket.on('framesent',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method)calls.push({method:m.method,threadId:m.params?.threadId,model:m.params?.model,server:m.params?.server,tool:m.params?.tool,keyPath:m.params?.keyPath});}catch{}});
 socket.on('framereceived',frame=>{try{const m=JSON.parse(String(frame.payload));const item=m.params?.item;if(item?.type==='mcpToolCall'&&item.server===name)mcpItems.push({method:m.method,threadId:m.params.threadId,turnId:m.params.turnId,item});}catch{}});
});
const persist=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'One real public read-only remote MCP; deepseek-flash only; no ChatGPT or custom Skills; not an all-provider or strict-egress claim',base,workspace,endpoint,documentation,name,results,errors,calls,mcpItems},null,2));
async function check(title,fn){try{results.push({name:title,status:'passed',evidence:await fn()});console.log('PASS '+title);}catch(error){results.push({name:title,status:'failed',error:error.stack||error.message});console.log('FAIL '+title+': '+error.message);await page.screenshot({path:path.join(out,'failure-'+results.length+'.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure-'+results.length+'.txt'),await page.evaluate(()=>document.body.innerText).catch(()=>''));if(await page.locator('#dialog[open]').count())await page.locator('#dialog-close').click();}persist();}
const card=()=>page.locator(`[data-mcp-name="${name}"]`);
async function fresh(){await page.locator('#new-chat').click();await page.locator('[data-view="settings"]').click();await page.locator('#analysis-advanced-settings').waitFor();if(!await page.locator('#analysis-advanced-settings').evaluate(node=>node.open))await page.locator('#analysis-advanced-settings > summary').click();await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');await page.evaluate(()=>showView('chat'));}
async function mcpView(){if(await page.locator('#dialog[open]').count())await page.locator('#dialog-close').click();await page.locator('[data-view="mcp"]').click();await page.getByRole('heading',{name:'MCP 服务',exact:true}).waitFor();}
try{
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});await ready();assert.equal(await page.evaluate(()=>state.status.workspace),workspace);
 const codexHome=await page.evaluate(()=>state.runtimeInfo.codexHome);assert(codexHome.startsWith('/tmp/'));assert(!fs.existsSync(path.join(codexHome,'auth.json')),'Test home must not have ChatGPT authorization');
 const original=(await call(page,'config/read',{includeLayers:false,cwd:workspace})).config;
 baselinePolicy=Object.fromEntries(['model','model_provider','approval_policy','sandbox_mode'].map(key=>[key,original[key]]));baselineMcp=original.mcp_servers||{};assert(!Object.hasOwn(baselineMcp,name));
 await check('MCP管理页添加匿名远端，原生返回真实工具目录',async()=>{
  await fresh();await mcpView();
  await page.getByRole('button',{name:'添加自定义 MCP',exact:true}).click();
  await page.locator('#mcp-name').fill(name);await page.locator('#mcp-transport').selectOption('http');await page.locator('#mcp-url').fill(endpoint);
  await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden',timeout:90000});created=true;
  await card().waitFor();await page.waitForFunction(name=>/\d+ 个工具/.test(document.querySelector(`[data-mcp-name="${name}"]`)?.textContent||'')&&!document.querySelector(`[data-mcp-name="${name}"]`)?.textContent.includes('0 个工具'),name,{timeout:90000});
  await card().getByRole('button',{name:'查看工具与资源',exact:true}).click();await page.locator('#dialog pre').waitFor();
  const data=JSON.parse(await page.locator('#dialog pre').innerText());const names=Object.keys(data.tools||{});assert(!data.toolsError,data.toolsError);assert(names.includes('search_templates')&&names.includes('get_template'));
  fs.writeFileSync(path.join(out,'native-remote-directory.json'),JSON.stringify(data,null,2));await page.screenshot({path:path.join(out,'remote-directory.png')});await page.locator('#dialog-close').click();
  return{endpoint,documentation,authRequired:false,nativeToolCount:names.length,tools:names,configuredViaManagementPage:true,authStatus:data.authStatus,realResources:Array.isArray(data.resources)?data.resources.length:null};
 });
 await check('远端配置可通过编辑入口保存且不改变连接目标',async()=>{
  assert(created,'Setup failed');await mcpView();await card().getByRole('button',{name:'编辑配置',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#dialog').open&&document.querySelector('#dialog-title').textContent==='编辑 MCP 配置',null,{polling:100});assert.equal(await page.locator('#mcp-url').inputValue(),'');assert.equal(await page.locator('#mcp-headers').inputValue(),'');await page.locator('#mcp-url').fill(endpoint);await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden',timeout:90000});const config=(await call(page,'config/read',{includeLayers:false,cwd:workspace})).config;assert.equal(config.mcp_servers[name].url,endpoint);await card().getByRole('button',{name:'查看工具与资源',exact:true}).click();await page.locator('#dialog pre').waitFor();const directory=JSON.parse(await page.locator('#dialog pre').innerText());assert(Object.keys(directory.tools||{}).includes('search_templates'));await page.locator('#dialog-close').click();return{nativeConfigWriteThroughEdit:true,endpointPreserved:true,noExistingCredentialsEchoed:true,remoteToolsReady:true};
 });
 await check(process.env.CODEX_REMOTE_CONNECTION_ONLY==='1'?'Flash 实际调用一个真实远端只读工具':'Flash 从真实远端搜索转盘模板并取详情，结果展示可核验',async()=>{
  assert(created,'Setup failed');await fresh();
  if(process.env.CODEX_REMOTE_CONNECTION_ONLY==='1'){
   const result=await prompt(page,`这是独立远端工具接入验收。只调用 MCP server ${name} 的 search_templates 工具一次，参数 query="转盘",limit=1。不要创建或修改任何活动，不调用其他工具、数据库、Python、命令或文件。最后仅说明工具调用是否完成，不总结模板内容或报告任何业务数值。失败请明确说明。`,true,180000);threadId=await page.evaluate(()=>state.thread.id);assert.equal(result.settings.model,'deepseek-flash');assert.equal(result.settings.modelProvider,'deepseek');const items=result.items.filter(item=>item.type==='mcpToolCall'&&item.server===name);assert.equal(items.length,1);assert.equal(items[0].tool,'search_templates');assert.equal(items[0].status,'completed');assert(!items[0].error&&!items[0].result?.isError);assert(!result.items.some(item=>['commandExecution','fileChange'].includes(item.type)||item.type==='mcpToolCall'&&item.server!==name));fs.writeFileSync(path.join(out,'flash-readonly-connection-turn.json'),JSON.stringify({threadId,...result},null,2));return{threadId,model:result.settings.model,provider:result.settings.modelProvider,realTool:items[0].tool,status:items[0].status,readOnly:true,scope:'One actual remote tool call; does not certify downstream import, calculation, or report publication'};
  }
  const result=await prompt(page,`这是只读接入验收。请只调用 MCP server ${name} 的 search_templates（query="转盘",limit=2），再用搜索结果中的真实 id 调用同一服务 get_template 取一条详情。之后必须用 codex_web_databases.import_mcp_result 列出并导入该服务真实工具输出，通过run_python的document_ids解析原始JSON，提取实际返回的标题和id形成数据集，最后用publish_answer引用这个数据集发布标题和id；所有编号与数值都必须来自Python读取的原始工具文档。不要将看到的字段转抄为Python常量，不要调用数据库、命令、网页抓取或任何Skill，不要创建/修改活动，不要安装内容；失败就如实报告。`,true,240000);
  threadId=await page.evaluate(()=>state.thread.id);assert.equal(result.settings.model,'deepseek-flash');assert.equal(result.settings.modelProvider,'deepseek');
  const items=result.items.filter(item=>item.type==='mcpToolCall'&&item.server===name);assert(items.some(item=>item.tool==='search_templates'),'No native search call');assert(items.some(item=>item.tool==='get_template'),'No native detail call');
  assert(items.every(item=>item.status==='completed'&&!item.error),'MCP call failed: '+JSON.stringify(items));
  const search=items.find(item=>item.tool==='search_templates'),detail=items.find(item=>item.tool==='get_template');assert.equal(search.arguments.query,'转盘');assert(detail.arguments.id);assert(JSON.stringify(search.result).includes(String(detail.arguments.id)),'Detail id did not come from search result');
  assert(result.items.some(item=>item.tool==='import_mcp_result'&&item.status==='completed'&&item.arguments.output_id),'No original tool output import');assert(result.items.some(item=>item.tool==='run_python'&&item.status==='completed'&&item.arguments.document_ids?.length),'No Python document input');const verification=await page.evaluate(()=>[...state.items.values()].filter(entry=>entry.turnId===state.turns.at(-1).id&&entry.item.type==='agentMessage').map(entry=>({status:entry.node?.dataset.analysisVerification,proof:entry.node?.analysisEvidence})));assert(verification.some(item=>item.status==='verified'),'External numeric report not verified');assert(!result.items.some(item=>item.tool==='query_database'),'Unrelated database used');
  assert(!result.items.some(item=>['commandExecution','fileChange'].includes(item.type)),'Unexpected command/file fallback');
  assert(JSON.stringify(detail.result).includes('24haowan.com'),'Missing genuine detail link');
  fs.writeFileSync(path.join(out,'flash-turn.json'),JSON.stringify({threadId,...result},null,2));await page.screenshot({path:path.join(out,'flash-result.png')});
  return{threadId,model:result.settings.model,provider:result.settings.modelProvider,realToolCalls:items.map(item=>({tool:item.tool,status:item.status,arguments:item.arguments})),detailId:detail.arguments.id,noCommandOrFileFallback:true,originalMcpDocumentImported:true,pythonCalculatedAndPublished:true};
 });
 if(process.env.CODEX_REMOTE_CONNECTION_ONLY!=='1')await check('真实配置停用与重新启用，目录随原生状态恢复',async()=>{
  assert(created,'Setup failed');await mcpView();await card().getByRole('button',{name:'停用',exact:true}).click();await card().getByRole('button',{name:'启用',exact:true}).waitFor({timeout:90000});
  let config=(await call(page,'config/read',{includeLayers:false,cwd:workspace})).config;assert.equal(config.mcp_servers[name].enabled,false);
  await mcpView();await card().getByRole('button',{name:'启用',exact:true}).waitFor({timeout:30000});assert(!(await card().getByRole('button',{name:'查看工具与资源',exact:true}).count()));
  await card().getByRole('button',{name:'启用',exact:true}).click();await card().getByRole('button',{name:'停用',exact:true}).waitFor({timeout:90000});
  await page.waitForFunction(name=>/\d+ 个工具/.test(document.querySelector(`[data-mcp-name="${name}"]`)?.textContent||'')&&!document.querySelector(`[data-mcp-name="${name}"]`)?.textContent.includes('0 个工具'),name,{timeout:90000});
  config=(await call(page,'config/read',{includeLayers:false,cwd:workspace})).config;assert.equal(config.mcp_servers[name].enabled,true);
  await mcpView();await page.screenshot({path:path.join(out,'reenabled.png')});return{disabledConfigConfirmed:true,toolsHiddenWhileDisabled:true,reenabledConfigConfirmed:true,realRemoteDirectoryReturned:true};
 });
}finally{
 if(created){await check('清理唯一远端配置，保留已有模型/审批与其他服务',async()=>{
  if(await page.locator('#dialog[open]').count())await page.locator('#dialog-close').click();
  const before=(await call(page,'config/read',{includeLayers:false,cwd:workspace})).config;
  await mcpView();await card().getByRole('button',{name:'移除连接',exact:true}).click();await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden',timeout:90000});
  const after=(await call(page,'config/read',{includeLayers:false,cwd:workspace})).config;assert(!Object.hasOwn(after.mcp_servers||{},name));
  for(const [key,value]of Object.entries(baselinePolicy))assert.equal(after[key],value,'Global policy changed: '+key);
  for(const [key,value]of Object.entries(before.mcp_servers||{}))if(key!==name)assert.deepEqual(after.mcp_servers?.[key],value,'Concurrent unrelated MCP changed: '+key);
  for(const [key,value]of Object.entries(baselineMcp))assert.deepEqual(after.mcp_servers?.[key],value,'Preexisting MCP changed: '+key);
  return{removedUniqueServer:name,modelAndApprovalPreserved:true,unrelatedMcpPreserved:true};
 });}
 persist();if(reusedPage)await page.close();else await browser.close();const summary={passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,errors};console.log(JSON.stringify(summary));if(summary.failed||errors.length)process.exitCode=1;
}
