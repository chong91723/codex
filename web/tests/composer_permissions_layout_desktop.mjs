// Visible draft-only permission layout. No thread or turn is created.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL,home=process.env.CODEX_TEST_HOME,workspace=process.env.CODEX_TEST_WORKSPACE;
assert(base&&home?.startsWith('/tmp/')&&workspace?.startsWith('/tmp/'),'Explicit independent /tmp test profile required');
const out=process.env.REPORT_DIR||'test-results/composer-permissions-2026-10-27/layout';fs.mkdirSync(out,{recursive:true});
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const config=path.join(home,'config.toml'),before=digest(config);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),results=[],calls=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));page.on('websocket',socket=>{if(socket.url().includes('/ws/rpc'))socket.on('framesent',frame=>{try{const message=JSON.parse(String(frame.payload));if(message.method)calls.push({method:message.method});}catch{}});});
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({origin:'Visible browser draft-only full-access selection, desktop light/dark widths. No thread/start or model request; no generated result or permission state event.',results,calls,browserErrors:errors,configSha256Before:before,configSha256After:digest(config)},null,2));
async function contained(selector,size){const box=await page.locator(selector).boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=size.width+0.5&&box.y+box.height<=size.height+0.5,selector+' is outside viewport');return box;}
async function menu(){await page.locator('#permissions-button').click();await page.getByRole('heading',{name:'Agent 权限',exact:true}).waitFor();}
try{
 await page.goto(base);await page.waitForFunction(()=>state.ready&&state.models.length&&!state.threadLoading,null,{timeout:60000});assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),home);assert.equal(await page.evaluate(()=>state.status.workspace),workspace);await page.locator('#new-chat').click();
 await menu();await page.locator('input[name=permission-mode][value=full]').check();await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>composerState().pendingPermissions?.mode),'full');assert.equal(await page.evaluate(()=>state.thread),null);
 for(const theme of ['light','dark'])for(const size of [{width:1024,height:768},{width:1280,height:720},{width:1440,height:960}]){
  const name=theme+'-'+size.width;try{
   await page.setViewportSize(size);if(await page.evaluate(()=>document.documentElement.dataset.theme||'light')!==theme)await page.locator('#theme-toggle').click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme||'light'),theme);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const boxes={};for(const selector of ['#permissions-button','#send','#model','#effort','.composer-options'])boxes[selector]=await contained(selector,size);assert.equal(await page.locator('#permissions-button').getAttribute('data-mode'),'full');assert(await page.locator('#send').isEnabled());await page.screenshot({path:path.join(out,name+'-composer.png')});
   await menu();assert(await page.locator('input[name=permission-mode][value=full]').isChecked());boxes.dialog=await contained('#dialog',size);const overflow=await page.locator('#dialog-body').evaluate(n=>n.scrollWidth>n.clientWidth);assert.equal(overflow,false,'Permission menu has horizontal overflow');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,name+'-menu.png')});await page.locator('#dialog-cancel').click();results.push({name,status:'passed',evidence:{...size,theme,fullDraftSelected:true,composerControlsInsideViewport:true,menuInsideViewport:true,noHorizontalOverflow:true,boxes}});console.log('PASS '+name);
  }catch(error){results.push({name,status:'failed',error:error.message});await page.screenshot({path:path.join(out,name+'-failure.png')}).catch(()=>{});throw error;}finally{save();}
 }
 assert.equal(calls.filter(x=>['thread/start','turn/start','turn/steer','config/value/write','config/batchWrite'].includes(x.method)).length,0);assert.equal(digest(config),before);assert.equal(errors.length,0);
}catch(error){console.error(error.stack);process.exitCode=1;}finally{save();await browser.close();console.log(JSON.stringify({passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,newModelRequests:calls.filter(x=>x.method==='turn/start').length,threadStarts:calls.filter(x=>x.method==='thread/start').length,globalConfigUnchanged:digest(config)===before,browserErrors:errors}));}
