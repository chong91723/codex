// A real anonymous read-only mainland remote MCP, through the Web UI and native Flash runtime.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ready,call,prompt} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL||'http://127.0.0.1:8789';
const workspace=process.env.CODEX_TEST_WORKSPACE;
assert(workspace?.startsWith('/tmp/'),'Requires an independent /tmp workspace');
const out=path.resolve(process.env.ARTIFACT_DIR||'test-results/mainland-services-2026-10-26/mcp');
fs.mkdirSync(out,{recursive:true});
const endpoint='https://mcp.24haowan.com/mcp',documentation='https://mcp.24haowan.com/';
const name='mainland24_'+Date.now()+'_'+process.pid;
const results=[],errors=[],calls=[],mcpItems=[];let created=false,baselinePolicy,baselineMcp,threadId;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30000);
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{
 socket.on('framesent',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method)calls.push({method:m.method,threadId:m.params?.threadId,model:m.params?.model,server:m.params?.server,tool:m.params?.tool,keyPath:m.params?.keyPath});}catch{}});
 socket.on('framereceived',frame=>{try{const m=JSON.parse(String(frame.payload));const item=m.params?.item;if(item?.type==='mcpToolCall'&&item.server===name)mcpItems.push({method:m.method,threadId:m.params.threadId,turnId:m.params.turnId,item});}catch{}});
});
const persist=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'One real public read-only remote MCP; deepseek-flash only; no ChatGPT or custom Skills; not an all-provider or strict-egress claim',base,workspace,endpoint,documentation,name,results,errors,calls,mcpItems},null,2));
async function check(title,fn){try{results.push({name:title,status:'passed',evidence:await fn()});console.log('PASS '+title);}catch(error){results.push({name:title,status:'failed',error:error.stack||error.message});console.log('FAIL '+title+': '+error.message);await page.screenshot({path:path.join(out,'failure-'+results.length+'.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure-'+results.length+'.txt'),await page.evaluate(()=>document.body.innerText).catch(()=>''));if(await page.locator('#dialog[open]').count())await page.locator('#dialog-close').click();}persist();}
const card=()=>page.locator(`[data-mcp-name="${name}"]`);
async function mcpView(){if(await page.locator('#dialog[open]').count())await page.locator('#dialog-close').click();await page.locator('[data-view="mcp"]').click();await page.getByRole('heading',{name:'MCP 服务',exact:true}).waitFor();}
try{
 await page.goto(base);await ready(page);assert.equal(await page.evaluate(()=>state.status.workspace),workspace);
 const codexHome=await page.evaluate(()=>state.runtimeInfo.codexHome);assert(codexHome.startsWith('/tmp/'));assert(!fs.existsSync(path.join(codexHome,'auth.json')),'Test home must not have ChatGPT authorization');
 const original=(await call(page,'config/read',{includeLayers:false,cwd:workspace})).config;
 baselinePolicy=Object.fromEntries(['model','model_provider','approval_policy','sandbox_mode'].map(key=>[key,original[key]]));baselineMcp=original.mcp_servers||{};assert(!Object.hasOwn(baselineMcp,name));
 await check('/mcp 添加官方匿名远端，原生返回真实工具目录',async()=>{
  await page.locator('#new-chat').click();await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');
  await page.locator('#prompt').fill('/mcp');await page.locator('#menu-mcp').click();await page.locator('#prompt').press('Enter');
  await page.getByRole('button',{name:'添加自定义 MCP',exact:true}).click();
  await page.locator('#mcp-name').fill(name);await page.locator('#mcp-transport').selectOption('http');await page.locator('#mcp-url').fill(endpoint);
  await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden',timeout:90000});created=true;
  await card().waitFor();await page.waitForFunction(name=>/\d+ 个工具/.test(document.querySelector(`[data-mcp-name="${name}"]`)?.textContent||'')&&!document.querySelector(`[data-mcp-name="${name}"]`)?.textContent.includes('0 个工具'),name,{timeout:90000});
  await card().getByRole('button',{name:'查看工具与资源',exact:true}).click();await page.locator('#dialog pre').waitFor();
  const data=JSON.parse(await page.locator('#dialog pre').innerText());const names=Object.keys(data.tools||{});assert(!data.toolsError,data.toolsError);assert(names.includes('search_templates')&&names.includes('get_template'));
  fs.writeFileSync(path.join(out,'native-remote-directory.json'),JSON.stringify(data,null,2));await page.screenshot({path:path.join(out,'remote-directory.png')});await page.locator('#dialog-close').click();
  return{endpoint,documentation,authRequired:false,nativeToolCount:names.length,tools:names,configuredViaSlashMenu:true,authStatus:data.authStatus,realResources:Array.isArray(data.resources)?data.resources.length:null};
 });
 await check('Flash 从真实远端搜索转盘模板并取详情，结果展示可核验',async()=>{
  assert(created,'Setup failed');await page.locator('#new-chat').click();await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');
  const result=await prompt(page,`这是只读接入验收。请只调用 MCP server ${name} 的 search_templates（query="转盘",limit=2），再用搜索结果中的真实 id 调用同一服务 get_template 取一条详情。最终用中文简短列出实际返回的模板标题、id 和详情页链接。不要调用其他工具、命令、网页抓取或任何 Skill，不要创建/修改活动，不要安装内容；失败就如实报告。`,true,240000);
  threadId=await page.evaluate(()=>state.thread.id);assert.equal(result.settings.model,'deepseek-flash');assert.equal(result.settings.modelProvider,'deepseek');
  const items=result.items.filter(item=>item.type==='mcpToolCall'&&item.server===name);assert(items.some(item=>item.tool==='search_templates'),'No native search call');assert(items.some(item=>item.tool==='get_template'),'No native detail call');
  assert(items.every(item=>item.status==='completed'&&!item.error),'MCP call failed: '+JSON.stringify(items));
  const search=items.find(item=>item.tool==='search_templates'),detail=items.find(item=>item.tool==='get_template');assert.equal(search.arguments.query,'转盘');assert(detail.arguments.id);assert(JSON.stringify(search.result).includes(String(detail.arguments.id)),'Detail id did not come from search result');
  assert(!result.items.some(item=>['commandExecution','fileChange'].includes(item.type)),'Unexpected command/file fallback');
  assert(JSON.stringify(detail.result).includes('24haowan.com'),'Missing genuine detail link');
  fs.writeFileSync(path.join(out,'flash-turn.json'),JSON.stringify({threadId,...result},null,2));await page.screenshot({path:path.join(out,'flash-result.png')});
  return{threadId,model:result.settings.model,provider:result.settings.modelProvider,realToolCalls:items.map(item=>({tool:item.tool,status:item.status,arguments:item.arguments})),detailId:detail.arguments.id,noCommandOrFileFallback:true};
 });
 await check('真实配置停用与重新启用，目录随原生状态恢复',async()=>{
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
  await call(page,'config/value/write',{keyPath:'mcp_servers.'+JSON.stringify(name),value:null,mergeStrategy:'replace',reloadUserConfig:true});await call(page,'config/mcpServer/reload',null);
  const after=(await call(page,'config/read',{includeLayers:false,cwd:workspace})).config;assert(!Object.hasOwn(after.mcp_servers||{},name));
  for(const [key,value]of Object.entries(baselinePolicy))assert.equal(after[key],value,'Global policy changed: '+key);
  for(const [key,value]of Object.entries(before.mcp_servers||{}))if(key!==name)assert.deepEqual(after.mcp_servers?.[key],value,'Concurrent unrelated MCP changed: '+key);
  for(const [key,value]of Object.entries(baselineMcp))assert.deepEqual(after.mcp_servers?.[key],value,'Preexisting MCP changed: '+key);
  return{removedUniqueServer:name,modelAndApprovalPreserved:true,unrelatedMcpPreserved:true};
 });}
 persist();await browser.close();const summary={passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,errors};console.log(JSON.stringify(summary));if(summary.failed||errors.length)process.exitCode=1;
}
