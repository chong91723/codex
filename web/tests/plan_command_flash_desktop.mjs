// Exactly two new deepseek-flash planning turns, through the real composer.
// No existing conversation contents, credentials or configuration are read.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ready} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL,home=process.env.CODEX_TEST_HOME,workspace=process.env.CODEX_TEST_WORKSPACE;
assert(base&&home?.startsWith('/tmp/')&&workspace?.startsWith('/tmp/'),'Explicit independent /tmp instance required');
const out=path.resolve(process.env.REPORT_DIR||'test-results/plan-command-2026-10-27/flash');fs.mkdirSync(out,{recursive:true});
const fixture=fs.mkdtempSync(path.join(workspace,'plan-command-owned-')),marker='PLAN_COMMAND_UNCHANGED_'+Date.now();fs.writeFileSync(path.join(fixture,'sentinel.txt'),marker,{flag:'wx'});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(30000);
const results=[],calls=[],events=[],errors=[],cleanup=[],owned=new Set();
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{if(!socket.url().includes('/ws/rpc'))return;socket.on('framesent',frame=>{try{const value=JSON.parse(String(frame.payload));if(value.method&&/^(thread\/(start|settings\/update|delete)|turn\/(start|steer|interrupt))$/.test(value.method))calls.push(value);}catch{}});socket.on('framereceived',frame=>{try{const value=JSON.parse(String(frame.payload));if(['thread/settings/updated','turn/started','turn/completed','item/started','item/completed'].includes(value.method))events.push(value);}catch{}});});
const rpc=(method,params)=>page.evaluate(({method,params})=>rpc(method,params),{method,params});
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'Exactly two new synthetic ordinary Flash planning tasks in this invocation. Real UI, native requests, native proposed-plan items and completed turns. No previous history, model fallback, configuration or credentials access. No plan execution is approved.',base,home,workspace,fixture,modelTaskSubmissions:calls.filter(value=>value.method==='turn/start').length,results,calls,events,errors,cleanup},null,2)+'\n');
async function check(name,run){try{results.push({name,status:'passed',evidence:await run()});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:error.stack});await page.screenshot({path:path.join(out,'failure-'+results.length+'.png')}).catch(()=>{});throw error;}finally{save();}}
async function chooseDirectory(directory){await page.locator('#project-edit').click();await page.locator('#dialog-value').fill(directory);await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});await page.waitForFunction(directory=>state.selectedCwd===directory&&!state.thread,directory);}
const taskCount=()=>calls.filter(value=>value.method==='turn/start').length;
async function dismiss(){if(await page.locator('#toast').isVisible())await page.locator('#toast .toast-close').click();}
async function submitPlan(text){
 const start=calls.length,before=await page.evaluate(()=>state.turns.at(-1)?.id||null);
 await page.locator('#prompt').fill(text);await page.locator('#send').click();
 await page.waitForFunction(()=>!!state.thread?.id,null,{timeout:60000});const id=await page.evaluate(()=>state.thread.id);owned.add(id);
 await page.waitForFunction(before=>state.turns.some(turn=>turn.id!==before&&turn.status!=='inProgress'),before,{timeout:240000});
 const actual=await page.evaluate(before=>{const turn=state.turns.findLast(turn=>turn.id!==before&&turn.status!=='inProgress');return{thread:state.thread,settings:state.threadSettings.get(state.thread.id),mode:currentMode(),turn,items:[...state.items.values()].filter(entry=>entry.turnId===turn.id).map(entry=>entry.item)};},before);
 assert.equal(actual.turn.status,'completed',JSON.stringify(actual.turn.error));assert.equal(actual.settings.model,'deepseek-flash');assert.equal(actual.settings.modelProvider,'deepseek');assert.equal(actual.mode,'plan');assert.equal(actual.thread.cwd,fixture);
 const sent=calls.slice(start).filter(value=>value.method==='turn/start');assert.equal(sent.length,1);assert.equal(sent[0].params.threadId,id);assert.equal(sent[0].params.collaborationMode.mode,'plan');assert.equal(sent[0].params.collaborationMode.settings.model,'deepseek-flash');assert.equal(sent[0].params.model,'deepseek-flash');assert.equal(calls.slice(start).filter(value=>value.method==='turn/steer').length,0);
 const plans=actual.items.filter(item=>item.type==='plan');assert(plans.length,'Native model completion did not produce a proposed-plan item');assert(plans.every(item=>item.text?.length>40),'Native proposed plan is unexpectedly empty');
 const forbidden=actual.items.filter(item=>['commandExecution','fileChange','mcpToolCall','dynamicToolCall','webSearch'].includes(item.type));assert.deepEqual(forbidden,[],'The planning-only task performed forbidden work');assert.equal(fs.readFileSync(path.join(fixture,'sentinel.txt'),'utf8'),marker);assert.deepEqual(fs.readdirSync(fixture),['sentinel.txt']);
 await page.locator('.proposed-plan').last().waitFor({state:'visible'});assert(await page.locator('.proposed-plan').last().getByRole('button',{name:'确认 / 修改后执行',exact:true}).isVisible());
 assert(events.some(value=>value.method==='item/completed'&&value.params.threadId===id&&value.params.turnId===actual.turn.id&&value.params.item?.type==='plan'),'No actual native plan completion notification');
 return{threadId:id,turnId:actual.turn.id,model:actual.settings.model,provider:actual.settings.modelProvider,mode:actual.mode,submittedText:sent[0].params.input.filter(item=>item.type==='text').map(item=>item.text).join('\n'),nativePlans:plans,toolAndFileMutations:0,fixtureUnchanged:true,confirmationVisible:true};
}
async function exitMode(){
 const start=calls.length,eventStart=events.length,before=taskCount(),id=await page.evaluate(()=>state.thread.id);
 assert.equal(await page.locator('#mode-toggle').getAttribute('aria-label'),'退出计划模式，切回默认模式');
 await page.locator('#mode-toggle').click();await page.waitForFunction(id=>!state.nativeModePending&&currentMode()==='default'&&state.threadSettings.get(id)?.collaborationMode?.mode==='default',id,{timeout:30000});
 const requests=calls.slice(start).filter(value=>value.method==='thread/settings/update');assert.equal(requests.length,1);assert.equal(requests[0].params.threadId,id);assert.equal(requests[0].params.collaborationMode.mode,'default');
 assert(events.slice(eventStart).some(value=>value.method==='thread/settings/updated'&&value.params.threadId===id&&value.params.threadSettings?.collaborationMode?.mode==='default'));assert.equal(taskCount(),before,'Exiting Plan mode unexpectedly submitted a model task');
 return{threadId:id,nativeDefaultModeConfirmed:true,settingsRequests:1,newModelTasks:0,label:await page.locator('#mode-toggle').innerText()};
}
try{
 await page.goto(base);await ready(page);assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),home);assert.equal(await page.evaluate(()=>state.status.workspace),workspace);
 await page.locator('#new-chat').click();await chooseDirectory(fixture);await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');
 await check('新会话单独发送 /plan 进入模式并显示说明，零任务请求',async()=>{const start=calls.length;await page.locator('#prompt').fill('/plan');await page.locator('#send').click();await page.waitForFunction(()=>!composerState().pending&&!state.nativeModePending&&currentMode()==='plan');assert.equal(await page.evaluate(()=>state.thread?.id||null),null);assert.equal(await page.locator('#prompt').inputValue(),'');assert.match(await page.locator('#composer-status').innerText(),/计划模式.*输入.*计划模式.*退出/);assert.equal(calls.slice(start).filter(value=>['thread/start','turn/start','turn/steer'].includes(value.method)).length,0);await page.screenshot({path:path.join(out,'bare-plan-feedback.png')});return{mode:'plan',newModelTasks:0,nativeThreadCreated:false,feedback:await page.locator('#composer-status').innerText()};});
 await check('进入计划模式后自然语言发送真实Flash任务，只生成待确认计划',async()=>{await dismiss();const text='这是新建独立测试会话中的纯文本规划任务。请为一个 5 人小组制定一份新员工入职指引的编写计划，目标读者是第一次使用工单系统的同事。指引最终需要覆盖账号申请、提交工单、查看进度三个主题，要求中文、简洁。当前只需要你给出可执行的建议计划（约 3 至 5 步），等待我确认；请不要编写最终指引，不要执行计划，不要使用任何工具，不要读取或修改文件，不要联网，不需要进一步澄清。';const result=await submitPlan(text);assert.equal(result.submittedText,text);assert.equal(taskCount(),1);await page.screenshot({path:path.join(out,'bare-then-natural-plan.png')});return result;});
 await check('点击输入框内计划模式按钮，原生确认退出而不发任务',async()=>{const result=await exitMode();await page.screenshot({path:path.join(out,'explicit-exit-default.png')});return result;});
 await check('已有默认会话 /plan 具体问题去掉命令前缀，真实Flash按计划模式处理',async()=>{await dismiss();const task='这是第二个独立的纯文本规划目标。为周五的 30 分钟内部分享制定准备计划，主题是如何写出清楚的问题复现步骤，听众为 5 位工程师。最后的准备物应包括一个演示提纲和一个复现步骤模板，但当前只给出约 3 至 5 步的可执行建议计划，等我确认后才制作内容。不要执行计划，不要调用工具，不要读取或修改文件，不要联网。以上条件充分，不必反问。';const result=await submitPlan('/plan '+task);assert.equal(result.submittedText,task);assert(!result.submittedText.startsWith('/plan'));assert.equal(taskCount(),2);await page.screenshot({path:path.join(out,'inline-plan-task.png')});return result;});
 await check('带问题 /plan 结束后仍能通过模式按钮退出，两个任务无执行副作用',async()=>{const result=await exitMode();assert.equal(taskCount(),2);assert.equal(errors.length,0);assert.equal(fs.readFileSync(path.join(fixture,'sentinel.txt'),'utf8'),marker);assert.deepEqual(fs.readdirSync(fixture),['sentinel.txt']);return{...result,ordinaryModelTasksTotal:2,browserErrors:0,fixtureUnchanged:true};});
}catch(error){if(!results.some(value=>value.status==='failed'))results.push({name:'环境或夹具准备',status:'failed',error:error.stack});console.error(error.stack);process.exitCode=1;}
finally{
 for(const id of [...owned].reverse()){try{const active=await page.evaluate(id=>state.activeTurns.get(id)||null,id);if(active){await page.evaluate(async({id,turn})=>interruptTurn(id,turn),{id,turn:active});await page.waitForFunction(id=>!state.activeTurns.has(id),id,{timeout:45000});}await rpc('thread/delete',{threadId:id});cleanup.push({threadId:id,deleted:true,scope:'current invocation only'});}catch(error){cleanup.push({threadId:id,deleted:false,error:error.message});process.exitCode=1;}}
 try{await page.locator('#new-chat').click();await chooseDirectory(workspace);}catch(error){cleanup.push({uiWorkspaceRestored:false,error:error.message});process.exitCode=1;}
 fs.rmSync(fixture,{recursive:true,force:true});cleanup.push({ownedFixtureDeleted:!fs.existsSync(fixture)});save();await browser.close();console.log(JSON.stringify({passed:results.filter(value=>value.status==='passed').length,failed:results.filter(value=>value.status==='failed').length,modelTaskSubmissions:taskCount(),errors,cleanup}));
 if(results.length!==5||results.some(value=>value.status==='failed')||errors.length||taskCount()!==2||cleanup.some(value=>value.deleted===false||value.ownedFixtureDeleted===false))process.exitCode=1;
}
