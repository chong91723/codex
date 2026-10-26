'use strict';
// UI adapters use the public app-server protocol; the runtime is unmodified.
state.nativeModes=new Map();state.nativeGoals=new Map();state.draftMode='default';state.selectedProject=null;
// Native goal budgets count uncached input + output, unlike context occupancy.
const goalLabels={active:'进行中',paused:'已暂停',blocked:'等待处理',usageLimited:'额度受限',budgetLimited:'预算已用尽',complete:'已完成'};
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
function resetNativeUI(){state.draftMode='default';renderNativeMode();renderGoalBanner();}
function adoptNativeUI(thread){state.selectedProject=thread.projectId||null;renderNativeMode();renderGoalBanner();}
function nativeUIEvent(msg){
  const p=msg.params||{};
  if(msg.method==='thread/settings/updated'&&p.threadSettings?.collaborationMode)state.nativeModes.set(p.threadId,p.threadSettings.collaborationMode.mode);
  if(msg.method==='thread/goal/updated')state.nativeGoals.set(p.threadId,p.goal);
  if(msg.method==='thread/goal/cleared')state.nativeGoals.delete(p.threadId);
  if(msg.method==='thread/project/updated'&&p.threadId===state.thread?.id){state.thread.projectId=p.projectId;state.selectedProject=p.projectId;}
  if(['thread/settings/updated','turn/started','turn/completed','thread/goal/updated','thread/goal/cleared'].includes(msg.method))queueMicrotask(()=>{renderNativeMode();renderGoalBanner();if(msg.method==='turn/completed')restoreExecutionPlans();});
}
async function nativeSlashCommand(text){
  const actions={'/plan':()=>setNativeMode(currentMode()==='plan'?'default':'plan'),'/status':showNativeStatus,'/init':initializeWorkspace,'/feedback':showFeedback,'/goal':showGoalDialog,'/projects':showProjects,'/chat':unassignedChat,'/fast':toggleFast};
  if(!actions[text])return false;
  $('#prompt').value='';await actions[text]();return true;
}
function showNativeMenu(){
  const model=$('#model').value||state.threadSettings.get(state.thread?.id)?.model||state.runtimeDefaults?.model;
  openDialog('对话功能',root=>{
    const list=el('div','native-menu');
    const action=(label,description,fn,id)=>{const item=button('',()=>{$('#dialog').close();return fn();},'native-menu-item');if(id)item.id=id;item.append(el('strong','',label),el('span','subtle',description));list.append(item);return item;};
    action('初始化','为当前工作区生成 AGENTS.md；已有文件不会覆盖',initializeWorkspace,'menu-init');
    action(currentMode()==='plan'?'退出计划模式':'计划模式','先研究并提出计划，确认后再执行',()=>setNativeMode(currentMode()==='plan'?'default':'plan'),'menu-plan');
    action('在项目中使用','选择、新建或管理原生项目',showProjects,'menu-projects');
    if(selectedModelProvider()==='openai'&&/^gpt-|^o\d/.test(model||'')){
      const tier=state.modelDetails?.find(m=>m.model===model)?.serviceTiers?.find(t=>t.id==='priority');
      const item=action('快速档位',tier?(state.threadSettings.get(state.thread?.id)?.serviceTier==='priority'?'已开启 · 点击恢复标准速度':tier.description||'更快响应，会增加用量'):'当前模型未声明快速档位',toggleFast,'menu-fast');item.disabled=!tier;
    }
    action('状态','查看会话、模型、上下文、权限与原生额度',showNativeStatus,'menu-status');
    action('目标','明确设置需要持续推进的目标，并管理暂停与继续',showGoalDialog,'menu-goal');
    action('反馈','保存本地反馈包，或由你明确提交给 OpenAI',showFeedback,'menu-feedback');
    action('聊天','新建一个不关联项目的会话；保留 Codex 工具能力',unassignedChat,'menu-chat');
    root.append(list);
  },async()=>{},'关闭');
}
async function toggleFast(){
  const model=$('#model').value||state.threadSettings.get(state.thread?.id)?.model||state.runtimeDefaults?.model;
  if(selectedModelProvider()!=='openai'||!state.modelDetails?.find(m=>m.model===model)?.serviceTiers?.some(t=>t.id==='priority'))throw new Error('当前模型不支持原生快速档位');
  if(state.activeTurns.has(state.thread?.id))throw new Error('请等待当前任务结束');
  const thread=await ensureThread(),settings=state.threadSettings.get(thread.id)||{},tier=settings.serviceTier==='priority'?'default':'priority';
  await rpc('thread/settings/update',{threadId:thread.id,serviceTier:tier});settings.serviceTier=tier==='default'?null:tier;state.threadSettings.set(thread.id,settings);toast(tier==='priority'?'快速档位已开启，会增加用量':'已恢复标准档位');
}
async function initializeWorkspace(){
  openDialog('初始化工作区',root=>{root.append(el('p','','Codex 将检查当前工作区，再按官方初始化指令生成 AGENTS.md。已有 AGENTS.md 不会覆盖。'),el('p','subtle',state.selectedCwd));},async()=>{const {prompt}=await fetchJSON('/api/init-prompt');showView('chat');$('#prompt').value=prompt;await submitPrompt();},'开始初始化');
}
async function showNativeStatus(){
  const id=state.thread?.id,settings=state.threadSettings.get(id)||{},snapshot=contextSnapshot(),provider=id?modelProvider():selectedModelProvider();
  let quotas=null;if(provider==='openai'){try{quotas=await rpc('account/rateLimits/read',{});}catch(error){quotas={message:nativeErrorMessage(error)};}}
  openDialog('当前状态',root=>{
    const grid=el('div','context-stats');for(const [name,value]of [['会话 ID',id||'尚未发送'],['模型',settings.model||$('#model').value||state.runtimeDefaults?.model],['提供方',provider],['模式',currentMode()==='plan'?'计划':'默认'],['工作区',state.selectedCwd],['项目',state.thread?.projectId||state.selectedProject||'未关联'],['上下文占用',snapshot?snapshot.used.toLocaleString()+' / '+snapshot.limit?.toLocaleString()+' tokens':'尚未统计'],['审批策略',settings.approvalPolicy||state.runtimeDefaults?.approval_policy],['沙箱',settings.sandboxPolicy?.type||state.runtimeDefaults?.sandbox_mode]]){const row=el('div');row.append(el('span','subtle',name),el('strong','',typeof value==='string'?value:pretty(value)));grid.append(row);}root.append(grid);
    if(quotas)root.append(el('h3','','原生额度'),el('pre','',pretty(quotas)));else root.append(el('p','subtle','DeepSeek 未提供原生额度接口；这里不显示 ChatGPT 账号额度。'));
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
    await setNativeMode('default');$('#prompt').value='我已确认以下计划，请按照这个版本执行。若需调整，请先说明。\n\n'+plan;await submitPrompt();
  },'确认并执行');
}
function executionPlanKey(){return 'codex.execution-plans.'+state.runtimeInfo?.codexHome+'.'+state.thread?.id;}
function savedExecutionPlans(){try{return JSON.parse(localStorage.getItem(executionPlanKey())||'{}');}catch{return {};}}
function rememberExecutionPlan(p){
  if(!state.thread||p.threadId&&p.threadId!==state.thread.id)return;
  const turnId=p.turnId||state.activeTurns.get(state.thread.id);if(!turnId)return;
  const plans=savedExecutionPlans();plans[turnId]={explanation:p.explanation,plan:p.plan||[]};
  try{localStorage.setItem(executionPlanKey(),JSON.stringify(Object.fromEntries(Object.entries(plans).slice(-50))));}catch{}
  renderExecutionProgress(turnId,plans[turnId]);
}
function renderExecutionProgress(turnId,p){
  if(!p.plan?.length)return;let node=$$('[data-execution-plan]').find(n=>n.dataset.executionPlan===turnId);
  if(!node){node=el('details','message execution-progress');node.dataset.executionPlan=turnId;const group=$$('.activity-group').find(g=>g.dataset.turnId===turnId);if(group)group.before(node);else $('#messages').append(node);}
  const turn=state.turns.find(t=>t.id===turnId),complete=p.plan.filter(s=>s.status==='completed').length,current=p.plan.find(s=>s.status==='inProgress');
  const stopped=turn?.status==='interrupted';node.replaceChildren(el('summary','','执行计划 · '+complete+'/'+p.plan.length+' 已完成'+(stopped?' · 已停止':current?' · '+current.step:'')));
  const list=el('div','progress-steps');if(p.explanation)list.append(el('p','subtle',p.explanation));
  for(const step of p.plan)list.append(el('div','plan-step '+step.status,(step.status==='completed'?'✓ ':step.status==='inProgress'?'◉ ':'○ ')+step.step));
  list.append(el('p','subtle','进度由 Codex 的原生 update_plan 事件报告。停止任务不会回滚已完成的操作。'));node.append(list);
}
function restoreExecutionPlans(){if(!state.thread)return;for(const [id,p]of Object.entries(savedExecutionPlans()))if(state.turns.some(t=>t.id===id)||state.activeTurns.get(state.thread.id)===id)renderExecutionProgress(id,p);}
function renderGoalBanner(){
  let node=$('#goal-banner');if(!node){node=el('div','goal-banner');node.id='goal-banner';$('#plan-summary').before(node);}
  const goal=state.nativeGoals.get(state.thread?.id);node.hidden=!goal;node.replaceChildren();if(!goal)return;
  node.append(button('目标 · '+(goalLabels[goal.status]||goal.status)+' · '+goal.objective,showGoalDialog,'goal-link'),el('span','subtle',(goal.tokensUsed||0).toLocaleString()+' tokens'+(goal.tokenBudget?' / '+goal.tokenBudget.toLocaleString():'')));
}
async function showGoalDialog(){
  const thread=await ensureThread();const {goal}=await rpc('thread/goal/get',{threadId:thread.id});
  if(goal)state.nativeGoals.set(thread.id,goal);else state.nativeGoals.delete(thread.id);renderGoalBanner();
  openDialog('持续目标',root=>{
    root.append(el('p','subtle','明确设置目标后，Codex 会持续推进，直到完成、暂停或达到预算。普通对话不会自动创建目标。'));
    formField(root,'目标','goal-objective',{value:goal?.objective||'',multiline:true,required:true});
    root.append(el('p','subtle','目标预算按原生的未缓存输入与输出计数，和上下文占用不同；完整请求消耗见上下文详情。新会话首回合可能缺少目标计数基线，原生计数为 0 不代表没有消耗。'));
    formField(root,'Token 预算（可选）','goal-budget',{value:goal?.tokenBudget||'',type:'number'});$('#goal-budget',root).min='1';
    if(goal){root.append(el('p','',`${goalLabels[goal.status]||goal.status} · ${(goal.tokensUsed||0).toLocaleString()} tokens · ${goal.timeUsedSeconds||0} 秒`));const actions=el('div','card-actions');
      const change=status=>async()=>{if(status==='active'&&!state.activeTurns.has(thread.id))await rpc('thread/settings/update',{threadId:thread.id,collaborationMode:turnCollaborationMode()});await rpc('thread/goal/set',{threadId:thread.id,origin:'user',status});if(status==='paused'){const turn=state.activeTurns.get(thread.id);if(turn)await rpc('turn/interrupt',{threadId:thread.id,turnId:turn});}$('#dialog').close();renderGoalBanner();};
      actions.append(button('暂停目标并停止当前任务',change('paused')),button('继续目标',change('active')),button('移除目标',async()=>{await rpc('thread/goal/clear',{threadId:thread.id,origin:'user'});state.nativeGoals.delete(thread.id);const turn=state.activeTurns.get(thread.id);if(turn)await rpc('turn/interrupt',{threadId:thread.id,turnId:turn});$('#dialog').close();renderGoalBanner();}));root.append(actions);}
  },async root=>{const objective=$('#goal-objective',root).value.trim(),budget=$('#goal-budget',root).value;if(!objective)throw new Error('请输入明确目标');if(!state.activeTurns.has(thread.id))await rpc('thread/settings/update',{threadId:thread.id,collaborationMode:turnCollaborationMode()});const r=await rpc('thread/goal/set',{threadId:thread.id,origin:'user',objective,status:'active',tokenBudget:budget?Number(budget):null});state.nativeGoals.set(thread.id,r.goal);renderGoalBanner();},goal?'更新并继续目标':'设置并开始');
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
function showFeedback(){
  openDialog('反馈',root=>{
    root.append(el('p','subtle','本地保存不会上传。只有点击“明确提交给 OpenAI”才会向外发送描述；默认不附带日志。'));
    formField(root,'反馈描述','feedback-reason',{multiline:true,required:true});
    formField(root,'本地反馈包保存位置','feedback-path',{value:state.selectedCwd+'/codex-feedback-'+Date.now()+'.zip'});
    root.append(button('明确提交给 OpenAI',async()=>{const reason=$('#feedback-reason',root).value.trim();if(!reason)throw new Error('请输入描述');await rpc('feedback/upload',{classification:'bug',reason,threadId:state.thread?.id,includeLogs:false});$('#dialog').close();toast('反馈已提交');}));
  },async root=>{const reason=$('#feedback-reason',root).value.trim(),savePath=$('#feedback-path',root).value.trim();if(!reason||!savePath)throw new Error('请填写描述和保存位置');const r=await rpc('feedback/save',{classification:'bug',reason,threadId:state.thread?.id,includeLogs:false,savePath});toast('已保存本地反馈包：'+r.savedPath);},'仅保存本地');
}
$('#chat-features').onclick=showNativeMenu;
$('#mode-toggle').onclick=()=>setNativeMode(currentMode()==='plan'?'default':'plan').catch(report);
renderNativeMode();renderGoalBanner();
