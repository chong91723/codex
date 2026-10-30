// Actual Chromium + isolated Web/native profile. Report rows/events are explicit
// UI fixtures; memory CRUD/clear uses real backend and pinned native CLI.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.REPORT_DIR||'/tmp/codex-learning/browser-results';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const base=process.env.CODEX_WEB_URL||'http://127.0.0.1:8797';
async function ready(p){await p.goto(base);await p.waitForFunction(()=>window.state?.ready||typeof state!=='undefined'&&state.ready,null,{timeout:45000});}
const check=async(name,fn)=>{await fn();checks.push({name,status:'passed'});console.log('PASS '+name);};
try{
 await ready(page);const home=await page.evaluate(()=>state.runtimeInfo.codexHome);assert(home.startsWith('/tmp/')&&(home.includes('codex-learning')||home===process.env.CODEX_TEST_HOME),'Requires explicitly selected isolated test memory home');await page.evaluate(async()=>{const state=await databaseApi('result',{nativeMemory:{operation:'state'}});if(state.paused)await databaseApi('result',{nativeMemory:{operation:'pause',expectedVersion:state.version,paused:false}});await rpc('config/batchWrite',{edits:[{keyPath:'features.memories',value:true,mergeStrategy:'replace'}],reloadUserConfig:true});});
 const resultId='e'.repeat(32),chartId='f'.repeat(32);
 await page.route('**/api/databases/read_chart',route=>route.fulfill({json:{version:1,resultId,title:'显式界面测试图表',rowCount:2,rows:[{region:'东区',amount:125},{region:'西区',amount:80}],option:{xAxis:{type:'category',data:['东区','西区']},yAxis:{type:'value'},series:[{type:'bar',data:[125,80]}]}}}));
 await page.route('**/api/databases/result',route=>{const data=route.request().postDataJSON();if(data.resultId===resultId)return route.fulfill({json:{resultId,rowCount:2,columns:[{name:'region'},{name:'amount'}],rows:[{region:'东区',amount:125},{region:'西区',amount:80}]}});return route.continue();});
 await check('复杂报告在对话内有目录和完整表格，图表/数据保持同一区域',async()=>{
  await page.evaluate(({resultId,chartId})=>{resetChat();state.thread={id:'report-fixture-thread',name:'复杂报告界面夹具'};const threadId=state.thread.id,turnId='report-fixture-turn';
   const chart={id:'report-fixture-chart',type:'mcpToolCall',server:'codex_web_databases',tool:'create_chart',status:'completed',result:{structuredContent:{codexWebChart:{version:2,chartId,resultId,title:'显式界面测试图表',rowCount:2}},content:[]}};
   const text='## 核心结论\n这是明确的界面测试夹具，并非真实模型分析。\n\n## 业务背景\n'+('分析应说明数据范围、业务含义与不确定性。'.repeat(45))+'\n\n## 区域对比\n| 区域 | 表现 |\n|---|---|\n| 东区 | 领先 |\n| 西区 | 待观察 |\n\n## 限制与建议\n保留原始数据，并按实际业务解释。\n<script>window.__reportInjected=true</script>';
   const answer={id:'report-fixture-answer',type:'agentMessage',phase:'final_answer',text};
   handleEvent({method:'turn/started',params:{threadId,turn:{id:turnId,status:'inProgress',items:[]}}});for(const item of [chart,answer])handleEvent({method:'item/completed',params:{threadId,turnId,item}});handleEvent({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed',items:[chart,answer]}}});showView('chat');
  },{resultId,chartId});
  await page.locator('[data-export-analysis-report]').waitFor();await page.locator('.analysis-report-outline').waitFor();assert.equal(await page.locator('.unified-analysis-result').count(),1);assert.equal(await page.locator('.analysis-report table tbody tr').count(),2);assert.equal(await page.evaluate(()=>window.__reportInjected),undefined);
  for(const width of [1440,1024]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'report-'+width+'.png')});}
 });
 await check('Markdown 正文优先，HTML 内嵌真实 ECharts SVG 并可离线阅读',async()=>{
  const download=page.locator('[data-export-analysis-report]'),format=page.getByLabel('报告导出格式');
  let promise=page.waitForEvent('download');await download.click();let file=await promise;await file.saveAs(path.join(out,'report.md'));const md=fs.readFileSync(path.join(out,'report.md'),'utf8');assert(md.indexOf('核心结论')<md.indexOf('数值依据状态'));assert(!md.includes('"publicationChecks"'));
  await format.selectOption('html');promise=page.waitForEvent('download');await download.click();file=await promise;const htmlPath=path.join(out,'report.html');await file.saveAs(htmlPath);const html=fs.readFileSync(htmlPath,'utf8');assert(html.includes('data:image/svg+xml;base64,'));assert(!html.includes('<script>'));assert(html.includes('Content-Security-Policy'));
  const offline=await browser.newPage();await offline.goto('file://'+htmlPath);assert.equal(await offline.locator('figure img').count(),1);assert.equal(await offline.locator('table tbody tr').count(),2);assert(await offline.locator('figure img').evaluate(img=>img.complete&&img.naturalWidth>0));await offline.screenshot({path:path.join(out,'exported-report.png'),fullPage:true});await offline.pdf({path:path.join(out,'report-print.pdf'),format:'A4',printBackground:true});await offline.close();
  await format.selectOption('evidence');promise=page.waitForEvent('download');await download.click();file=await promise;await file.saveAs(path.join(out,'report-evidence.json'));const proof=JSON.parse(fs.readFileSync(path.join(out,'report-evidence.json')));assert.equal(proof.turnId,'report-fixture-turn');
 });
 await check('设置页可编辑记忆，另一页面新任务立即读到；并发编辑保留草稿',async()=>{
  await page.evaluate(()=>resetChat());await page.locator('[data-view=settings]').click();await page.getByRole('button',{name:'查看与编辑记忆',exact:true}).click();const dialog=page.locator('.analysis-memory-dialog');await dialog.getByRole('button',{name:'保存编辑',exact:true}).waitFor();await dialog.locator('[data-memory-status=preference]').waitFor();await dialog.locator('[data-memory-status=consolidation]').waitFor();assert.match(await dialog.locator('.analysis-native-history').innerText(),/普通新分析关闭整段对话自动提取/);await dialog.getByRole('button',{name:'暂停长期记忆',exact:true}).click();await dialog.getByRole('button',{name:'启用长期记忆',exact:true}).click();const memoryConfig=await page.evaluate(()=>rpc('config/read',{includeLayers:false}));assert.equal(memoryConfig.config.memories.generate_memories,false,'Enabling remembered preferences must not enable raw analysis extraction');assert.equal(memoryConfig.config.memories.use_memories,true);await dialog.getByLabel('编辑用户记忆').fill('报告使用中文，并把限制说明写在结论之后。');await dialog.getByRole('button',{name:'保存编辑',exact:true}).click();await dialog.getByRole('status').filter({hasText:'已保存'}).waitFor();
  const other=await browser.newPage();await ready(other);await other.evaluate(()=>prepareAnalysisMemory());const memory=await other.evaluate(()=>state.analysisUserMemory);assert.equal(memory.content,'报告使用中文，并把限制说明写在结论之后。');assert.equal(memory.paused,false);assert(memory.recent.notes.every(note=>!note.path.includes('-web-user-')),'Manual edits must not be duplicated as stale snapshots; independent prior Agent notes may remain');assert(await other.evaluate(()=>analysisLearningInstructions().includes('报告使用中文，并把限制说明写在结论之后。')));
  await dialog.getByLabel('编辑用户记忆').fill('这是待保存的并发修改草稿。');await other.evaluate(async()=>{const s=await databaseApi('result',{nativeMemory:{operation:'state'}});await databaseApi('result',{nativeMemory:{operation:'save',expectedVersion:s.version,content:'另一个页面已确认的新偏好。'}});});await dialog.getByRole('button',{name:'保存编辑',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'记忆已更新'}).waitFor();assert.equal(await dialog.getByLabel('编辑用户记忆').inputValue(),'这是待保存的并发修改草稿。');await dialog.getByRole('button',{name:'刷新',exact:true}).click();await page.screenshot({path:path.join(out,'memory-settings.png')});await other.close();
 });
 await check('原生清空操作确实清除独立测试记忆并保持暂停，新任务不注入旧内容',async()=>{
  const dialog=page.locator('.analysis-memory-dialog');page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'清空长期记忆',exact:true}).click();await dialog.getByRole('status').filter({hasText:'已清空'}).waitFor({timeout:45000});const current=await page.evaluate(()=>databaseApi('result',{nativeMemory:{operation:'state'}}));assert.equal(current.content,'');assert.equal(current.total,0);assert.equal(current.paused,true);await page.evaluate(()=>prepareAnalysisMemory());assert.equal(await page.evaluate(()=>threadRuntimeConfig('deepseek').features.memories),false);await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 });
 assert.equal(errors.length,0,errors.join('\n'));
}catch(error){checks.push({name:'failure',status:'failed',error:error.stack});console.error(error.stack);await page.screenshot({path:path.join(out,'failure.png')});process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'Real browser and native local memory CRUD; report transcript/chart are explicit UI fixtures, not live model/data',checks,errors},null,2));await browser.close();}
