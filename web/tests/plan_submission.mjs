// Deterministic invocation tests exercise the production composer and /plan adapter.
// RPC/thread creation are transport fixtures, not real model or runtime verification.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const native=fs.readFileSync(new URL('../public/native-ui.js',import.meta.url),'utf8');
function declaration(source,name){
  const match=new RegExp('^(?:async )?function '+name+'\\(', 'm').exec(source);
  assert(match,'Missing production function '+name);
  const next=/\n(?:async )?function \w+\(/g;next.lastIndex=match.index+match[0].length;
  const end=next.exec(source)?.index??source.length;
  return source.slice(match.index,end);
}
const nativeStart=native.indexOf('function currentMode('),nativeEnd=native.indexOf('\nfunction resetNativeUI(',nativeStart);
const actionStart=native.indexOf('function composerThreadAction('),actionEnd=native.indexOf('\n// Commands and installed skills',actionStart);
assert(nativeStart>=0&&nativeEnd>nativeStart&&actionStart>=0&&actionEnd>actionStart,'Read actual mode and slash adapter functions');
let implementation=[declaration(app,'composerState'),declaration(app,'persistDrafts'),declaration(app,'saveComposer'),native.slice(nativeStart,nativeEnd),native.slice(actionStart,actionEnd),declaration(app,'submitPrompt')].join('\n');
if(!implementation.includes('function parsePlanPrompt(')){
  const source=/function parsePlanPrompt\(/.test(native)?native:app;
  if(/function parsePlanPrompt\(/.test(source))implementation=declaration(source,'parsePlanPrompt')+'\n'+implementation;
}
const plain=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function makeDraft(text,attachments=[],skills=[]){return{text,attachments,skills,loads:0,pending:false,revision:0,follow:false};}
function fixture({text='/plan',existing=true,attachments=[],skills=[],transport=null,ensure=null}={}){
  const calls=[],ensures=[],notifications=[],storage=new Map(),draft=makeDraft(text,attachments,skills);
  const thread=existing?{id:'own-thread-A'}:null,key=thread?.id||'new';
  const state={ready:true,view:'chat',thread,composerKey:key,composers:new Map([[key,draft]]),stopOperations:new Map(),threadSettings:new Map(thread?[[thread.id,{model:'deepseek-flash',modelProvider:'deepseek',collaborationMode:{mode:'default'}}]]:[]),nativeModes:new Map(),draftMode:'default',activeTurns:new Map(),finishedTurns:new Set(),navigationGeneration:1,selectedCwd:'/tmp/plan-submission-fixture',selectedProject:null,modelDetails:[{model:'deepseek-flash',inputModalities:['text'],defaultReasoningEffort:'low'}],runtimeDefaults:{model:'deepseek-flash'}};
  const dom=()=>({value:'',textContent:'',disabled:false,hidden:false,classList:{toggle(){},add(){},remove(){}},setAttribute(){},removeAttribute(){},focus(){}});
  const nodes={'#prompt':Object.assign(dom(),{value:text}),'#model':Object.assign(dom(),{value:'deepseek-flash'}),'#effort':Object.assign(dom(),{value:'high'}),'#mode-toggle':dom(),'#composer-status':dom()};
  const context={state,$:selector=>{assert(nodes[selector],'Unexpected DOM selector '+selector);return nodes[selector];},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    renderContextUsage(){},closeCommandMenu(){},resizePrompt(){},renderAttachments(){},scrollMessages(){},updateSend(){},
    toast:message=>notifications.push(message),selectedModelProvider:()=> 'deepseek',modelProvider:()=> 'deepseek',isRemovedModel:()=>false,
    permissionSubmissionBlocked:()=>false,runtimeModelContext:()=>undefined,
    rpc:async(method,params)=>{calls.push({method,params});if(method==='skills/list')return{data:[{skills:skills.map(skill=>({...skill,enabled:true}))}]};assert(['thread/settings/update','turn/start','turn/steer'].includes(method),'Unexpected RPC '+method);
      const result=transport?await transport(method,params):method==='thread/settings/update'?{}:{turn:{id:'own-turn-'+calls.length,status:'inProgress'}};
      // Simulate a successful native settings notification as well as its empty
      // acknowledgement. A repeated command must see the confirmed snapshot.
      if(method==='thread/settings/update'&&params.collaborationMode)state.threadSettings.set(params.threadId,{...state.threadSettings.get(params.threadId),collaborationMode:params.collaborationMode});
      return result;},
    ensureThread:async captured=>{ensures.push(captured);if(ensure)return ensure(captured);return captured.thread||{id:'own-created-thread'};}
  };
  for(const name of ['showNativeStatus','initializeWorkspace','showGoalDialog','showProjects','unassignedChat','showComposerSetting'])context[name]=()=>{};
  const api=vm.runInNewContext(implementation+'\n({submitPrompt,saveComposer,currentMode,setNativeMode,nativeSlashCommand,...(typeof parsePlanPrompt===\'function\'?{parsePlanPrompt}:{})});',context);
  return{state,draft,nodes,calls,ensures,notifications,storage,...api};
}
const turns=f=>f.calls.filter(call=>['turn/start','turn/steer'].includes(call.method));
async function flushUntil(predicate){for(let n=0;n<80&&!predicate();n++)await Promise.resolve();assert(predicate(),'Submission did not reach the expected transport boundary');}
const request=f=>{assert.equal(turns(f).length,1);return turns(f)[0];};
const textAttachment={name:'plan-notes.txt',input:{type:'text',text:'OWN_TEXT_ATTACHMENT_SENTINEL'}};
const skill={name:'openai-docs',path:'/tmp/plan-test-profile/skills/.system/openai-docs/SKILL.md'};

test('bare /plan enables Plan without creating a thread, sending an empty task, or silently disappearing',async()=>{
  const f=fixture({existing:false});await f.submitPrompt();
  assert.equal(f.currentMode(),'plan');assert.equal(f.ensures.length,0);assert.equal(turns(f).length,0);assert.equal(f.draft.text,'');assert.equal(f.nodes['#prompt'].value,'');
  assert(f.notifications.some(text=>/计划/.test(text)),'A completed mode command needs explicit feedback');assert.equal(f.draft.pending,false);
});
test('bare /plan is idempotent for an existing thread',async()=>{
  const f=fixture();await f.submitPrompt();assert.equal(f.currentMode(),'plan');
  f.nodes['#prompt'].value='/plan';f.draft.revision++;await f.submitPrompt();
  assert.equal(f.currentMode(),'plan');assert.equal(f.ensures.length,0);assert.equal(turns(f).length,0);
  const updates=f.calls.filter(call=>call.method==='thread/settings/update');assert.equal(updates.length,1,'A confirmed Plan snapshot makes repeated /plan a no-op');for(const call of updates)assert.equal(call.params.collaborationMode.mode,'plan');
});
test('/plan plus a multiline task sends the stripped task in Plan with the selected Flash model and effort',async()=>{
  const f=fixture({text:'/plan  检查目录\n再提出执行计划  '});await f.submitPrompt();const call=request(f);
  assert.equal(call.method,'turn/start');assert.equal(call.params.model,'deepseek-flash');assert.equal(call.params.effort,'high');assert.equal(call.params.collaborationMode.mode,'plan');assert.equal(call.params.collaborationMode.settings.model,'deepseek-flash');
  assert.deepEqual(plain(call.params.input),[{type:'text',text:'检查目录\n再提出执行计划',text_elements:[]}]);assert.equal(f.draft.text,'');assert.equal(f.draft.pending,false);
});
test('/plan task in a new conversation supplies Plan to thread creation and exactly one real task boundary',async()=>{
  const f=fixture({text:'/plan 新会话任务',existing:false});await f.submitPrompt();
  assert.equal(f.ensures.length,1);assert.equal(f.ensures[0].mode,'plan');assert.equal(request(f).params.collaborationMode.mode,'plan');assert.equal(request(f).params.input[0].text,'新会话任务');
});
test('/planet and ordinary mentions of /plan do not activate Plan',async()=>{
  for(const text of ['/planet 介绍行星','请解释 /plan 这个命令']){const f=fixture({text});await f.submitPrompt();const call=request(f);assert.equal(call.params.input[0].text,text);assert.equal(call.params.collaborationMode.mode,'default');}
});
test('/plan task retains text attachment and a selected native skill exactly once',async()=>{
  const f=fixture({text:'/plan 请用 $openai-docs 阅读所附笔记后规划',attachments:[textAttachment],skills:[skill]});await f.submitPrompt();
  assert.deepEqual(plain(request(f).params.input),[{type:'text',text:'请用 $openai-docs 阅读所附笔记后规划',text_elements:[]},{type:'skill',...skill},textAttachment.input]);
  assert.equal(f.calls.filter(call=>call.method==='skills/list').length,1);assert.deepEqual(f.draft.attachments,[]);assert.equal(f.draft.text,'');
});
test('bare local /plan rejects an attachment while keeping all unsent content',async()=>{
  const f=fixture({attachments:[textAttachment]});await assert.rejects(f.submitPrompt(),/不接收附件/);
  assert.equal(f.draft.text,'/plan');assert.deepEqual(f.draft.attachments,[textAttachment]);assert.equal(f.ensures.length,0);assert.equal(turns(f).length,0);assert.equal(f.currentMode(),'default');
});
test('Flash image capability checks still reject unsupported images on /plan tasks',async()=>{
  const image={name:'own-image.png',input:{type:'image',url:'data:image/png;base64,OWN_FIXTURE'}};
  const f=fixture({text:'/plan 规划图片工作',attachments:[image]});await assert.rejects(f.submitPrompt(),/未声明支持/);
  assert.equal(f.draft.text,'/plan 规划图片工作');assert.deepEqual(f.draft.attachments,[image]);assert.equal(turns(f).length,0);
});
test('a rejected Plan task preserves the complete original command, skill, attachment, and retry state',async()=>{
  const raw='/plan 请用 $openai-docs 规划';const f=fixture({text:raw,attachments:[textAttachment],skills:[skill],transport:async(method)=>{if(method==='thread/settings/update')return{};throw Error('OWN_PLAN_TRANSPORT_REJECTION');}});
  await assert.rejects(f.submitPrompt(),/OWN_PLAN_TRANSPORT_REJECTION/);assert.equal(request(f).params.collaborationMode.mode,'plan');
  assert.equal(f.draft.text,raw);assert.equal(f.nodes['#prompt'].value,raw);assert.deepEqual(f.draft.attachments,[textAttachment]);assert.deepEqual(f.draft.skills,[skill]);assert.equal(f.draft.pending,false);assert.equal(f.state.activeTurns.size,0);
});
test('a rejected thread creation preserves /plan plus task and does not invoke a turn',async()=>{
  const raw='/plan 新建失败仍保留';const f=fixture({existing:false,text:raw,ensure:async()=>{throw Error('OWN_THREAD_CREATION_REJECTED');}});
  await assert.rejects(f.submitPrompt(),/OWN_THREAD_CREATION_REJECTED/);assert.equal(f.draft.text,raw);assert.equal(f.nodes['#prompt'].value,raw);assert.equal(turns(f).length,0);assert.equal(f.draft.pending,false);
});
test('a pending Plan submission blocks repeat send from creating a duplicate turn',async()=>{
  const gate=deferred();const f=fixture({text:'/plan 唯一任务',transport:async(method)=>method==='thread/settings/update'?{}:gate.promise});
  const first=f.submitPrompt();await flushUntil(()=>turns(f).length);await f.submitPrompt();assert.equal(turns(f).length,1);assert.equal(f.draft.pending,true);
  gate.resolve({turn:{id:'own-unique-turn',status:'inProgress'}});await first;assert.equal(turns(f).length,1);assert.equal(f.draft.pending,false);
});
test('late task acknowledgement keeps later edits and newly attached files',async()=>{
  const gate=deferred();const f=fixture({text:'/plan 原始任务',attachments:[textAttachment],transport:async(method)=>method==='thread/settings/update'?{}:gate.promise});
  const first=f.submitPrompt();await flushUntil(()=>turns(f).length);
  const later={name:'later.txt',input:{type:'text',text:'OWN_LATER_ATTACHMENT'}};f.nodes['#prompt'].value='LATER_UNSENT_DRAFT';f.draft.revision++;f.draft.attachments.push(later);f.saveComposer();
  gate.resolve({turn:{id:'own-late-turn',status:'inProgress'}});await first;
  assert.equal(request(f).params.input[0].text,'原始任务');assert.equal(f.nodes['#prompt'].value,'LATER_UNSENT_DRAFT');assert.equal(f.draft.text,'LATER_UNSENT_DRAFT');assert.deepEqual(f.draft.attachments,[later]);
});
test('navigation during thread creation keeps the newer thread, mode, model, cwd, and draft intact',async()=>{
  const gate=deferred();const f=fixture({text:'/plan 原页面任务',existing:false,ensure:()=>gate.promise});
  const first=f.submitPrompt();await flushUntil(()=>f.ensures.length);
  const next=makeDraft('B_UNSENT_DRAFT');f.state.thread={id:'own-thread-B'};f.state.composerKey='own-thread-B';f.state.composers.set('own-thread-B',next);f.state.nativeModes.set('own-thread-B','default');f.state.navigationGeneration++;f.state.selectedCwd='/tmp/own-B-workspace';f.nodes['#prompt'].value=next.text;f.nodes['#model'].value='deepseek-flash';
  gate.resolve({id:'own-created-thread-A'});await first;
  const call=request(f);assert.equal(call.params.threadId,'own-created-thread-A');assert.equal(call.params.input[0].text,'原页面任务');assert.equal(call.params.collaborationMode.mode,'plan');
  assert.equal(f.state.thread.id,'own-thread-B');assert.equal(f.currentMode(),'default');assert.equal(f.nodes['#prompt'].value,'B_UNSENT_DRAFT');assert.equal(next.text,'B_UNSENT_DRAFT');assert.equal(f.state.selectedCwd,'/tmp/own-B-workspace');assert.equal(f.nodes['#model'].value,'deepseek-flash');
});
test('late acknowledgement cannot switch a newer fresh draft back to Plan',async()=>{
  const gate=deferred();const f=fixture({text:'/plan 原新会话任务',existing:false,transport:async(method)=>method==='thread/settings/update'?{}:gate.promise});
  const first=f.submitPrompt();await flushUntil(()=>turns(f).length);
  const next=makeDraft('NEW_FRESH_DRAFT');next.mode='default';f.state.navigationGeneration++;f.state.thread=null;f.state.composerKey='new';f.state.composers.set('new',next);f.state.draftMode='default';f.nodes['#prompt'].value=next.text;
  gate.resolve({turn:{id:'own-old-draft-turn',status:'inProgress'}});await first;
  assert.equal(f.currentMode(),'default');assert.equal(f.nodes['#prompt'].value,'NEW_FRESH_DRAFT');assert.equal(next.text,'NEW_FRESH_DRAFT');assert.equal(request(f).params.collaborationMode.mode,'plan');
});
test('confirmed-plan independent submission does not interpret its approved text as a composer command',async()=>{
  const f=fixture({text:'USER_UNSENT_DRAFT'});await f.submitPrompt({text:'/plan literal approved instruction',preserveDraft:true});
  const call=request(f);assert.equal(call.params.input[0].text,'/plan literal approved instruction');assert.equal(call.params.collaborationMode.mode,'default');assert.equal(f.nodes['#prompt'].value,'USER_UNSENT_DRAFT');assert.equal(f.draft.text,'USER_UNSENT_DRAFT');
});

test('whitespace after bare /plan changes mode without creating an empty task',async()=>{
  const f=fixture({text:'  /plan \n\t  ',existing:false});await f.submitPrompt();assert.equal(f.currentMode(),'plan');assert.equal(f.ensures.length,0);assert.equal(turns(f).length,0);assert.equal(f.draft.text,'');
});
test('a rejected bare mode update preserves the command and previous mode',async()=>{
  const f=fixture({transport:async()=>{throw Error('OWN_MODE_UPDATE_REJECTED');}});await assert.rejects(f.submitPrompt(),/OWN_MODE_UPDATE_REJECTED/);
  assert.equal(f.draft.text,'/plan');assert.equal(f.nodes['#prompt'].value,'/plan');assert.equal(f.currentMode(),'default');assert.equal(f.draft.pending,false);assert.equal(turns(f).length,0);
});
test('an active default turn cannot receive /plan as a misleading ordinary steer',async()=>{
  const f=fixture({text:'/plan 修改计划后执行'});f.state.activeTurns.set('own-thread-A','own-active-turn');
  await assert.rejects(f.submitPrompt(),/停止|执行中|正在执行/);assert.equal(turns(f).length,0);assert.equal(f.draft.text,'/plan 修改计划后执行');assert.equal(f.nodes['#prompt'].value,f.draft.text);assert.equal(f.draft.pending,false);
});
test('Plan command parser recognizes only a separated exact command and nonempty task',()=>{
  const f=fixture();assert.equal(typeof f.parsePlanPrompt,'function');
  for(const text of ['/plan','/plan  \n\t','/planet 任务','/planning 任务','请用 /plan 做计划'])assert.equal(f.parsePlanPrompt(text),null,text);
  for(const [text,body]of [['/plan 任务','任务'],['/plan\n多行\n任务 ','多行\n任务'],['/plan\t任务','任务'],['/plan\u3000任务','任务']])assert.equal(f.parsePlanPrompt(text),body,text);
});

test('a late bare /plan acknowledgement cannot claim that the newly selected default conversation entered Plan',async()=>{
  const gate=deferred();const f=fixture({transport:()=>gate.promise});const first=f.submitPrompt();
  await flushUntil(()=>f.calls.some(call=>call.method==='thread/settings/update'));
  const next=makeDraft('BARE_COMMAND_NAVIGATION_DRAFT');f.state.thread={id:'own-thread-B'};f.state.composerKey='own-thread-B';f.state.composers.set('own-thread-B',next);f.state.nativeModes.set('own-thread-B','default');f.state.navigationGeneration++;f.nodes['#prompt'].value=next.text;
  gate.resolve({});await first;
  assert.equal(f.state.nativeModes.get('own-thread-A'),'plan');assert.equal(f.currentMode(),'default');assert.equal(f.state.thread.id,'own-thread-B');assert.equal(f.nodes['#prompt'].value,next.text);assert.equal(next.text,'BARE_COMMAND_NAVIGATION_DRAFT');assert.equal(f.draft.pending,false);
  assert.equal(f.notifications.length,0,'A completed command from the previous conversation must not announce a mode change in the selected conversation');
});
