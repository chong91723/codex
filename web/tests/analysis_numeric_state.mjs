// Actual numerical-answer presentation with deterministic DOM/HTTP events.
import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../public/analysis-evidence.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
class Node{
 constructor(tag,cls='',text=''){this.tagName=tag;this.className=cls;this.textContent=text;this.children=[];this.dataset={};this.attributes={};this.isConnected=true;this.hidden=false;this.open=false;this.value='';this.classList={remove:name=>{this.className=this.className.split(' ').filter(v=>v!==name).join(' ');}};}
 append(...items){this.children.push(...items);}prepend(...items){this.children.unshift(...items);}replaceChildren(...items){this.children=items;}setAttribute(k,v){this.attributes[k]=v;}focus(){this.focused=true;}
 all(tag){return this.children.flatMap(child=>[...(child.tagName===tag?[child]:[]),...child.all(tag)]);}
}
const item={id:'answer-A',type:'agentMessage',phase:'final_answer',text:'实际合计 3.50，日期 2026-10-27。'};
function fixture(transport=async()=>({status:'verified',evidence:[{value:'3.50'}],sources:{}})){
 const state={analysisToolsVerified:true,thread:{id:'thread-A'},navigationGeneration:1,items:new Map(),activeTurns:new Map([['thread-A','active-turn']]),renderingHistory:false,status:{analysisEvidenceVersion:'data-evidence-v2'},selectedCwd:'/tmp/work'},calls=[],rendered=[],writes=[],toasts=[],prompt=new Node('textarea');
 state.items.set('data-call',{turnId:'turn-A',item:{type:'mcpToolCall',server:'codex_web_databases',tool:'query_database',status:'completed',result:{isError:false}}});
 const context=vm.createContext({state,Map,Set,JSON,Promise,Error,el:(tag,cls,text)=>new Node(tag,cls,text),button:(text,fn,cls)=>{const node=new Node('button',cls,text);node.onclick=fn;return node;},databaseApi:(action,payload)=>{calls.push({action,payload});return transport(action,payload);},rpc:async()=>({config:{}}),writeMcpConfig:async(...args)=>writes.push(args),renderItem:(value,done,turn)=>{rendered.push({value,done,turn});assert.equal(value._analysisVerified,true);return new Node('div','message agent',value.text);},refreshAnalysisDownloads(){},pretty:JSON.stringify,nativeErrorMessage:error=>error.message,$:()=>prompt,toast:text=>toasts.push(text),saveComposer(){},resizePrompt(){}});vm.runInContext(source,context);return{context,state,calls,rendered,writes,toasts,prompt};
}
test('existing explicit MCP disable is never silently overridden',async()=>{const f=fixture(async()=>({ready:true,mcpName:'analysis',mcpConfig:{command:'/fixed/python'}}));f.context.rpc=async()=>({config:{mcp_servers:{analysis:{enabled:false}}}});await f.context.prepareAnalysisTools();assert.equal(f.writes.length,0);});

test('fresh analysis provisions its existing managed tools without needing a database connection',async()=>{const f=fixture(async()=>({ready:true,mcpName:'analysis',mcpConfig:{command:'/fixed/python'}}));f.state.activeTurns.clear();await f.context.prepareAnalysisTools();assert.equal(f.writes.length,1);assert.equal(f.writes[0][0],'analysis');});


test('managed extension upgrade fills missing roots and origins while preserving its custom settings',async()=>{const status={ready:true,mcpName:'analysis',mcpConfig:{command:'/fixed/python',args:['/fixed/server.py'],env:{CODEX_WEB_DB_STATE:'/state',CODEX_WEB_ANALYSIS_ROOTS:'/work',CODEX_WEB_DATA_ORIGINS:'https://allowed.test'}}};const f=fixture(async()=>status);f.state.activeTurns.clear();const existing={...status.mcpConfig,env:{CODEX_WEB_DB_STATE:'/custom-state'},tool_timeout_sec:777,tools:{run_python:{enabled:false}}};f.context.rpc=async()=>({config:{mcp_servers:{analysis:existing}}});await f.context.prepareAnalysisTools();assert.equal(f.writes.length,1);const value=f.writes[0][1];assert.equal(value.env.CODEX_WEB_DB_STATE,'/custom-state');assert.equal(value.env.CODEX_WEB_ANALYSIS_ROOTS,'/work');assert.equal(value.tool_timeout_sec,777);assert.equal(value.tools.run_python.enabled,false);});

test('explicit roots and API policy or a custom same-name server are never overwritten',async()=>{const status={ready:true,mcpName:'analysis',mcpConfig:{command:'/fixed/python',args:['/fixed/server.py'],env:{CODEX_WEB_ANALYSIS_ROOTS:'/default',CODEX_WEB_DATA_ORIGINS:'https://default.test'}}};for(const existing of [{...status.mcpConfig,env:{CODEX_WEB_ANALYSIS_ROOTS:'/private-choice',CODEX_WEB_DATA_ORIGINS:''}},{command:'/custom/python',args:['/other/server.py']}]){const f=fixture(async()=>status);f.context.rpc=async()=>({config:{mcp_servers:{analysis:existing}}});await f.context.prepareAnalysisTools();assert.equal(f.writes.length,0);}});

