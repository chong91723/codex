import { chromium } from '/root/Codex/.toolchains/playwright/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import readline from 'node:readline';
const dir='/tmp/codex-collab-audit-20261029/agent-a';
const browser=await chromium.launch({executablePath:'/root/Codex/.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1500,height:1100},acceptDownloads:true});
const page=await context.newPage();
const log=async o=>fs.appendFile(`${dir}/events.jsonl`,JSON.stringify({at:new Date().toISOString(),...o})+'\n');
page.on('console',m=>{if(m.type()==='error')log({kind:'console-error',text:m.text()});});
page.on('pageerror',e=>log({kind:'pageerror',text:e.message}));
page.on('requestfailed',r=>log({kind:'requestfailed',url:r.url().split('?')[0],failure:r.failure()}));
page.on('response',r=>{if(r.status()>=400)log({kind:'http-error',url:r.url().split('?')[0],status:r.status()});});
page.on('download',async d=>{const filename=d.suggestedFilename();await d.saveAs(`${dir}/${filename}`);await log({kind:'download',filename});});
const pick=a=>a.role?page.getByRole(a.role,{name:a.name,exact:a.exact??true}):a.text?page.getByText(a.text,{exact:a.exact??true}):page.locator(a.selector);
async function run(a){
 await log({kind:'operation',...a});
 if(a.op==='open'){await page.goto(a.url??'http://127.0.0.1:44437',{waitUntil:'domcontentloaded'});}
 else if(a.op==='click')await pick(a).nth(a.nth??0).click({timeout:a.timeout??10000});
 else if(a.op==='fill')await pick(a).nth(a.nth??0).fill(a.value);
 else if(a.op==='press')await pick(a).nth(a.nth??0).press(a.key);
 else if(a.op==='wait')await page.waitForTimeout(a.ms??1000);
 else if(a.op==='reload')await page.reload({waitUntil:'domcontentloaded'});
 else if(a.op==='shot'){await page.screenshot({path:`${dir}/${a.name}.png`,fullPage:true});return {screenshot:`${dir}/${a.name}.png`};}
 else if(a.op==='read')return await page.locator(a.selector??'body').innerText();
 else if(a.op==='dom')return await page.locator(a.selector??'button,input,textarea,select,a').evaluateAll(es=>es.map(e=>({tag:e.tagName,text:e.innerText,placeholder:e.getAttribute('placeholder'),title:e.getAttribute('title'),aria:e.getAttribute('aria-label'),type:e.getAttribute('type'),value:e.value,disabled:e.disabled,cls:e.className})).filter(x=>!(x.type==='password')));
 else if(a.op==='attr')return await pick(a).nth(a.nth??0).getAttribute(a.attr);
 else if(a.op==='state'){return await page.evaluate(()=>({url:location.href,storage:Object.keys(localStorage)}));}
 else if(a.op==='close'){await browser.close();process.exit(0);}
 return {url:page.url(),text:await page.locator('body').innerText()};
}
process.stdout.write(JSON.stringify({ready:true,at:new Date().toISOString()})+'\n');
for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{const a=JSON.parse(line);const result=await run(a);await log({kind:'result',op:a.op,result});process.stdout.write(JSON.stringify({ok:true,result})+'\n');}
 catch(e){await log({kind:'error',text:e.message});process.stdout.write(JSON.stringify({ok:false,error:e.message})+'\n');}
}
