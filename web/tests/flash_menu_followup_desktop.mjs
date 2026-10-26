// Every accepted command is chosen from the composer menu, then sent through the UI.
// Native RPC is used only for read-back assertions and emergency test cleanup.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {ready, prompt} from './skills_mcp_helpers.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL||'http://127.0.0.1:8785';
const out=path.resolve(process.env.ARTIFACT_DIR||'/root/Codex/test-results/flash-followup-2026-10-26');
const requiredWorkspace=process.env.CODEX_TEST_WORKSPACE;
assert(requiredWorkspace?.startsWith('/tmp/'),'CODEX_TEST_WORKSPACE must name the independent /tmp workspace');
const filter=process.env.MENU_ONLY?new RegExp(process.env.MENU_ONLY):null;
const runId=Date.now()+'-'+process.pid;
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(25000);
const results=[],errors=[],sent=[],received=[],approvals=[],ownedThreads=new Set(),pendingGoals=new Set();
let workspace,home;
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{
  socket.on('framesent',frame=>{
    try{
      const message=JSON.parse(String(frame.payload));
      if(message.method)sent.push({id:message.id,method:message.method,params:{
        threadId:message.params?.threadId,turnId:message.params?.turnId,
        model:message.params?.model,reasoningEffort:message.params?.reasoningEffort,
        collaborationMode:message.params?.collaborationMode,
        status:message.params?.status,origin:message.params?.origin,
        keyPath:message.params?.keyPath,
        input:message.params?.input?.map(item=>({type:item.type,name:item.name,path:item.path,text:item.text}))
      }});
    }catch{}
  });
  socket.on('framereceived',frame=>{
    try{
      const message=JSON.parse(String(frame.payload));
      if(message.method&&['turn/started','turn/completed','thread/goal/updated','thread/goal/cleared','thread/tokenUsage/updated'].includes(message.method))received.push(message);
    }catch{}
  });
});
const persist=()=>fs.writeFileSync(path.join(out,'menu-results.json'),JSON.stringify({
  scope:'Only deepseek-flash. Real composer-menu paths and native backend. No custom test skills.',
  base,workspace,home,results,errors,sent,received,approvals
},null,2));
const read=async(method,params)=>{
  assert(/^(thread\/(read|turns\/list|goal\/get|backgroundTerminals\/list)|config\/read|project\/list)$/.test(method),'Read-back RPC outside allowlist: '+method);
  return page.evaluate(({method,params})=>rpc(method,params),{method,params});
};
const turnCount=()=>sent.filter(message=>message.method==='turn/start').length;
async function waitForSent(method,start){const deadline=Date.now()+25000;while(!sent.slice(start).some(message=>message.method===method)){assert(Date.now()<deadline,'No actual request '+method);await page.waitForTimeout(100);}}
async function menu(command){
  assert.equal(await page.evaluate(()=>state.view),'chat','Menu command must start from the visible chat composer');
  const turnsBefore=turnCount();
  await page.locator('#prompt').fill('/'+command);
  await page.locator('#menu-'+command).waitFor();
  await page.locator('#menu-'+command).click();
  assert.equal(await page.locator('#prompt').inputValue(),'/'+command);
  assert(await page.locator('#command-menu').isHidden(),'Selection must only fill the input');
  assert.equal(turnCount(),turnsBefore,'Menu selection executed a model task before send');
  const start=sent.length;
  await page.locator('#prompt').press('Enter');
  return start;
}
async function closeDialog(){await page.locator('#dialog-submit').click();await page.locator('#dialog').waitFor({state:'hidden'});}
async function newChat(){
  await page.locator('#new-chat').click();
  await page.locator('#model').selectOption('deepseek-flash');
  await page.locator('#effort').selectOption('low');
}
async function waitForFile(file,timeout=180000){const deadline=Date.now()+timeout;while(!fs.existsSync(file)){const failure=await page.evaluate(()=>{const goal=state.nativeGoals.get(state.thread?.id),turn=state.turns.at(-1);return goal?.status==='blocked'||turn?.status==='failed'?{threadId:state.thread?.id,goalStatus:goal?.status,turnStatus:turn?.status,error:turn?.error}:null;});assert(!failure,'Native command stopped before creating file: '+JSON.stringify(failure));assert(Date.now()<deadline,'Native command did not create '+file);await page.waitForTimeout(100);}}
function liveProcesses(marker){return fs.readdirSync('/proc').filter(id=>/^\d+$/.test(id)).filter(id=>{try{return fs.readFileSync('/proc/'+id+'/cmdline','utf8').includes(marker);}catch{return false;}});}
async function finish(before,timeout=240000){
  let done=false,failure;
  const completion=page.waitForFunction(before=>state.turns.at(-1)?.id!==before&&state.turns.at(-1)?.status&&state.turns.at(-1).status!=='inProgress',before,{timeout}).then(()=>{done=true;},error=>{failure=error;done=true;});
  while(!done){
    for(const card of await page.locator('#requests .request-card').all()){
      const allow=card.getByRole('button',{name:'允许一次',exact:true});
      if(!await allow.isVisible()||!await allow.isEnabled())continue;
      const data=JSON.parse(await card.locator('pre').first().innerText());
      const cwd=data.cwd?.startsWith('file:')?new URL(data.cwd).pathname:data.cwd;
      const command=typeof data.command==='string'?data.command:Array.isArray(data.command)?data.command.join(' '):'';
      const safeInitCleanup=typeof cwd==='string'&&cwd.startsWith(path.resolve(workspace)+path.sep+'menu-init-')&&/^rm -f __pycache__\/hello\.cpython-\d+\.pyc && rmdir __pycache__$/.test(command);
      approvals.push({command,cwd,decision:safeInitCleanup?'accept':'decline',reason:safeInitCleanup?'Exact generated bytecode cleanup in this test subdirectory':'Unexpected command is not approved by this test'});
      await card.getByRole('button',{name:safeInitCleanup?'允许一次':'拒绝',exact:true}).click();
    }
    if(!done)await page.waitForTimeout(100);
  }
  await completion;if(failure)throw failure;
  const status=await page.evaluate(()=>state.turns.at(-1));
  assert.equal(status.status,'completed','Actual native turn failed: '+JSON.stringify(status.error));
  return status;
}
async function rememberThread(){const id=await page.evaluate(()=>state.thread?.id);assert(id);ownedThreads.add(id);return id;}
async function chooseDirectory(directory){
  await menu('projects');
  await page.getByRole('button',{name:'选择工作目录',exact:true}).click();
  await page.locator('#dialog-value').fill(directory);
  await closeDialog();
  await page.waitForFunction(directory=>state.selectedCwd===directory&&!state.thread,directory);
}
async function goalDialog(){await menu('goal');await page.getByRole('heading',{name:'持续目标',exact:true}).waitFor();}
async function waitStopped(id){
  await page.waitForFunction(id=>!state.activeTurns.has(id)&&![...state.stopOperations.values()].some(op=>op.threadId===id&&op.status==='pending'),id,{timeout:90000});
  const listed=await read('thread/backgroundTerminals/list',{threadId:id,limit:100});
  return listed;
}
async function emergencyGoalCleanup(){
  for(const id of [...pendingGoals]){
    await page.evaluate(async id=>{const turn=state.activeTurns.get(id);if(turn)await interruptTurn(id,turn);await rpc('thread/goal/clear',{threadId:id,origin:'user'});},id);
    pendingGoals.delete(id);
  }
}
async function check(name,action){
  if(filter&&!filter.test(name))return;
  try{results.push({name,status:'passed',evidence:await action()});console.log('PASS '+name);}
  catch(error){
    results.push({name,status:'failed',error:error.stack||error.message});
    console.log('FAIL '+name+': '+error.message);
    await page.screenshot({path:path.join(out,'menu-failure-'+results.length+'.png')}).catch(()=>{});
    fs.writeFileSync(path.join(out,'menu-failure-'+results.length+'.txt'),await page.locator('body').innerText().catch(()=>''));
    if(await page.locator('#dialog[open]').count())await page.locator('#dialog-cancel').click().catch(()=>{});
    await emergencyGoalCleanup().catch(error=>results.push({name:'Emergency goal cleanup',status:'failed',error:error.message}));
    if(workspace&&await page.evaluate(()=>state.selectedCwd)!==workspace){await newChat();await chooseDirectory(workspace).catch(()=>{});}
  }
  persist();
}

