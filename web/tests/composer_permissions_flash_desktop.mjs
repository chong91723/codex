// Three NEW native Flash turns, exercising the visible composer permission picker.
// Synthetic local fixtures only: no existing conversation history or credentials.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ready} from './skills_mcp_helpers.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL,home=process.env.CODEX_TEST_HOME,workspace=process.env.CODEX_TEST_WORKSPACE;
assert(base&&home?.startsWith('/tmp/')&&workspace?.startsWith('/tmp/'),'An explicit independent test instance is required');
const out=path.resolve(process.env.REPORT_DIR||'test-results/composer-permissions-2026-10-27/flash');
fs.mkdirSync(out,{recursive:true});
const fixture=fs.mkdtempSync(path.join(workspace,'composer-permissions-'));
const askFile=path.join(fixture,'denied-marker.txt'),fullFile=path.join(fixture,'full-marker.txt');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:960}});
page.setDefaultTimeout(30000);
const results=[],errors=[],sent=[],events=[],responses=[],cleanup=[];
const selected=process.env.AUDIT_ONLY?new RegExp(process.env.AUDIT_ONLY):null;
const selectedModes=process.env.PERMISSION_MODES?new Set(process.env.PERMISSION_MODES.split(',')):null;
if(selectedModes)for(const mode of selectedModes)assert(['ask','auto','full'].includes(mode),'Unknown permission test mode: '+mode);
let expectedTasks=0;
let threadId,originalWorkspacePolicy,originalDefaults;
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{
  socket.on('framesent',frame=>{try{
    const message=JSON.parse(String(frame.payload));
    if(message.method&&/^(thread\/(start|settings\/update|delete)|turn\/(start|interrupt))$/.test(message.method))sent.push(message);
    else if(message.id!=null&&!message.method&&message.result)responses.push({id:message.id,result:message.result});
  }catch{}});
  socket.on('framereceived',frame=>{try{
    const message=JSON.parse(String(frame.payload));
    if(message.method&&(/autoApprovalReview|requestApproval/.test(message.method)||['thread/settings/updated','turn/started','turn/completed'].includes(message.method)))events.push(message);
  }catch{}});
});
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({
  selectedCases:process.env.PERMISSION_MODES||process.env.AUDIT_ONLY||'all three',
  scope:'Selected new deepseek-flash parent tasks from visible composer permissions: manual denial, native auto-review approval, and explicit full access. Reviewer internal calls are not counted as parent turn/start and outbound HTTP bodies are not captured. Only newly owned fixtures are accessed.',
  base,home,workspace,fixture,threadId,modelTaskSubmissions:sent.filter(message=>message.method==='turn/start').length,
  results,errors,sent,events,responses,cleanup,
},null,2));
const rpc=(method,params)=>page.evaluate(async({method,params})=>rpc(method,params),{method,params});
const defaults=()=>page.evaluate(()=>Object.fromEntries(['model','model_provider','sandbox_mode','approval_policy','approvals_reviewer'].map(key=>[key,state.runtimeDefaults?.[key]??null])));
const settings=()=>page.evaluate(id=>state.threadSettings.get(id),threadId);
async function stopOwnedTurn(){
  const active=await page.evaluate(id=>state.activeTurns.get(id)||null,threadId);
  if(active){await page.evaluate(async({id,turn})=>interruptTurn(id,turn),{id:threadId,turn:active});await page.waitForFunction(id=>!state.activeTurns.has(id),threadId,{timeout:45000});}
}
async function check(mode,name,fn){
  if(selectedModes&&!selectedModes.has(mode)||selected&&!selected.test(name))return;
  expectedTasks++;
  try{results.push({name,status:'passed',evidence:await fn()});console.log('PASS '+name);}
  catch(error){results.push({name,status:'failed',error:error.stack});console.error('FAIL '+name+': '+error.message);await page.screenshot({path:path.join(out,'failure-'+results.length+'.png')}).catch(()=>{});await stopOwnedTurn().catch(error=>cleanup.push({entity:'ownedActiveTurn',stopped:false,error:error.message}));}
  save();
}
function expectedMode(mode){return{approvalPolicy:mode==='full'?'never':'on-request',approvalsReviewer:mode==='auto'?'auto_review':'user',sandboxType:mode==='full'?'dangerFullAccess':'workspaceWrite'};}
async function chooseMode(mode){
  const before=events.length;
  await page.locator('#permissions-button').click();
  await page.locator('#dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#dialog-title').innerText(),'Agent 权限');
  await page.locator('input[name="permission-mode"][value="'+mode+'"]').check();
  await page.locator('#dialog-submit').click();
  const expected=expectedMode(mode);
  await page.waitForFunction(({id,expected})=>{
    const current=state.threadSettings.get(id);
    return current?.approvalPolicy===expected.approvalPolicy&&current?.approvalsReviewer===expected.approvalsReviewer&&current?.sandboxPolicy?.type===expected.sandboxType;
  },{id:threadId,expected},{timeout:30000});
  await page.locator('#dialog').waitFor({state:'hidden'});
  const current=await settings();
  assert.equal(current.model,'deepseek-flash');assert.equal(current.modelProvider,'deepseek');
  const notices=events.slice(before).filter(message=>message.method==='thread/settings/updated'&&message.params.threadId===threadId);
  assert(notices.some(message=>{
    const actual=message.params.threadSettings;
    return actual.approvalPolicy===expected.approvalPolicy&&actual.approvalsReviewer===expected.approvalsReviewer&&actual.sandboxPolicy.type===expected.sandboxType;
  }),'Permission mode has no matching actual native settings notification');
  if(mode!=='full')assert.deepEqual(current.sandboxPolicy,originalWorkspacePolicy,'Permission picker changed existing workspace network or file boundaries');
  return{mode,settings:current,nativeSettingsNotifications:notices};
}
async function submit(text){
  const before=await page.evaluate(()=>state.turns.at(-1)?.id||null);
  await page.locator('#prompt').fill(text);await page.locator('#prompt').press('Enter');
  // In-progress turns live in activeTurns; state.turns is completed history.
  await page.waitForFunction(before=>{const active=state.activeTurns.get(state.thread?.id);return active&&active!==before||state.turns.at(-1)?.id&&state.turns.at(-1).id!==before;},before,{timeout:30000});
  return page.evaluate(()=>state.activeTurns.get(state.thread.id)||state.turns.at(-1).id);
}
async function finish(turnId){
  await page.waitForFunction(turnId=>state.turns.some(turn=>turn.id===turnId&&turn.status!=='inProgress'),turnId,{timeout:240000});
  const actual=await page.evaluate(turnId=>({turn:state.turns.find(turn=>turn.id===turnId),items:[...state.items.values()].filter(entry=>entry.turnId===turnId).map(entry=>entry.item)}),turnId);
  assert.equal(actual.turn.status,'completed',JSON.stringify(actual.turn.error));
  return actual;
}
function reviewsSince(index,turnId){return events.slice(index).filter(message=>message.method==='item/autoApprovalReview/completed'&&message.params.threadId===threadId&&message.params.turnId===turnId);}
function requestsSince(index){return events.slice(index).filter(message=>message.method==='item/commandExecution/requestApproval'&&message.params.threadId===threadId);}

