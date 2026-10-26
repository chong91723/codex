// Requires an isolated profile seeded with > 40 genuine test conversations.
import fs from 'node:fs';import assert from 'node:assert/strict';import{ready,call}from './skills_mcp_helpers.mjs';
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE),out=process.env.REPORT_DIR||'/tmp/codex-web-capability-audit/pagination';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:900}});
try{
 const url=process.env.CODEX_WEB_URL||'http://127.0.0.1:8784';await page.goto(url);await ready(page);assert((await page.evaluate(()=>state.runtimeInfo.codexHome)).startsWith('/tmp/codex-web-'));const list=await call(page,'thread/list',{limit:100,sortKey:'updated_at'});assert(list.data.length>40,'Test condition unmet: seed >40 genuine disposable threads before running');const target=list.data.at(-1);await page.goto(url+'/?thread='+encodeURIComponent(target.id));await ready(page);assert.equal(await page.locator(`.thread-row[data-thread-id="${target.id}"]`).count(),1);
 let pages=0;while(await page.locator('#threads-more').isVisible()){
  const before=await page.evaluate(()=>state.cursor);await page.locator('#threads-more').click();await page.waitForFunction(cursor=>state.cursor!==cursor,before);assert(++pages<=10);assert.equal(await page.locator(`.thread-row[data-thread-id="${target.id}"]`).count(),1,'Current thread duplicated when pagination returned its real metadata');
 }
 const ids=await page.locator('.thread-row[data-thread-id]').evaluateAll(rows=>rows.map(row=>row.dataset.threadId));assert.equal(ids.length,new Set(ids).size);const result={status:'passed',seedThreads:list.data.length,pages,targetThread:target.id,uniqueRows:ids.length};fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
