// Real localhost OAuth/PKCE fixture + real native MCP + real deepseek-flash.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {ready,call,prompt} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.ARTIFACT_DIR||'/root/Codex/test-results/flash-followup-2026-10-26/oauth-current');
const base=process.env.CODEX_WEB_URL||'http://127.0.0.1:8785';
const workspace=process.env.CODEX_TEST_WORKSPACE;
assert(workspace?.startsWith('/tmp/'),'Requires independent /tmp workspace');
fs.mkdirSync(out,{recursive:true});
const run=Date.now()+'_'+process.pid,name='flash_oauth_'+run,marker='FLASH_HTTP_OAUTH_'+run;
const fixture=spawn('python3',[fileURLToPath(new URL('./oauth_mcp_fixture.py',import.meta.url))],{stdio:['ignore','pipe','pipe']});
let fixtureStderr='',origin,fixtureStopped=false;
fixture.stderr.on('data',data=>fixtureStderr+=String(data).slice(0,3000));
origin=await new Promise((resolve,reject)=>{let buffer='';const timeout=setTimeout(()=>reject(Error('Local OAuth fixture did not start')),15000);fixture.once('error',reject);fixture.stdout.on('data',data=>{buffer+=String(data);if(buffer.includes('\n')){clearTimeout(timeout);try{resolve(JSON.parse(buffer.split('\n')[0]).url);}catch(error){reject(error);}}});});
assert.equal(new URL(origin).hostname,'127.0.0.1');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(30000);
const results=[],errors=[],calls=[],oauthEvents=[];let created=false,authorized=false,threadId,baselinePolicy,baselineMcp,oauthEvidence;
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{
 socket.on('framesent',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method)calls.push({method:m.method,name:m.params?.name,threadId:m.params?.threadId,model:m.params?.model,server:m.params?.server,tool:m.params?.tool,keyPath:m.params?.keyPath});}catch{}});
 socket.on('framereceived',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method==='mcpServer/oauthLogin/completed')oauthEvents.push(m.params);}catch{}});
});
const persist=()=>fs.writeFileSync(path.join(out,'oauth-results.json'),JSON.stringify({scope:'Only localhost OAuth/PKCE and deepseek-flash; no ChatGPT, external OAuth account, or custom test skill',base,workspace,origin,name,results,errors,calls,oauthEvents,fixtureStderr,fixtureStopped},null,2));
async function check(title,fn){try{results.push({name:title,status:'passed',evidence:await fn()});console.log('PASS '+title);}catch(error){results.push({name:title,status:'failed',error:error.stack||error.message});console.log('FAIL '+title+': '+error.message);await page.screenshot({path:path.join(out,'failure-'+results.length+'.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure-'+results.length+'.txt'),await page.evaluate(()=>document.querySelector('#panel-content')?.textContent+'\nTOAST: '+document.querySelector('#toast')?.textContent).catch(()=>''));if(await page.locator('#dialog[open]').count())await page.locator('#dialog-close').click();}persist();}
async function menuMcp(){
 await page.locator('#new-chat').click();await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');
 await page.locator('#prompt').fill('/mcp');await page.locator('#menu-mcp').click();assert.equal(await page.locator('#prompt').inputValue(),'/mcp');await page.locator('#prompt').press('Enter');
 await page.getByRole('heading',{name:'MCP 服务',exact:true}).waitFor();
}
const card=()=>page.locator(`[data-mcp-name="${name}"]`);
async function closeDialog(){await page.locator('#dialog-close').click();await page.locator('#dialog').waitFor({state:'hidden'});}
async function evidence(){const response=await page.request.get(origin+'/evidence');assert(response.ok());return response.json();}
async function waitUntil(predicate,message,timeout=30000){const deadline=Date.now()+timeout;while(!await predicate()){assert(Date.now()<deadline,message);await page.waitForTimeout(100);}}
async function stopFixture(){if(fixtureStopped)return;fixture.kill('SIGTERM');await new Promise(resolve=>fixture.exitCode!==null?resolve():fixture.once('exit',resolve));fixtureStopped=true;}
try{
 await page.goto(base);await ready(page);assert.equal(await page.evaluate(()=>state.status.workspace),workspace);
 const home=await page.evaluate(()=>state.runtimeInfo.codexHome);assert(home.startsWith('/tmp/')&&home.includes('flash'));assert(!fs.existsSync(path.join(home,'auth.json')));
 const original=(await call(page,'config/read',{includeLayers:false,cwd:workspace})).config;
 baselinePolicy=Object.fromEntries(['model','model_provider','approval_policy','sandbox_mode'].map(key=>[key,original[key]]));baselineMcp=original.mcp_servers||{};assert(!Object.hasOwn(baselineMcp,name));

 await check('/mcp 新增本机 HTTP 服务，真实状态要求 OAuth',async()=>{
  await menuMcp();await page.getByRole('button',{name:'添加自定义 MCP',exact:true}).click();
  await page.locator('#mcp-name').fill(name);await page.locator('#mcp-transport').selectOption('http');await page.locator('#mcp-url').fill(origin+'/mcp');
  await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden',timeout:90000});created=true;
  await card().waitFor();await page.waitForFunction(name=>/需要认证|Auth required/.test(document.querySelector(`[data-mcp-name="${name}"]`)?.textContent||''),name,{timeout:60000});
  const config=(await call(page,'config/read',{includeLayers:false,cwd:workspace})).config;
  assert.equal(config.mcp_servers[name].url,origin+'/mcp');assert.equal(config.mcp_servers[name].enabled,true);
  await page.locator('[data-view="mcp"]').click();await card().waitFor();
  return{uniqueServer:name,url:origin+'/mcp',nativeAuthenticationRequired:true,configuredViaComposerMenu:true};
 });

 await check('MCP OAuth 登录按钮→本机授权页→原生 PKCE 交换与工具目录',async()=>{
  assert(created,'HTTP service setup failed');
  await card().getByRole('button',{name:'OAuth 登录',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#dialog[open]')||/showAuthResult.*not defined/.test(document.querySelector('#toast').textContent),null,{timeout:30000});
  assert(await page.locator('#dialog').isVisible(),await page.locator('#toast').innerText());
  const dialogText=await page.locator('#dialog-body').innerText();assert(dialogText.includes('不会取消')&&dialogText.includes('超时'));
  const link=page.getByRole('link',{name:'打开授权页面',exact:true});await link.waitFor();
  const authorizationUrl=new URL(await link.getAttribute('href'));assert.equal(authorizationUrl.origin,origin);assert.equal(authorizationUrl.pathname,'/authorize');
  const popupPromise=page.waitForEvent('popup');await link.click();const popup=await popupPromise;await popup.waitForLoadState();
  await waitUntil(()=>oauthEvents.some(event=>event.name===name&&event.success===true),'Native OAuth completion notification missing',60000);
  oauthEvidence=await evidence();assert.equal(oauthEvidence.pkce_token_exchange,1);assert.equal(oauthEvidence.authorization_redirect,1);authorized=true;
  await popup.close();await closeDialog();
  await page.getByRole('button',{name:'重新加载配置',exact:true}).click();await card().waitFor();
  await page.waitForFunction(name=>document.querySelector(`[data-mcp-name="${name}"]`)?.textContent.includes('1 个工具'),name,{timeout:90000});
  await card().getByRole('button',{name:'查看工具与资源',exact:true}).click();await page.locator('#dialog pre').waitFor();
  const data=JSON.parse(await page.locator('#dialog pre').innerText());assert(data.tools?.echo||JSON.stringify(data.tools).includes('echo'));
  assert.equal(data.authStatus,'oAuth');await closeDialog();
  return{nativePkceExchange:true,authorizationRedirects:1,tokenExchanges:1,closingIsNotCancellation:true,authStatus:data.authStatus,toolListed:'echo',realResourceInventory:Array.isArray(data.resources)?data.resources.length:null};
 });

 if(!process.env.OAUTH_SETUP_ONLY)await check('Flash 真实调用已授权 HTTP MCP echo，工具结果和资源目录可核验',async()=>{
  assert(authorized,'Real OAuth did not complete');
  await page.locator('#new-chat').click();await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');
  const result=await prompt(page,`请仅调用 MCP server ${name} 的 echo 工具一次，参数 text="${marker}"。必须报告真实返回；不要使用命令行、外网或其他 MCP 替代。若有工具审批请等待。`,true,240000);
  threadId=await page.evaluate(()=>state.thread.id);assert.equal(result.settings.model,'deepseek-flash');assert.equal(result.settings.modelProvider,'deepseek');
  const tool=result.items.find(item=>item.type==='mcpToolCall'&&item.server===name&&item.tool==='echo');assert(tool,'Flash did not call this HTTP MCP tool');
  assert(JSON.stringify(tool).includes('NATIVE_HTTP_OAUTH_OK:'+marker),'Authenticated tool did not return the real marker');
  const observed=await evidence();assert(observed['tools/call']>=1);assert(observed['resources/list']>=1);
  return{threadId,model:result.settings.model,provider:result.settings.modelProvider,actualMcpTool:'echo',actualMarker:true,pkceExchanges:observed.pkce_token_exchange,toolCalls:observed['tools/call'],resourceInventoryRequests:observed['resources/list'],resourceContentsRead:false};
 });

 if(!process.env.OAUTH_SETUP_ONLY)await check('原生 OAuth 超时：匹配 loginId，显示未完成而非取消成功',async()=>{
  assert(authorized,'Real OAuth did not complete');
  const login=await call(page,'mcpServer/oauth/login',{name,timeoutSecs:1});assert(login.loginId);assert.equal(new URL(login.authorizationUrl).origin,origin);
  // Deliberately do not open the authorization URL. Only the real native timeout ends it.
  await waitUntil(()=>oauthEvents.some(event=>event.name===name&&event.loginId===login.loginId&&event.success===false),'Native OAuth timeout notification missing',30000);
  const failed=oauthEvents.find(event=>event.name===name&&event.loginId===login.loginId&&event.success===false);assert(failed.error&&/timeout|timed out|超时/i.test(failed.error),failed.error);
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('MCP 授权未完成'));
  const text=await page.locator('#toast').innerText();assert(!text.includes('取消成功'));
  return{nativeTimeout:true,loginIdMatched:true,success:false,actualError:failed.error,visibleMessage:text,authorizationUrlNotOpened:true,nativeCancelMethodAvailable:false};
 });

 if(!process.env.OAUTH_SETUP_ONLY)await check('本机 HTTP 服务停止后真实工具请求明确失败，无假成功',async()=>{
  assert(authorized&&threadId,'Authenticated workflow did not finish');await stopFixture();
  let failure;try{await call(page,'mcpServer/tool/call',{server:name,threadId,tool:'echo',arguments:{text:'SHOULD_FAIL_AFTER_LOCAL_SERVER_STOP'}});}catch(error){failure=error.message;}
  assert(failure,'Disconnected HTTP MCP returned success');assert(/closed|refused|error|failed|sending|connect|transport/i.test(failure),failure);
  const visible=await page.locator('#rpc-result').innerText();assert(!visible.includes('NATIVE_HTTP_OAUTH_OK:SHOULD_FAIL_AFTER_LOCAL_SERVER_STOP'));
  return{fixtureActuallyStopped:true,actualError:failure,visibleError:visible,successNotReported:true};
 });
}finally{
 if(created){
  try{
   if(await page.locator('#dialog[open]').count())await closeDialog();
   await call(page,'config/value/write',{keyPath:'mcp_servers.'+JSON.stringify(name),value:null,mergeStrategy:'replace',reloadUserConfig:true});
   await call(page,'config/mcpServer/reload',null);
   const restored=(await call(page,'config/read',{includeLayers:false,cwd:workspace})).config;
   assert(!Object.hasOwn(restored.mcp_servers||{},name));
   assert(JSON.stringify(restored.mcp_servers||{})===JSON.stringify(baselineMcp),'Unrelated MCP configuration changed');
   for(const key of Object.keys(baselinePolicy))assert.equal(restored[key],baselinePolicy[key],'Global setting changed: '+key);
   results.push({name:'删除本次 MCP 配置并确认模型、审批和其他服务保持原样',status:'passed',evidence:{deletedServer:name,unrelatedMcpPreserved:true,globalPolicyPreserved:true}});
  }catch(error){results.push({name:'清理本次 MCP 配置',status:'failed',error:error.message});}
 }
 await stopFixture();persist();await browser.close();
 const summary={passed:results.filter(result=>result.status==='passed').length,failed:results.filter(result=>result.status==='failed').length,errors};console.log(JSON.stringify(summary));if(summary.failed||errors.length)process.exitCode=1;
}
