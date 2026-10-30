import fs from 'node:fs';
const {chromium}=await import('/root/Codex/.toolchains/playwright/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:'/root/Codex/.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});let release,entered;
 const requested=new Promise(r=>entered=r);const gate=new Promise(r=>release=r);
 await page.route('**/app.js*',async route=>{entered();await gate;await route.abort();});
 await page.goto('http://127.0.0.1:8765/?thread=01a18bf1-8470-7920-9a54-389aa8698aa5',{waitUntil:'commit'});await requested;await page.locator('#welcome').waitFor({state:'attached'});
 const observation=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve({url:location.href,welcomeVisible:!!document.querySelector('#welcome')&&getComputedStyle(document.querySelector('#welcome')).display!=='none',empty:document.querySelector('#view-chat')?.classList.contains('empty'),title:document.querySelector('#page-title')?.textContent,welcome:document.querySelector('#welcome')?.textContent,appLoaded:typeof state!=='undefined'}))));
 await page.screenshot({path:'/tmp/codex-refresh-20261030/baseline-first-paint.png'});fs.writeFileSync('/tmp/codex-refresh-20261030/baseline-first-paint.json',JSON.stringify({scope:'Daily static HTML and CSS only; app.js blocked, no native user history read or model work',observation},null,2));console.log(JSON.stringify(observation));release();
}finally{await browser.close();}
