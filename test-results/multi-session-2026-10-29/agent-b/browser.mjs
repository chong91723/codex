import { chromium } from '/root/Codex/.toolchains/playwright/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import readline from 'node:readline';
const dir='/tmp/codex-collab-audit-20261029/agent-b';
const browser=await chromium.launch({executablePath:'/root/Codex/.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true});
const page=await context.newPage();
page.on('response',r=>{if(r.url().includes('/api/'))fs.appendFileSync(dir+'/network.jsonl',JSON.stringify({utc:new Date().toISOString(),url:r.url(),method:r.request().method(),status:r.status()})+'\n');});
page.on('download',async d=>{const path=dir+'/'+Date.now()+'-'+d.suggestedFilename();await d.saveAs(path);console.log(JSON.stringify({download:path}));});
await page.goto('http://127.0.0.1:44437');
console.log(JSON.stringify({ready:true,utc:new Date().toISOString(),text:await page.locator('body').innerText()}));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of rl){
 try{
  const c=JSON.parse(line);const start=new Date().toISOString();
  const result=await new AsyncFunction('page','context','browser','fs','dir',c.js)(page,context,browser,fs,dir);
  const screenshot=dir+'/'+(c.name||Date.now())+'.png';await page.screenshot({path:screenshot,fullPage:true});
  fs.appendFileSync(dir+'/actions.jsonl',JSON.stringify({utc:start,command:c,screenshot,result})+'\n');
  console.log(JSON.stringify({ok:true,utc:start,result,screenshot}));
 }catch(e){const screenshot=dir+'/error-'+Date.now()+'.png';await page.screenshot({path:screenshot,fullPage:true}).catch(()=>{});console.log(JSON.stringify({ok:false,error:String(e),screenshot}));}
}
await browser.close();
