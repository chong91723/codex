// Native OAuth flow via actual web MCP buttons, real local authorization server.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=process.env.REPORT_DIR||'/tmp/codex-oauth-desktop';fs.mkdirSync(directory,{recursive:true});
const fixture=spawn('python3',[fileURLToPath(new URL('./oauth_mcp_fixture.py',import.meta.url))],{stdio:['ignore','pipe','inherit']});
const origin=await new Promise(resolve=>fixture.stdout.once('data',data=>resolve(JSON.parse(String(data)).url)));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const calls=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{if(socket.url().includes('/ws/rpc'))socket.on('framesent',frame=>{try{const value=JSON.parse(String(frame.payload));if(value.method)calls.push({method:value.method,origin:'browser'});}catch{}});});
async function call(method,params){
  await page.locator('[data-view="protocol"]').click();await page.locator('.protocol-search').fill(method);await page.getByRole('button',{name:method,exact:true}).click();await page.locator('#rpc-params').fill(JSON.stringify(params));
  await page.evaluate(method=>{window.__receipt={pending:true};const original=rpc;rpc=function(name,...args){const result=original(name,...args);if(name===method){rpc=original;result.then(value=>window.__receipt={value},error=>window.__receipt={error:error.message});}return result;};},method);
  await page.getByRole('button',{name:'执行原生请求',exact:true}).click();await page.waitForFunction(()=>!window.__receipt.pending,null,{timeout:120000});const response=await page.evaluate(()=>window.__receipt);if(response.error)throw new Error(response.error);return response.value;
}
let previous,report,popup;
try{
  await page.goto(process.env.CODEX_WEB_URL||'http://127.0.0.1:8765');await page.waitForFunction(()=>state.ready,null,{timeout:45000});
  const config=await call('config/read',{includeLayers:true});const user=config.layers.find(x=>x.name.type==='user');previous=user.config.mcp_servers?.native_oauth??null;
  await call('config/value/write',{keyPath:'mcp_servers.native_oauth',value:{url:origin+'/mcp'},mergeStrategy:'replace',reloadUserConfig:true});await call('config/mcpServer/reload',null);
  await page.locator('[data-view="mcp"]').click();const card=page.locator('.card').filter({hasText:'native_oauth'});await card.waitFor({timeout:30000});await card.getByRole('button',{name:'OAuth 登录',exact:true}).click();
  await page.locator('#dialog[open]').waitFor({timeout:30000});
  const popupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'打开登录页面',exact:true}).click();popup=await popupPromise;await popup.waitForLoadState();
  await page.locator('#dialog-submit').click();await call('config/mcpServer/reload',null);
  const status=await call('mcpServerStatus/list',{limit:100});const server=status.data.find(x=>x.name==='native_oauth');
  const workspace=await page.evaluate(()=>state.status.workspace);const thread=(await call('thread/start',{cwd:workspace,model:'deepseek-flash'})).thread;
  const result=await call('mcpServer/tool/call',{server:'native_oauth',threadId:thread.id,tool:'echo',arguments:{text:'FROM_BROWSER'}});
  await popup.goto(origin+'/evidence');const evidence=JSON.parse(await popup.locator('body').innerText());await popup.close();
  if(!evidence||evidence.pkce_token_exchange!==1||!evidence['tools/call'])throw new Error('The real PKCE exchange and authenticated MCP request were not observed');
  if(!JSON.stringify(result).includes('NATIVE_HTTP_OAUTH_OK:FROM_BROWSER'))throw new Error('OAuth-protected native tool did not return its real result');
  report={status:'passed',origin:'actual web MCP OAuth login/open authorization page + protocol panel buttons',serverAuthStatus:server.authStatus,result,evidence};
  console.log('PASS native HTTP MCP OAuth discovery, registration, PKCE redirect, token exchange and authenticated tool call');
}catch(error){report={status:'failed',error:error.message};console.log('FAIL '+error.message);process.exitCode=1;}
finally{
  if(previous!==undefined){await call('config/value/write',{keyPath:'mcp_servers.native_oauth',value:previous,mergeStrategy:'replace',reloadUserConfig:true});await call('config/mcpServer/reload',null);}
  await page.screenshot({path:directory+'/oauth.png',fullPage:true});fs.writeFileSync(directory+'/results.json',JSON.stringify({...report,calls,browserErrors:errors},null,2));
  await browser.close();fixture.kill();
}
