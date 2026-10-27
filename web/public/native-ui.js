'use strict';
// UI adapters use the public app-server protocol; the runtime is unmodified.
state.nativeModes=new Map();state.nativeGoals=new Map();state.draftMode='default';state.selectedProject=null;
// Native goal budgets count uncached input + output, unlike context occupancy.
const goalLabels={active:'进行中',paused:'已暂停',blocked:'等待处理',usageLimited:'额度受限',budgetLimited:'预算已用尽',complete:'已完成'};
// BEGIN Web goal usage observer. Public native counters stay unmodified.
class GoalUsageTracker {
  constructor(storage,namespace){
    this.storage=storage;this.namespace=namespace;
    this.records=new Map();this.latest=new Map();this.pending=new Map();
  }
  key(threadId){return 'codex.goal-usage.v1.'+JSON.stringify([this.namespace(),threadId]);}
  total(value){
    if(!value||![value.inputTokens,value.cachedInputTokens,value.outputTokens].every(n=>Number.isSafeInteger(n)&&n>=0)||value.cachedInputTokens>value.inputTokens)return null;
    return {inputTokens:value.inputTokens,cachedInputTokens:value.cachedInputTokens,outputTokens:value.outputTokens};
  }
  save(key,record){
    this.records.set(key,record);
    try{delete record.storageError;this.storage.setItem(key,JSON.stringify(record));}
    catch(error){record.storageError='网页观测无法保存：'+error.message;}
  }
  load(key){
    if(this.records.has(key))return this.records.get(key);
    try{
      const raw=this.storage.getItem(key);if(!raw)return null;
      const value=JSON.parse(raw);
      if(value.version!==1||!Number.isFinite(value.createdAt)||!Number.isSafeInteger(value.observedTokens)||value.observedTokens<0||typeof value.complete!=='boolean'||typeof value.hasUsage!=='boolean'||!Array.isArray(value.turnIds)||value.turnIds.some(id=>typeof id!=='string')||value.lastTotal!==null&&!this.total(value.lastTotal))throw new Error('记录格式无效');
      this.records.set(key,value);return value;
    }catch(error){
      const value={storageError:'网页观测记录不可用：'+error.message};
      this.records.set(key,value);return value;
    }
  }
  prepare(threadId,fresh){
    const key=this.key(threadId),lastTotal=this.latest.get(key)||(fresh?{inputTokens:0,cachedInputTokens:0,outputTokens:0}:null);
    // Only a newly created, unrun thread is known to have a zero baseline.
    this.pending.set(key,{version:1,createdAt:null,observedTokens:0,complete:!!lastTotal,lastTotal,turnIds:[],hasUsage:false});
  }
  cancel(threadId){this.pending.delete(this.key(threadId));}
  adopt(threadId,goal,activeTurnId){
    const key=this.key(threadId);let record=this.load(key);
    if(record?.createdAt!==goal.createdAt){
      const error=record?.storageError;
      record=this.pending.get(key)||{version:1,observedTokens:0,complete:false,lastTotal:this.latest.get(key)||null,turnIds:[],hasUsage:false};
      record.createdAt=goal.createdAt;if(error)record.counterError=error;
      this.pending.delete(key);this.save(key,record);
    }
    if(activeTurnId&&goal.status==='active')this.start(threadId,goal,activeTurnId);
    return record;
  }
  start(threadId,goal,turnId){
    if(!goal||goal.status!=='active'||!turnId)return;
    const record=this.adopt(threadId,goal);
    if(!record.turnIds.includes(turnId)){record.turnIds.push(turnId);this.save(this.key(threadId),record);}
  }
  receive(threadId,turnId,usage,goal){
    const key=this.key(threadId),total=this.total(usage?.total);if(!total)return;
    const previous=this.latest.get(key);
    if(!previous||Object.keys(total).every(name=>total[name]>=previous[name]))this.latest.set(key,total);
    if(!goal)return;
    const record=this.adopt(threadId,goal),last=record.lastTotal;
    if(last&&Object.keys(total).some(name=>total[name]<last[name])){
      // Old replayed events must not reset the checkpoint and inflate later deltas.
      record.complete=false;record.counterError='原生累计统计回退，网页仅保留已确认消耗。';
      this.save(key,record);return;
    }
    if(record.turnIds.includes(turnId)){
      if(last){
        const input=total.inputTokens-last.inputTokens,cached=total.cachedInputTokens-last.cachedInputTokens,output=total.outputTokens-last.outputTokens;
        if(cached>input){record.complete=false;record.counterError='原生缓存增量超过输入增量，该段未归入目标。';}
        else{record.observedTokens+=input-cached+output;if(input+output>0)record.hasUsage=true;}
      }else record.complete=false;
    }else if(goal.status==='active'&&last&&Object.keys(total).some(name=>total[name]>last[name])){
      record.complete=false;record.counterError='部分目标回合未被网页观察，统计只包含已确认部分。';
    }
    // Also advance over paused/completed-goal ordinary turns, without charging them.
    record.lastTotal=total;this.save(key,record);
  }
  forget(threadId){
    const key=this.key(threadId);this.records.delete(key);this.pending.delete(key);
    try{this.storage.removeItem(key);}
    catch(error){this.records.set(key,{storageError:'网页旧目标观测记录无法移除：'+error.message});}
  }
  snapshot(threadId,goal){
    const record=this.adopt(threadId,goal);
    return {observedTokens:record.hasUsage?record.observedTokens:null,complete:record.complete,storageError:record.storageError,counterError:record.counterError,nativeTokens:Number.isSafeInteger(goal.tokensUsed)&&goal.tokensUsed>=0?goal.tokensUsed:null};
  }
}
// END Web goal usage observer.
const goalUsageTracker=new GoalUsageTracker(localStorage,()=>state.runtimeInfo?.codexHome||'unconnected');
const goalUsageFreshThreads=new Set();
function goalUsageSnapshot(threadId,goal){return goalUsageTracker.snapshot(threadId,goal);}
function goalUsageText(usage){return usage.observedTokens===null?'本会话消耗尚未完整观测':'本会话观测 '+(usage.complete?'':'至少 ')+usage.observedTokens.toLocaleString()+' tokens';}
function goalUsageWarning(usage,goal){const warnings=[];if(usage.nativeTokens===0)warnings.push('原生目标计数 0 不代表没有模型消耗。');if(usage.observedTokens!==null&&usage.nativeTokens!==null&&usage.nativeTokens<usage.observedTokens)warnings.push('原生预算计数低于本会话观测，可能尚未更新或存在首回合漏计；剩余预算可能高估。');if(!usage.complete)warnings.push('缺少目标开始时的完整基线，网页观测仅是下界。');if(goal.tokenBudget)warnings.push('预算由原生计数控制，不能作为严格费用上限。');if(usage.storageError)warnings.push(usage.storageError);if(usage.counterError)warnings.push(usage.counterError);return warnings.join(' ');}
function renderGoalUsageDetails(root,threadId,goal){const usage=goalUsageSnapshot(threadId,goal),details=el('div','context-stats');details.dataset.goalUsage='details';for(const [title,value]of [[usage.complete?'本会话观测消耗':'本会话已确认消耗下界',usage.observedTokens===null?'未完整观测':usage.observedTokens.toLocaleString()+' tokens'],['原生预算计数',usage.nativeTokens===null?'未知':usage.nativeTokens.toLocaleString()+' tokens'],['原生剩余预算',goal.tokenBudget&&usage.nativeTokens!==null?Math.max(0,goal.tokenBudget-usage.nativeTokens).toLocaleString()+' tokens（可能高估）':'未设置']]){const row=el('div');row.append(el('span','subtle',title),el('strong','',value));details.append(row);}root.append(details,el('p','subtle','网页观测按目标参与回合的原生累计统计差额计算：未缓存输入 + 输出；缓存输入扣除，推理输出已包含。只覆盖本会话，不含子代理独立消耗和服务计价；未知历史不会按 0 补齐。原生预算计数保持原样。'));const warning=goalUsageWarning(usage,goal);if(warning){const node=el('p','subtle',warning);node.dataset.goalUsageWarning='true';root.append(node);}}

