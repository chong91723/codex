// Deterministic submission/protocol-boundary regression. RPC is a transport stub,
// not a model result; real approved-plan DB execution is covered by browser acceptance.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const submitStart=source.indexOf('async function submitPrompt('),submitEnd=source.indexOf('\nfunction runtimeModelContext(',submitStart);
const draftsStart=source.indexOf('function composerState('),draftsEnd=source.indexOf('\nfunction resizePrompt(',draftsStart);
const saveStart=source.indexOf('function saveComposer('),saveEnd=source.indexOf('\nfunction rememberScroll(',saveStart);
assert(submitStart>=0&&submitEnd>submitStart&&draftsStart>=0&&draftsEnd>draftsStart&&saveEnd>saveStart,'Exercise actual submission and draft functions');
const commandStart=source.indexOf('function validateComposerCommand(');assert(commandStart>=0&&commandStart<submitStart);
const planParseStart=source.indexOf('function parsePlanPrompt('),localCommandStart=planParseStart>=0?Math.min(commandStart,planParseStart):commandStart;
const implementation=[source.slice(localCommandStart,submitStart),source.slice(draftsStart,draftsEnd),source.slice(saveStart,saveEnd),source.slice(submitStart,submitEnd)].join('\n');
const native=fs.readFileSync(new URL('../public/native-ui.js',import.meta.url),'utf8');
const reviewStart=native.indexOf('function reviewPlan('),reviewEnd=native.indexOf('\nfunction executionPlanKey(',reviewStart);assert(reviewStart>=0&&reviewEnd>reviewStart);
const reviewImplementation=native.slice(reviewStart,reviewEnd);
const approved='APPROVED_PLAN_SENTINEL: use $openai-docs only if this approved task needs it.';
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture(transport=async()=>({turn:{id:'turn-approved',status:'inProgress'}}),modeTransport=async()=>{}){
  const storage=new Map(),calls=[],notifications=[],modeChanges=[],dialogs=[];
  const attachment={name:'unsent.png',input:{type:'image',url:'data:image/png;base64,UNSENT_ATTACHMENT'}};
  const skill={name:'openai-docs',path:'/tmp/test-profile/skills/.system/openai-docs/SKILL.md'};
  const sentinel='UNSENT_DRAFT_SENTINEL $openai-docs';
  const draft={text:sentinel,attachments:[attachment],skills:[skill],pending:false,revision:0,follow:false};
  const state={ready:true,thread:{id:'thread-A'},composerKey:'thread-A',composers:new Map([['thread-A',draft]]),stopOperations:new Map(),threadSettings:new Map([['thread-A',{model:'deepseek-flash',modelProvider:'deepseek'}]]),activeTurns:new Map(),finishedTurns:new Set(),navigationGeneration:1,selectedCwd:'/tmp/test-workspace',selectedProject:null,modelDetails:[{model:'deepseek-flash',inputModalities:['text','image']}],runtimeDefaults:{model:'deepseek-flash'}};
  const nodes={'#prompt':{value:sentinel},'#model':{value:'deepseek-flash'},'#effort':{value:'low'}};
  const context={state,$:selector=>{assert(nodes[selector],'Unexpected DOM access '+selector);return nodes[selector];},
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    closeCommandMenu(){},toast:message=>notifications.push(message),selectedModelProvider:()=> 'deepseek',modelProvider:()=> 'deepseek',isRemovedModel:()=>false,currentMode:()=> 'default',
    nativeSlashActions:()=>({}),nativeSlashCommand:async()=>false,turnCollaborationMode:mode=>({mode,settings:{model:'deepseek-flash'}}),ensureThread:async captured=>captured.thread,
    setNativeMode:async mode=>{modeChanges.push(mode);await modeTransport(mode);},
    el:(tag,className,text)=>({tag,className,text}),formField:(root,label,id,options)=>{nodes['#'+id]={value:options.value};},
    openDialog:(title,build,submit,submitLabel)=>{const root={children:[],append(...items){this.children.push(...items);}};build(root);dialogs.push({title,root,submit,submitLabel});},
    runtimeModelContext:()=>undefined,updateSend(){},renderNativeMode(){},resizePrompt(){},renderAttachments(){},scrollMessages(){},
    rpc:async(method,params)=>{calls.push({method,params});if(method==='skills/list')return {data:[{skills:[{...skill,enabled:true}]}]};assert(['turn/start','turn/steer'].includes(method),'Unexpected RPC '+method);return transport(method,params);},
  };
  const api=vm.runInNewContext(implementation+'\n'+reviewImplementation+'\n({submitPrompt,saveComposer,reviewPlan});',context);
  return {state,draft,nodes,calls,storage,sentinel,attachment,skill,notifications,modeChanges,dialogs,...api};
}
const plain=value=>JSON.parse(JSON.stringify(value));
const turns=f=>f.calls.filter(call=>call.method==='turn/start'||call.method==='turn/steer');
test('approved-plan submission sends only approved text and preserves unsent text, attachments and skills',async()=>{
  const f=fixture();await f.submitPrompt({text:approved,preserveDraft:true});
  assert.equal(turns(f).length,1);assert.equal(turns(f)[0].method,'turn/start');
  assert.deepEqual(plain(turns(f)[0].params.input),[{type:'text',text:approved,text_elements:[]}]);
  assert.equal(f.calls.some(call=>call.method==='skills/list'),false,'Draft skill selection must not bleed into the approved task');
  assert.equal(f.nodes['#prompt'].value,f.sentinel);assert.equal(f.draft.text,f.sentinel);
  assert.deepEqual(f.draft.attachments,[f.attachment]);assert.deepEqual(f.draft.skills,[f.skill]);
  assert.equal(JSON.parse(f.storage.get('codex.drafts'))['thread-A'],f.sentinel);assert.equal(f.draft.pending,false);assert.equal(f.draft.follow,false);
});
test('ordinary submission still sends selected skill and attachment, then clears sent text and attachment',async()=>{
  const f=fixture();await f.submitPrompt();
  assert.equal(turns(f).length,1);
  assert.deepEqual(plain(turns(f)[0].params.input),[{type:'text',text:f.sentinel,text_elements:[]},{type:'skill',...f.skill},f.attachment.input]);
  assert.equal(f.draft.text,'');assert.equal(f.nodes['#prompt'].value,'');assert.deepEqual(f.draft.attachments,[]);
  assert.equal(Object.hasOwn(JSON.parse(f.storage.get('codex.drafts')),'thread-A'),false);assert.equal(f.draft.pending,false);
});
test('delayed approved-task acknowledgement cannot overwrite text or attachments entered meanwhile',async()=>{
  const gate=deferred(),f=fixture(()=>gate.promise),pending=f.submitPrompt({text:approved,preserveDraft:true});
  const added={name:'later.txt',input:{type:'text',text:'NEW_ATTACHMENT_SENTINEL'}};
  f.nodes['#prompt'].value='NEW_DRAFT_SENTINEL';f.draft.revision++;f.draft.attachments.push(added);f.saveComposer();
  gate.resolve({turn:{id:'turn-approved',status:'inProgress'}});await pending;
  assert.equal(f.nodes['#prompt'].value,'NEW_DRAFT_SENTINEL');assert.equal(f.draft.text,'NEW_DRAFT_SENTINEL');
  assert.deepEqual(f.draft.attachments,[f.attachment,added]);assert.equal(turns(f)[0].params.input[0].text,approved);
});
test('ordinary delayed acknowledgement keeps later edits and newly added attachments',async()=>{
  const gate=deferred(),f=fixture(()=>gate.promise),pending=f.submitPrompt();
  // Allow skill validation and request construction to capture only the original inputs.
  await Promise.resolve();await Promise.resolve();
  const added={name:'later.txt',input:{type:'text',text:'NEW_ATTACHMENT_SENTINEL'}};
  f.nodes['#prompt'].value='NEW_ORDINARY_DRAFT_SENTINEL';f.draft.revision++;f.draft.attachments.push(added);f.saveComposer();
  gate.resolve({turn:{id:'turn-ordinary',status:'inProgress'}});await pending;
  assert.equal(f.nodes['#prompt'].value,'NEW_ORDINARY_DRAFT_SENTINEL');assert.equal(f.draft.text,'NEW_ORDINARY_DRAFT_SENTINEL');
  assert.deepEqual(f.draft.attachments,[added]);assert.equal(turns(f).length,1);assert.equal(turns(f)[0].params.input[0].text,f.sentinel);
});
test('repeated confirmation while pending produces exactly one protocol request',async()=>{
  const gate=deferred(),f=fixture(()=>gate.promise),first=f.submitPrompt({text:approved,preserveDraft:true});
  await f.submitPrompt({text:'DUPLICATE_APPROVAL_MUST_NOT_SEND',preserveDraft:true});
  assert.equal(f.draft.pending,true);assert.equal(turns(f).length,1);
  gate.resolve({turn:{id:'turn-approved',status:'inProgress'}});await first;
  assert.equal(turns(f).length,1);assert.equal(turns(f)[0].params.input[0].text,approved);assert.equal(f.draft.pending,false);
});
test('approved-task transport rejection preserves the original draft sentinel, attachments and skills',async()=>{
  const f=fixture(async()=>{throw Error('transport rejection sentinel');});
  await assert.rejects(f.submitPrompt({text:approved,preserveDraft:true}),/transport rejection sentinel/);
  assert.equal(turns(f).length,1);assert.equal(f.draft.text,f.sentinel);assert.equal(f.nodes['#prompt'].value,f.sentinel);
  assert.deepEqual(f.draft.attachments,[f.attachment]);assert.deepEqual(f.draft.skills,[f.skill]);
  assert.equal(f.draft.pending,false);assert.equal(f.state.activeTurns.size,0);
});
test('ordinary transport rejection also retains its original input and attachment for retry',async()=>{
  const f=fixture(async()=>{throw Error('ordinary transport rejection');});await assert.rejects(f.submitPrompt(),/ordinary transport rejection/);
  assert.equal(f.draft.text,f.sentinel);assert.equal(f.nodes['#prompt'].value,f.sentinel);assert.deepEqual(f.draft.attachments,[f.attachment]);assert.equal(f.draft.pending,false);
});

