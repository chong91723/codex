// Real authenticated model and V8 code-mode tests, initiated by web controls.
import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const results=[],calls=[],errors=[];let terminal='';
const directory=process.env.REPORT_DIR||'/tmp/codex-chatgpt-desktop';fs.mkdirSync(directory,{recursive:true});
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{
  if(socket.url().includes('/ws/rpc'))socket.on('framesent',frame=>{try{const value=JSON.parse(String(frame.payload));if(value.method)calls.push({method:value.method,origin:'browser'});}catch{}});
  if(socket.url().includes('/ws/terminal'))socket.on('framereceived',frame=>{try{const value=JSON.parse(String(frame.payload));if(value.data)terminal+=Buffer.from(value.data,'base64').toString();}catch{}});
});
async function panelCall(method,params){
  await page.locator('[data-view="protocol"]').click();await page.locator('.protocol-search').fill(method);await page.getByRole('button',{name:method,exact:true}).click();await page.locator('#rpc-params').fill(JSON.stringify(params));
  await page.evaluate(method=>{window.__receipt={pending:true};const original=rpc;rpc=function(name,...args){const result=original(name,...args);if(name===method){rpc=original;result.then(value=>window.__receipt={value},error=>window.__receipt={error:error.message});}return result;};},method);
  await page.getByRole('button',{name:'执行原生请求',exact:true}).click();await page.waitForFunction(()=>!window.__receipt.pending,null,{timeout:120000});const response=await page.evaluate(()=>window.__receipt);if(response.error)throw new Error(response.error);return response.value;
}
async function check(name,fn){try{const evidence=await fn();results.push({name,status:'passed',evidence});console.log('PASS '+name);}catch(error){results.push({name,status:'failed',error:error.message});console.log('FAIL '+name+': '+error.message);}}
try{
  await page.goto(process.env.CODEX_WEB_URL||'http://127.0.0.1:8766');
  await page.waitForFunction(()=>state.ready&&state.models.length>0,null,{timeout:60000});
  await check('ChatGPT 登录会话真实模型及文件工具',async()=>{
    await page.locator('#new-chat').click();await page.locator('#model').selectOption('gpt-5.6-luna');await page.locator('#effort').selectOption('low');
    await page.locator('#prompt').fill('Use your native shell tool to calculate 123*456 and write the result to chatgpt-web-test.txt in the current workspace. Read it back using the shell tool. Then reply CHATGPT_BROWSER_MODEL_OK and the calculated number.');
    await page.locator('#prompt').press('Enter');
    await page.waitForFunction(()=>state.turns.length>0&&!state.activeTurns.has(state.thread?.id),null,{timeout:180000});
    const result=await page.evaluate(()=>({turnStatus:state.turns.at(-1).status,text:[...document.querySelectorAll('.message.agent')].map(x=>x.innerText).join('\n'),toolTypes:[...state.items.values()].map(x=>x.item.type)}));
    if(result.turnStatus!=='completed'||!result.text.includes('CHATGPT_BROWSER_MODEL_OK')||!result.text.includes('56088')||!result.toolTypes.includes('commandExecution'))throw new Error('The authenticated model/tool task did not complete');
    await page.locator('#files-toggle').click();await page.locator('#file-tree button').filter({hasText:'chatgpt-web-test.txt'}).click();await page.waitForSelector('#file-preview:not([hidden])');
    if(!(await page.locator('#file-preview').innerText()).includes('56088'))throw new Error('The native file preview did not contain the actual result');await page.locator('#files-close').click();
    await page.screenshot({path:directory+'/chatgpt-model.png',fullPage:true,mask:[page.locator('#account-name')]});return result;
  });
  await check('网页终端原生 CLI 与 V8 Code Mode',async()=>{
    await page.locator('#terminal-toggle').click();
    await page.locator('#cli-args').fill(JSON.stringify(['exec','--json','-m','gpt-5.6-luna','--enable','code_mode','Use the exec JavaScript code-mode tool to calculate 123*456 with text(123*456). You must call the exec code-mode tool and then reply CODE_MODE_BROWSER_OK with the result. Do not use a shell tool.']));
    await page.locator('#terminal-start').click();
    await page.waitForFunction(()=>document.querySelector('#terminal').innerText.includes('进程退出：'),null,{timeout:180000});
    const events=[];for(const line of terminal.replace(/\r/g,'').split('\n')){try{events.push(JSON.parse(line));}catch{}}
    const items=events.filter(e=>e.type==='item.completed').map(e=>e.item);
    const text=items.filter(item=>item.type==='agent_message').map(item=>item.text).join('\n');
    if(!text.includes('CODE_MODE_BROWSER_OK')||!text.includes('56088'))throw new Error('Native CLI model completion was not verified');
    await page.screenshot({path:directory+'/cli-code-mode.png',fullPage:true,mask:[page.locator('#account-name')]});
    fs.writeFileSync(directory+'/cli-events.json',JSON.stringify(events,null,2));await page.locator('#terminal-close').click();
    // Native CLI JSON omits code-mode calls. Verify its actual persisted call and
    // output by reading the native history through the page's filesystem panel.
    const tid=events.find(event=>event.type==='thread.started').thread_id;
    const thread=(await panelCall('thread/read',{threadId:tid,includeTurns:false})).thread;
    const file=await panelCall('fs/readFile',{path:thread.path});
    const history=Buffer.from(file.dataBase64,'base64').toString().split('\n').filter(Boolean).map(JSON.parse).filter(x=>x.type==='response_item').map(x=>x.payload);
    const code=history.find(item=>item.type==='custom_tool_call'&&item.name==='exec'&&item.input.includes('123*456'));
    const output=code&&history.find(item=>item.type==='custom_tool_call_output'&&item.call_id===code.call_id);
    if(!output||!JSON.stringify(output.output).includes('56088'))throw new Error('A real matching V8 call and output were not found in native history');
    return{agentText:text,tool:code.name,input:code.input,output:output.output};
  });
}finally{
  fs.writeFileSync(directory+'/results.json',JSON.stringify({origin:'real web UI controls and embedded CLI terminal',results,calls,browserErrors:errors},null,2));
  fs.writeFileSync(directory+'/cli-terminal.txt',terminal.replace(/\r\n/g,'\n'));
  await browser.close();if(results.some(x=>x.status==='failed')||errors.length)process.exitCode=1;
}
