'use strict';
// Permission choices are per conversation. Native settings notifications, rather
// than an empty RPC acknowledgement, confirm changes to an existing thread.
const permissionModes={
  ask:{label:'请求批准',approvalPolicy:'on-request',approvalsReviewer:'user',sandbox:'workspace-write',profile:':workspace',description:'在工作区沙箱内执行任务；需要越过权限边界时由你审批。'},
  auto:{label:'帮我批准',approvalPolicy:'on-request',approvalsReviewer:'auto_review',sandbox:'workspace-write',profile:':workspace',description:'保留工作区沙箱，由 Codex 原生审核代理评估需要审批的操作；可能允许或拒绝。'},
  full:{label:'完全访问权限',approvalPolicy:'never',approvalsReviewer:'user',sandbox:'danger-full-access',profile:':danger-full-access',description:'不使用 Codex 文件和网络沙箱，不再请求操作审批；可访问服务端运行账户有权访问的资源。'}
};
state.permissionUpdates=new Map();state.permissionUnconfirmed=new Set();state.permissionWorkspacePolicies=new Map();
function permissionWorkspacePolicy(settings=null,configuration=state.runtimeDefaults||{}){
  if(settings?.sandboxPolicy?.type==='workspaceWrite')return {...settings.sandboxPolicy,writableRoots:[...settings.sandboxPolicy.writableRoots]};
  const config=configuration.sandbox_workspace_write||{};
  return {type:'workspaceWrite',writableRoots:[...(config.writable_roots||[])],networkAccess:config.network_access===true,excludeTmpdirEnvVar:config.exclude_tmpdir_env_var===true,excludeSlashTmp:config.exclude_slash_tmp===true};
}
function permissionMode(settings){
  if(!settings)return null;
  return Object.entries(permissionModes).find(([,mode])=>settings.approvalPolicy===mode.approvalPolicy&&settings.approvalsReviewer===mode.approvalsReviewer&&settings.sandboxPolicy?.type===(mode.sandbox==='workspace-write'?'workspaceWrite':'dangerFullAccess'))?.[0]||'custom';
}
function defaultPermissionSettings(){
  const config=state.permissionDefaultConfig||state.runtimeDefaults;if(!config)return null;
  const policy=config.sandbox_mode==='workspace-write'?permissionWorkspacePolicy(null,config):config.sandbox_mode==='danger-full-access'?{type:'dangerFullAccess'}:config.sandbox_mode==='read-only'?{type:'readOnly',networkAccess:false}:null;
  return policy&&config.approval_policy?{approvalPolicy:config.approval_policy,approvalsReviewer:config.approvals_reviewer||'user',sandboxPolicy:policy}:null;
}
function refreshPermissionDefaults(config){state.permissionDefaultConfig=config;renderPermissions();}
function currentPermissionSettings(){return state.thread?state.threadSettings.get(state.thread.id):defaultPermissionSettings();}
function permissionUnavailable(){
  if(!state.ready)return '原生连接尚未就绪';
  if(state.threadLoading)return '正在恢复会话，请稍候';
  if(state.restoreError)return '请先恢复会话';
  if(state.threadArchived||state.threadBusy)return '请先恢复为可编辑的会话';
  if(state.activeTurns.has(state.thread?.id)||state.thread?.status?.type==='active')return '请先停止正在执行的任务，再更改权限';
  if([...state.stopOperations.values()].some(operation=>operation.threadId===state.thread?.id&&operation.status==='pending'))return '本轮命令仍在回收，请等待停止结果后更改权限';
  if(composerState().pending)return '正在发送任务，请稍候';
  if(state.permissionUpdates.has(state.thread?.id))return '正在等待原生确认权限';
  return '';
}
function permissionSubmissionBlocked(){return !!state.thread&&(state.permissionUpdates.has(state.thread.id)||state.permissionUnconfirmed.has(state.thread.id));}
function renderPermissions(){
  const node=$('#permissions-button');if(!node)return;
  const id=state.thread?.id,mode=id?permissionMode(currentPermissionSettings()):composerState().pendingPermissions?.mode||permissionMode(currentPermissionSettings());
  const pending=id&&state.permissionUpdates.has(id),unknown=id&&state.permissionUnconfirmed.has(id);
  const label=pending?'正在确认权限…':unknown?'权限待确认':permissionModes[mode]?.label||(mode==='custom'?'自定义权限':'默认权限');
  node.replaceChildren(el('span','',label),icon('down'));node.dataset.mode=unknown?'unconfirmed':mode||'default';
  const reason=permissionUnavailable();node.disabled=!!reason||!!state.permissionReading;
  node.title=reason||'更改当前会话的审批和沙箱权限';node.ariaLabel='Agent 权限：'+label;node.setAttribute('aria-busy',String(!!pending||!!state.permissionReading));
}
function permissionsFromSnapshot(id,settings){
  state.permissionUnconfirmed.delete(id);
  if(settings?.sandboxPolicy?.type==='workspaceWrite')state.permissionWorkspacePolicies.set(id,permissionWorkspacePolicy(settings));
  const pending=state.permissionUpdates.get(id);
  if(pending&&permissionMode(settings)===pending.mode&&samePermissionPolicy(settings.sandboxPolicy,pending.sandboxPolicy))pending.finish({settings});
  renderPermissions();
}
function cancelPermissionUpdates(message){
  for(const [id,pending]of state.permissionUpdates){state.permissionUnconfirmed.add(id);pending.finish({error:new Error(message)});}
}
function samePermissionPolicy(left,right){
  const normalize=value=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalize(value[key])])):value;
  return JSON.stringify(normalize(left))===JSON.stringify(normalize(right));
}
function permissionsEvent(msg){
  const p=msg.params||{};
  if(msg.method==='thread/settings/updated'){
    permissionsFromSnapshot(p.threadId,p.threadSettings);
    updateSend();
  }
  if(msg.method==='thread/deleted'){
    state.permissionUpdates.get(p.threadId)?.finish({error:new Error('目标会话已删除')});state.permissionUnconfirmed.delete(p.threadId);state.permissionWorkspacePolicies.delete(p.threadId);
  }
}
async function permissionChoices(threadId,cwd){
  const [config,requirements,features,profiles]=await Promise.all([
    rpc('config/read',{includeLayers:false,cwd}),rpc('configRequirements/read',{}),paged('experimentalFeature/list',{threadId:threadId||undefined,limit:100}),paged('permissionProfile/list',{cwd,limit:100})
  ]);
  const policy=requirements.requirements||{},guardian=features.find(feature=>feature.name==='guardian_approval');
  const blocked={};
  for(const [key,mode]of Object.entries(permissionModes)){
    let reason='';
    if(policy.allowedApprovalPolicies&&!policy.allowedApprovalPolicies.some(value=>value===mode.approvalPolicy))reason='服务端策略不允许此审批策略';
    if(policy.allowedApprovalsReviewers&&!policy.allowedApprovalsReviewers.includes(mode.approvalsReviewer))reason='服务端策略不允许此审核方式';
    if(policy.allowedSandboxModes&&!policy.allowedSandboxModes.includes(mode.sandbox))reason='服务端策略不允许此沙箱权限';
    const profile=profiles.find(profile=>profile.id===mode.profile);if(profile?.allowed===false)reason='服务端策略不允许此权限配置';
    if(key==='auto'&&guardian?.enabled!==true)reason='当前原生配置未启用自动审批审核';
    blocked[key]=reason;
  }
  refreshPermissionDefaults(config.config);return {blocked,config:config.config};
}
async function applyPermissionMode(mode,context,choices){
  const spec=permissionModes[mode];if(!spec)throw new Error('请选择权限模式');
  if(context.generation!==state.navigationGeneration||context.id!==state.thread?.id||context.draft!==composerState())throw new Error('当前会话已切换，请重新打开权限菜单');
  const unavailable=permissionUnavailable();if(unavailable)throw new Error(unavailable);
  if(choices.blocked[mode])throw new Error(choices.blocked[mode]);
  if(!context.id){context.draft.pendingPermissions={mode};renderPermissions();return;}
  if(state.permissionUnconfirmed.has(context.id))throw new Error('上一次权限更改尚未确认，请重新打开会话核对后再操作');
  const settings=state.threadSettings.get(context.id);if(permissionMode(settings)===mode)return;
  const sandboxPolicy=mode==='full'?{type:'dangerFullAccess'}:permissionWorkspacePolicy(settings?.sandboxPolicy?.type==='workspaceWrite'?settings:{sandboxPolicy:state.permissionWorkspacePolicies.get(context.id)},choices.config);
  let resolve,timer;const confirmation=new Promise(done=>{resolve=done;});
  const pending={mode,sandboxPolicy,settled:false,finish:result=>{if(pending.settled)return;pending.settled=true;clearTimeout(timer);resolve(result);}};
  timer=setTimeout(()=>{state.permissionUnconfirmed.add(context.id);pending.finish({error:new Error('权限更改尚未收到原生确认；请重新打开会话核对后继续，不会自动重试。')});},30000);
  state.permissionUpdates.set(context.id,pending);updateSend();
  try{
    rpc('thread/settings/update',{threadId:context.id,approvalPolicy:spec.approvalPolicy,approvalsReviewer:spec.approvalsReviewer,...(mode!=='full'&&settings?.sandboxPolicy?.type==='workspaceWrite'?{}:{sandboxPolicy})}).catch(error=>pending.finish({error}));
    const result=await confirmation;if(result.error)throw result.error;
  }finally{clearTimeout(timer);if(state.permissionUpdates.get(context.id)===pending)state.permissionUpdates.delete(context.id);updateSend();}
}
function permissionStartParams(draft){
  const spec=permissionModes[draft.pendingPermissions?.mode];
  return spec?{approvalPolicy:spec.approvalPolicy,sandbox:spec.sandbox,config:{approvals_reviewer:spec.approvalsReviewer}}:{};
}
function confirmStartedPermissions(draft,result){
  const requested=draft.pendingPermissions?.mode;if(!requested)return;
  const actual={approvalPolicy:result.approvalPolicy,approvalsReviewer:result.approvalsReviewer,sandboxPolicy:result.sandbox};
  if(permissionMode(actual)!==requested)throw new Error('原生新会话权限与所选模式不一致，任务尚未发送；请检查当前权限后重试。');
  delete draft.pendingPermissions;
}
async function showPermissions(){
  const reason=permissionUnavailable();if(reason)throw new Error(reason);
  const context={id:state.thread?.id,generation:state.navigationGeneration,draft:composerState()},cwd=state.selectedCwd;
  state.permissionReading=true;renderPermissions();
  let choices;
  try{choices=await permissionChoices(context.id,cwd);}finally{state.permissionReading=false;renderPermissions();}
  if(context.generation!==state.navigationGeneration||context.id!==state.thread?.id)return;
  const mode=context.id?permissionMode(currentPermissionSettings()):context.draft.pendingPermissions?.mode||permissionMode(defaultPermissionSettings());
  openDialog('Agent 权限',root=>{
    const summary=el('p','subtle',context.id?'仅更改当前会话后续任务的权限；其他会话和全局默认值保持原样。':'为这个新会话选择权限；首次发送时交由 Codex 原生创建并确认。');root.append(summary);
    if(!permissionModes[mode])root.append(el('p','permission-current','当前使用'+(mode==='custom'?'自定义权限':'原生默认权限')+'；选择下面任一模式后才会更改。'));
    for(const [key,spec]of Object.entries(permissionModes)){
      const label=el('label','permission-choice'),input=el('input');input.type='radio';input.name='permission-mode';input.value=key;input.checked=mode===key;input.disabled=!!choices.blocked[key];
      const text=el('span');text.append(el('strong','',spec.label),el('small','',spec.description));if(choices.blocked[key])text.append(el('small','permission-blocked',choices.blocked[key]));label.append(input,text);root.append(label);
    }
    root.append(el('p','permission-full-warning','完全访问权限会取消 Codex 的执行沙箱，但不会获得运行账户本身没有的系统权限，也不提供租户隔离。选择后点击「应用权限」才会生效。'));
  },async root=>{const mode=$('input[name="permission-mode"]:checked',root)?.value;await applyPermissionMode(mode,context,choices);},'应用权限');
}
$('#permissions-button').onclick=()=>showPermissions().catch(report);renderPermissions();