test('actual analysis confirmation uses the edited whole plan, genuine progress instructions and preserved user draft',async()=>{
  const f=fixture();f.reviewPlan({text:'ORIGINAL_ANALYSIS_PLAN'});assert.equal(f.dialogs.length,1);const dialog=f.dialogs[0];assert.equal(dialog.title,'确认分析方案');assert.equal(dialog.submitLabel,'确认并执行分析');assert(dialog.root.children.some(node=>/不等同于逐条 SQL 审批/.test(node.text)));assert.equal(turns(f).length,0);assert.deepEqual(f.modeChanges,[]);
  f.nodes['#approved-plan'].value='EDITED_ANALYSIS_PLAN: 月度收入，按付款日期，结果 resultId=OWN_RESULT';await dialog.submit(dialog.root);assert.deepEqual(f.modeChanges,['default']);assert.equal(turns(f).length,1);const text=turns(f)[0].params.input[0].text;assert.match(text,/EDITED_ANALYSIS_PLAN/);assert.doesNotMatch(text,/ORIGINAL_ANALYSIS_PLAN/);for(const required of ['update_plan','指标口径','数据来源','真实查询','resultId','断点恢复'])assert(text.includes(required),required);assert.equal(f.draft.text,f.sentinel);assert.equal(f.nodes['#prompt'].value,f.sentinel);assert.deepEqual(f.draft.attachments,[f.attachment]);assert.deepEqual(f.draft.skills,[f.skill]);
});
test('native mode-switch rejection aborts analysis confirmation without submitting a task or losing the draft',async()=>{
  const f=fixture(undefined,async()=>{throw Error('OWN_ANALYSIS_MODE_REJECTED');});f.reviewPlan({text:'OWN_ANALYSIS_PLAN'});await assert.rejects(f.dialogs[0].submit(f.dialogs[0].root),/OWN_ANALYSIS_MODE_REJECTED/);assert.deepEqual(f.modeChanges,['default']);assert.equal(turns(f).length,0);assert.equal(f.draft.text,f.sentinel);assert.deepEqual(f.draft.attachments,[f.attachment]);
});
test('an empty edited analysis plan is rejected before mode changes or protocol submissions',async()=>{
  const f=fixture();f.reviewPlan({text:'OWN_ANALYSIS_PLAN'});f.nodes['#approved-plan'].value='  ';await assert.rejects(f.dialogs[0].submit(f.dialogs[0].root),/分析方案不能为空/);assert.deepEqual(f.modeChanges,[]);assert.equal(turns(f).length,0);assert.equal(f.draft.text,f.sentinel);
});
test('an active analysis cannot open a second confirmation while the model is still planning',()=>{
  const f=fixture();f.state.activeTurns.set('thread-A','turn-planning');assert.throws(()=>f.reviewPlan({text:'INCOMPLETE_ANALYSIS_PLAN'}),/分析方案生成完成/);assert.equal(f.dialogs.length,0);assert.deepEqual(f.modeChanges,[]);assert.equal(turns(f).length,0);
});
