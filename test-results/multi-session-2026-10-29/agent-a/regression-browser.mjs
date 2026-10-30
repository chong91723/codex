import { chromium } from '/root/Codex/.toolchains/playwright/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import readline from 'node:readline';
const dir='/tmp/codex-collab-audit-20261029/agent-a';
const log=async o=>fs.appendFile(`${dir}/regression-events.jsonl`,JSON.stringify({at:new Date().toISOString(),...o})+'\n');
const browser=await chromium.launch({executablePath:'/root/Codex/.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
const page=await context.newPage();
const rpcIds=new Set();
const safeRpc=o=>({type:o.type,id:o.id,method:o.method,params:o.params?{threadId:o.params.threadId,includeTurns:o.params.includeTurns}:undefined});
page.on('websocket',ws=>{
 ws.on('framesent',async f=>{try{const raw=String(f.payload);if(raw.includes('thread/read')){const o=JSON.parse(raw);rpcIds.add(o.id);await log({kind:'ui-native-request',transport:'websocket',request:safeRpc(o)});}}catch{}});
 ws.on('framereceived',async f=>{try{const o=JSON.parse(String(f.payload));if(rpcIds.has(o.id)){const r=o.result??o.response??{};await log({kind:'ui-native-response',id:o.id,error:o.error??null,threadId:r.thread?.id??r.id,status:r.thread?.status??r.status,turnCount:r.thread?.turns?.length??r.turns?.length});}}catch{}});
});
page.on('request',async r=>{const raw=r.postData();if(raw?.includes('thread/read')){try{const o=JSON.parse(raw);await log({kind:'ui-native-request',transport:'http',url:r.url().split('?')[0],request:safeRpc(o)});}catch{}}});
page.on('response',async r=>{if(r.url().match(/\.(?:js|css)(?:\?|$)/)){await log({kind:'asset-loaded',url:r.url(),lastModified:r.headers()['last-modified'],etag:r.headers().etag,status:r.status()});}if(r.status()>=400)await log({kind:'http-error',url:r.url().split('?')[0],status:r.status()});});
page.on('pageerror',e=>log({kind:'pageerror',text:e.message}));
page.on('requestfailed',r=>log({kind:'requestfailed',url:r.url().split('?')[0],failure:r.failure()}));
const pick=a=>a.role?page.getByRole(a.role,{name:a.name,exact:a.exact??true}):a.text?page.getByText(a.text,{exact:a.exact??true}):page.locator(a.selector);
async function run(a){
 await log({kind:'operation',...a});
 if(a.op==='open')await page.goto(a.url,{waitUntil:'domcontentloaded'});
 else if(a.op==='reload')await page.reload({waitUntil:'domcontentloaded'});
 else if(a.op==='click')await pick(a).nth(a.nth??0).click({timeout:a.timeout??10000});
 else if(a.op==='fill')await pick(a).nth(a.nth??0).fill(a.value);
 else if(a.op==='press')await pick(a).nth(a.nth??0).press(a.key);
 else if(a.op==='read')return await page.locator(a.selector??'body').nth(a.nth??0).innerText();
 else if(a.op==='shot'){const path=`${dir}/${a.name}.png`;if(a.selector)await page.locator(a.selector).nth(a.nth??0).screenshot({path});else await page.screenshot({path,fullPage:a.fullPage??false});return {path};}
 else if(a.op==='resize')await page.setViewportSize({width:a.width,height:a.height??1100});
 else if(a.op==='scroll')await pick(a).nth(a.nth??0).scrollIntoViewIfNeeded();
 else if(a.op==='offline')await context.setOffline(a.value);
 else if(a.op==='wait')await page.waitForTimeout(a.ms??1000);
 else if(a.op==='dom')return await page.locator(a.selector).evaluateAll(es=>es.map(e=>({tag:e.tagName,cls:e.className,text:e.innerText?.slice(0,500),aria:e.getAttribute('aria-label'),open:e.open,childId:e.getAttribute('data-child-id'),value:e.type==='password'?undefined:e.value,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height},scrollWidth:e.scrollWidth,clientWidth:e.clientWidth})));
 else if(a.op==='status')return await page.evaluate(()=>({url:location.href,width:innerWidth,bodyScrollWidth:document.body.scrollWidth,htmlScrollWidth:document.documentElement.scrollWidth}));
 return {url:page.url(),tail:(await page.locator('body').innerText()).slice(-2000)};
}
console.log(JSON.stringify({ready:true,at:new Date().toISOString()}));
for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{const a=JSON.parse(line);const result=await run(a);await log({kind:'result',op:a.op,result});console.log(JSON.stringify({ok:true,result}));}
 catch(e){await log({kind:'error',text:e.message});console.log(JSON.stringify({ok:false,error:e.message}));}
}