test('old running backend reads current worker configuration without a service restart',async()=>{const full={ready:true,mcpName:'analysis',mcpConfig:{command:'/fixed/python',args:['/fixed/server.py'],env:{CODEX_WEB_ANALYSIS_ROOTS:'/actual-startup-workspace'}}};const f=fixture(async action=>action==='result'?full:{...full,mcpConfig:{command:'/fixed/python'}});f.state.activeTurns.clear();await f.context.prepareAnalysisTools();assert.equal(f.calls[1].payload.analysisEvidence.action,'configuration');assert.equal(f.calls[1].payload.analysisEvidence.workspace,'/tmp/work');assert.equal(f.writes[0][1].env.CODEX_WEB_ANALYSIS_ROOTS,'/actual-startup-workspace');});


test('submission acknowledgement registers strict evidence even if turn-start notification is late',()=>{const src=fs.readFileSync(new URL('../public/analysis-workspace.js',import.meta.url),'utf8'),start=src.indexOf('function recordAnalysisSubmission('),end=src.indexOf('\nfunction analysisUIEvent(',start),registered=[];const c=vm.createContext({registerAnalysisTurn:(thread,turn)=>registered.push([thread,turn]),analysisOwnedTurns:new Map(),analysisLiveTurns:new Map(),state:{ws:{},threadSettings:new Map(),runtimeDefaults:{}}});vm.runInContext(src.slice(start,end),c);c.recordAnalysisSubmission('thread-A',{id:'plan-turn'},{mode:'plan'});c.recordAnalysisSubmission('thread-A',{id:'default-turn'},{mode:'default'});assert.deepEqual(registered,[['thread-A','plan-turn'],['thread-A','default-turn']]);});


test('fresh managed-tool initialization waits for idle instead of reloading active calls',async()=>{
 const config={ready:true,learningVersion:'analysis-publications-v7',mcpName:'analysis',mcpConfig:{command:'/fixed/python',args:[],env:{CODEX_WEB_ANALYSIS_ROOTS:'/tmp/explicit'}}};
 const f=fixture(async()=>config);f.state.analysisToolsVerified=false;const calls=[];f.context.rpc=async(method)=>{calls.push(method);return {config:{mcp_servers:{analysis:config.mcpConfig}}};};
 await assert.rejects(f.context.prepareAnalysisTools(),/当前任务/);assert(!calls.includes('config/mcpServer/reload'));f.state.activeTurns.clear();await f.context.prepareAnalysisTools();assert.equal(calls.filter(method=>method==='config/mcpServer/reload').length,1);assert(f.state.analysisToolsVerified);
});

test('metric proof download rejects navigation changes and mismatched execution evidence',async()=>{
 const gate=deferred(),f=fixture(()=>gate.promise),metric={resultId:'a'.repeat(32),proofHash:'expected'};let current=true,downloads=0;
 f.context.downloadDatabaseBlob=()=>{downloads++;};f.context.Blob=Blob;
 const pending=f.context.downloadAnalysisMetricProof(metric,()=>current);current=false;gate.resolve({proofHash:'expected',proof:{resultId:metric.resultId}});await assert.rejects(pending,/已切换/);assert.equal(downloads,0);
 const mismatch=fixture(async()=>({proofHash:'other',proof:{resultId:metric.resultId}}));mismatch.context.downloadDatabaseBlob=()=>{downloads++;};mismatch.context.Blob=Blob;await assert.rejects(mismatch.context.downloadAnalysisMetricProof(metric),/不一致/);assert.equal(downloads,0);
});

test('tool schema migration waits until all active analyses finish, without reloading running MCP',async()=>{const f=fixture(async()=>({ready:true,learningVersion:'knowledge-receipts-v1',mcpName:'analysis',mcpConfig:{command:'/fixed/python',args:[],env:{CODEX_WEB_ANALYSIS_ROOTS:'/work'}}}));await assert.rejects(f.context.prepareAnalysisTools(),/分析正在执行/);assert.equal(f.writes.length,0);});

