// Deterministic behavior/protocol-boundary regressions for the restricted slash
// menu and explicit Plan switch. Native RPC replies are transport fixtures;
// these tests do not claim real browser, model, or native-runtime verification.
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
  return source.slice(match.index,next.exec(source)?.index??source.length);
}
const nativeFunctions=['currentMode','turnCollaborationMode','renderNativeMode','setNativeMode','changeModeWithFeedback','nativeSlashActions','nativeSlashCommand','commandEntries','updateCommandMenu','chooseCommand'];
const appFunctions=['composerState','persistDrafts','saveComposer','validateComposerCommand','submitPrompt'];
let implementation=[...appFunctions.map(name=>declaration(app,name)),...nativeFunctions.map(name=>declaration(native,name))].join('\n');
const plain=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function makeDraft(text,attachments=[],skills=[]){return{text,attachments,skills,loads:0,pending:false,revision:0,follow:false};}
function fixture({text='需要规划的任务',existing=true,attachments=[],skills=[],transport=null,ensure=null}={}){
  const calls=[],ensures=[],notifications=[],actions=[],storage=new Map(),draft=makeDraft(text,attachments,skills);
  const thread=existing?{id:'own-thread-A'}:null,key=thread?.id||'new';
  const state={ready:true,view:'chat',thread,composerKey:key,composers:new Map([[key,draft]]),stopOperations:new Map(),threadSettings:new Map(thread?[[thread.id,{model:'deepseek-flash',modelProvider:'deepseek',collaborationMode:{mode:'default'}}]]:[]),nativeModes:new Map(),draftMode:'default',activeTurns:new Map(),finishedTurns:new Set(),navigationGeneration:1,selectedCwd:'/tmp/restricted-slash-fixture',selectedProject:null,modelDetails:[{model:'deepseek-flash',inputModalities:['text'],defaultReasoningEffort:'low'}],runtimeDefaults:{model:'deepseek-flash'}};
  const dom=()=>({value:'',textContent:'',disabled:false,hidden:false,attributes:{},querySelector(selector){assert.equal(selector,'.plan-switch-state');return this.planSwitchState??={textContent:''};},classList:{toggle(){},add(){},remove(){}},setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},focus(){},setSelectionRange(){}});
  const nodes={'#prompt':Object.assign(dom(),{value:text}),'#model':Object.assign(dom(),{value:'deepseek-flash'}),'#effort':Object.assign(dom(),{value:'high'}),'#mode-toggle':dom(),'#composer-status':dom()};
  const context={state,$:selector=>{assert(nodes[selector],'Unexpected DOM selector '+selector);return nodes[selector];},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    renderContextUsage(){},renderCommandMenu(){},closeCommandMenu(){state.commandMenu=null;},resizePrompt(){},renderAttachments(){},scrollMessages(){},updateSend(){},
    toast:message=>notifications.push(message),selectedModelProvider:()=> 'deepseek',modelProvider:()=> 'deepseek',isRemovedModel:()=>false,
    permissionSubmissionBlocked:()=>false,runtimeModelContext:()=>undefined,
    rpc:async(method,params)=>{calls.push({method,params});if(method==='skills/list')return{data:[{skills:skills.map(skill=>({...skill,enabled:true}))}]};assert(['thread/settings/update','turn/start','turn/steer'].includes(method),'Unexpected RPC '+method);
      const result=transport?await transport(method,params):method==='thread/settings/update'?{}:{turn:{id:'own-turn-'+calls.length,status:'inProgress'}};
      // A confirmed native settings event is a separate input from the ACK.
      // This fixture applies both; browser acceptance checks real notifications.
      if(method==='thread/settings/update'&&params.collaborationMode)state.threadSettings.set(params.threadId,{...state.threadSettings.get(params.threadId),collaborationMode:params.collaborationMode});
      return result;},
    ensureThread:async captured=>{ensures.push(captured);if(ensure)return ensure(captured);return captured.thread||{id:'own-created-thread'};},
    threadAction:action=>{actions.push(action);},showView:view=>{actions.push('view:'+view);},showNativeMenu:()=>{actions.push('menu');}
  };
  for(const [name,id]of [['initializeWorkspace','init'],['showGoalDialog','goal'],['unassignedChat','chat']])context[name]=()=>{actions.push(id);};
  const api=vm.runInNewContext(implementation+'\n({submitPrompt,saveComposer,currentMode,setNativeMode,changeModeWithFeedback,renderNativeMode,nativeSlashCommand,nativeSlashActions,commandEntries,updateCommandMenu,chooseCommand});',context);
  return{state,draft,nodes,calls,ensures,notifications,actions,storage,...api};
}
const turns=f=>f.calls.filter(call=>['turn/start','turn/steer'].includes(call.method));
async function flushUntil(predicate){for(let n=0;n<80&&!predicate();n++)await Promise.resolve();assert(predicate(),'Submission did not reach the expected transport boundary');}
const request=f=>{assert.equal(turns(f).length,1);return turns(f)[0];};
const textAttachment={name:'plan-notes.txt',input:{type:'text',text:'OWN_TEXT_ATTACHMENT_SENTINEL'}};
const skill={name:'openai-docs',path:'/tmp/restricted-slash-profile/skills/.system/openai-docs/SKILL.md'};
const removed=['/chat','/plan','/compact','/fork','/export','/review','/rollback','/mcp','/projects','/reasoning','/model','/status','/skills','/settings','/native','/apps','/plugins','/fast','/feedback','/image','/imagegen'];

