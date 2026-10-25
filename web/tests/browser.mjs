// Optional browser QA: use a locally installed Playwright and Chromium.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs
// CHROMIUM_BIN=/absolute/path/to/chromium node web/tests/browser.mjs
import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const base=process.env.CODEX_WEB_URL||'http://127.0.0.1:8765';
try{
  await page.goto(base);
  await page.waitForFunction(()=>document.querySelector('#connection').textContent.includes('原生已连接'),{timeout:45000});
  const screenshotDir=process.env.SCREENSHOT_DIR||'/tmp/codex-web-screenshots';fs.mkdirSync(screenshotDir,{recursive:true});
  await page.screenshot({path:screenshotDir+'/desktop.png',fullPage:true,mask:[page.locator('#account-name')]});
  for(const view of ['skills','mcp','plugins','protocol','settings','account']){
    await page.locator('[data-view="'+view+'"]').first().click();
    await page.waitForFunction(()=>!document.querySelector('#panel-content .loading'),{timeout:45000});
    const error=await page.locator('.panel-error').allTextContents();
    console.log(JSON.stringify({view,error}));
  }
  await page.locator('#new-chat').click();
  await page.locator('#files-toggle').click();
  await page.waitForSelector('#file-panel:not([hidden])');
  await page.locator('#files-close').click();
  if(!await page.locator('#terminal-toggle').isHidden())throw new Error('CLI entry should be hidden');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  console.log(JSON.stringify({errors,desktopOverflow:overflow,screenshotDir}));
  if(errors.length||overflow)process.exitCode=1;
}finally{await browser.close();}