try{
  await page.goto(base);await ready(page);
  assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),home);
  assert.equal(await page.evaluate(()=>state.status.workspace),workspace);
  originalDefaults=await defaults();
  const created=await rpc('thread/start',{cwd:fixture,model:'deepseek-flash',modelProvider:'deepseek',sandbox:'workspace-write',approvalPolicy:'untrusted',approvalsReviewer:'user'});
  threadId=created.thread.id;
  assert.equal(created.model,'deepseek-flash');assert.equal(created.modelProvider,'deepseek');
  originalWorkspacePolicy=created.sandbox;assert.equal(originalWorkspacePolicy.type,'workspaceWrite');
  await page.evaluate(created=>{
    resetChat();state.threadSettings.set(created.thread.id,{model:created.model,modelProvider:created.modelProvider,sandboxPolicy:created.sandbox,approvalPolicy:created.approvalPolicy,approvalsReviewer:created.approvalsReviewer,effort:created.reasoningEffort,collaborationMode:created.collaborationMode});
    adoptThread(created.thread);showView('chat');
  },created);
  await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');

  await check('ask','请求批准：真实审批拒绝阻止自有文件创建',async()=>{
    const selection=await chooseMode('ask'),marker='COMPOSER_PERMISSION_DENIED_'+Date.now(),before=events.length;
    assert(!fs.existsSync(askFile));
    const command='printf '+marker+' > '+askFile;
    const turnId=await submit(`This is a controlled local permission test. Call exec_command exactly once with cmd=${JSON.stringify(command)}, sandbox_permissions="require_escalated", and justification="Exercise manual approval for a harmless local acceptance marker". Wait for the actual approval decision. If rejected, do not retry, do not use any other tool, and do not create the file another way. Report the real rejection and that the command was not executed. Do not access the network or any other files.`);
    await page.waitForFunction(({id,turnId})=>[...state.requests.values()].some(request=>request.method==='item/commandExecution/requestApproval'&&request.params.threadId===id)||state.turns.some(turn=>turn.id===turnId&&turn.status!=='inProgress'),{id:threadId,turnId},{timeout:120000});
    const approvals=requestsSince(before);assert(approvals.length,'Actual Flash turn completed without a native command approval request');
    assert(approvals.some(message=>JSON.stringify(message.params).includes(marker)),'Approval did not cover the controlled marker command');
    const card=page.locator('.request-card').filter({hasText:marker});await card.waitFor({state:'visible'});
    await page.screenshot({path:path.join(out,'ask-awaiting-approval.png')});
    await card.getByRole('button',{name:'拒绝',exact:true}).click();
    const actual=await finish(turnId);
    assert(!fs.existsSync(askFile),'Rejected command created the owned marker file');
    assert(!actual.items.some(item=>item.type==='commandExecution'&&item.exitCode===0&&String(item.command).includes(marker)),'Rejected marker command reported successful execution');
    assert(responses.some(response=>approvals.some(approval=>approval.id===response.id)&&response.result.decision==='decline'),'No native decline response was sent');
    const answer=actual.items.filter(item=>item.type==='agentMessage').map(item=>item.text).join('\n');assert.match(answer,/拒绝|未执行|没有执行|reject|denied|declin|not execut/i);
    await page.screenshot({path:path.join(out,'ask-denied.png')});
    return{selection,turnId,requests:approvals,controlledFileAbsent:true,answer};
  });

  await check('auto','帮我批准：Flash原生自动审核允许后才执行',async()=>{
    const selection=await chooseMode('auto'),marker='COMPOSER_PERMISSION_AUTO_'+Date.now(),before=events.length;
    const turnId=await submit(`This is a new controlled local permission test. The user explicitly authorizes a harmless local printf. Call exec_command exactly once with cmd="printf ${marker}", sandbox_permissions="require_escalated", and justification="Exercise native automatic approval review for a harmless printf". Do not change the command or use another tool. If native auto-review rejects it, stop and report the rejection without retrying. Otherwise report the actual command output. Do not access the network or modify files.`);
    const actual=await finish(turnId),reviews=reviewsSince(before,turnId);
    assert(reviews.some(message=>message.params.review.status==='approved'),'No genuine native auto-review approval notification');
    assert.equal(requestsSince(before).length,0,'Auto-review unexpectedly prompted the user for command approval');
    assert(actual.items.some(item=>item.type==='commandExecution'&&item.exitCode===0&&String(item.aggregatedOutput).includes(marker)),'Approved printf did not produce actual native stdout');
    await page.locator('[data-guardian-review]').waitFor({state:'visible'});
    await page.screenshot({path:path.join(out,'auto-approved.png')});
    return{selection,turnId,reviewNotifications:reviews,actualExitCode:0,actualStdoutMarker:true,independentOutboundHttpBodyCapture:false};
  });

  await check('full','完全访问：明确选择后无审批执行自有标记，随后恢复请求批准',async()=>{
    const selection=await chooseMode('full'),marker='COMPOSER_PERMISSION_FULL_'+Date.now(),before=events.length;
    assert(!fs.existsSync(fullFile));
    const command='printf '+marker+' > '+fullFile+' && cat '+fullFile;
    const turnId=await submit(`This is a new controlled local permission test in the explicitly selected full-access mode. Call exec_command exactly once with cmd=${JSON.stringify(command)}. Use the normal tool mode: do not request sandbox escalation, and do not set sandbox_permissions="require_escalated". The only allowed mutation in this task is this newly owned test marker file. Do not access the network or any other files. Report the actual command output.`);
    const actual=await finish(turnId);
    assert.equal(requestsSince(before).length,0,'Full access unexpectedly emitted a manual command approval request');
    assert.equal(reviewsSince(before,turnId).length,0,'Full access unexpectedly used automatic approval review');
    assert.equal(fs.readFileSync(fullFile,'utf8'),marker,'Full-access command did not create the expected owned file');
    assert(actual.items.some(item=>item.type==='commandExecution'&&item.exitCode===0&&String(item.aggregatedOutput).includes(marker)),'Full-access native command did not complete successfully');
    await page.screenshot({path:path.join(out,'full-completed.png')});
    const restored=await chooseMode('ask');await page.screenshot({path:path.join(out,'restored-ask.png')});
    assert.deepEqual(await defaults(),originalDefaults,'Session permission changes modified the global UI defaults');
    return{selection,turnId,actualFileAndStdoutMarker:true,manualApprovalRequests:0,automaticReviews:0,restored,globalDefaultsUnchanged:true};
  });
  assert.equal(sent.filter(message=>message.method==='turn/start').length,expectedTasks,'Each selected case must submit exactly one new parent Flash turn');
  assert.equal(errors.length,0);
}catch(error){results.push({name:'Permission workflow setup or final invariants',status:'failed',error:error.stack});console.error(error.stack);await page.screenshot({path:path.join(out,'failure-setup.png')}).catch(()=>{});}
finally{
  if(threadId){
    try{await stopOwnedTurn();await rpc('thread/delete',{threadId});cleanup.push({entity:'ownedTestThread',id:threadId,deleted:true});}
    catch(error){cleanup.push({entity:'ownedTestThread',id:threadId,deleted:false,error:error.message});}
  }
  // Only this run's newly created fixture directory can be removed.
  fs.rmSync(fixture,{recursive:true,force:true});cleanup.push({entity:'ownedFixtureDirectory',path:fixture,deleted:!fs.existsSync(fixture)});
  save();await browser.close();
  console.log(JSON.stringify({passed:results.filter(row=>row.status==='passed').length,failed:results.filter(row=>row.status==='failed').length,modelTaskSubmissions:sent.filter(message=>message.method==='turn/start').length,errors,cleanup}));
  if(!expectedTasks||results.length!==expectedTasks||results.some(row=>row.status==='failed')||errors.length||cleanup.some(row=>row.deleted===false))process.exitCode=1;
}
