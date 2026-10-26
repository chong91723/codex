// Reproduce review -> fresh parent -> one worker on a single native connection.
// This diagnostic preserves the git defect and records real spawn/input/output evidence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {ready,call} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL, home=process.env.CODEX_TEST_HOME, out=process.env.REPORT_DIR;
assert(base&&home&&out,'Explicit isolated CODEX_WEB_URL, CODEX_TEST_HOME, REPORT_DIR required');
assert(home.startsWith('/tmp/codex-web-'),'Refusing non-audit CODEX_HOME');
const transport=process.env.AUDIT_TRANSPORT||'v1',codeMode=transport==='code-mode',legacy=transport==='v1';
assert(['v1','v2-direct','code-mode'].includes(transport),'Unknown audit transport');
const overrideCatalog=process.env.AUDIT_CATALOG_OVERRIDE==='1';
fs.mkdirSync(out,{recursive:true});
const compatibilityCatalog=path.resolve(out,'models-v1.json');
if(legacy&&overrideCatalog){const catalog=JSON.parse(fs.readFileSync(path.join(home,'models.json'),'utf8'));for(const model of catalog.models)model.multi_agent_version='v1';fs.writeFileSync(compatibilityCatalog,JSON.stringify(catalog));}
const nonce=String(Date.now()), fixture='/tmp/codex-web-review-worker-combined-'+nonce;
const token='COMBINED_WORKER_'+nonce, parents=[], children=new Set(), completions=new Map();
const requests=[], events=[], histories={}, rolloutEvidence={}, results=[], cleanup=[], browserErrors=[];
fs.mkdirSync(fixture);
fs.writeFileSync(fixture+'/math_utils.py','def average(values):\n    return sum(values) / len(values)\n');
fs.writeFileSync(fixture+'/worker_input.txt','token='+token+'\nvalues=17,34\n');
fs.writeFileSync(fixture+'/audit-worker.toml','model = "deepseek-flash"\nmodel_reasoning_effort = "low"\n');
const git=(...args)=>execFileSync('git',args,{cwd:fixture,encoding:'utf8'});
git('init','-q');git('add','.');git('-c','user.name=Codex local audit','-c','user.email=codex-audit@localhost','commit','-qm','baseline');
fs.writeFileSync(fixture+'/math_utils.py','def average(values):\n    return sum(values) / 0\n');
const hash=()=>Object.fromEntries(['math_utils.py','worker_input.txt','audit-worker.toml'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(fixture+'/'+name)).digest('hex')]));
const before=hash();
const v2Instruction='Use the native spawn_agent tool to create exactly ONE child with agent_type="worker", task_name="readonly_worker", and a fresh context (fork_turns="none" if supported). Omit model and reasoning overrides: the native worker configuration already selects deepseek-flash. Parent: do not read files or execute commands yourself. Give the worker this complete bounded task: "You are responsible only for reading worker_input.txt in the current working directory. You are not alone in the codebase; do not revert or change any files. Read the actual file using a native read-only command, return its token value and the exact integer sum of the comma-separated values. Do not spawn agents and do not modify any file." Wait for the worker to finish using native wait tools, then report the actual token and integer sum it returned. Do not guess or fabricate a worker result.';
const instruction=legacy?v2Instruction.replace('task_name="readonly_worker", and a fresh context (fork_turns="none" if supported)','and a fresh context (fork_context=false if supported)'):v2Instruction;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:960}});
page.on('pageerror',error=>browserErrors.push(error.message));
function inspectItem(item){if(item?.type==='subAgentActivity'&&item.agentThreadId)children.add(item.agentThreadId);if(item?.type==='collabAgentToolCall')for(const id of item.receiverThreadIds||[])children.add(id);}
page.on('websocket',socket=>{
 socket.on('framesent',frame=>{try{const message=JSON.parse(String(frame.payload));if(message.method)requests.push(message);}catch{}});
 socket.on('framereceived',frame=>{try{const message=JSON.parse(String(frame.payload));if(message.method){events.push(message);inspectItem(message.params?.item);if(message.method==='turn/completed')completions.set(message.params.turn.id,message.params.turn);}}catch{}});
});
const rpc=(method,params)=>call(page,method,params);
function save(){fs.writeFileSync(out+'/combined-results.json',JSON.stringify({base,model:'deepseek-flash',provider:'deepseek',fixture,fixtureHashesBefore:before,instruction,runVariant:{sameConnection:true,gitDefectAndWorkerInput:true,freshWorkerParent:true,stopConstraintAdded:false,nativeRawEventsDiagnostic:true,transport,threadCatalogOverride:overrideCatalog,codeModeCompatibility:codeMode,timeoutMs:180000,originalPromptNote:'Original failed report did not save its prompt; this is the retained script prompt without the later failure-stop constraint.'},results,histories,rolloutEvidence,requests,events,cleanup,browserErrors},null,2));}
async function waitDone(turnId){const deadline=Date.now()+180000;while(Date.now()<deadline){if(completions.has(turnId))return completions.get(turnId);await page.waitForTimeout(150);}throw Error('Native turn completion timeout at original 180 seconds');}
async function capture(id){
 try{
  const metadata=(await rpc('thread/read',{threadId:id,includeTurns:false})).thread;
  const turns=(await rpc('thread/turns/list',{threadId:id,itemsView:'full',sortDirection:'asc',limit:100})).data;
  histories[id]={metadata,turns};for(const turn of turns)for(const item of turn.items||[])inspectItem(item);
  if(metadata.path){const file=path.resolve(metadata.path);assert(file.startsWith(path.resolve(home)+path.sep),'Native evidence path outside explicitly owned CODEX_HOME');const rows=fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));rolloutEvidence[id]=rows.filter(row=>['response_item','turn_context','session_meta'].includes(row.type)).map(row=>row.type==='session_meta'?{...row,payload:{id:row.payload.id,cwd:row.payload.cwd,source:row.payload.source,agent_role:row.payload.agent_role,model_provider:row.payload.model_provider,base_instructions:row.payload.base_instructions}}:row);}
 }catch(error){histories[id]={...histories[id],captureError:error.message};}
 save();
}
async function start(config){const r=await rpc('thread/start',{cwd:fixture,model:'deepseek-flash',modelProvider:'deepseek',sandbox:'read-only',approvalPolicy:'never',experimentalRawEvents:true,config:{model_reasoning_effort:'low',review_model:'deepseek-flash',...(legacy&&overrideCatalog?{model_catalog_json:compatibilityCatalog}:{}),...config}});parents.push(r.thread.id);assert.equal(r.model,'deepseek-flash');assert.equal(r.modelProvider,'deepseek');assert.equal((r.thread.turns||[]).length,0,'New native parent contains previous turns');return r.thread.id;}
try{
 await page.goto(base);await ready(page);assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),home);
 if(legacy&&!overrideCatalog){const catalog=JSON.parse(fs.readFileSync(path.join(home,'models.json'),'utf8'));assert.equal(catalog.models.find(model=>model.slug==='deepseek-flash')?.multi_agent_version,'v1','Server-generated Flash catalog still advertises incompatible V2');}
 const review=await start({'agents.enabled':false});const r=await rpc('review/start',{threadId:review,target:{type:'uncommittedChanges'},delivery:'inline'});assert.equal((await waitDone(r.turn.id)).status,'completed');await capture(review);
 const reviewFindings=histories[review].turns.flatMap(turn=>turn.items).filter(item=>item.type==='exitedReviewMode');assert(/zero.?division|division.{0,25}zero|ZeroDivisionError|除.{0,5}零|\/ 0/i.test(JSON.stringify(reviewFindings)),'Review missed actual defect');results.push({name:'native_review_on_shared_connection',status:'passed',threadId:review,turnId:r.turn.id});save();
 const parent=await start({...(legacy?{'features.multi_agent':true,'features.multi_agent_v2':false}:codeMode?{'features.multi_agent_v2':{enabled:true,non_code_mode_only:false},'features.code_mode':{enabled:true,direct_only_tool_namespaces:['functions']},'features.code_mode_only':true}:{'features.multi_agent_v2':true}),'agents.enabled':true,'agents.default_subagent_model':'deepseek-flash','agents.default_subagent_reasoning_effort':'low','agents.max_concurrent_threads_per_session':2,'agents.worker':{description:'Read-only worker for this bounded audit',config_file:fixture+'/audit-worker.toml'}});
 const t=await rpc('turn/start',{threadId:parent,model:'deepseek-flash',effort:'low',input:[{type:'text',text:instruction,text_elements:[]}]});let completion;
 try{completion=await waitDone(t.turn.id);}catch(error){await capture(parent);for(const id of [...children])await capture(id);throw error;}
 await capture(parent);for(const id of [...children])await capture(id);assert.equal(completion.status,'completed',JSON.stringify(completion.error));
 const parentTurn=histories[parent].turns.find(turn=>turn.id===t.turn.id);assert.equal(children.size,1,'Expected one real native worker');const child=[...children][0], childData=histories[child];assert(childData&&!childData.captureError,'Child native evidence unavailable');assert.equal(childData.metadata.parentThreadId,parent,'Native child metadata points to another parent');assert.equal(childData.metadata.model,'deepseek-flash');assert.equal(childData.metadata.modelProvider,'deepseek');assert.equal(childData.metadata.agentRole,'worker');
 const childTurn=childData.turns.at(-1);assert.equal(childTurn.status,'completed');assert(childTurn.items.some(item=>item.type==='commandExecution'&&item.exitCode===0&&JSON.stringify(item).includes(token)),'Actual worker file read missing');const childText=childTurn.items.filter(item=>item.type==='agentMessage').map(item=>item.text).join('\n');const parentText=parentTurn.items.filter(item=>item.type==='agentMessage').map(item=>item.text).join('\n');assert(childText.includes(token)&&/\b51\b/.test(childText),'Worker result incorrect');assert(parentText.includes(token)&&/\b51\b/.test(parentText),'Parent did not report real worker result');assert(!parentTurn.items.some(item=>item.type==='commandExecution'),'Parent executed command');assert.deepEqual(hash(),before);
 const parentRaw=rolloutEvidence[parent]||[];const spawnCalls=parentRaw.filter(row=>row.type==='response_item'&&row.payload.type==='function_call'&&/spawn_agent$/.test(row.payload.name));let spawn;if(codeMode){const calls=parentRaw.filter(row=>row.type==='response_item'&&row.payload.type==='custom_tool_call'&&/spawn_agent/.test(row.payload.input||''));assert.equal(calls.length,1,'Native code mode spawn call missing');spawn={nativeCodeModeInput:calls[0].payload.input};const taskMessage=(rolloutEvidence[child]||[]).find(row=>row.type==='response_item'&&row.payload.type==='agent_message'&&row.payload.content.some(part=>part.type==='input_text'&&/NEW_TASK/.test(part.text)));assert(taskMessage,'Native child NEW_TASK missing');assert(!taskMessage.payload.content.some(part=>part.type==='encrypted_content'),'Plaintext task still wrapped as encrypted');assert(taskMessage.payload.content.some(part=>part.type==='input_text'&&/worker_input\.txt/.test(part.text)),'Worker task not in native plaintext content');}else{assert.equal(spawnCalls.length,1,'Raw spawn arguments were not captured');spawn=JSON.parse(spawnCalls[0].payload.arguments);assert.equal(spawn.agent_type,'worker');if(legacy)assert.equal(spawn.fork_context||false,false);else assert.equal(spawn.fork_turns,'none');assert(/worker_input\.txt/.test(spawn.message));}
 if(legacy){assert((rolloutEvidence[parent]||[]).some(row=>row.type==='turn_context'&&row.payload.multi_agent_version==='v1'),'Parent did not actually use V1');assert((rolloutEvidence[child]||[]).some(row=>row.type==='turn_context'&&row.payload.multi_agent_version==='v1'),'Child did not actually use V1');const childTask=(rolloutEvidence[child]||[]).find(row=>row.type==='response_item'&&row.payload.type==='message'&&row.payload.role==='user'&&row.payload.content.some(part=>/worker_input\.txt/.test(part.text||'')));assert(childTask,'Native V1 child plaintext user task missing');}
 assert(!childText.includes('division')&&!parentText.includes('division'),'Unrelated review result appeared in worker outcome');results.push({name:'native_worker_after_review_same_connection',status:'passed',parentThreadId:parent,childThreadId:child,spawn,actualChildRead:true,parentChildCorrelationVerified:true,workspaceUnchanged:true});
}catch(error){results.push({name:'combined_flow',status:'failed',error:error.message});console.log('FAIL '+error.message);for(const id of [...parents,...children])await capture(id);}
finally{
 save();for(const id of parents){try{await rpc('thread/delete',{threadId:id});cleanup.push({entity:'parent',id,removed:true});}catch(error){cleanup.push({entity:'parent',id,removed:false,error:error.message});}}
 for(const id of children){try{await rpc('thread/read',{threadId:id,includeTurns:false});await rpc('thread/delete',{threadId:id});cleanup.push({entity:'worker',id,removed:true});}catch(error){cleanup.push({entity:'worker',id,removed:/not found|not loaded|no rollout|cannot find/i.test(error.message),error:error.message});}}
 fs.rmSync(fixture,{recursive:true,force:true});cleanup.push({entity:'fixture',removed:true});save();await browser.close();console.log(JSON.stringify({passed:results.filter(item=>item.status==='passed').length,failed:results.filter(item=>item.status==='failed').length,children:[...children],browserErrors}));if(results.some(item=>item.status==='failed')||browserErrors.length||cleanup.some(item=>!item.removed))process.exitCode=1;
}