test('ordinary numbers, terms, user parameters and error codes do not trigger reads or body blocking',()=>{
 const f=fixture();f.state.items.clear();
 for(const text of ['三角形与三角函数','HTTP 401','2025年，阈值80，分3步','一共十二','字段甲出现最多'])assert.equal(f.context.renderGroundedAnalysisItem({...item,text},true,'turn-A'),null);
 assert.equal(f.calls.length,0);
});
test('native plan and commentary do not require data execution or publication',()=>{
 const f=fixture();f.context.extractAnalysisProposal=text=>text.startsWith('<proposed_plan>')?'plan':null;
 assert.equal(f.context.renderGroundedAnalysisItem({...item,text:'<proposed_plan>2025年，分3步。</proposed_plan>'},true,'turn-A'),null);
 assert.equal(f.context.renderGroundedAnalysisItem({...item,phase:'commentary'},true,'turn-A'),null);
 assert.equal(f.calls.length,0);
});
test('data activity triggers association even for a text-only fact; streaming stays readable',async()=>{
 const f=fixture(),node=f.context.renderGroundedAnalysisItem({...item,text:'类别甲最常见'},false,'turn-A');
 assert.equal(node.dataset.analysisVerification,'pending');assert.equal(f.calls.length,0);assert.equal(f.rendered[0].value.text,'类别甲最常见');
 const complete=f.context.renderGroundedAnalysisItem({...item,text:'类别甲最常见'},true,'turn-A');await flush();assert.equal(complete.dataset.analysisVerification,'verified');assert.equal(f.calls.length,1);
});
test('failed association preserves visible body without giving it a verified state or submitting model work',async()=>{
 const f=fixture(async()=>({status:'rejected',reason:'字段未关联'})),node=f.context.renderGroundedAnalysisItem(item,true,'turn-A');await flush();
 assert.equal(node.dataset.analysisVerification,'rejected');assert.equal(f.rendered[0].value.text,item.text);assert.equal(f.calls.length,2);assert(node.all('button').some(n=>n.textContent==='补充数据依据'));
 f.prompt.value='原有草稿';node.all('button').find(n=>n.textContent==='补充数据依据').onclick();assert.equal(f.prompt.value,'原有草稿');assert.equal(f.toasts.length,1);
});
test('transport failure is visible, never certified, and retry associates the same text',async()=>{
 let calls=0;const f=fixture(async()=>{if(++calls===1)throw Error('offline fixture');return {status:'verified',evidence:[],sources:{}};}),node=f.context.renderGroundedAnalysisItem(item,true,'turn-A');await flush();
 assert.equal(node.dataset.analysisVerification,'rejected');assert.equal(f.rendered.length,1);node.all('button').find(n=>n.textContent==='重试关联').onclick();await flush();assert.equal(node.dataset.analysisVerification,'verified');assert.equal(f.calls.length,2);
});
test('late source association cannot replace another conversation or detached answer',async()=>{
 for(const change of ['thread','generation','detach']){const gate=deferred(),f=fixture(()=>gate.promise),node=f.context.renderGroundedAnalysisItem(item,true,'turn-A');if(change==='thread')f.state.thread={id:'other'};if(change==='generation')f.state.navigationGeneration++;if(change==='detach')node.isConnected=false;gate.resolve({status:'verified',evidence:[],sources:{}});await flush();assert.equal(node.dataset.analysisVerification,'pending');assert.equal(f.rendered.length,1);}
});
test('canonical report is delivered without certifying rewritten narration',async()=>{
 const f=fixture(async(action,payload)=>payload.analysisEvidence?.action==='published_answer'?{status:'verified',text:'原字段为类别甲',version:'data-evidence-v2',delivery:'published-report',nativeMessageMatched:false,evidence:[{name:'category',value:'类别甲'}],sources:{}}:{status:'rejected'}),node=f.context.renderGroundedAnalysisItem(item,true,'turn-A');await flush();
 assert.equal(node.analysisDisplayText,'原字段为类别甲');assert.equal(node.dataset.analysisDelivery,'published-report');assert.equal(node.analysisEvidence.nativeMessageMatched,false);assert(node.all('pre').some(p=>p.textContent===item.text));
});
test('source, actual execution and configured metric scope remain distinct',async()=>{
 for(const metric of [undefined,{name:'字段派生规则',version:2,unit:'1'}]){const f=fixture(async()=>({status:'verified',version:'data-evidence-v2',evidence:[{name:'value',column:'field',value:'3.50',metric}],sources:{}})),node=f.context.renderGroundedAnalysisItem(item,true,'turn-A');await flush();assert.equal(node.dataset.analysisVerification,'verified');assert(node.all('p').some(p=>p.textContent.includes(metric?'部分字段按已确认口径执行':'未应用已确认口径')));assert(node.all('p').some(p=>p.textContent.includes('不认证正文')));}
});
test('native-observed current turns register locally without ordinary-chat HTTP reads',async()=>{
 const f=fixture();await f.context.registerAnalysisTurn('thread-A','turn-A');assert.equal(f.calls.length,0);await f.context.registerAnalysisTurn('thread-A','turn-A');assert.equal(f.calls.length,0);
 f.state.status={};await f.context.registerAnalysisTurn('other','turn');assert.equal(f.calls.length,1);assert.equal(f.calls[0].payload.analysisEvidence.action,'register');
});

test('a failed tool response does not force a runtime error into data-field verification',()=>{const f=fixture();f.state.items.get('data-call').item.status='failed';f.state.items.get('data-call').item.result.isError=true;assert.equal(f.context.renderGroundedAnalysisItem({...item,text:'查询失败：HTTP 401'},true,'turn-A'),null);assert.equal(f.calls.length,0);});
