// Representative production package audit. No ChatGPT auth or third-party Skills.
// Run only against an explicitly named, disposable /tmp Codex Web instance.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {ready,call,prompt} from './skills_mcp_helpers.mjs';

const source='https://gitcode.com/xuguoliang3/claude-plugins-official.git';
const revision='3d368d2972d9af8f52e96ae7d86d2686967af31f';
const base=process.env.CODEX_WEB_URL;
const home=process.env.CODEX_TEST_HOME;
const workspace=process.env.CODEX_TEST_WORKSPACE;
const chromiumPath=process.env.CHROMIUM_BIN;
for(const value of [home,workspace])assert(value&&path.resolve(value).startsWith('/tmp/'),'Explicit independent /tmp home and workspace are required');
assert(base&&/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base),'Explicit loopback CODEX_WEB_URL required');
assert(chromiumPath&&fs.statSync(chromiumPath).isFile(),'CHROMIUM_BIN must name an installed browser');
const out=path.resolve(process.env.ARTIFACT_DIR||'test-results/mainland-plugin');
assert(!out.startsWith(path.resolve(home)+path.sep),'Evidence must be outside the disposable Codex home');
fs.mkdirSync(out,{recursive:true});
const auditRoot=fs.mkdtempSync('/tmp/codex-mainland-plugin-');
const localMarket=path.join(auditRoot,'market');
const npmCache=path.join(auditRoot,'npm-cache');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:chromiumPath,args:['--no-sandbox']});
const result={source,revision,base,home,workspace,steps:[],errors:[],scope:'Remote source lifecycle and local configured runtime are distinct checks. This is a real mirrored Playwright package; the localhost webpage is only its test target. No additional Skill is installed.'};
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');
let page,marketplace,pluginId,threadId,fixture,originalManifest;
async function open(){
 const p=await browser.newPage({viewport:{width:1440,height:1000}});
 p.on('pageerror',error=>result.errors.push(error.message));
 await p.goto(base);await ready(p);
 const actual=await p.evaluate(()=>({home:state.runtimeInfo.codexHome,workspace:state.status.workspace}));
 assert.deepEqual(actual,{home,workspace},'Audit instance does not match the explicitly authorized directories');
 return p;
}
async function removePlugin(){
 if(pluginId){await call(page,'plugin/uninstall',{pluginId});pluginId=null;}
 if(marketplace){await call(page,'marketplace/remove',{marketplaceName:marketplace.marketplaceName});marketplace=null;}
}
async function install(market){
 const marketplacePath=path.join(market.installedRoot,'.claude-plugin','marketplace.json');
 const detail=await call(page,'plugin/read',{marketplacePath,pluginName:'playwright'});
 assert.equal(detail.plugin.skills.length,0);assert.equal(detail.plugin.apps.length,0);assert.equal(detail.plugin.hooks.length,0);
 const response=await call(page,'plugin/install',{marketplacePath,pluginName:'playwright'});
 assert.equal(response.appsNeedingAuth.length,0,'Unexpected account/service authentication');
 const listed=await call(page,'plugin/list',{cwds:[workspace],marketplaceKinds:['local']});
 const plugin=listed.marketplaces.find(item=>item.name===market.marketplaceName)?.plugins.find(item=>item.name==='playwright');
 assert(plugin?.installed&&plugin.enabled);pluginId=plugin.id;
 return {detail,response,plugin};
}
try{
 page=await open();
 const before=await call(page,'plugin/list',{cwds:[workspace],marketplaceKinds:['local']});
 assert(!before.marketplaces.some(item=>item.name==='claude-plugins-official'),'An existing marketplace with this name must not be replaced');
 marketplace=await call(page,'marketplace/add',{source,refName:revision,sparsePaths:['.claude-plugin','external_plugins/playwright']});
 assert.equal(marketplace.alreadyAdded,false);
 assert.equal(execFileSync('git',['-C',marketplace.installedRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),revision);
 result.remote=await install(marketplace);
 // Do not launch the unconfigured MCP runtime; its original failure is a separate check.
 result.steps.push({name:'remote_mirror_discovery_install_read',status:'passed'});
 // Keep the real manifest/catalog byte-for-byte. Only copy the selected MCP-only package.
 fs.mkdirSync(path.join(localMarket,'.claude-plugin'),{recursive:true});
 fs.copyFileSync(path.join(marketplace.installedRoot,'.claude-plugin','marketplace.json'),path.join(localMarket,'.claude-plugin','marketplace.json'));
 const remotePlugin=path.join(marketplace.installedRoot,'external_plugins','playwright');
 const localPlugin=path.join(localMarket,'external_plugins','playwright');
 fs.cpSync(remotePlugin,localPlugin,{recursive:true});
 assert.deepEqual(fs.readdirSync(localPlugin).sort(),['.claude-plugin','.mcp.json']);
 originalManifest=fs.readFileSync(path.join(localPlugin,'.claude-plugin','plugin.json'));
 const originalMcp=fs.readFileSync(path.join(localPlugin,'.mcp.json'));
 result.originalHashes={manifest:hash(originalManifest),mcp:hash(originalMcp)};
 fs.writeFileSync(path.join(out,'original.plugin.json'),originalManifest);
 fs.writeFileSync(path.join(out,'original.mcp.json'),originalMcp);
 await removePlugin();save();
 const expected=JSON.parse(originalMcp);
 expected.playwright.args=['--registry=https://registry.npmmirror.com','--cache='+npmCache,'@playwright/mcp@0.0.83','--headless','--no-sandbox','--executable-path',chromiumPath,'--isolated','--image-responses','omit'];
 expected.playwright.env={npm_config_registry:'https://registry.npmmirror.com',npm_config_cache:npmCache,npm_config_update_notifier:'false'};
 fs.writeFileSync(path.join(localPlugin,'.mcp.json'),JSON.stringify(expected,null,2)+'\n');
 fs.writeFileSync(path.join(out,'configured.mcp.json'),JSON.stringify(expected,null,2)+'\n');
 marketplace=await call(page,'marketplace/add',{source:localMarket});
 result.local=await install(marketplace);await page.close();page=await open();
 result.local.status=await call(page,'mcpServerStatus/list',{limit:100});
 const server=result.local.status.data.find(item=>item.name==='playwright');
 assert.equal(server?.pluginId,pluginId);assert(!server.toolsError,server.toolsError);
 const cached=path.join(home,'plugins','cache',marketplace.marketplaceName,'playwright');
 const versions=fs.readdirSync(cached);assert.equal(versions.length,1);
 const cacheRoot=path.join(cached,versions[0]);
 result.effectiveRuntime=JSON.parse(fs.readFileSync(path.join(cacheRoot,'.mcp.json')));
 // Compare to an independent fixed object. Two reset files comparing equal is insufficient.
 assert.deepEqual(result.effectiveRuntime,expected);
 for(const arg of ['@playwright/mcp@0.0.83','--headless','--no-sandbox','--executable-path',chromiumPath])assert(result.effectiveRuntime.playwright.args.includes(arg),'Missing runtime argument '+arg);
 assert.equal(hash(fs.readFileSync(path.join(cacheRoot,'.claude-plugin','plugin.json'))),result.originalHashes.manifest);
 result.steps.push({name:'local_runtime_configuration_effective',status:'passed'});save();
 const marker='MAINLAND_PLUGIN_'+crypto.randomUUID();let requests=0;
 fixture=http.createServer((request,response)=>{requests++;response.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});response.end('<!doctype html><title>大陆插件验收</title><button onclick="document.getElementById(\'result\').textContent=\''+marker+'\'">验证插件</button><p id="result">尚未点击</p>');});
 await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+fixture.address().port+'/';
 await page.locator('#new-chat').click();await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');
 result.turn=await prompt(page,'请只用已安装 playwright 插件的 MCP 工具打开 '+url+'，点击“验证插件”，读取结果文本和网页标题。不要使用命令、文件操作、Skill或其他网站。',true,180000);
 threadId=await page.evaluate(()=>state.thread.id);
 result.fixture={url,requests,marker};
 const calls=result.turn.items.filter(item=>item.type==='mcpToolCall'&&item.server==='playwright'&&item.pluginId===pluginId);
 assert(requests>0);assert(calls.some(item=>item.tool==='browser_navigate'&&item.status==='completed'));
 assert(calls.some(item=>item.tool==='browser_click'&&item.status==='completed'));
 assert(JSON.stringify(calls).includes(marker));
 assert.equal(result.turn.settings.model,'deepseek-flash');assert.equal(result.turn.settings.modelProvider,'deepseek');
 result.steps.push({name:'real_flash_plugin_navigate_click_readback',status:'passed'});
 // A real browser workflow may pass while model instruction adherence fails. Keep both outcomes.
 const extra=result.turn.items.filter(item=>['commandExecution','fileChange','webSearch'].includes(item.type));
 result.steps.push({name:'model_obeys_only_mcp_instruction',status:extra.length?'failed':'passed',extra});
 if(extra.length)process.exitCode=1;
 await page.screenshot({path:path.join(out,'flash-plugin-result.png'),fullPage:true});
}catch(error){result.error=error.stack;result.steps.push({name:'execution',status:'failed',error:error.message});process.exitCode=1;}
finally{
 if(fixture)await new Promise(resolve=>fixture.close(resolve));
 if(page&&!page.isClosed()){
  try{
   const current=await page.evaluate(()=>({id:state.thread?.id,turn:state.activeTurns.get(state.thread?.id)}));
   if(current.turn)await page.evaluate(async current=>interruptTurn(current.id,current.turn),current);
   if(threadId)await call(page,'thread/delete',{threadId});
   await removePlugin();result.cleanupNative=true;
  }catch(error){result.cleanupError=error.message;process.exitCode=1;}
 }
 fs.rmSync(auditRoot,{recursive:true,force:true});result.cleanedLocalAuditRoot=!fs.existsSync(auditRoot);
 save();await browser.close();console.log(JSON.stringify({output:out,steps:result.steps},null,2));
}
