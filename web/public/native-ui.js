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
function renderNativeMode(){const node=$('#mode-toggle');if(!node)return;node.textContent=currentMode()==='plan'?'计划模式':'默认模式';node.classList.toggle('plan-active',currentMode()==='plan');node.disabled=state.nativeModePending||state.threadArchived||state.threadBusy||state.activeTurns.has(state.thread?.id);renderContextUsage();}
async function setNativeMode(mode){
  if(state.nativeModePending)throw new Error('模式正在切换，请稍候');
  if(state.activeTurns.has(state.thread?.id))throw new Error('请先停止当前任务，再切换模式');
  if(state.threadArchived||state.threadBusy)throw new Error('请先恢复可编辑的会话');
  state.nativeModePending=true;renderNativeMode();
  try{if(state.thread){const id=state.thread.id;await rpc('thread/settings/update',{threadId:id,collaborationMode:turnCollaborationMode(mode)});state.nativeModes.set(id,mode);}
  else state.draftMode=mode;}finally{state.nativeModePending=false;renderNativeMode();}
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
function composerThreadAction(action){if(!state.thread)throw new Error('请先选择已有会话，再使用此命令；没有创建会话或发送任务。');return threadAction(action);}
function nativeSlashActions(){return {'/compact':()=>composerThreadAction('compact'),'/fork':()=>composerThreadAction('fork'),'/export':()=>composerThreadAction('export'),'/review':()=>composerThreadAction('review'),'/rollback':()=>composerThreadAction('revert'),'/plan':()=>setNativeMode(currentMode()==='plan'?'default':'plan'),'/status':showNativeStatus,'/init':initializeWorkspace,'/goal':showGoalDialog,'/projects':showProjects,'/chat':unassignedChat,'/model':()=>showComposerSetting('model'),'/reasoning':()=>showComposerSetting('effort')};}
async function nativeSlashCommand(text){
  const actions=nativeSlashActions();if(!Object.hasOwn(actions,text))return false;
  const draft=saveComposer(),raw=draft.text,revision=draft.revision||0;await actions[text]();
  if(draft.text===raw&&(draft.revision||0)===revision){draft.text='';persistDrafts();if(composerState()===draft){$('#prompt').value='';resizePrompt();closeCommandMenu();}}return true;
}
// Commands and installed skills share the composer's selection/focus lifecycle.
function commandEntries(){return [
  {command:'/compact',title:'压缩上下文',description:'手动压缩当前会话的上下文',icon:'code'},
  {command:'/fork',title:'分叉会话',description:'从当前会话创建新的分支',icon:'chat'},
  {command:'/export',title:'导出会话',description:'下载当前会话的完整 JSON 历史',icon:'file'},
  {command:'/review',title:'审查未提交更改',description:'审查当前工作区的未提交代码修改',icon:'check'},
  {command:'/rollback',title:'回退用户任务',description:'选择要移除的会话任务，不撤销磁盘文件',icon:'file'},
  {command:'/mcp',title:'MCP',description:'显示 MCP 服务器状态',icon:'mcp'},
  {command:'/init',title:'初始化',description:'创建包含项目指令的 AGENTS.md 文件',icon:'file'},
  {command:'/projects',title:'在项目中使用',description:'为聊天选择或管理项目',icon:'folder'},
  {command:'/reasoning',title:'推理',description:'选择下一次任务的思考强度',icon:'code'},
  {command:'/model',title:'模型',description:'选择下一次任务的模型',icon:'grid'},
  {command:'/status',title:'状态',description:'显示聊天 ID、上下文用量和权限',icon:'code'},
  {command:'/goal',title:'目标',description:'设置要持续追求的目标',icon:'check'},
  {command:'/chat',title:'聊天',description:'新建不关联项目的会话',icon:'chat'},
  {command:'/plan',title:'计划模式',description:currentMode()==='plan'?'退出计划模式':'开启计划模式',icon:'code'},
  {command:'/skills',title:'技能管理',description:'查看、启用或停用内置技能',icon:'skill'},
  {command:'/settings',title:'设置',description:'工作区、模型提供方和原生配置',icon:'settings'},
  {command:'/native',title:'原生协议',description:'查看可用范围和完整定义',icon:'code'}
].map(entry=>({...entry,id:'menu-'+entry.command.slice(1),kind:'command'}));}
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
  const draft=composerState();
  if(entry.kind==='skill'){
    draft.skills=[...(draft.skills||[]).filter(skill=>skill.name!==entry.skill.name),{name:entry.skill.name,path:entry.skill.path}];$('#prompt').value='$'+entry.skill.name+' ';
  }else $('#prompt').value=entry.command;
  saveComposer();draft.revision=(draft.revision||0)+1;resizePrompt();updateSend();closeCommandMenu();$('#prompt').focus();const end=$('#prompt').value.length;$('#prompt').setSelectionRange(end,end);
}
function renderCommandMenu(){
  const value=state.commandMenu,menu=$('#command-menu');if(!value)return closeCommandMenu();
  const scroll=menu.scrollTop;menu.replaceChildren();let skillsHeading=false;
  value.entries.forEach((entry,index)=>{
    if(entry.kind==='skill'&&!skillsHeading){menu.append(el('div','command-section','技能'));skillsHeading=true;}
    const option=button('',()=>chooseCommand(entry),'command-option');option.id=entry.id;if(entry.skill)option.dataset.skillName=entry.skill.name;option.title=entry.command||entry.skill.name;option.setAttribute('role','option');option.setAttribute('aria-selected',String(index===value.index));option.onmousedown=event=>event.preventDefault();
    option.append(icon(entry.icon||'skill'),el('span','command-title',entry.title),el('span','command-description',entry.description));if(entry.kind==='skill')option.append(el('span','command-scope',entry.scope));menu.append(option);
  });
  if(value.catalog.loading)menu.append(el('p','command-notice','正在读取当前工作区的技能…'));
  if(value.catalog.error){const error=el('div','command-notice');error.append(el('span','','技能读取失败：'+value.catalog.error),button('重试',()=>{value.catalog=null;updateCommandMenu();},'text-button'));menu.append(error);}
  if(!value.entries.length&&!value.catalog.loading&&!value.catalog.error)menu.append(el('p','command-notice','没有匹配的命令或已启用技能'));
  menu.hidden=false;$('#view-chat').classList.add('command-menu-open');menu.scrollTop=scroll;$('#prompt').setAttribute('aria-expanded','true');
  const active=value.entries[value.index];if(active){$('#prompt').setAttribute('aria-activedescendant',active.id);document.getElementById(active.id)?.scrollIntoView({block:'nearest'});}else $('#prompt').removeAttribute('aria-activedescendant');positionCommandMenu();
}
function updateCommandMenu(){
  const text=$('#prompt').value;if(state.commandComposing||state.view!=='chat'||!/^\/[^\s]*$/.test(text))return closeCommandMenu();
  const previous=state.commandMenu,query=text.slice(1).toLocaleLowerCase();let catalog=previous?.catalog;
  if(!catalog||catalog.connection!==state.ws||catalog.cwd!==state.selectedCwd){
    catalog={connection:state.ws,cwd:state.selectedCwd,loading:true,skills:[]};
    rpc('skills/list',{cwds:[catalog.cwd],forceReload:true}).then(result=>{
      const seen=new Set();catalog.skills=(result.data||[]).flatMap(group=>group.skills||[]).filter(skill=>{if(skill.enabled===false||!isRetainedNativeSkill(skill)||seen.has(skill.path))return false;seen.add(skill.path);return true;});
      const failures=(result.data||[]).flatMap(group=>group.errors||[]);if(failures.length)catalog.error=failures.map(error=>error.message).join('；');
    }).catch(error=>{catalog.error=nativeErrorMessage(error);}).finally(()=>{catalog.loading=false;if(state.commandMenu?.catalog===catalog&&catalog.connection===state.ws)updateCommandMenu();});
  }
  const skills=catalog.skills.map((skill,index)=>{const p=skillPresentation(skill);return {kind:'skill',id:'menu-skill-'+index,skill,title:p.title,description:state.skillCatalog?.[skill.name]?p.description:(skill.shortDescription||skill.description||p.description),scope:skill.scope==='repo'?'项目':skill.scope==='system'?'内置':'个人'};});
  const score=entry=>!query?0:([entry.command,entry.title,entry.skill?.name].filter(Boolean).join(' ')).toLocaleLowerCase().includes(query)?0:1;
  const entries=[...commandEntries(),...skills].filter(entry=>([entry.command,entry.title,entry.description,entry.skill?.name].filter(Boolean).join(' ')).toLocaleLowerCase().includes(query)).sort((a,b)=>score(a)-score(b));
  const active=previous?.text===text?previous.entries[previous.index]?.id:null;
  state.commandMenu={text,entries,index:Math.max(0,entries.findIndex(entry=>entry.id===active)),draft:composerState(),catalog};renderCommandMenu();
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
  openDialog('初始化工作区',root=>{root.append(el('p','','Codex 将检查当前工作区，再按官方初始化指令生成 AGENTS.md。已有 AGENTS.md 不会覆盖。'),el('p','subtle',state.selectedCwd));},async()=>{const {prompt}=await fetchJSON('/api/init-prompt');showView('chat');$('#prompt').value=prompt;await submitPrompt();},'开始初始化');
}
async function showNativeStatus(){
  const id=state.thread?.id,settings=state.threadSettings.get(id)||{},snapshot=contextSnapshot(),provider=id?modelProvider():selectedModelProvider();
  openDialog('当前状态',root=>{
    const grid=el('div','context-stats');for(const [name,value]of [['会话 ID',id||'尚未发送'],['模型',settings.model||$('#model').value||state.runtimeDefaults?.model],['提供方',provider],['模式',currentMode()==='plan'?'计划':'默认'],['工作区',state.selectedCwd],['项目',state.thread?.projectId||state.selectedProject||'未关联'],['上下文占用',snapshot?snapshot.used.toLocaleString()+' / '+snapshot.limit?.toLocaleString()+' tokens':'尚未统计'],['审批策略',settings.approvalPolicy||state.runtimeDefaults?.approval_policy],['沙箱',settings.sandboxPolicy?.type||state.runtimeDefaults?.sandbox_mode]]){const row=el('div');row.append(el('span','subtle',name),el('strong','',typeof value==='string'?value:pretty(value)));grid.append(row);}root.append(grid);
  },async()=>{},'关闭');
}
function renderProposedPlan(item,done){
  const node=el('section','message proposed-plan');node.dataset.proposedPlan=item.id;
  node.append(el('h3','','建议计划'),markdown(item.text||'正在形成计划…'));
  if(done){const actions=el('div','card-actions');actions.append(button('确认 / 修改后执行',()=>reviewPlan(item),'solid-button'),button('继续修改计划',async()=>{await setNativeMode('plan');$('#prompt').focus();toast('请在输入框说明需要调整的部分');}));node.append(actions,el('p','subtle','确认前保持计划模式。执行中的普通任务清单由模型更新进度，不会逐步弹出计划确认。'));}
  return node;
}
function reviewPlan(item){
  if(state.activeTurns.has(state.thread?.id))throw new Error('请等待计划生成完成');
  openDialog('确认执行计划',root=>{root.append(el('p','','可以直接修改下方计划。确认后在当前会话切换至默认模式并开始执行；工具权限仍由原生审批策略控制。'));formField(root,'执行计划','approved-plan',{value:item.text||'',multiline:true,required:true});},async root=>{
    const plan=$('#approved-plan',root).value.trim();if(!plan)throw new Error('计划不能为空');
    await setNativeMode('default');await submitPrompt({text:'我已确认以下计划，请按照这个版本执行。若需调整，请先说明。开始执行前请使用原生 update_plan 建立任务清单，并按实际进展更新；完成后回答我的问题。\n\n'+plan,preserveDraft:true});
  },'确认并执行');
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
  if(!summary){summary=el('summary','execution-progress-heading');summary.append(el('span','execution-progress-status'),el('strong','execution-progress-count'),el('span','execution-progress-current'),el('span','execution-progress-toggle','查看步骤'));node.append(summary,el('div','progress-steps'));}
  node.dataset.progressStatus=progress.status;
  const text=(selector,value)=>{const target=$(selector,node);if(target.textContent!==value)target.textContent=value;};
  text('.execution-progress-status',progress.label);text('.execution-progress-count',progress.completed+'/'+progress.total+' 步已完成');
  text('.execution-progress-current',progress.current?(progress.status==='interrupted'?'停止于：':'当前：')+progress.current:'');
  const signature=JSON.stringify([p.explanation,p.plan]);
  if(node.dataset.planSignature!==signature){
    const list=$('.progress-steps',node);list.replaceChildren();
    if(p.explanation)list.append(el('p','subtle',p.explanation));
    for(const step of p.plan)list.append(el('div','plan-step '+step.status,(step.status==='completed'?'✓ ':step.status==='inProgress'?'◉ ':'○ ')+step.step));
    list.append(el('p','execution-progress-note','按 Codex 原生 update_plan 报告的步骤计数，不代表用时百分比。停止后可修改要求并继续；已完成操作不会回滚。'));node.dataset.planSignature=signature;
  }
  node.setAttribute('aria-label',(banner?'当前任务进度':'执行计划')+' · '+progress.label+' · '+progress.completed+'/'+progress.total+' 步已完成');
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
function unassignedChat(){resetChat();state.selectedProject=null;showView('chat');toast('新聊天不关联项目，仍使用当前工作目录');}
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.composer'))closeCommandMenu();});
window.addEventListener('resize',positionCommandMenu);
$('#prompt').addEventListener('compositionstart',()=>{state.commandComposing=true;closeCommandMenu();});
$('#prompt').addEventListener('compositionend',()=>{state.commandComposing=false;updateCommandMenu();});
$('#mode-toggle').onclick=()=>setNativeMode(currentMode()==='plan'?'default':'plan').catch(report);
renderNativeMode();renderGoalBanner();
