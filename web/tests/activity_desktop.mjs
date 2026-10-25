// Actual DeepSeek/browser regression: compact activity groups, streaming and history.
import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=process.env.REPORT_DIR||'/tmp/codex-activity-desktop';fs.mkdirSync(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const results=[],errors=[],calls=[];const name='会话过程折叠验收 '+Date.now();
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{if(socket.url().includes('/ws/rpc'))socket.on('framesent',frame=>{try{const value=JSON.parse(String(frame.payload));if(value.method)calls.push({method:value.method,origin:'browser'});}catch{}});});
const expect=(condition,message)=>{if(!condition)throw new Error(message);};
async function check(name,fn){try{const evidence=await fn();results.push({name,status:'passed',evidence});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:error.message});console.log('FAIL '+name+': '+error.message);await page.screenshot({path:directory+'/failure-'+results.length+'.png',mask:[page.locator('#account-name'),page.locator('#thread-list')]});}}
async function send(text){await page.locator('#prompt').fill(text);await page.locator('#prompt').press('Enter');await page.waitForFunction(()=>state.activeTurns.has(state.thread?.id),null,{timeout:30000});return page.evaluate(()=>state.activeTurns.get(state.thread.id));}
async function completed(id,status='completed'){await page.waitForFunction(({id,status})=>state.turns.some(turn=>turn.id===id&&turn.status===status),{id,status},{timeout:180000});}
const groupFor=id=>page.locator('.activity-group[data-turn-id="'+id+'"]');
async function snapshot(){return page.evaluate(()=>({threadId:state.thread.id,groups:[...document.querySelectorAll('.activity-group')].map(node=>({turnId:node.dataset.turnId,open:node.open,summary:node.querySelector('summary').innerText,height:node.getBoundingClientRect().height,items:node.querySelectorAll('[data-item]').length})),rootItems:[...document.querySelector('#messages').children].map(node=>node.className),agentText:[...document.querySelectorAll('.message.agent')].map(node=>node.innerText).join('\n')}));}
async function reopen(){await page.reload();await page.waitForFunction(()=>state.ready,null,{timeout:45000});await page.locator('.thread-row').filter({hasText:name}).first().click();await page.waitForFunction(()=>document.querySelector('#messages').innerText.includes('ACTIVITY_GROUP_DONE'),null,{timeout:30000});}
let firstTurn;
try{
  await page.goto(process.env.CODEX_WEB_URL||'http://127.0.0.1:8765');await page.waitForFunction(()=>state.ready&&state.models.length,null,{timeout:45000});
  await page.locator('#new-chat').click();await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');
  await check('连续思考与命令默认合并，流式更新保留展开状态',async()=>{
    firstTurn=await send('Execute exactly three separate exec_command calls in sequence, never combine them in one script and do not send commentary between calls. First run python3 -c "import time; print(\'ACTIVITY_STEP_ONE\', flush=True); time.sleep(4)". Then run python3 -c "import time; print(\'ACTIVITY_STEP_TWO\', flush=True); time.sleep(4)". Finally run python3 -c "import time; print(\'ACTIVITY_STEP_THREE\', flush=True); time.sleep(4)". After all three commands finish, reply exactly ACTIVITY_GROUP_DONE.');
    await page.waitForFunction(()=>[...state.items.values()].some(entry=>entry.item.type==='commandExecution'),null,{timeout:60000});
    const group=groupFor(firstTurn).first();expect(!await group.evaluate(node=>node.open),'Activity group opened itself');
    expect((await group.boundingBox()).height<=40,'Collapsed progress is taller than one compact row');
    await group.locator(':scope > summary').click();expect(await group.evaluate(node=>node.open),'Could not expand the combined activity group');
    await page.waitForFunction(()=>[...state.items.values()].filter(entry=>entry.item.type==='commandExecution').length>=2,null,{timeout:90000});
    expect(await group.evaluate(node=>node.open),'A streamed update reset the expanded state');
    await group.locator(':scope > summary').click();
    await page.waitForFunction(()=>[...state.items.values()].filter(entry=>entry.item.type==='commandExecution').length>=3,null,{timeout:90000});
    expect(!await group.evaluate(node=>node.open),'New activity forced the group open');await completed(firstTurn);
    expect((await page.locator('.message.agent').allTextContents()).join('\n').includes('ACTIVITY_GROUP_DONE'),'Final reply is not visible');
    expect(await page.locator('#messages > .tool-item').count()===0,'Individual thoughts or commands still occupy root rows');
    const collapsed=await snapshot();expect(collapsed.groups.length===1,'Consecutive activity was not combined into one group');
    expect(collapsed.groups[0].items>=4,'The actual thoughts and commands were not retained');
    expect(!await group.evaluate(node=>node.classList.contains('running')),'Completed activity still shows running');
    await group.scrollIntoViewIfNeeded();await page.screenshot({path:directory+'/collapsed.png',mask:[page.locator('#account-name'),page.locator('#thread-list')]});
    await group.locator(':scope > summary').click();const command=group.locator('.tool-item').filter({hasText:'ACTIVITY_STEP_ONE'}).first();await command.locator(':scope > summary').click();
    expect((await command.locator('.tool-body').innerText()).includes('ACTIVITY_STEP_ONE'),'Expanded command lost its actual native output');
    const expandedHeight=(await group.boundingBox()).height;expect(expandedHeight>collapsed.groups[0].height+80,'Expanding did not reveal the retained activity');
    await page.screenshot({path:directory+'/expanded.png',mask:[page.locator('#account-name'),page.locator('#thread-list')]});await group.locator(':scope > summary').click();
    const order=await page.evaluate(()=>({dom:[...document.querySelector('#messages').children].flatMap(node=>node.classList.contains('activity-group')?[...node.querySelectorAll('[data-item]')].map(item=>item.dataset.item):node.dataset.item?[node.dataset.item]:[]),native:[...state.items.keys()]}));
    expect(JSON.stringify(order.dom)===JSON.stringify(order.native),'Activity grouping changed the original item order');return{...collapsed,expandedHeight,nativeOrderPreserved:true};
  });
  await check('刷新恢复历史后仍默认合并折叠',async()=>{
    await page.locator('#thread-action').selectOption('rename');await page.locator('#dialog-value').fill(name);await page.locator('#dialog-submit').click();await page.waitForFunction(name=>document.querySelector('#page-title').textContent===name,name,{timeout:15000});
    await reopen();const state=await snapshot();expect(state.groups.length===1&&state.groups.every(group=>!group.open&&group.height<=40),'Hydrated history is not compact by default');
    expect(await page.locator('#messages > .tool-item').count()===0,'History has ungrouped thought/command rows');
    const group=groupFor(firstTurn).first();await group.locator(':scope > summary').click();const command=group.locator('.tool-item').filter({hasText:'ACTIVITY_STEP_THREE'}).first();await command.locator(':scope > summary').click();
    expect((await command.locator('.tool-body').innerText()).includes('ACTIVITY_STEP_THREE'),'Restored command output was lost');await group.locator(':scope > summary').click();return state;
  });
  await check('失败命令在折叠摘要中标出，回答保持独立',async()=>{
    const id=await send('Run python3 -c "import sys; print(\'ACTIVITY_EXPECTED_FAILURE\'); sys.exit(3)" once with your native command tool. Do not retry or fix the deliberately failing command. Then reply exactly ACTIVITY_FAILURE_RECORDED.');await completed(id);
    const group=groupFor(id).first();expect((await group.locator(':scope > summary').innerText()).includes('未成功'),'A failed command is hidden without a summary indicator');expect(!await group.evaluate(node=>node.open),'Failed command forced the activity list open');
    expect((await page.locator('.message.agent').allTextContents()).join('\n').includes('ACTIVITY_FAILURE_RECORDED'),'The agent reply was grouped into execution details');return await snapshot();
  });
  await check('中断后停止运行状态，下一轮和历史互不混合',async()=>{
    const id=await send('Run python3 -c "import time; print(\'ACTIVITY_INTERRUPT_READY\', flush=True); time.sleep(25)" using your native command tool. Wait for completion before replying.');
    await page.waitForFunction(id=>[...state.items.values()].some(entry=>entry.turnId===id&&entry.item.type==='commandExecution'),id,{timeout:60000});await page.locator('#send').click();await completed(id,'interrupted');
    const groups=groupFor(id);expect(await groups.count()>0,'Interrupted turn has no activity group');
    expect((await groups.first().locator(':scope > summary').innerText()).includes('已中断'),'Interrupted activity did not report its final state');expect(await groups.evaluateAll(nodes=>nodes.every(node=>!node.classList.contains('running')&&!node.open)),'Interrupted activity remains running or expanded');
    expect(await page.locator('[data-turn-outcome="'+id+'"]').count()===1,'The interrupted-turn notice disappeared into a collapsed group');
    await reopen();expect(await groupFor(firstTurn).count()===1,'Another turn was merged into the earlier activity group');expect(await groupFor(id).count()>0,'Interrupted history was lost');
    expect(await page.locator('.activity-group[open]').count()===0,'History restoration expanded activity groups');expect(await page.locator('.activity-group.running').count()===0,'Restored completed history still shows active execution');return await snapshot();
  });
}finally{
  fs.writeFileSync(directory+'/results.json',JSON.stringify({source:'real DeepSeek turns initiated by web chat controls',results,calls,browserErrors:errors},null,2));
  await browser.close();console.log(JSON.stringify({passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,browserErrors:errors}));if(results.some(x=>x.status==='failed')||errors.length)process.exitCode=1;
}
