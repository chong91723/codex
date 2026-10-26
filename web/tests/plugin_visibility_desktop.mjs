// User-authorized hiding of plugin navigation; no model calls or native capability removal.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ready} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL;
const home=process.env.CODEX_TEST_HOME;
assert(base&&home?.startsWith('/tmp/'),'Explicit independent test instance required');
const out=path.resolve(process.env.ARTIFACT_DIR||'test-results/final-fixes-2026-10-26/visibility');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const calls=[],errors=[],results=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>socket.on('framesent',frame=>{try{const msg=JSON.parse(String(frame.payload));if(msg.method)calls.push(msg.method);}catch{}}));
try{
 await page.goto(base);await ready(page);assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),home);
 for(const width of [1440,1280,1024]){
  await page.setViewportSize({width,height:1000});assert.equal(await page.locator('[data-view="plugins"]').count(),0);
  await page.locator('#prompt').fill('/');await page.locator('#command-menu').waitFor({state:'visible'});
  assert.equal(await page.locator('#menu-apps').count(),0);assert.equal(await page.locator('#menu-plugins').count(),0);
  assert.equal(await page.locator('.command-option:not([data-skill-name])').count(),12);
  assert(await page.locator('#menu-mcp').isVisible());
  await page.screenshot({path:path.join(out,'desktop-'+width+'.png')});
  results.push({name:'hidden_plugin_entry_'+width,status:'passed',commands:12});
 }
 const before=calls.filter(method=>['thread/start','turn/start'].includes(method)).length;
 for(const command of ['/apps','/plugins']){
  await page.locator('#prompt').fill(command);await page.locator('#prompt').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('插件管理入口已隐藏'));
  assert.equal(await page.locator('#prompt').inputValue(),command);
 }
 assert.equal(calls.filter(method=>['thread/start','turn/start'].includes(method)).length,before);
 results.push({name:'hidden_commands_preserve_draft_without_model_submission',status:'passed'});
 await page.evaluate(()=>showView('plugins'));assert.equal(await page.evaluate(()=>state.view),'chat');
 const methods=await page.evaluate(()=>methodEntries().map(item=>item.method));
 assert(methods.includes('plugin/uninstall'));assert(methods.includes('mcpServerStatus/list'));
 results.push({name:'legacy_view_hidden_native_protocol_retained',status:'passed'});
 const configured=await page.evaluate(async()=>({plugins:await rpc('plugin/list',{cwds:[state.selectedCwd],marketplaceKinds:['local']}),config:(await rpc('config/read',{includeLayers:false,cwd:state.selectedCwd})).config}));
 const installed=(configured.plugins.marketplaces||[]).flatMap(market=>market.plugins||[]).filter(plugin=>plugin.installed&&plugin.name==='playwright');
 assert.equal(installed.length,0);
 const auditMcp=Object.entries(configured.config.mcp_servers||{}).filter(([name,config])=>name.startsWith('mainland24_')&&config.url==='https://mcp.24haowan.com/mcp');
 assert.equal(auditMcp.length,0);
 results.push({name:'test_playwright_and_remote_mcp_not_installed',status:'passed'});
 assert.equal(errors.length,0);
}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({base,home,results,errors,calls},null,2)+'\n');await browser.close();}
console.log(JSON.stringify({passed:results.length,errors}));