test('slash menu and executable local adapter expose only initialization and goals',()=>{
  const f=fixture();assert.deepEqual(plain(f.commandEntries().map(entry=>entry.command)),['/init','/goal']);assert.deepEqual(Object.keys(f.nativeSlashActions()),['/init','/goal']);
  assert(f.commandEntries().every(entry=>entry.kind==='command'));assert.equal(f.calls.length,0);
});
test('opening and filtering slash menu never fetches or inserts installed skills',()=>{
  const f=fixture({text:'/',skills:[skill]});f.updateCommandMenu();assert.deepEqual(plain(f.state.commandMenu.entries.map(entry=>entry.command)),['/init','/goal']);
  f.nodes['#prompt'].value='/go';f.updateCommandMenu();assert.deepEqual(plain(f.state.commandMenu.entries.map(entry=>entry.command)),['/goal']);
  f.nodes['#prompt'].value='/openai';f.updateCommandMenu();assert.equal(f.state.commandMenu.entries.length,0);assert.equal(f.calls.length,0,'Menu must not request skills/list');
});
test('selecting a retained menu item only fills the composer; sending invokes the real local adapter',async()=>{
  for(const command of ['/init','/goal']){const f=fixture({text:'/'});f.updateCommandMenu();f.chooseCommand(f.state.commandMenu.entries.find(entry=>entry.command===command));assert.equal(f.nodes['#prompt'].value,command);assert.deepEqual(f.actions,[]);await f.submitPrompt();assert.deepEqual(f.actions,[command.slice(1)]);assert.equal(turns(f).length,0);assert.equal(f.ensures.length,0);assert.equal(f.draft.text,'');}
});
test('removed bare slash commands cannot execute tools, change views, create threads, or become model prompts',async()=>{
  for(const command of removed){const f=fixture({text:command,existing:false});await assert.rejects(f.submitPrompt(),/输入已保留|不再|移除|开关|仅保留|不支持|不可用/);assert.equal(f.calls.length,0,command);assert.equal(f.ensures.length,0,command);assert.deepEqual(f.actions,[],command);assert.equal(f.draft.text,command);assert.equal(f.nodes['#prompt'].value,command);assert.equal(f.currentMode(),'default');assert.equal(f.draft.pending,false);}
});
test('/plan with whitespace or task text is rejected without changing mode or losing its complete input',async()=>{
  for(const text of ['/plan 具体问题',' /plan\n多行\n任务 ','/plan\t问题','/plan\u3000问题','  /plan \n\t  ']){const f=fixture({text});await assert.rejects(f.submitPrompt(),/计划|开关|不支持|不再/);assert.equal(f.currentMode(),'default');assert.equal(f.calls.length,0);assert.equal(f.draft.text,text);assert.equal(f.nodes['#prompt'].value,text);}
});
test('old commands with arguments and attachments cannot bypass removal or lose unsent files',async()=>{
  for(const command of ['/compact','/export','/review','/mcp','/skills']){const text=command+' 参数';const f=fixture({text,attachments:[textAttachment],skills:[skill]});await assert.rejects(f.submitPrompt());assert.equal(f.calls.length,0);assert.equal(f.ensures.length,0);assert.equal(f.draft.text,text);assert.deepEqual(f.draft.attachments,[textAttachment]);assert.deepEqual(f.draft.skills,[skill]);}
});
test('removed commands remain blocked in an existing Plan conversation and during an active turn',async()=>{
  for(const text of ['/plan','/plan 新需求','/compact']){const f=fixture({text});f.state.nativeModes.set('own-thread-A','plan');f.state.activeTurns.set('own-thread-A','own-active-turn');await assert.rejects(f.submitPrompt());assert.equal(f.currentMode(),'plan');assert.equal(f.calls.length,0);assert.equal(f.nodes['#prompt'].value,text);}
});
test('a read-only archive cannot use the former /export exception to invoke an operation',async()=>{
  for(const guard of ['threadArchived','threadBusy']){const f=fixture({text:'/export'});f.state[guard]=true;await f.submitPrompt();assert.equal(f.calls.length,0);assert.deepEqual(f.actions,[]);assert.equal(f.draft.text,'/export');assert.equal(f.nodes['#prompt'].value,'/export');}
});
test('Plan switch on a fresh draft changes only draft mode and leaves the typed task intact',async()=>{
  const f=fixture({existing:false});await f.changeModeWithFeedback('plan');assert.equal(f.currentMode(),'plan');assert.equal(f.calls.length,0);assert.equal(f.ensures.length,0);assert.equal(f.draft.text,'需要规划的任务');assert(f.notifications.some(text=>/计划/.test(text)));
  await f.changeModeWithFeedback('default');assert.equal(f.currentMode(),'default');assert.equal(turns(f).length,0);assert.equal(f.nodes['#prompt'].value,'需要规划的任务');
});
test('an existing-thread Plan switch uses native settings and stays pending until its ACK',async()=>{
  const gate=deferred(),f=fixture({transport:()=>gate.promise}),changing=f.changeModeWithFeedback('plan');await flushUntil(()=>f.calls.length);
  assert.equal(f.state.nativeModePending,true);assert.equal(f.nodes['#mode-toggle'].disabled,true);assert.equal(f.currentMode(),'default');assert.equal(f.notifications.length,0);assert.equal(f.calls[0].method,'thread/settings/update');assert.equal(f.calls[0].params.threadId,'own-thread-A');assert.equal(f.calls[0].params.collaborationMode.mode,'plan');assert.equal(f.calls[0].params.collaborationMode.settings.model,'deepseek-flash');
  await assert.rejects(f.submitPrompt(),/模式正在切换/);assert.equal(turns(f).length,0);assert.equal(f.draft.text,'需要规划的任务');gate.resolve({});await changing;assert.equal(f.state.nativeModePending,false);assert.equal(f.currentMode(),'plan');assert.equal(f.nodes['#mode-toggle'].disabled,false);
});
test('a rejected native Plan switch preserves default mode and the whole composer, then can be retried',async()=>{
  let fail=true;const f=fixture({attachments:[textAttachment],transport:async()=>{if(fail)throw Error('OWN_SETTINGS_REJECTED');return{};}});await assert.rejects(f.changeModeWithFeedback('plan'),/OWN_SETTINGS_REJECTED/);assert.equal(f.currentMode(),'default');assert.equal(f.state.nativeModePending,false);assert.equal(f.nodes['#mode-toggle'].disabled,false);assert.equal(f.nodes['#prompt'].value,'需要规划的任务');assert.deepEqual(f.draft.attachments,[textAttachment]);assert.equal(f.notifications.length,0);fail=false;await f.changeModeWithFeedback('plan');assert.equal(f.currentMode(),'plan');assert.equal(turns(f).length,0);
});
test('busy, archived, loading, restoring, and active conversations cannot change Plan mode',async()=>{
  for(const guard of ['threadBusy','threadArchived','threadLoading','restoreError','active']){const f=fixture();if(guard==='active')f.state.activeTurns.set('own-thread-A','own-running');else f.state[guard]=true;await assert.rejects(f.changeModeWithFeedback('plan'));assert.equal(f.calls.length,0);assert.equal(f.currentMode(),'default');assert.equal(f.nodes['#prompt'].value,'需要规划的任务');}
});
test('repeat switch attempts while pending produce only one settings update',async()=>{
  const gate=deferred(),f=fixture({transport:()=>gate.promise}),first=f.changeModeWithFeedback('plan');await flushUntil(()=>f.calls.length);await assert.rejects(f.changeModeWithFeedback('plan'),/正在切换/);assert.equal(f.calls.length,1);gate.resolve({});await first;assert.equal(f.currentMode(),'plan');
});
test('late switch completion updates its original thread without announcing Plan in the newly selected thread',async()=>{
  const gate=deferred(),f=fixture({transport:()=>gate.promise}),first=f.changeModeWithFeedback('plan');await flushUntil(()=>f.calls.length);const next=makeDraft('B_UNSENT_DRAFT');f.state.thread={id:'own-thread-B'};f.state.composerKey='own-thread-B';f.state.composers.set('own-thread-B',next);f.state.nativeModes.set('own-thread-B','default');f.state.navigationGeneration++;f.nodes['#prompt'].value=next.text;gate.resolve({});await first;assert.equal(f.state.nativeModes.get('own-thread-A'),'plan');assert.equal(f.currentMode(),'default');assert.equal(f.nodes['#prompt'].value,'B_UNSENT_DRAFT');assert.equal(f.notifications.length,0);assert.equal(turns(f).length,0);
});
test('ordinary task after explicit Plan switch sends unmodified text and native Plan/model settings',async()=>{
  const f=fixture({text:'检查目录\n再提出执行计划'});await f.changeModeWithFeedback('plan');await f.submitPrompt();const call=request(f);assert.equal(call.method,'turn/start');assert.equal(call.params.model,'deepseek-flash');assert.equal(call.params.effort,'high');assert.equal(call.params.collaborationMode.mode,'plan');assert.deepEqual(plain(call.params.input),[{type:'text',text:'检查目录\n再提出执行计划',text_elements:[]}]);assert.equal(f.draft.text,'');
});
test('a fresh explicitly enabled Plan draft supplies Plan to thread creation and exactly one task',async()=>{
  const f=fixture({existing:false});await f.changeModeWithFeedback('plan');await f.submitPrompt();assert.equal(f.ensures.length,1);assert.equal(f.ensures[0].mode,'plan');assert.equal(request(f).params.collaborationMode.mode,'plan');
});
test('explicit exit sends no task; the next ordinary task uses default collaboration mode',async()=>{
  const f=fixture();await f.changeModeWithFeedback('plan');await f.changeModeWithFeedback('default');assert.equal(turns(f).length,0);await f.submitPrompt();assert.equal(request(f).params.collaborationMode.mode,'default');assert.equal(request(f).params.input[0].text,'需要规划的任务');
});
test('an ordinary task keeps supported text attachments and explicitly selected native skills',async()=>{
  const f=fixture({text:'请用 $openai-docs 规划',attachments:[textAttachment],skills:[skill]});await f.changeModeWithFeedback('plan');await f.submitPrompt();assert.deepEqual(plain(request(f).params.input),[{type:'text',text:'请用 $openai-docs 规划',text_elements:[]},{type:'skill',...skill},textAttachment.input]);assert.equal(f.calls.filter(call=>call.method==='skills/list').length,1,'Explicit selected skill validation remains independent of slash-menu browsing');assert.equal(f.draft.text,'');assert.deepEqual(f.draft.attachments,[]);
});
test('Plan does not bypass Flash image capability checks or lose unsupported input',async()=>{
  const image={name:'own-image.png',input:{type:'image',url:'data:image/png;base64,OWN_FIXTURE'}},f=fixture({attachments:[image]});await f.changeModeWithFeedback('plan');await assert.rejects(f.submitPrompt(),/未声明支持/);assert.equal(turns(f).length,0);assert.equal(f.draft.text,'需要规划的任务');assert.deepEqual(f.draft.attachments,[image]);
});
test('failed Plan task submission preserves its whole input for retry',async()=>{
  const f=fixture({attachments:[textAttachment],transport:async method=>{if(method==='thread/settings/update')return{};throw Error('OWN_PLAN_TASK_REJECTED');}});await f.changeModeWithFeedback('plan');await assert.rejects(f.submitPrompt(),/OWN_PLAN_TASK_REJECTED/);assert.equal(request(f).params.collaborationMode.mode,'plan');assert.equal(f.draft.text,'需要规划的任务');assert.equal(f.nodes['#prompt'].value,'需要规划的任务');assert.deepEqual(f.draft.attachments,[textAttachment]);assert.equal(f.draft.pending,false);assert.equal(f.state.activeTurns.size,0);
});
test('pending ordinary Plan submission cannot create a duplicate turn',async()=>{
  const gate=deferred(),f=fixture({transport:async method=>method==='thread/settings/update'?{}:gate.promise});await f.changeModeWithFeedback('plan');const first=f.submitPrompt();await flushUntil(()=>turns(f).length);await f.submitPrompt();assert.equal(turns(f).length,1);gate.resolve({turn:{id:'own-unique-turn',status:'inProgress'}});await first;assert.equal(f.draft.pending,false);
});
test('late task ACK preserves later text and newly attached files',async()=>{
  const gate=deferred(),f=fixture({attachments:[textAttachment],transport:async method=>method==='thread/settings/update'?{}:gate.promise});await f.changeModeWithFeedback('plan');const first=f.submitPrompt();await flushUntil(()=>turns(f).length);const added={name:'later.txt',input:{type:'text',text:'OWN_LATER_ATTACHMENT'}};f.nodes['#prompt'].value='LATER_UNSENT_DRAFT';f.draft.revision++;f.draft.attachments.push(added);f.saveComposer();gate.resolve({turn:{id:'own-late-turn',status:'inProgress'}});await first;assert.equal(f.nodes['#prompt'].value,'LATER_UNSENT_DRAFT');assert.equal(f.draft.text,'LATER_UNSENT_DRAFT');assert.deepEqual(f.draft.attachments,[added]);
});
test('approved-plan independent text is not reinterpreted as a composer slash command',async()=>{
  const f=fixture({text:'USER_UNSENT_DRAFT'});await f.submitPrompt({text:'/plan literal approved instruction',preserveDraft:true});assert.equal(request(f).params.input[0].text,'/plan literal approved instruction');assert.equal(request(f).params.collaborationMode.mode,'default');assert.equal(f.nodes['#prompt'].value,'USER_UNSENT_DRAFT');assert.equal(f.draft.text,'USER_UNSENT_DRAFT');
});
test('the visible Plan control reports its confirmed on/off state to assistive technology',()=>{
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/<button\b[^>]*\bid="mode-toggle"[^>]*\brole="switch"[^>]*>/);
  const f=fixture();f.renderNativeMode();assert.equal(f.nodes['#mode-toggle'].attributes['aria-checked'],'false');
  f.state.nativeModes.set('own-thread-A','plan');f.renderNativeMode();assert.equal(f.nodes['#mode-toggle'].attributes['aria-checked'],'true');
  f.state.nativeModePending=true;f.renderNativeMode();assert.equal(f.nodes['#mode-toggle'].disabled,true);assert.equal(f.nodes['#mode-toggle'].attributes['aria-checked'],'true','Pending switch must retain the confirmed mode');
});
test('Plan on/off settings are idempotent when the native snapshot already confirms that mode',async()=>{
  const f=fixture();await f.setNativeMode('default');assert.equal(f.calls.length,0);await f.setNativeMode('plan');await f.setNativeMode('plan');assert.equal(f.calls.length,1);assert.equal(f.currentMode(),'plan');await f.setNativeMode('default');await f.setNativeMode('default');assert.equal(f.calls.length,2);assert.equal(f.currentMode(),'default');
});
test('unassigned chat can submit in Plan while retaining its actual working directory',async()=>{
  const f=fixture({existing:false});assert.equal(f.state.selectedProject,null);const cwd=f.state.selectedCwd;await f.changeModeWithFeedback('plan');await f.submitPrompt();assert.equal(f.ensures[0].projectId,null);assert.equal(f.ensures[0].cwd,cwd);assert.equal(f.ensures[0].mode,'plan');assert.equal(request(f).params.collaborationMode.mode,'plan');
});
test('unlisted slash words and removed commands with Unicode-separated arguments cannot fall through as tasks',async()=>{
  for(const text of ['/unknown','/planet 介绍行星','/PLAN\t任务','/chat\u3000任务','/export\n参数']){const f=fixture({text});await assert.rejects(f.submitPrompt());assert.equal(f.calls.length,0);assert.equal(f.ensures.length,0);assert.equal(f.nodes['#prompt'].value,text);assert.equal(f.draft.text,text);}
});
test('ordinary prose mentioning a former command and absolute file paths remain valid tasks',async()=>{
  for(const text of ['请解释 /plan 以前的用途','/tmp/project/README.md 请阅读这个文件']){const f=fixture({text});await f.submitPrompt();assert.equal(request(f).params.input[0].text,text);assert.equal(request(f).params.collaborationMode.mode,'default');}
});