try{
  await page.goto(base);await ready(page);
  ({workspace,home}=await page.evaluate(()=>({workspace:state.status.workspace,home:state.runtimeInfo.codexHome})));
  assert.equal(path.resolve(workspace),path.resolve(requiredWorkspace));
  assert(home.startsWith('/tmp/')&&/flash|audit|followup/.test(home),'Refusing a daily-use Codex profile');
  assert(!fs.existsSync(path.join(home,'auth.json')),'This profile must not contain ChatGPT auth');
  await newChat();

  await check('范围与菜单基础：只调用 Flash，无反馈/快速/生图或 ChatGPT 主动入口',async()=>{
    const models=await page.locator('#model option').evaluateAll(nodes=>nodes.map(node=>({value:node.value,provider:node.dataset.provider})));
    assert(models.some(model=>model.value==='deepseek-flash'));assert(!models.some(model=>model.provider==='openai'||/^(gpt-|o[134]-|chatgpt)/i.test(model.value)));
    await page.locator('#prompt').fill('/');
    await page.waitForFunction(()=>state.commandMenu&&!state.commandMenu.catalog.loading);
    const commands=await page.locator('#command-menu .command-option').evaluateAll(nodes=>nodes.map(node=>({id:node.id,text:node.textContent})));
    for(const id of ['menu-feedback','menu-fast'])assert(!commands.some(command=>command.id===id));
    assert(!commands.some(command=>/imagegen|生成图像|绘图|生图/.test(command.text)));
    await page.screenshot({path:path.join(out,'menu-desktop.png')});
    await page.locator('#prompt').press('Escape');
    const count=turnCount();
    for(const command of ['/feedback','/fast','/image','/imagegen']){
      await page.locator('#prompt').fill(command);await page.locator('#prompt').press('Enter');
      await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('功能已移除'));
      assert.equal(await page.locator('#prompt').inputValue(),command);assert.equal(turnCount(),count);
    }
    return {models,commands,selectionOnly:true,removedCommandsRejectedWithoutTurn:true,draftsRetained:true};
  });

  for(const entry of [
    {command:'mcp',view:'mcp',heading:'MCP 服务',method:'mcpServerStatus/list'},
    {command:'skills',view:'skills',heading:'技能',method:'skills/list'},
    {command:'settings',view:'settings',heading:'按照你的方式工作',method:'config/read'}
  ])await check('/'+entry.command+'：从新菜单发送，读取真实原生页面',async()=>{
    await newChat();const start=await menu(entry.command);
    await page.waitForFunction(view=>state.view===view,entry.view);
    if(entry.heading)await page.getByRole('heading',{name:entry.heading,exact:true}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('#panel-content > .loading'));
    await waitForSent(entry.method,start);
    assert(sent.slice(start).some(message=>message.method===entry.method),'The command did not call '+entry.method);
    assert.equal(await page.locator('#panel-content > .panel-error').count(),0);
    const text=await page.locator('#panel-content').innerText();
    await page.screenshot({path:path.join(out,'menu-'+entry.command+'.png')});
    return {view:entry.view,actualRequest:entry.method,text:text.slice(0,1800)};
  });

  await check('/native：从新菜单打开协议并执行真实只读请求',async()=>{
    await newChat();await menu('native');
    await page.waitForFunction(()=>state.view==='protocol');
    await page.locator('.protocol-search').fill('config/read');
    await page.getByRole('button',{name:'config/read',exact:true}).click();
    await page.locator('#rpc-params').fill(JSON.stringify({includeLayers:false,cwd:workspace}));
    const start=sent.length;
    await page.getByRole('button',{name:'执行原生请求',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#rpc-result').textContent.includes('deepseek-flash'));
    const value=JSON.parse(await page.locator('#rpc-result').innerText());
    assert.equal(value.config.model,'deepseek-flash');assert.equal(value.config.model_provider,'deepseek');
    assert(sent.slice(start).some(message=>message.method==='config/read'));
    return {nativeDefinitions:await page.evaluate(()=>methodEntries().length),realConfigProvider:value.config.model_provider,realConfigModel:value.config.model};
  });

  await check('/model、/reasoning、/status：选择、下一回合实际生效与后台一致',async()=>{
    await newChat();await menu('model');
    await page.getByRole('heading',{name:'选择模型',exact:true}).waitFor();
    const options=await page.locator('#command-setting option').evaluateAll(nodes=>nodes.map(node=>({value:node.value,provider:node.dataset.provider})));assert(options.some(option=>option.value==='deepseek-flash'));assert(!options.some(option=>option.provider==='openai'||/^(gpt-|o[134]-|chatgpt)/i.test(option.value)));
    await page.locator('#command-setting').selectOption('deepseek-flash');await closeDialog();
    await menu('reasoning');await page.locator('#command-setting').selectOption('low');await closeDialog();
    const result=await prompt(page,'只回复 FLASH_MENU_MODEL_OK，不调用任何工具。',false,180000);
    const id=await rememberThread();assert.equal(result.settings.model,'deepseek-flash');assert.equal(result.settings.modelProvider,'deepseek');
    assert.equal(result.settings.effort||result.settings.collaborationMode?.settings.reasoning_effort,'low');
    const native=(await read('thread/read',{threadId:id,includeTurns:false})).thread;
    await menu('status');const status=await page.locator('#dialog-body').innerText();
    assert(status.includes(id)&&status.includes('deepseek-flash')&&status.includes('deepseek')&&status.includes(workspace));
    await closeDialog();
    return {threadId:id,provider:result.settings.modelProvider,model:result.settings.model,effort:result.settings.effort,readBackThreadId:native.id};
  });

  await check('/init：独立目录真实创建 AGENTS.md，再次初始化不覆盖',async()=>{
    await newChat();const directory=path.join(workspace,'menu-init-'+runId);fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,'README.md'),'# Independent menu acceptance workspace\nA tiny Python command project. Run python3 hello.py to verify it.\n');
    fs.writeFileSync(path.join(directory,'hello.py'),'print("independent menu acceptance")\n');
    await chooseDirectory(directory);assert(!fs.existsSync(path.join(directory,'AGENTS.md')));
    const before=await page.evaluate(()=>state.turns.at(-1)?.id||null);
    await menu('init');await page.getByRole('heading',{name:'初始化工作区',exact:true}).waitFor();
    await closeDialog();await finish(before);const id=await rememberThread();
    const file=path.join(directory,'AGENTS.md');assert(fs.existsSync(file),'AGENTS.md was not generated');
    const first=fs.readFileSync(file);assert(first.length>100,'AGENTS content is empty');
    const secondBefore=await page.evaluate(()=>state.turns.at(-1)?.id||null);
    await menu('init');await closeDialog();await finish(secondBefore);
    assert.deepEqual(fs.readFileSync(file),first,'Existing AGENTS.md was changed');
    const lastTurn=sent.filter(message=>message.method==='turn/start').at(-1);assert.equal(lastTurn.params.model,'deepseek-flash');
    const evidence={threadId:id,directory,createdBytes:first.length,sha256:crypto.createHash('sha256').update(first).digest('hex'),secondInitializationKeptBytes:true};
    await chooseDirectory(workspace);return evidence;
  });

  await check('/projects 与 /chat：原生项目关联后新建无项目会话，其他会话草稿保留',async()=>{
    await newChat();await prompt(page,'只回复 DRAFT_SOURCE_A，不使用工具。');
    const draftThread=await rememberThread(),draft='原会话未发送的中文草稿 '+runId;
    await page.locator('#prompt').fill(draft);
    await newChat();await prompt(page,'只回复 PROJECT_SOURCE_B，不使用工具。');
    const source=await rememberThread();
    await menu('projects');await page.getByRole('button',{name:'新建项目',exact:true}).click();
    const name='Flash菜单项目-'+runId;await page.locator('#native-project-name').fill(name);await closeDialog();
    await menu('projects');const card=page.locator('.native-project').filter({has:page.getByText(name,{exact:true})});
    const projectId=await card.getAttribute('data-project-id');assert(projectId);
    await card.getByRole('button',{name:'将当前会话移入',exact:true}).click();
    await page.waitForFunction(id=>state.thread?.projectId===id,projectId);
    await menu('chat');await page.waitForFunction(()=>!state.thread&&!state.selectedProject);
    assert.equal(await page.locator('#prompt').inputValue(),'');assert.equal(await page.evaluate(()=>state.selectedCwd),workspace);
    await prompt(page,'只回复 UNASSIGNED_CHAT_C，不使用工具。');const unassigned=await rememberThread();
    assert.notEqual(unassigned,source);assert.notEqual(unassigned,draftThread);
    const native=(await read('thread/read',{threadId:unassigned,includeTurns:false})).thread;assert(!native.projectId);
    await page.locator(`.thread-row[data-thread-id="${draftThread}"]`).click();
    await page.waitForFunction(id=>state.thread?.id===id&&!state.threadLoading,draftThread);
    assert.equal(await page.locator('#prompt').inputValue(),draft,'Unrelated session draft changed');
    await page.locator(`.thread-row[data-thread-id="${source}"]`).click();
    await page.waitForFunction(id=>state.thread?.id===id&&!state.threadLoading,source);
    assert((await page.locator('#messages').innerText()).includes('PROJECT_SOURCE_B'));
    await menu('projects');await page.locator(`[data-project-id="${projectId}"]`).getByRole('button',{name:'删除项目',exact:true}).click();await closeDialog();
    assert(!((await read('project/list',{limit:100})).data||[]).some(project=>project.id===projectId));
    return {sourceThread:source,draftThread,unassignedThread:unassigned,projectId,nativeUnassigned:true,otherDraftPreserved:true,sourceHistoryPreserved:true};
  });

  await check('/plan：Flash 原生计划→修改确认→同会话真实文件与步骤结果',async()=>{
    await newChat();await menu('plan');await page.waitForFunction(()=>currentMode()==='plan');
    const result=await prompt(page,'请为当前独立验收目录制定一个极简计划：创建一个文本文件并核对内容。现在只研究和提出计划，不执行修改，不提问。必须用原生 proposed_plan 格式给出最终计划。',false,240000);
    await page.locator('.proposed-plan').waitFor();const id=await rememberThread();
    const original=sent.filter(message=>message.method==='turn/start').at(-1);assert.equal(original.params.collaborationMode.mode,'plan');assert.equal(original.params.collaborationMode.settings.model,'deepseek-flash');
    const file='menu-plan-'+runId+'.txt',marker='FLASH_MENU_PLAN_CONFIRMED_'+runId;
    await page.getByRole('button',{name:'确认 / 修改后执行',exact:true}).last().click();
    await page.locator('#approved-plan').fill(`用户已经确认以下计划，只在当前独立工作区执行：1. 调用 update_plan 建立创建文件、核对文件两步。2. 使用 exec_command（sandbox_permissions="use_default"，省略 justification 和 prefix_rule）创建 ${file}，内容严格为 ${marker}，不得附加换行。3. 用 cat 核对真实内容，再调用 update_plan 将两步都标为 completed。4. 简短报告完成。`);
    await closeDialog();await finish(result.turn.id);assert.equal(fs.readFileSync(path.join(workspace,file),'utf8'),marker);
    assert.equal(await page.evaluate(()=>state.thread.id),id);assert.equal(await page.evaluate(()=>currentMode()),'default');
    await page.locator('.execution-progress').last().waitFor();assert((await page.locator('.execution-progress').last().innerText()).includes('2/2'));
    await page.reload();await ready(page);assert.equal(await page.evaluate(()=>state.thread.id),id);await page.locator('.execution-progress').last().waitFor();
    return {threadId:id,model:'deepseek-flash',nativePlan:true,editedPlanExecuted:true,realFile:file,progressRestored:true};
  });

  await check('/goal：UI 创建→暂停并回收命令→继续→移除并停止',async()=>{
    await newChat();await goalDialog();const id=await rememberThread();pendingGoals.add(id);
    const commandMarker='FLASH_MENU_GOAL_WAIT_'+runId;
    const startedName='menu-goal-started-'+runId+'.txt',tailName='menu-goal-tail-'+runId+'.txt';
    const startedFile=path.join(workspace,startedName),tailFile=path.join(workspace,tailName);
    const script=`import time; from pathlib import Path; Path('${startedName}').write_text('${commandMarker}'); time.sleep(45); Path('${tailName}').write_text('${commandMarker}')`;
    await page.locator('#goal-objective').fill(`这是一个独立验收目标。每次开始或继续都先用 exec_command 执行命令 python3 -c ${JSON.stringify(script)}，sandbox_permissions="use_default"，yield_time_ms=1000，省略 justification 和 prefix_rule。使用 write_stdin 等待真实结束，不要提前报告完成。只允许创建上述两个测试文件，不访问网络。完成等待后读取当前工作目录，然后明确报告并保持目标 active；用户会手动暂停或移除它，勿自行创建或完成其他目标。`);
    await page.locator('#goal-budget').fill('30000');await closeDialog();
    await waitForFile(startedFile);
    await page.waitForFunction(()=>state.nativeGoals.get(state.thread?.id)?.status==='active'&&state.activeTurns.has(state.thread?.id));
    const firstTurn=await page.evaluate(()=>state.activeTurns.get(state.thread.id));
    assert.equal(received.filter(event=>event.method==='turn/started'&&event.params.threadId===id).length,1,'Unexpected goal turn before pause');
    const goalSetCount=sent.filter(message=>message.method==='thread/goal/set').length;
    await goalDialog();await page.getByRole('button',{name:'继续目标',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('无需重复继续目标'));
    assert.equal(sent.filter(message=>message.method==='thread/goal/set').length,goalSetCount);assert.equal(await page.evaluate(()=>state.activeTurns.get(state.thread.id)),firstTurn);
    await page.locator('#dialog-cancel').click();
    const originalObjective=(await read('thread/goal/get',{threadId:id})).goal.objective;
    await goalDialog();await page.locator('#goal-objective').fill('THIS_ACTIVE_EDIT_MUST_NOT_BE_SENT');await page.locator('#dialog-submit').click();
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('请先暂停或停止当前任务'));
    assert.equal(sent.filter(message=>message.method==='thread/goal/set').length,goalSetCount);assert.equal((await read('thread/goal/get',{threadId:id})).goal.objective,originalObjective);assert.equal(await page.locator('#goal-objective').inputValue(),'THIS_ACTIVE_EDIT_MUST_NOT_BE_SENT');
    await page.locator('#dialog-cancel').click();
    await goalDialog();await page.getByRole('button',{name:'暂停目标并停止当前任务',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
    await page.waitForFunction(id=>state.nativeGoals.get(id)?.status==='paused'&&!state.activeTurns.has(id),id,{timeout:90000});
    const paused=await waitStopped(id);assert(!(paused.data||[]).length,'Native terminal remains after goal pause');
    assert.equal(liveProcesses(commandMarker).length,0,'Goal pause left a real command process alive');assert(!fs.existsSync(tailFile),'Stopped command reached its tail');fs.unlinkSync(startedFile);
    assert.equal((await read('thread/goal/get',{threadId:id})).goal.status,'paused');
    assert.equal(received.filter(event=>event.method==='turn/started'&&event.params.threadId===id).length,1,'Goal automatically restarted while paused');
    await goalDialog();await page.getByRole('button',{name:'继续目标',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
    await waitForFile(startedFile);
    await page.waitForFunction(({id,firstTurn})=>state.nativeGoals.get(id)?.status==='active'&&state.activeTurns.has(id)&&state.activeTurns.get(id)!==firstTurn,{id,firstTurn},{timeout:180000});
    const resumedTurn=await page.evaluate(()=>state.activeTurns.get(state.thread.id));
    assert.equal(received.filter(event=>event.method==='turn/started'&&event.params.threadId===id).length,2,'Resume started more than one goal turn');
    await goalDialog();await page.getByRole('button',{name:'移除目标',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
    await page.waitForFunction(id=>!state.nativeGoals.has(id)&&!state.activeTurns.has(id),id,{timeout:90000});
    const removed=await waitStopped(id);assert(!(removed.data||[]).length,'Native terminal remains after goal removal');assert.equal(liveProcesses(commandMarker).length,0,'Goal removal left a real command process alive');assert(!fs.existsSync(tailFile),'Removed command reached its tail');assert.equal((await read('thread/goal/get',{threadId:id})).goal,null);pendingGoals.delete(id);
    assert.equal(received.filter(event=>event.method==='turn/started'&&event.params.threadId===id).length,2,'Goal restarted while being removed');
    return {threadId:id,createdFromUi:true,firstTurn,resumedTurn,pauseKilledManagedCommand:true,hostProcessCount:0,tailWriteAbsent:true,onlyExpectedGoalTurns:2,duplicateContinueRejected:true,activeEditRejectedWithInputRetained:true,resumeStartedNewTurn:true,removedFromUi:true,finalGoal:null};
  });

  await check('/goal：UI 设置的明确短目标真实 complete，刷新保留后移除',async()=>{
    await newChat();await goalDialog();const id=await rememberThread();pendingGoals.add(id);
    await page.locator('#goal-objective').fill('这是可立即完成的明确验收目标：只回复 FLASH_MENU_GOAL_COMPLETE，并必须使用原生 update_goal 工具将本目标设为 complete。不要访问文件、数据库、网络，不要创建其他目标。');
    await page.locator('#goal-budget').fill('30000');await closeDialog();
    await page.waitForFunction(id=>state.nativeGoals.get(id)?.status==='complete'&&!state.activeTurns.has(id),id,{timeout:240000});
    const goal=(await read('thread/goal/get',{threadId:id})).goal;assert.equal(goal.status,'complete');
    assert((await page.locator('#goal-banner').innerText()).includes('已完成'));
    await page.reload();await ready(page);assert.equal(await page.evaluate(()=>state.thread.id),id);
    await page.waitForFunction(()=>document.querySelector('#goal-banner')?.textContent.includes('已完成'));
    await goalDialog();await page.getByRole('button',{name:'移除目标',exact:true}).click();await page.locator('#dialog').waitFor({state:'hidden'});
    await page.waitForFunction(id=>!state.nativeGoals.has(id),id);assert.equal((await read('thread/goal/get',{threadId:id})).goal,null);pendingGoals.delete(id);
    return {threadId:id,nativeComplete:true,completionPersistedAfterRefresh:true,removedFromUi:true,tokensUsed:goal.tokensUsed,firstTurnAccountingBaselineMissing:goal.tokensUsed===0};
  });

  await check('普通任务停止后续聊：Flash 中断工具历史的独立线程复验',async()=>{
    await newChat();const marker='FLASH_STOP_CONTINUATION_'+runId;
    const startedName='menu-stop-continuation-'+runId+'.txt',startedFile=path.join(workspace,startedName);
    const script=`import time; from pathlib import Path; Path('${startedName}').write_text('${marker}'); time.sleep(45); print('${marker}_FINISHED')`;
    await page.locator('#prompt').fill(`只执行这个独立无害停止测试：用 exec_command 执行 python3 -c ${JSON.stringify(script)}，sandbox_permissions="use_default"，yield_time_ms=1000，省略 justification 和 prefix_rule。必须使用 write_stdin 等待该进程真正结束，不要提前回复。`);
    await page.locator('#prompt').press('Enter');await waitForFile(startedFile);const id=await rememberThread();
    await page.waitForFunction(id=>state.activeTurns.has(id),id);
    await page.locator('#send').click();await waitStopped(id);assert.equal(liveProcesses(marker).length,0);
    assert.equal(await page.evaluate(()=>state.turns.at(-1).status),'interrupted');
    let result;try{result=await prompt(page,'只回复 FLASH_STOP_CONTINUATION_OK，不使用任何工具。',false,180000);}catch(error){throw new Error('Independent non-goal thread '+id+': '+error.message);}
    const answer=result.items.filter(item=>item.type==='agentMessage').map(item=>item.text).join(' ');assert(answer.includes('FLASH_STOP_CONTINUATION_OK'));
    return{threadId:id,interruptedManagedProcessKilled:true,nextTurnCompleted:true,model:result.settings.model};
  });

  await check('全套实际请求：未切换模型、未登录 ChatGPT、未执行反馈/快速/生图',async()=>{
    const turns=sent.filter(message=>message.method==='turn/start');
    assert(turns.length>0||!!filter,'No real task was executed');
    assert(turns.every(message=>message.params.model==='deepseek-flash'));
    assert(!sent.some(message=>/^(account\/login\/start|account\/rateLimits\/read|feedback\/|app\/)/.test(message.method)));
    assert(!sent.some(message=>message.params.collaborationMode?.settings.model&&message.params.collaborationMode.settings.model!=='deepseek-flash'));
    assert.deepEqual(errors,[]);
    return {realExplicitTurns:turns.length,onlyModel:'deepseek-flash',browserErrors:errors,disallowedRequests:0};
  });
}finally{
  // Cleanup only goals created by this run. This never counts as acceptance of the UI paths.
  for(const id of pendingGoals){
    await page.evaluate(async id=>{const turn=state.activeTurns.get(id);if(turn)await interruptTurn(id,turn);await rpc('thread/goal/clear',{threadId:id,origin:'user'});},id).catch(error=>results.push({name:'Emergency cleanup '+id,status:'failed',error:error.message}));
  }
  persist();await browser.close();
  const summary={passed:results.filter(result=>result.status==='passed').length,failed:results.filter(result=>result.status==='failed').length,errors};
  console.log(JSON.stringify(summary));if(summary.failed||errors.length)process.exitCode=1;
}