function threadRuntimeConfig(provider){return provider==='deepseek'?{model_auto_compact_token_limit_scope:'total',model_post_turn_compact_threshold_percent:100}:{};}
function currentMode(){return state.thread?(state.nativeModes.get(state.thread.id)||state.threadSettings.get(state.thread.id)?.collaborationMode?.mode||'default'):state.draftMode;}
function turnCollaborationMode(mode=currentMode()){
  const settings=state.threadSettings.get(state.thread?.id)||{};
  return {mode,settings:{model:$('#model').value||settings.model||state.runtimeDefaults?.model,
    reasoning_effort:$('#effort').value||settings.effort||state.modelDetails?.find(m=>m.model===($('#model').value||settings.model||state.runtimeDefaults?.model))?.defaultReasoningEffort||null,developer_instructions:null}};
}
function renderNativeMode(){
  const node=$('#mode-toggle');if(!node)return;const plan=currentMode()==='plan',automaticPending=typeof analysisModeChangeBlocked==='function'&&analysisModeChangeBlocked(state.thread?.id),pending=!!state.nativeModePending||automaticPending;
  node.classList.toggle('plan-active',plan);node.setAttribute('role','switch');node.setAttribute('aria-checked',String(plan));node.setAttribute('aria-busy',String(pending));node.ariaLabel='计划模式';
  node.querySelector('.plan-switch-state').textContent=pending?'切换中…':plan?'开启':'关闭';
  node.title=plan?'当前为计划模式；退出不会执行已有方案':'通过 /plan 进入计划模式';
  node.disabled=pending||state.threadLoading||state.restoreError||state.threadArchived||state.threadBusy||state.activeTurns.has(state.thread?.id);
  const status=$('#analysis-mode-status');if(status){status.hidden=!plan&&!pending;status.textContent=automaticPending?'方案已提出，正在进入计划模式…':state.nativeModePending?'正在切换计划模式…':'计划模式';status.title='先形成并确认整体分析方案；规划期间可能进行只读调查。';}
  const exit=$('#exit-plan-mode');if(exit){exit.hidden=!plan;exit.disabled=node.disabled;}
  renderContextUsage();
}
async function setNativeMode(mode){
  if(typeof analysisModeChangeBlocked==='function'&&analysisModeChangeBlocked(state.thread?.id))throw new Error('正在进入计划模式，请稍候');
  if(state.nativeModePending)throw new Error('模式正在切换，请稍候');
  if(state.threadLoading||state.restoreError)throw new Error('请先完成当前会话的恢复，再切换模式');
  if(state.activeTurns.has(state.thread?.id))throw new Error('请先停止当前任务，再切换模式');
  if(state.threadArchived||state.threadBusy)throw new Error('请先恢复可编辑的会话');
  if(currentMode()===mode&&(!state.thread||state.threadSettings.get(state.thread.id)?.collaborationMode?.mode===mode)){renderNativeMode();return;}
  state.nativeModePending=true;renderNativeMode();updateSend();
  try{if(state.thread){const id=state.thread.id;await rpc('thread/settings/update',{threadId:id,collaborationMode:turnCollaborationMode(mode)});state.nativeModes.set(id,mode);}
  else state.draftMode=mode;}finally{state.nativeModePending=false;renderNativeMode();updateSend();}
}
function resetNativeUI(){state.draftMode='default';renderNativeMode();renderGoalBanner();renderExecutionProgressBanner();}
function adoptNativeUI(thread){state.selectedProject=thread.projectId||null;renderNativeMode();renderGoalBanner();renderExecutionProgressBanner();}
function nativeUIEvent(msg){
  const p=msg.params||{};
  if(msg.method==='thread/settings/updated'&&p.threadSettings?.collaborationMode)state.nativeModes.set(p.threadId,p.threadSettings.collaborationMode.mode);
  if(msg.method==='thread/goal/updated'){state.nativeGoals.set(p.threadId,p.goal);goalUsageTracker.adopt(p.threadId,p.goal,state.activeTurns.get(p.threadId));}
  if(msg.method==='thread/goal/cleared'){state.nativeGoals.delete(p.threadId);goalUsageTracker.forget(p.threadId);}
  if(msg.method==='turn/started'){goalUsageFreshThreads.delete(p.threadId);goalUsageTracker.start(p.threadId,state.nativeGoals.get(p.threadId),p.turn?.id);}
  if(msg.method==='thread/tokenUsage/updated'){goalUsageTracker.receive(p.threadId,p.turnId,p.tokenUsage,state.nativeGoals.get(p.threadId));if(p.threadId===state.thread?.id)renderGoalBanner();}
  if(msg.method==='thread/deleted'){state.nativeModes.delete(p.threadId);state.nativeGoals.delete(p.threadId);goalUsageTracker.forget(p.threadId);goalUsageFreshThreads.delete(p.threadId);try{localStorage.removeItem(executionPlanKey(p.threadId));}catch(error){toast('会话已删除，但网页进度缓存未能清除：'+error.message);}}
  if(msg.method==='thread/project/updated'&&p.threadId===state.thread?.id){state.thread.projectId=p.projectId;state.selectedProject=p.projectId;}
  if(['thread/settings/updated','turn/started','turn/completed','thread/goal/updated','thread/goal/cleared'].includes(msg.method))queueMicrotask(()=>{renderNativeMode();renderGoalBanner();if(msg.method==='turn/completed')restoreExecutionPlans();renderExecutionProgressBanner();});
}
async function changeModeWithFeedback(mode){
  const threadId=state.thread?.id,generation=state.navigationGeneration,draft=composerState();
  await setNativeMode(mode);
  if(threadId!==state.thread?.id||generation!==state.navigationGeneration||draft!==composerState())return;
  toast(mode==='plan'?'已手动进入计划模式，生成计划后由你确认执行。':'已退出计划模式。后续可直接开展分析；退出不会执行已有方案。');
}
async function enterPlanMode(){await changeModeWithFeedback('plan');}
function nativeSlashActions(){return {'/plan':enterPlanMode};}
async function nativeSlashCommand(text){
  const actions=nativeSlashActions();if(!Object.hasOwn(actions,text))return false;
  const draft=saveComposer(),raw=draft.text,revision=draft.revision||0;await actions[text]();
  if(draft.text===raw&&(draft.revision||0)===revision){draft.text='';persistDrafts();if(composerState()===draft){$('#prompt').value='';resizePrompt();closeCommandMenu();}}return true;
}
// Plan is the only slash action; engineering actions stay in advanced settings.
function commandEntries(){return [{command:'/plan',title:'计划模式',description:'手动进入计划模式，生成计划后由你确认执行',icon:'check',id:'menu-plan',kind:'command'}];}
function showComposerSetting(id){
  const source=$('#'+id),model=id==='model';
  openDialog(model?'选择模型':'选择思考强度',root=>{
    root.append(el('p','subtle',model?'沿用当前提供方；发送下一次任务时生效。':'按当前模型目录提供的档位选择，发送下一次任务时生效。'));
    const select=source.cloneNode(true);select.id='command-setting';select.className='field-input';root.append(select);select.value=source.value;
  },async()=>{source.value=$('#command-setting').value;source.onchange?.();},'应用');
}
function closeCommandMenu(){const menu=$('#command-menu');if(!menu)return;menu.hidden=true;$('#view-chat').classList.remove('command-menu-open');state.commandMenu=null;$('#prompt').setAttribute('aria-expanded','false');$('#prompt').removeAttribute('aria-activedescendant');}
function positionCommandMenu(){const menu=$('#command-menu');if(!menu||menu.hidden)return;const top=$('.composer').getBoundingClientRect().top;let available=top-80;if($('#view-chat').classList.contains('empty'))available=Math.min(available,top-$('#welcome h1').getBoundingClientRect().bottom-32);menu.style.maxHeight=Math.max(80,Math.min(340,available))+'px';}
function chooseCommand(entry){
  const menu=state.commandMenu;if(!entry||!menu||menu.draft!==composerState()||menu.text!==$('#prompt').value)return closeCommandMenu();
  if(entry.kind!=='command'||!Object.hasOwn(nativeSlashActions(),entry.command))return closeCommandMenu();
  const draft=composerState();$('#prompt').value=entry.command;
  saveComposer();draft.revision=(draft.revision||0)+1;resizePrompt();updateSend();closeCommandMenu();$('#prompt').focus();const end=$('#prompt').value.length;$('#prompt').setSelectionRange(end,end);
}
function renderCommandMenu(){
  const value=state.commandMenu,menu=$('#command-menu');if(!value)return closeCommandMenu();
  const scroll=menu.scrollTop;menu.replaceChildren();
  value.entries.forEach((entry,index)=>{
    const option=button('',()=>chooseCommand(entry),'command-option');option.id=entry.id;option.title=entry.command;option.setAttribute('role','option');option.setAttribute('aria-selected',String(index===value.index));option.onmousedown=event=>event.preventDefault();
    option.append(icon(entry.icon),el('span','command-title',entry.title),el('span','command-description',entry.description));menu.append(option);
  });
  if(!value.entries.length)menu.append(el('p','command-notice','仅支持 /plan；初始化和持续目标位于高级设置，技能和 MCP 可在左侧配置。'));
  menu.hidden=false;$('#view-chat').classList.add('command-menu-open');menu.scrollTop=scroll;$('#prompt').setAttribute('aria-expanded','true');
  const active=value.entries[value.index];if(active){$('#prompt').setAttribute('aria-activedescendant',active.id);document.getElementById(active.id)?.scrollIntoView({block:'nearest'});}else $('#prompt').removeAttribute('aria-activedescendant');positionCommandMenu();
}
function updateCommandMenu(){
  const text=$('#prompt').value;if(state.commandComposing||state.view!=='chat'||!/^\/[^\s]*$/.test(text))return closeCommandMenu();
  const previous=state.commandMenu,query=text.slice(1).toLocaleLowerCase();
  const entries=commandEntries().filter(entry=>[entry.command,entry.title,entry.description].join(' ').toLocaleLowerCase().includes(query));
  if(!entries.length)return closeCommandMenu();
  const active=previous?.text===text?previous.entries[previous.index]?.id:null;
  state.commandMenu={text,entries,index:Math.max(0,entries.findIndex(entry=>entry.id===active)),draft:composerState()};renderCommandMenu();
}
function showNativeMenu(){if(!$('#prompt').value){$('#prompt').value='/';saveComposer();resizePrompt();}updateCommandMenu();$('#prompt').focus();}
function commandMenuKey(event){
  if(event.isComposing||event.keyCode===229||state.commandComposing)return false;
  const value=state.commandMenu;if(!value||$('#command-menu').hidden)return false;
  if(event.key==='Escape'){event.preventDefault();closeCommandMenu();return true;}
  if(['ArrowDown','ArrowUp'].includes(event.key)&&value.entries.length){event.preventDefault();value.index=(value.index+(event.key==='ArrowDown'?1:-1)+value.entries.length)%value.entries.length;renderCommandMenu();return true;}
  if((event.key==='Tab'||event.key==='Enter'&&!event.shiftKey)&&value.entries.length){
    if(event.key==='Enter'&&value.entries[value.index]?.command===value.text){closeCommandMenu();return false;}
    event.preventDefault();chooseCommand(value.entries[value.index]);return true;
  }
  return false;
}
async function initializeWorkspace(){
  openDialog('初始化工作区',root=>{root.append(el('p','','Codex 将检查当前工作区，再按官方初始化指令生成 AGENTS.md。已有 AGENTS.md 不会覆盖。'),el('p','subtle',state.selectedCwd));if(currentMode()==='plan')root.append(el('p','subtle','当前为计划模式：会先形成初始化方案，确认执行后才写入文件。'));},async()=>{const {prompt}=await fetchJSON('/api/init-prompt');showView('chat');$('#prompt').value=prompt;await submitPrompt();},'开始初始化');
}
async function showNativeStatus(){
  const id=state.thread?.id,settings=state.threadSettings.get(id)||{},snapshot=contextSnapshot(),provider=id?modelProvider():selectedModelProvider();
  openDialog('当前状态',root=>{
    const grid=el('div','context-stats');for(const [name,value]of [['会话 ID',id||'尚未发送'],['模型',settings.model||$('#model').value||state.runtimeDefaults?.model],['提供方',provider],['模式',currentMode()==='plan'?'计划':'默认'],['工作区',state.selectedCwd],['项目',state.thread?.projectId||state.selectedProject||'未关联'],['上下文占用',snapshot?snapshot.used.toLocaleString()+' / '+snapshot.limit?.toLocaleString()+' tokens':'尚未统计'],['审批策略',settings.approvalPolicy||state.runtimeDefaults?.approval_policy],['沙箱',settings.sandboxPolicy?.type||state.runtimeDefaults?.sandbox_mode]]){const row=el('div');row.append(el('span','subtle',name),el('strong','',typeof value==='string'?value:pretty(value)));grid.append(row);}root.append(grid);
  },async()=>{},'关闭');
}
function renderProposedPlan(item,done){
  const node=el('section','message proposed-plan');node.dataset.proposedPlan=item.id;
  node.append(el('h3','','分析方案'),markdown(item.text||'正在形成分析方案…'));
  if(done){const actions=el('div','card-actions');actions.append(button('确认并执行分析',()=>reviewPlan(item),'solid-button'),button('修改分析方案',async()=>{await setNativeMode('plan');$('#prompt').focus();toast('请说明需要调整的分析思路、指标口径或输出要求');}));node.append(actions,el('p','subtle','此处确认整体分析方案；规划期间可能进行只读调查。具体工具仍按权限请求审批，执行进度按实际步骤更新。'));}
  return node;
}
function reviewPlan(item){
  if(state.activeTurns.has(state.thread?.id))throw new Error('请等待分析方案生成完成');
  openDialog('确认分析方案',root=>{root.append(el('p','','可以修改下方分析方案。确认后退出计划模式，并开始执行整体方案；具体工具仍受现有权限控制。这不等同于逐条 SQL 审批。'));formField(root,'分析方案','approved-plan',{value:item.text||'',multiline:true,required:true});},async root=>{
    const plan=$('#approved-plan',root).value.trim();if(!plan)throw new Error('分析方案不能为空');
    await setNativeMode('default');await submitPrompt({text:'我已确认以下分析方案，请按照这个版本执行，保留我明确指定的分析思路、指标口径、时间范围和数据来源。若需调整方案，请先说明。开始执行前请使用原生 update_plan 建立分析步骤，并按实际执行结果更新进度，不使用估算百分比。只依据真实查询和计算结果形成结论；存在 resultId 时保留结果引用，复用与本方案口径一致的已有结果。遇到缺少数据或查询失败，请明确说明，不能编造。完成后逐项回答我的问题，并提供方案要求的图表或分析报告。停止后按实际完成情况重新安排剩余步骤，不假定数据库事务可以断点恢复。\n\n'+plan,preserveDraft:true});
  },'确认并执行分析');
}
function executionPlanKey(threadId=state.thread?.id){return 'codex.execution-plans.'+state.runtimeInfo?.codexHome+'.'+threadId;}
function savedExecutionPlans(){try{return JSON.parse(localStorage.getItem(executionPlanKey())||'{}');}catch{return {};}}
function rememberExecutionPlan(p){
  if(!state.thread||p.threadId&&p.threadId!==state.thread.id)return;
  const turnId=p.turnId||state.activeTurns.get(state.thread.id);if(!turnId)return;
  const plans=savedExecutionPlans();plans[turnId]={explanation:p.explanation,plan:p.plan||[]};
  try{localStorage.setItem(executionPlanKey(),JSON.stringify(Object.fromEntries(Object.entries(plans).slice(-50))));}catch{}
  renderExecutionProgress(turnId,plans[turnId]);
}
// BEGIN execution progress status. Counts are native steps, never elapsed-time estimates.
function executionProgressStatus({plan,turn,active=false,interrupting=false,connected=true,request=null}){
  const completed=plan.filter(step=>step.status==='completed').length,total=plan.length;
  const current=plan.find(step=>step.status==='inProgress')?.step||null;
  let status='unknown',label='状态待恢复';
  if(turn?.status==='interrupted'){status='interrupted';label='已停止';}
  else if(turn?.status==='failed'){status='failed';label='执行失败';}
  else if(interrupting){status='stopping';label='正在停止';}
  else if(active&&request){status=request.responded?'responded':'waiting';label=request.responded?'决定已发送，等待确认':request.method.includes('requestApproval')||request.params?._meta?.codex_approval_kind==='mcp_tool_call'?'等待审批':'等待你的回应';}
  else if(!connected&&(active||turn?.status==='inProgress')){status='disconnected';label='连接已断开，状态待恢复';}
  else if(active){status='running';label=completed===total?'步骤已完成，正在整理结果':'执行中';}
  else if(turn?.status==='completed'){status=completed===total?'completed':'incomplete';label=completed===total?'已完成':'本轮已结束，计划未全部报告完成';}
  return {completed,total,current,status,label};
}
// END execution progress status.
function executionProgressSnapshot(turnId,p){
  const threadId=state.thread?.id,turn=state.turns.find(turn=>turn.id===turnId);
  const active=state.activeTurns.get(threadId)===turnId;
  const request=[...state.requests.values()].find(request=>request.params?.threadId===threadId&&(!request.params.turnId||request.params.turnId===turnId));
  return executionProgressStatus({plan:p.plan,turn,active,interrupting:state.interrupting.has(turnId),connected:state.ready,request});
}
function fillExecutionProgress(node,turnId,p,banner=false){
  const progress=executionProgressSnapshot(turnId,p),key=state.thread.id+'.'+turnId;
  if(node.dataset.progressKey!==key){node.open=false;node.replaceChildren();node.dataset.progressKey=key;}
  let summary=$('summary',node);
  if(!summary){summary=el('summary','execution-progress-heading');summary.append(el('span','execution-progress-status'),el('strong','execution-progress-count'),el('span','execution-progress-current'),el('span','execution-progress-toggle','查看分析步骤'));node.append(summary,el('div','progress-steps'));}
  node.dataset.progressStatus=progress.status;
  const text=(selector,value)=>{const target=$(selector,node);if(target.textContent!==value)target.textContent=value;};
  text('.execution-progress-status',progress.label);text('.execution-progress-count',progress.completed+'/'+progress.total+' 步已完成');
  text('.execution-progress-current',progress.current?(progress.status==='interrupted'?'停止于：':'当前：')+progress.current:'');
  const signature=JSON.stringify([p.explanation,p.plan]);
  if(node.dataset.planSignature!==signature){
    const list=$('.progress-steps',node);list.replaceChildren();
    if(p.explanation)list.append(el('p','subtle',p.explanation));
    for(const step of p.plan)list.append(el('div','plan-step '+step.status,(step.status==='completed'?'✓ ':step.status==='inProgress'?'◉ ':'○ ')+step.step));
    list.append(el('p','execution-progress-note','按实际报告的分析步骤计数，不代表查询扫描或用时百分比。停止后可修改方案并发起新一轮执行；已完成操作不会回滚，不保证数据库事务断点恢复。'));node.dataset.planSignature=signature;
  }
  node.setAttribute('aria-label',(banner?'当前分析进度':'分析步骤')+' · '+progress.label+' · '+progress.completed+'/'+progress.total+' 步已完成');
}
function renderExecutionProgress(turnId,p,updateBanner=true){
  if(!p.plan?.length){$$('[data-execution-plan]').find(node=>node.dataset.executionPlan===turnId)?.remove();if(updateBanner)renderExecutionProgressBanner();return;}let node=$$('[data-execution-plan]').find(node=>node.dataset.executionPlan===turnId);
  if(!node){node=el('details','message execution-progress');node.dataset.executionPlan=turnId;const group=$$('.activity-group').find(group=>group.dataset.turnId===turnId);if(group)group.before(node);else $('#messages').append(node);}
  fillExecutionProgress(node,turnId,p);if(updateBanner)renderExecutionProgressBanner();
}
function renderExecutionProgressBanner(){
  let node=$('#execution-progress-banner');
  if(!node){node=el('details','execution-progress execution-progress-banner');node.id='execution-progress-banner';node.hidden=true;$('#plan-summary').before(node);}
  const threadId=state.thread?.id,turnId=state.activeTurns.get(threadId)||state.turns.at(-1)?.id;
  const p=threadId&&!state.threadLoading&&!state.restoreError?savedExecutionPlans()[turnId]:null;
  const visible=!!(turnId&&p?.plan?.length);
  // The current plan has one visible home; earlier plans remain in history.
  for(const card of $$('[data-execution-plan]'))card.hidden=visible&&card.dataset.executionPlan===turnId;
  node.hidden=!visible;if(visible)fillExecutionProgress(node,turnId,p,true);
}
function restoreExecutionPlans(){if(!state.thread){renderExecutionProgressBanner();return;}for(const [id,p]of Object.entries(savedExecutionPlans()))if(state.turns.some(turn=>turn.id===id)||state.activeTurns.get(state.thread.id)===id)renderExecutionProgress(id,p,false);renderExecutionProgressBanner();}
function renderGoalBanner(){
  let node=$('#goal-banner');if(!node){node=el('div','goal-banner');node.id='goal-banner';$('#plan-summary').before(node);}
  const goal=state.nativeGoals.get(state.thread?.id);node.hidden=!goal;node.replaceChildren();if(!goal)return;
  const usage=goalUsageSnapshot(state.thread.id,goal),text=el('span','subtle',goalUsageText(usage)+' · 原生预算计数 '+(usage.nativeTokens===null?'未知':usage.nativeTokens.toLocaleString())+(goal.tokenBudget?' / '+goal.tokenBudget.toLocaleString():'')+' tokens');text.dataset.goalUsage='summary';text.title=goalUsageWarning(usage,goal);node.append(button('目标 · '+(goalLabels[goal.status]||goal.status)+' · '+goal.objective,showGoalDialog,'goal-link'),text);const warning=goalUsageWarning(usage,goal);if(warning){const note=el('span','subtle',usage.observedTokens!==null&&usage.nativeTokens<usage.observedTokens?'原生预算计数待核实':'消耗统计说明');note.title=warning;note.dataset.goalUsageWarning='true';node.append(note);}
}
// Goal mutations append user messages. Finish the native interrupt first so
// the real tool output is recorded before that goal-status message.
async function changeGoal(thread,status){
  if(!state.goalMutations)state.goalMutations=new Set();
  if(state.goalMutations.has(thread.id))throw new Error('目标状态正在更新，请稍候');
  state.goalMutations.add(thread.id);
  try{
    const turn=state.activeTurns.get(thread.id);
    if(status==='active'){
      if(turn)throw new Error('当前任务仍在执行，无需重复继续目标。');
      await rpc('thread/settings/update',{threadId:thread.id,collaborationMode:turnCollaborationMode()});
    }else if(turn)await interruptTurn(thread.id,turn);
    if(status==='clear'){await rpc('thread/goal/clear',{threadId:thread.id,origin:'user'});state.nativeGoals.delete(thread.id);goalUsageTracker.forget(thread.id);}
    else await rpc('thread/goal/set',{threadId:thread.id,origin:'user',status});
    $('#dialog').close();renderGoalBanner();
  }finally{state.goalMutations.delete(thread.id);}
}
async function showGoalDialog(){
  const fresh=!state.thread,thread=await ensureThread();if(fresh)goalUsageFreshThreads.add(thread.id);const {goal}=await rpc('thread/goal/get',{threadId:thread.id});
  if(goal)state.nativeGoals.set(thread.id,goal);else{state.nativeGoals.delete(thread.id);goalUsageTracker.forget(thread.id);}renderGoalBanner();
  openDialog('持续目标',root=>{
    root.append(el('p','subtle','明确设置目标后，Codex 会持续推进，直到完成、暂停或达到预算。普通对话不会自动创建目标。'));
    formField(root,'目标','goal-objective',{value:goal?.objective||'',multiline:true,required:true});
    root.append(el('p','subtle','目标预算按原生的未缓存输入与输出计数，和上下文占用不同；完整请求消耗见上下文详情。新会话首回合可能缺少目标计数基线，原生计数为 0 不代表没有消耗。'));
    formField(root,'Token 预算（可选）','goal-budget',{value:goal?.tokenBudget||'',type:'number'});$('#goal-budget',root).min='1';
    if(goal){root.append(el('p','',`${goalLabels[goal.status]||goal.status} · ${goal.timeUsedSeconds||0} 秒`));renderGoalUsageDetails(root,thread.id,goal);const actions=el('div','card-actions');
      const change=status=>()=>changeGoal(thread,status);
      actions.append(button('暂停目标并停止当前任务',change('paused')),button('继续目标',change('active')),button('移除目标',()=>changeGoal(thread,'clear')));root.append(actions);}
  },async root=>{const objective=$('#goal-objective',root).value.trim(),budget=$('#goal-budget',root).value;if(!objective)throw new Error('请输入明确目标');if(state.activeTurns.has(thread.id))throw new Error('请先暂停或停止当前任务，再设置或修改目标。');if(!state.activeTurns.has(thread.id))await rpc('thread/settings/update',{threadId:thread.id,collaborationMode:turnCollaborationMode()});if(!goal)goalUsageTracker.prepare(thread.id,goalUsageFreshThreads.has(thread.id));let r;try{r=await rpc('thread/goal/set',{threadId:thread.id,origin:'user',objective,status:'active',tokenBudget:budget?Number(budget):null});}catch(error){goalUsageTracker.cancel(thread.id);throw error;}state.nativeGoals.set(thread.id,r.goal);goalUsageTracker.adopt(thread.id,r.goal,state.activeTurns.get(thread.id));renderGoalBanner();},goal?'更新并继续目标':'设置并开始');
}
async function showProjects(){
  const projects=await paged('project/list',{limit:100});
  openDialog('项目',root=>{
    root.append(el('p','subtle','项目用于组织会话和选择工作目录。未关联项目的聊天仍保留 Codex 全部工具能力。'));
    const actions=el('div','card-actions');actions.append(button('新建项目',()=>{$('#dialog').close();projectEditor();}),button('选择工作目录',()=>{$('#dialog').close();return editProject();}),button('新建不关联项目的聊天',()=>{$('#dialog').close();return unassignedChat();}));root.append(actions);
    for(const project of projects){const card=el('div','native-project');card.dataset.projectId=project.id;card.append(el('strong','',project.name),el('span','subtle',project.roots.map(r=>r.path).join(' · ')));const buttons=el('div','card-actions');
      buttons.append(button('在此项目新建会话',()=>{resetChat();state.selectedProject=project.id;if(project.roots[0])setCwd(project.roots[0].path);$('#dialog').close();showView('chat');toast('新会话将关联 '+project.name);}),button('将当前会话移入',async()=>{if(!state.thread)throw new Error('请先发送消息，创建会话');await rpc('thread/metadata/update',{threadId:state.thread.id,projectId:project.id});state.thread.projectId=project.id;state.selectedProject=project.id;$('#dialog').close();toast('已关联项目 '+project.name);}),button('编辑',()=>{$('#dialog').close();projectEditor(project);}),button('删除项目',()=>{$('#dialog').close();openDialog('删除项目',body=>body.append(el('p','','删除“'+project.name+'”的项目分组，不删除会话或磁盘文件。')),async()=>{await rpc('project/delete',{projectId:project.id});if(state.selectedProject===project.id)state.selectedProject=null;toast('项目已删除');},'删除项目');}));card.append(buttons);root.append(card);}
    if(!projects.length)root.append(el('p','subtle','暂无原生项目。'));
    if(state.thread?.projectId)root.append(button('解除当前会话的项目关联',async()=>{await rpc('thread/metadata/update',{threadId:state.thread.id,projectId:''});state.thread.projectId=null;state.selectedProject=null;$('#dialog').close();toast('已解除项目关联');}));
  },async()=>{},'关闭');
}
function projectEditor(project=null){
  openDialog(project?'编辑项目':'新建项目',root=>{formField(root,'项目名称','native-project-name',{value:project?.name||'',required:true});formField(root,'根目录（每行一个绝对路径）','native-project-roots',{value:project?.roots?.map(r=>r.path).join('\n')||state.selectedCwd,multiline:true,required:true});},async root=>{
    const name=$('#native-project-name',root).value.trim(),paths=$('#native-project-roots',root).value.split('\n').map(v=>v.trim()).filter(Boolean);if(!name||!paths.length)throw new Error('请填写名称和目录');for(const path of paths)await rpc('fs/readDirectory',{path});const params={name,roots:paths.map(path=>({path}))};
    if(project)await rpc('project/update',{projectId:project.id,...params});else await rpc('project/create',{...params,idempotencyKey:crypto.randomUUID()});toast('项目已保存');
  });
}
function unassignedChat(){resetChat();state.selectedProject=null;showView('chat');toast('已新建分析。');}
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.composer'))closeCommandMenu();});
window.addEventListener('resize',positionCommandMenu);
$('#prompt').addEventListener('compositionstart',()=>{state.commandComposing=true;closeCommandMenu();});
$('#prompt').addEventListener('compositionend',()=>{state.commandComposing=false;updateCommandMenu();});
$('#unassigned-chat-button').onclick=()=>unassignedChat();
$('#mode-toggle').onclick=()=>changeModeWithFeedback(currentMode()==='plan'?'default':'plan').catch(report);
if($('#exit-plan-mode'))$('#exit-plan-mode').onclick=()=>changeModeWithFeedback('default').catch(report);
renderNativeMode();renderGoalBanner();
