// Test driver: all audited requests are made by clicking the real protocol panel.
// Stdin/stdout is private parent/child IPC. Public receipts contain no parameters.
import fs from 'node:fs';
import readline from 'node:readline';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
const receipts=[],errors=[],responses=new Map(),aliases=new Map();
let capturing=null,ui=Promise.resolve();
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{
  if(!socket.url().includes('/ws/rpc'))return;
  socket.on('framesent',frame=>{try{
    const value=JSON.parse(String(frame.payload));
    if(capturing&&value.method===capturing.method&&value.id!=null){
      const active=capturing;capturing=null;
      active.receipt.nativeRequestId=value.id;
      if(active.alias!=null)aliases.set(active.alias,value.id);
      responses.set(value.id,active);active.sent(value.id);
    }
  }catch{}});
  socket.on('framereceived',frame=>{try{
    const value=JSON.parse(String(frame.payload));
    if(value.method)output({event:value});
    else if(value.id!=null&&responses.has(value.id)){
      const pending=responses.get(value.id);responses.delete(value.id);
      pending.receipt.status=value.error?'native_error':'returned';
      pending.receipt.completedAt=new Date().toISOString();
      if(pending.alias!=null)output({event:{...value,id:pending.alias}});
      pending.result(value);
    }
  }catch{}});
});
await page.goto(process.env.CODEX_WEB_URL||'http://127.0.0.1:8765');
await page.waitForFunction(()=>state.ready&&state.schema&&state.runtimeInfo,null,{timeout:60000});
output({ready:true});
async function dispatch(method,params,alias){
  let resultResolve,sentResolve;
  const result=new Promise(resolve=>resultResolve=resolve);
  const sent=new Promise(resolve=>sentResolve=resolve);
  const receipt={method,origin:'browser:protocol-panel-button',startedAt:new Date().toISOString(),status:'pending'};
  const action=ui.then(async()=>{
    await page.locator('[data-view="protocol"]').click();
    await page.locator('.protocol-search').fill(method);
    await page.getByRole('button',{name:method,exact:true}).click();
    if(method==='thread/sample/cancel'&&aliases.has(params?.requestId))params={...params,requestId:aliases.get(params.requestId)};
    await page.locator('#rpc-params').fill(JSON.stringify(params??null));
    receipts.push(receipt);
    capturing={method,alias,receipt,sent:sentResolve,result:resultResolve};
    await page.getByRole('button',{name:'执行原生请求',exact:true}).click();
    await Promise.race([sent,new Promise((_,reject)=>setTimeout(()=>reject(new Error('No request after protocol button click: '+method)),10000))]);
  });
  ui=action.catch(()=>{});
  await action;
  return {sent:await sent,result};
}
const input=readline.createInterface({input:process.stdin});
async function handle(command){
  try{
    let value;
    if(command.action==='rpc'){
      if(command.method==='initialize')value={result:await page.evaluate(()=>state.runtimeInfo)};
      else value=await(await dispatch(command.method,command.params)).result;
    }else if(command.action==='send'){
      const message=command.message;
      if(message.method==='initialized')value={alreadySentByPage:true};
      else if(message.method){const request=await dispatch(message.method,message.params,message.id);value={nativeRequestId:request.sent};}
      else throw new Error('Server callback responses must be submitted using the request card in desktop_acceptance.mjs');
    }else if(command.action==='showThread')value=await page.evaluate(thread=>{resetChat();adoptThread(thread);showView('chat');return true;},command.thread);
    else if(command.action==='guardianConfirm'){
      await page.evaluate(()=>showView('chat'));
      let finish,sent;const result=new Promise(resolve=>finish=resolve);const posted=new Promise(resolve=>sent=resolve);
      const receipt={method:'thread/approveGuardianDeniedAction',origin:'browser:guardian-confirmation-button',startedAt:new Date().toISOString(),status:'pending'};receipts.push(receipt);
      capturing={method:receipt.method,receipt,result:finish,sent};
      await page.getByRole('button',{name:'确认允许此操作',exact:true}).click();await posted;value=await result;
    }else if(command.action==='fetch')value=await page.evaluate(async path=>{const response=await fetch(path);if(!response.ok)throw new Error('HTTP '+response.status);return response.json();},command.path);
    else if(command.action==='close'){
      await ui;await page.screenshot({path:process.env.CODEX_BROWSER_TRACE+'.png',fullPage:true,mask:[page.locator('#account-name'),page.locator('#rpc-params'),page.locator('#rpc-result')]});
      fs.writeFileSync(process.env.CODEX_BROWSER_TRACE,JSON.stringify({origin:'All requests were initiated by the real web page protocol Execute button; initialize/initialized were sent by the page connection flow.',requests:receipts,browserErrors:errors},null,2));
      await browser.close();output({id:command.id,value:true});process.exit(0);
    }else throw new Error('Unknown driver action');
    output({id:command.id,value});
  }catch(error){output({id:command.id,error:error.message});}
}
input.on('line',line=>{try{void handle(JSON.parse(line));}catch(error){output({error:error.message});}});
