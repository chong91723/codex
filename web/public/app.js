'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
const icon = name => { const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS(node.namespaceURI, 'use'); use.setAttribute('href', '#i-' + name); node.append(use); return node; };
const pretty = value => JSON.stringify(value, null, 2);
function configDiff(before,after,prefix=''){const edits=[];const object=value=>value&&typeof value==='object'&&!Array.isArray(value);for(const key of new Set([...Object.keys(before),...Object.keys(after)])){const segment=/^[A-Za-z0-9_-]+$/.test(key)?key:JSON.stringify(key);const path=prefix?prefix+'.'+segment:segment;if(!(key in after)){edits.push({keyPath:path,value:null,mergeStrategy:'replace'});continue;}if(object(before[key])&&object(after[key]))edits.push(...configDiff(before[key],after[key],path));else if(JSON.stringify(before[key])!==JSON.stringify(after[key]))edits.push({keyPath:path,value:after[key],mergeStrategy:'replace'});}return edits;}
const safeURL = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
const state = { ws: null, pending: new Map(), counter: 0, ready: false, view: 'chat', thread: null, threadArchived:false, threadBusy:false, attachmentLoads:0, threadSettings:new Map(), imageCache:new Map(), mcpCache:new Map(), mcpRequests:new Map(), mcpRevision:0, skillGroups:new Set(["common","custom"]), skillQuery:"", runtimeDefaults:null, turns: [], items: new Map(), live: new Map(), activeTurns: new Map(), threads: [], cursor: null, archived: false, attachments: [], events: [], requests: new Map(), models: [], status: null, schema: null, serverSchema: null, currentMethod: null, reconnect: null, selectedCwd: localStorage.getItem('codex.cwd') || '', listGeneration: 0, navigationGeneration:0, threadLoading:false, restoreError:false };
state.knownThreads=new Map();state.responseSequence=new WeakMap();state.eventSequence=0;state.hydration=null;
try{state.archived=sessionStorage.getItem('codex.historyArchived')==='1';}catch{}
state.composers = new Map(); state.composerKey = 'new'; state.finishedTurns = new Set(); state.interrupting = new Set(); state.stopOperations = new Map(); state.turnCommands = new Map();
let toastTimer, searchTimer, term, termWS, termResize, termFit, termResizeFrame;
function toast(message) { const root=$('#toast'),text=el('span','toast-message',message),close=el('button','toast-close','×');close.type='button';close.ariaLabel='关闭提示';close.onclick=()=>{root.hidden=true;clearTimeout(toastTimer);};root.replaceChildren(text,close);root.hidden=false;positionToast();clearTimeout(toastTimer);toastTimer=setTimeout(()=>root.hidden=true,5500); }
function positionToast(){const root=$('#toast'),text=$('.toast-message',root);if(root.hidden||!text)return;const bottom=state.view==='chat'&&!$('#view-chat').hidden?$('.composer').getBoundingClientRect().top:innerHeight;text.style.maxHeight=Math.max(40,Math.min(220,bottom-78-36))+'px';}
// Drafts belong to a conversation, including work still awaiting an RPC acknowledgement.
function composerState(key=state.composerKey) {
  if(!state.composers.has(key)) {
    let text='';try{text=JSON.parse(sessionStorage.getItem('codex.drafts')||'{}')[key]||'';}catch{}
    state.composers.set(key,{text,attachments:[],loads:0,pending:false,follow:true,scrollTop:null});
  }
  return state.composers.get(key);
}
function persistDrafts() {
  try { const drafts=JSON.parse(sessionStorage.getItem('codex.drafts')||'{}');for(const [key,draft]of state.composers){if(draft.text)drafts[key]=draft.text;else delete drafts[key];}sessionStorage.setItem('codex.drafts',JSON.stringify(drafts)); }
  catch { if(!state.draftStorageError){state.draftStorageError=true;toast('浏览器无法保存草稿；当前页面仍保留输入，请在关闭前复制。');} }
}
function forgetThreadDraft(threadId){
  state.composers.delete(threadId);
  try{const drafts=JSON.parse(sessionStorage.getItem('codex.drafts')||'{}');delete drafts[threadId];sessionStorage.setItem('codex.drafts',JSON.stringify(drafts));}
  catch(error){toast('会话历史已删除，但浏览器草稿未能清除：'+nativeErrorMessage(error)+'。请清除此页面的站点数据。');}
}
function resizePrompt(){const node=$('#prompt');node.style.height='auto';node.style.height=Math.min(240,node.scrollHeight)+'px';positionToast();}
function saveComposer(){const draft=composerState();draft.text=$('#prompt').value;persistDrafts();return draft;}
function rememberScroll(){if(state.threadLoading)return;const node=$('#conversation-scroll'),draft=composerState();draft.scrollTop=node.scrollTop;draft.follow=node.scrollHeight-node.scrollTop-node.clientHeight<80;}
function switchComposer(key,fresh=false){
  if(typeof closeCommandMenu==='function')closeCommandMenu();
  if(state.composerInitialized)saveComposer();if(fresh)state.composers.set(key,{text:'',attachments:[],loads:0,pending:false,follow:true,scrollTop:null});state.composerInitialized=true;state.composerKey=key;const draft=composerState();state.attachments=draft.attachments;state.attachmentLoads=draft.loads;
  $('#prompt').value=draft.text;resizePrompt();renderAttachments();
}
function restoreScroll(){const node=$('#conversation-scroll'),draft=composerState();node.scrollTop=draft.follow||draft.scrollTop==null?node.scrollHeight:draft.scrollTop;updateScrollControl();}
function updateScrollControl(){const node=$('#conversation-scroll');$('#jump-latest').hidden=composerState().follow||node.scrollHeight<=node.clientHeight;}
function nativeErrorMessage(error){const message=error?.message||String(error);if(/cf_chl_|challenge-platform/i.test(message))return '远端服务要求浏览器验证（HTTP 403）。请检查代理出口，或在官方服务完成验证后重试。';if(/<html/i.test(message))return '远端服务返回网页错误，请检查网络连接和登录状态。';return message;}
function report(error) { toast(nativeErrorMessage(error)); }
function button(label, fn, cls = 'small-button') { const node = el('button', cls, label); node.type = 'button'; node.onclick = () => Promise.resolve().then(fn).catch(report); return node; }
function redact(value) { if (Array.isArray(value)) return value.map(redact); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, /token|secret|api.?key|authorization/i.test(key) && typeof val === 'string' ? '[已隐藏]' : redact(val)])); return value; }
// Product scope follows the pinned runtime; schema visibility is not availability.
function scopeExclusion(method,params){
  if(method.startsWith('remoteControl/')&&!['remoteControl/disable','remoteControl/status/read'].includes(method))return '此远程控制路径已移除。';
  if(method.startsWith('account/'))return '账号登录及订阅功能已移除；请通过模型提供方环境变量配置凭据。';
  if(method.startsWith('feedback/'))return '反馈功能已移除。';
  if(method.startsWith('app/'))return '云端应用已移除；可使用本地插件和自定义 MCP。';
  if(method.startsWith('userVerification/')||method.startsWith('plugin/share/'))return '依赖云端账号的验证与插件分享已移除。';
  if(method==='thread/realtime/start')return '当前没有为 DeepSeek Flash 配置可用的实时语音服务。';
  if(method==='skills/config/write'&&params?.enabled&&!isRetainedNativeSkill({scope:'system',name:params.path?.split('/').at(-2),path:params.path}))return '仅支持启用本版本 Codex 源码自带的保留技能。';
  if(method==='mock/experimentalMethod')return '上游协议测试接口，不属于用户业务能力。';
  return '';
}
function isRemovedModel(model,provider){return provider==='openai'||/^(?:gpt-|chatgpt|o[1-9](?:-|$)|codex-mini|dall-e)/i.test(model||'');}
function isRetainedNativeSkill(skill){
  const names=['openai-docs','review-agent','skill-creator','skill-installer'];
  return skill.scope==='system'&&names.includes(skill.name)&&skill.path===state.runtimeInfo?.codexHome?.replace(/\/$/,'')+'/skills/.system/'+skill.name+'/SKILL.md';
}
function rpc(method, params = {}, timeout = 120000) {
  const excluded=scopeExclusion(method,params);if(excluded)return Promise.reject(new Error(excluded));
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('原生运行时尚未连接'));
  const id = ++state.counter;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { state.pending.delete(id); reject(new Error(method + ' 等待超时；请求可能仍在原生运行时执行，请查看事件后决定是否重试。')); }, timeout);
    state.pending.set(id, { resolve, reject, timer });
    state.ws.send(JSON.stringify({ id, method, params }));
  });
}
function sendResponse(request,result) {
  if(state.requests.get(String(request.id))!==request||request.connection!==state.ws||!state.ready||state.ws?.readyState!==WebSocket.OPEN)throw new Error('此审批所属连接已失效，请查看重连后的待处理请求。');
  if(request.responded)return;
  state.ws.send(JSON.stringify({id:request.id,result}));request.responded=true;renderRequests();
}
function setConnection(status, text) { $('#connection').className = 'connection ' + status; $('#connection').replaceChildren(el('i'), document.createTextNode(text)); }
async function connect() {
  if(typeof cancelPermissionUpdates==='function')cancelPermissionUpdates('原生连接正在重建，请重新打开会话核对权限');
  const connectionGeneration=state.connectionGeneration=(state.connectionGeneration||0)+1;
  clearTimeout(state.reconnect);state.threadLoading=!!threadRoute().id;state.ready=false;state.requests.clear();state.activeTurns.clear();state.interrupting.clear();renderRequests();renderThreadList();updateSend();setConnection('', '连接中');
  if (state.ws && state.ws.readyState !== WebSocket.CLOSED) { state.ws.onclose=null; state.ws.close(); for(const pending of state.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('原生连接正在重建'));}state.pending.clear(); }
  state.ws=null;
  // A local server restart rotates its HttpOnly session cookie. Re-establish
  // the same-origin HTTP session before reconnecting the native transport.
  try{
    const response=await fetch('/',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Object.assign(new Error(response.status===401?'服务登录已失效，请使用原访问令牌重新打开页面。草稿仍保留。':'Web 服务返回 HTTP '+response.status),{status:response.status});
  }catch(error){
    if(connectionGeneration!==state.connectionGeneration)return;
    setConnection('offline','服务连接失败');showConnectionError(nativeErrorMessage(error));
    if(error.status!==401)state.reconnect=setTimeout(connect,4000);return;
  }
  if(connectionGeneration!==state.connectionGeneration)return;
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/rpc'); state.ws = ws;
  ws.onmessage = event => {
    if(state.ws!==ws)return;
    let msg; try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.bridge) { if (msg.bridge === 'error') showConnectionError(msg.message);else if(msg.bridge==='warning')toast(msg.message); return; }
    if (msg.id != null && !msg.method) { const item = state.pending.get(msg.id); if (item) { state.pending.delete(msg.id); clearTimeout(item.timer); msg.result&&typeof msg.result==='object'&&state.responseSequence.set(msg.result,state.eventSequence);msg.error ? item.reject(Object.assign(new Error(nativeErrorMessage(msg.error)),{nativeError:msg.error})) : item.resolve(msg.result); } return; }
    if (msg.id != null && msg.method) { Object.defineProperty(msg,'connection',{value:ws});state.requests.set(String(msg.id), msg); renderRequests(); }
    Object.defineProperty(msg,'sequence',{value:++state.eventSequence});addEvent(msg); handleEvent(msg);
  };
  ws.onopen = async () => {
    if(state.ws!==ws)return;
    try {
      state.runtimeInfo = await rpc('initialize', { clientInfo: { name: 'codex_web_native', title: 'Codex Web', version: '1.0.0' }, capabilities: { experimentalApi: true } });
      if(state.ws!==ws)return;ws.send(JSON.stringify({ method: 'initialized' })); invalidateMcpCache();
      state.activeTurns.clear();state.interrupting.clear();updateSend();
      const generation=state.navigationGeneration;
      // Sidebar enrichment must not block opening the selected conversation.
      loadThreads().catch(report);
      await loadModels();
      if(state.ws!==ws)return;
      if(generation===state.navigationGeneration)await restoreThreadRoute();
      if(state.ws!==ws)return;state.ready=true;setConnection('online','原生已连接');$('#connection-error').hidden=true;updateSend();
      if(/^\/[^\s]*$/.test($('#prompt').value)){closeCommandMenu();updateCommandMenu();}
    } catch (error) { if(state.ws===ws)showConnectionError(error.message); }
  };
  ws.onclose = () => {
    if (state.ws !== ws) return;
    if(typeof cancelPermissionUpdates==='function')cancelPermissionUpdates('连接已断开，请重连后核对原生会话权限');
    state.ready = false; state.requests.clear();state.activeTurns.clear();state.interrupting.clear(); renderRequests();renderThreadList();updateSend();setConnection('offline', '连接已断开');showConnectionError('连接已断开，执行状态将在重连后恢复；不会自动重发任务。');
    for (const pending of state.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('连接已断开，请重连后检查原生执行状态')); } state.pending.clear();
    state.reconnect = setTimeout(connect, 4000);
  };
  ws.onerror = () => {if(state.ws===ws)setConnection('offline', '连接失败');};
}
function showConnectionError(message) { const banner = $('#connection-error'); banner.replaceChildren(document.createTextNode(message), button('重新连接', () => { state.ws?.close(); return connect(); }, 'text-button')); banner.hidden = false; }
function addEvent(msg) { state.events.push({ at: new Date().toLocaleTimeString(), ...msg }); if (state.events.length > 400) state.events.shift(); if ($('#event-log')) renderEvents(); }
function currentEvent(params) { return !params.threadId || params.threadId === (state.hydration?.threadId||state.thread?.id); }
function handleEvent(msg) {
  if(typeof analysisUIEvent==='function')analysisUIEvent(msg);
  const p = msg.params || {}, method = msg.method;
  observeTurnStop(msg);
  if(state.hydration&&state.hydration.threadId===p.threadId&&(/^(item|turn)\//.test(method)||method==='thread/tokenUsage/updated'||method==='thread/settings/updated')) {
    state.hydration.events.push(msg);
    if(method==='turn/started')state.activeTurns.set(p.threadId,p.turn.id);
    if(method==='turn/completed'){state.finishedTurns.add(p.turn.id);state.activeTurns.delete(p.threadId);if(!state.stopOperations.has(p.turn.id))state.interrupting.delete(p.turn.id);}
    renderThreadList();updateSend();return;
  }
  if(method==='thread/status/changed'&&p.status){for(const thread of [state.thread,...state.threads,state.knownThreads.get(p.threadId)])if(thread?.id===p.threadId)thread.status=p.status;refreshThreadMenu();}
  if(method==='thread/deleted'&&state.threadMenu?.target.thread.id===p.threadId)closeThreadMenu(false);
  nativeUIEvent(msg);
  if(method==='mcpServer/startupStatus/updated'){invalidateMcpCache();state.mcpViewUpdate?.(p);}
  if(method==='mcpServer/oauthLogin/completed')receiveMcpOAuth(p);
  if (method === 'serverRequest/resolved') { state.requests.delete(String(p.requestId)); renderRequests(); }
  if (method === 'thread/settings/updated') {state.threadSettings.set(p.threadId,p.threadSettings);if(p.threadId===state.thread?.id&&state.view==='settings')renderSettings().catch(report);}
  if(typeof permissionsEvent==='function')permissionsEvent(msg);
  if(method==='thread/started'){if(p.thread)state.knownThreads.set(p.thread.id,p.thread);loadThreads().catch(report);}
  if (method === 'thread/deleted') {state.knownThreads.delete(p.threadId);state.activeTurns.delete(p.threadId);if(state.thread?.id===p.threadId)resetChat();forgetThreadDraft(p.threadId);state.threadSettings.delete(p.threadId);if(typeof nativeContextUsage!=='undefined')nativeContextUsage.delete(p.threadId);loadThreads().catch(report);}
  if (method === 'turn/started') { state.activeTurns.set(p.threadId, p.turn.id);renderThreadList(); updateSend(); }
  if (method === 'turn/completed') { state.finishedTurns.add(p.turn.id);if(!state.stopOperations.has(p.turn.id))state.interrupting.delete(p.turn.id);state.activeTurns.delete(p.threadId);loadThreads().catch(report);renderThreadList(); updateSend(); if (currentEvent(p)) { if(p.turn.error)toast('任务未完成，详细原因已显示在对话中。'); const items=new Map([...state.items.values()].filter(entry=>entry.turnId===p.turn.id).map(entry=>[entry.item.id,entry.item]));for(const item of p.turn.items||[])items.set(item.id,{...items.get(item.id),...item});const turn={...p.turn,items:[...items.values()]};renderTurnOutcome(turn); const index=state.turns.findIndex(item=>item.id===turn.id); if(index<0)state.turns.push(turn);else state.turns[index]=turn; refreshActivityGroups(turn.id); } }
  if (method === 'thread/tokenUsage/updated') receiveContextUsage(p);
  if (!currentEvent(p)) return;
  if (method === 'item/autoApprovalReview/started' || method === 'item/autoApprovalReview/completed') renderGuardianReview(p);
  if (method === 'guardianWarning') toast(p.message);
  if((method==='item/started'||method==='item/completed')&&p.item?.type==='userMessage'){const thread=state.knownThreads.get(p.threadId);if(thread&&!thread.preview){thread.preview=p.item.content?.find(item=>item.type==='text')?.text?.slice(0,128)||'';renderThreadList();}}
  if (method === 'item/started' || method === 'item/completed') { upsertItem(p.item, method === 'item/completed', p.turnId); }
  if (method === 'item/plan/delta') appendDelta(p.itemId,p.delta,'plan',p.turnId);
  if (method === 'item/agentMessage/delta') appendDelta(p.itemId, p.delta, 'agentMessage', p.turnId);
  if (method === 'item/reasoning/summaryTextDelta' || method === 'item/reasoning/textDelta') appendDelta(p.itemId, p.delta, 'reasoning', p.turnId);
  if (method === 'item/commandExecution/outputDelta') appendDelta(p.itemId, p.delta, 'commandExecution', p.turnId);
  if (method === 'item/fileChange/outputDelta') appendDelta(p.itemId, p.delta, 'fileChange', p.turnId);
  if (method === 'turn/diff/updated') { state.lastDiff = p.diff; }
  if (method === 'turn/plan/updated') renderTurnPlan(p);

  if (method === 'thread/realtime/error') toast(p.message||'实时连接失败');
  if (method === 'windowsSandbox/setupCompleted' && !p.success) toast(p.error||'Windows 沙箱设置未完成');
  if (method === 'error') toast(p.error?.message || p.message || '原生运行时返回错误');
}
function scrollMessages() {if(state.threadLoading||state.renderingHistory)return;if(composerState().follow)$('#conversation-scroll').scrollTop=$('#conversation-scroll').scrollHeight;updateScrollControl();}
function renderTurnOutcome(turn) {
  if(!turn.error&&!['failed','interrupted'].includes(turn.status))return;
  const old=$$('[data-turn-outcome]').find(node=>node.dataset.turnOutcome===turn.id);if(old)old.remove();
  const message=turn.status==='interrupted'?'任务已中断':'原生执行失败：'+(turn.error?.message||'请查看执行过程及原生事件');
  const node=el('div','panel-error message');node.append(el('p','',message));node.dataset.turnOutcome=turn.id;
  const stop=state.stopOperations.get(turn.id);
  if(stop){
    node.append(el('p','',stop.status==='pending'?'回合已结束，正在回收本轮命令…':stop.status==='completed'?'已确认原生后台终端中没有本轮命令。':'本轮命令回收未确认：'+stop.error));
    if(stop.status==='failed'&&stop.connection===state.ws)node.append(button('重试回收本轮命令',()=>interruptTurn(stop.threadId,stop.turnId)));
  }else if(turn.status==='interrupted'&&(turn.items||[]).some(item=>item.type==='commandExecution'&&!['completed','failed','declined'].includes(item.status)))node.append(el('p','','部分命令尚未报告退出，可能仍在运行。请查看执行结果，并在主机确认进程状态。'));
  const inputs=(turn.items||[]).filter(item=>item.type==='userMessage').flatMap(item=>item.content||[]);
  const text=inputs.filter(input=>input.type==='text').map(input=>input.text).join('\n');
  if(text)node.append(button('重新编辑任务',()=>{if($('#prompt').value.trim()||state.attachments.length)return toast('请先保存或发送当前草稿，再重新编辑这次任务。');$('#prompt').value=text;saveComposer();resizePrompt();$('#prompt').focus();}));
  $('#messages').append(node);
}
function guardianAssessment(p){const snake=value=>String(value).replace(/[A-Z]/g,char=>'_'+char.toLowerCase());const action=Object.fromEntries(Object.entries(p.action).map(([key,value])=>[snake(key),['type','source'].includes(key)?snake(value):value]));return{id:p.reviewId,turn_id:p.turnId,target_item_id:p.targetItemId,started_at_ms:p.startedAtMs,completed_at_ms:p.completedAtMs,status:snake(p.review.status),risk_level:p.review.riskLevel,user_authorization:p.review.userAuthorization,rationale:p.review.rationale,decision_source:p.decisionSource?snake(p.decisionSource):undefined,action};}
function renderGuardianReview(p){let node=$$('[data-guardian-review]').find(node=>node.dataset.guardianReview===p.reviewId);if(!node){node=el('div','request-card');node.dataset.guardianReview=p.reviewId;$('#messages').append(node);}node.replaceChildren(el('h3','','原生自动审批 · '+p.review.status),el('p','',p.review.rationale||'正在评估此操作…'),el('pre','',pretty(redact(p.action))));if(p.review.status==='denied'){const confirm=button('确认允许此操作',async()=>{await rpc('thread/approveGuardianDeniedAction',{threadId:p.threadId,event:guardianAssessment(p)});confirm.disabled=true;confirm.textContent='已记录你的确认';toast('已记录对该操作的确认，可继续向 Codex 发送任务。');});node.append(confirm);}$('#welcome').hidden=true;scrollMessages();}
// Markdown output is sanitized before insertion into the conversation.
function modelProvider(){return state.threadSettings.get(state.thread?.id)?.modelProvider||state.runtimeDefaults?.model_provider||'openai';}
function modelPreferenceKey(provider=modelProvider()){return provider===(state.runtimeDefaults?.model_provider||'openai')?'codex.model':'codex.model.'+provider;}
function restoreDefaultModelChoice(){
  if(!state.runtimeDefaults)return;
  const provider=state.runtimeDefaults.model_provider||'openai';for(const option of $$('#model option')){option.disabled=false;}
  const saved=localStorage.getItem(modelPreferenceKey(provider));$('#model').value=$$('#model option').some(option=>option.value===saved)?saved:'';$('#model').title='模型提供方：'+provider;loadEfforts();
}
function selectThreadModel(threadId){
  const settings=state.threadSettings.get(threadId);if(!settings?.model||!settings.modelProvider)return;
  const provider=settings.modelProvider,defaultProvider=state.runtimeDefaults?.model_provider||'openai';

  for(const option of $$('#model option'))option.disabled=false;
  let option=$$('#model option').find(option=>option.value===settings.model&&(option.dataset.provider||defaultProvider)===provider);
  if(isRemovedModel(settings.model,provider)){$('#model').value='';$('#model').title='此历史会话的模型已移除；请新建使用当前提供方的会话。';return;}
  if(!option){option=new Option(settings.model,settings.model);option.dataset.provider=provider;$('#model').append(option);}
  option.disabled=false;$('#model').value=settings.model;$('#model').title='模型提供方：'+provider;loadEfforts();
}
function imageMime(path){const extension=String(path).split(/[?#]/)[0].split('.').pop().toLowerCase();return {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',svg:'image/svg+xml',bmp:'image/bmp'}[extension]||'image/png';}
function localImagePath(source){
  if(!source||/^(?:data:|blob:|https?:)/i.test(source))return null;
  if(!/\.(png|jpe?g|webp|gif|avif|svg|bmp)(?:[?#]|$)/i.test(source))return null;
  try{if(source.startsWith('sandbox:'))source=source.slice(8);return decodeURIComponent(new URL(source,'file://'+state.selectedCwd.replace(/\/$/,'')+'/').pathname);}catch{return null;}
}
function localImageData(path){
  if(state.imageCache.has(path))return state.imageCache.get(path);
  const promise=rpc('fs/readFile',{path}).then(result=>{if(!result.dataBase64)throw new Error('图片文件为空');if(result.dataBase64.length>24*1024*1024)throw new Error('图片过大，请从文件面板下载查看');return 'data:'+imageMime(path)+';base64,'+result.dataBase64;}).catch(error=>{state.imageCache.delete(path);throw error;});
  if(state.imageCache.size>=32)state.imageCache.delete(state.imageCache.keys().next().value);state.imageCache.set(path,promise);return promise;
}
function imagePreview(source,name='图片',path=null){
  openDialog(name,root=>{const image=el('img','image-preview');image.src=source;image.alt=name;root.append(image);const download=el('a','small-button','下载图片');download.href=source;download.download=path?.split('/').pop()||'codex-image.png';root.append(download);},async()=>{},'关闭');
}
function loadImageElement(image,source,path=null,deduplicate=false){
  image.alt=image.alt||'图片';image.loading='lazy';image.classList.add('clickable-image');image.onclick=()=>imagePreview(image.src,image.alt,path);image.onerror=()=>{image.alt='图片无法加载';};
  const present=url=>{const generated=deduplicate?[...state.items.values()].find(entry=>entry.item.type==='imageGeneration'&&entry.node.querySelector('img')?.src===url):null;if(generated){const show=button('查看已生成的图片',()=>imagePreview(url,'生成的图片',path||localImagePath(source)),'small-button generated-image-link');image.replaceWith(show);return;}image.src=url;image.alt='图片';image.onload=()=>{if(image.isConnected)scrollMessages();};};
  const local=path||localImagePath(source);if(local){image.removeAttribute('src');image.alt='正在加载图片…';localImageData(local).then(present).catch(error=>{image.alt='图片加载失败：'+nativeErrorMessage(error);});}else if(/^(data:image\/|blob:)/i.test(source||''))present(source);
}
function renderGeneratedImage(item){
  const figure=el('figure','message image-result');figure.dataset.generatedImage=item.id;const image=el('img');image.alt='Codex 生成的图片';
  const path=item.savedPath||null,source=item.result?(item.result.startsWith('data:image/')?item.result:'data:image/png;base64,'+item.result):null;
  if(source)loadImageElement(image,source);else if(path)loadImageElement(image,null,path);else{figure.append(el('p','subtle','图片附件：'+(item.fileId||'暂不可读取')));return figure;}
  figure.append(image);const caption=el('figcaption');caption.append(el('span','subtle','历史图片'),button('查看大图',()=>imagePreview(image.src,'生成的图片',path)),button('下载图片',()=>{const link=el('a');link.href=image.src;link.download=path?.split('/').pop()||'codex-image.png';link.click();}));figure.append(caption);return figure;
}
async function startProviderChat(model,provider){
  const result=await rpc('thread/start',{cwd:state.selectedCwd,model,config:{...threadRuntimeConfig(provider),model_provider:provider},projectId:state.selectedProject||undefined});
  resetChat();state.nativeModes.set(result.thread.id,'default');state.threadSettings.set(result.thread.id,{model:result.model,modelProvider:result.modelProvider,serviceTier:result.serviceTier,collaborationMode:result.collaborationMode,sandboxPolicy:result.sandbox,approvalPolicy:result.approvalPolicy,approvalsReviewer:result.approvalsReviewer,effort:result.reasoningEffort});adoptThread(result.thread);showView('chat');loadThreads().catch(report);
  toast('已创建新模型会话，已启用的原生技能可在对话中调用');
}
function selectedModelProvider(){return $('#model').selectedOptions[0]?.dataset.provider||state.runtimeDefaults?.model_provider||'openai';}
function markdown(text) {
  const wrapper=el('div','markdown');
  if(!window.marked||!window.DOMPurify){wrapper.textContent=text||'';return wrapper;}
  const source=typeof repairMarkdownTableDelimiters==='function'?repairMarkdownTableDelimiters(text||'',marked):text||'';
  const html=marked.parse(source,{gfm:true,breaks:true});
  wrapper.innerHTML=DOMPurify.sanitize(html,{USE_PROFILES:{html:true},FORBID_TAGS:['style','form','input','button','textarea','select','option'],FORBID_ATTR:['style','id','name']});
  for(const table of wrapper.querySelectorAll('table')){const scroll=el('div','table-scroll');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.ariaLabel='表格，可横向滚动';table.before(scroll);scroll.append(table);}
  for(const image of wrapper.querySelectorAll('img'))loadImageElement(image,image.getAttribute('src'),null,true);
  for(const link of wrapper.querySelectorAll('a[href]')){link.target='_blank';link.rel='noopener noreferrer';}
  return wrapper;
}
const toolNames = { reasoning:'思考过程', commandExecution:'执行命令', fileChange:'文件更改', mcpToolCall:'MCP 调用', dynamicToolCall:'工具调用', webSearch:'搜索网页', imageView:'查看图片', imageGeneration:'图像', collabAgentToolCall:'子代理', plan:'计划', contextCompaction:'压缩上下文', enteredReviewMode:'开始代码审查', exitedReviewMode:'审查结果' };
function renderItem(item, done = false, turnId = null) {
  if(typeof renderGroundedAnalysisItem==='function'){const grounded=renderGroundedAnalysisItem(item,done,turnId);if(grounded)return grounded;}
  if(typeof renderAnalysisToolResult==='function'){const result=renderAnalysisToolResult(item,done);if(result)return result;}
  const chart=databaseChart(item);if(chart)return renderDatabaseChart(chart);
  if(item.type==='agentMessage'&&typeof renderAutomaticAnalysisPlan==='function'){const plan=renderAutomaticAnalysisPlan(item,done);if(plan)return plan;}
  if(item.type==='plan')return renderProposedPlan(item,done);
  if(item.type==='imageGeneration'&&['completed','succeeded'].includes(item.status))return renderGeneratedImage(item);
  if (item.type === 'userMessage') { const node = el('div', 'message user'); for (const content of item.content || []) { if (content.text) node.append(document.createTextNode(content.text)); else if(content.type==='skill'){if(!(item.content||[]).some(part=>part.type==='text'&&part.text?.includes('$'+content.name)))node.append(el('span','skill-mention','$'+content.name));} else if (content.type?.toLowerCase().includes('image')) {const source=content.url||content.imageUrl||content.path;if(source){const image=el('img','user-image');loadImageElement(image,source,content.path||null);node.append(image);}else node.append(el('div','subtle','[图片附件]'));} else node.append(el('div', 'subtle', pretty(redact(content)))); } return node; }
  if (item.type === 'agentMessage') { const node = el('div', 'message agent'); node.append(markdown(item.text || ''));if(item.phase==='final_answer'||!item.phase&&done){const actions=el('div','message-actions'),copy=button('',async()=>{await navigator.clipboard.writeText(item.text||'');toast('已复制回答');},'icon-button');copy.append(icon('copy'));copy.title=copy.ariaLabel='复制回答';actions.append(copy);node.append(actions);}if(typeof decorateAnalysisAnswer==='function')decorateAnalysisAnswer(node,item,done);return node; }
  const node = el('details', 'tool-item'); node.open = item.type === 'fileChange';
  const title = toolNames[item.type] || item.type || '原生事件'; const status = item.status || (done ? 'completed' : 'inProgress');
  node.append(el('summary', '', (['completed','succeeded'].includes(status) ? '✓ ' : status === 'failed' ? '✕ ' : '· ') + title + (item.command ? ' · ' + item.command : item.tool ? ' · ' + item.tool : '')));
  const body = el('div', 'tool-body');
  if (item.type === 'fileChange' && item.changes) { for (const change of item.changes) { body.append(el('strong', '', change.path + '\n')); for (const line of (change.diff || '').split('\n')) body.append(el('div', line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : '', line)); } }
  else if (item.type === 'reasoning') body.textContent = (item.summary || []).map(x => typeof x === 'string' ? x : x.text || '').join('\n') || (item.content || []).map(x=>typeof x==='string'?x:x.text||'').join('\n') || item.text || '';
  else body.textContent = item.aggregatedOutput || item.output || item.text || pretty(redact(item));
  node.append(body); return node;
}
function isActivity(item, turnId) {
  if(databaseChart(item)||item.type==='plan'||typeof isAnalysisResultItem==='function'&&isAnalysisResultItem(item))return false;
  if(item.type==='userMessage'||item.type==='imageGeneration'&&['completed','succeeded'].includes(item.status))return false;
  if(item.type!=='agentMessage')return true;
  if(item.phase==='final_answer')return false;
  if(item.phase==='commentary')return true;
  const turn=state.turns.find(turn=>turn.id===turnId);
  if(turn&&turn.status!=='inProgress') {
    const last=(turn.items||[]).filter(item=>item.type==='agentMessage'&&item.phase!=='commentary').at(-1);
    return last?.id!==item.id;
  }
  return true;
}
function createActivityGroup(turnId) {
  const group = el('details', 'activity-group'); group.dataset.turnId = turnId || '';
  const summary = el('summary'), arrow = icon('down'), dot = el('span', 'activity-dot');
  arrow.classList.add('activity-chevron'); arrow.setAttribute('aria-hidden', 'true'); dot.setAttribute('aria-hidden', 'true');
  summary.append(arrow, dot, el('span', 'activity-label'), el('span', 'activity-count'));
  group.append(summary, el('div', 'activity-items')); $('#messages').append(group); return group;
}
function updateActivityGroup(group) {
  if (!group||state.renderingHistory) return;
  const entries = [...$('.activity-items', group).children].map(node => state.items.get(node.dataset.item)).filter(Boolean);
  const turn = state.turns.find(turn => turn.id === group.dataset.turnId);
  const finished = turn && turn.status !== 'inProgress';
  const pending = finished ? [] : entries.filter(entry => !entry.done && !['completed','succeeded','failed','declined'].includes(entry.item.status));
  const failed = entries.filter(({item}) => ['failed','declined'].includes(item.status) || (item.exitCode != null && item.exitCode !== 0)).length;
  const thoughts = entries.filter(entry => entry.item.type === 'reasoning').length;
  const commands = entries.filter(entry => entry.item.type === 'commandExecution').length;
  const notes=entries.filter(entry=>entry.item.type==='agentMessage').length;
  const tools = entries.length - thoughts - commands - notes, counts = [];
  if(notes)counts.push(notes+' 条过程说明');
  if (thoughts) counts.push(thoughts + ' 次思考');
  if (commands) counts.push(commands + ' 条命令');
  if (tools) counts.push(tools + ' 项工具活动');
  const latest = pending.at(-1)?.item;
  const label = turn?.status === 'interrupted' ? '执行已中断' : turn?.status === 'failed' ? '执行失败' :
    latest ? (latest.type === 'reasoning' ? '正在思考…' : latest.type === 'commandExecution' ? '正在执行命令…' : latest.type==='agentMessage'?'正在处理任务…':'正在调用工具…') :
    failed ? '思考与执行 · ' + failed + ' 项未成功' : '思考与执行';
  $('.activity-label', group).textContent = label; $('.activity-count', group).textContent = counts.join(' · ');
  $('.activity-dot', group).hidden = !pending.length;
  group.classList.toggle('running', pending.length > 0); group.classList.toggle('has-errors', failed > 0 || turn?.status === 'failed');
}
function renderTurnPlan(params) {
  rememberExecutionPlan(params);
  const turnId=params.turnId||state.activeTurns.get(state.thread?.id)||'';
  const group=$$('.activity-group',$('#messages')).find(group=>group.dataset.turnId===turnId)||createActivityGroup(turnId);
  let box=$('.activity-plan',group);if(!box){box=el('div','activity-plan');$('.activity-items',group).append(box);}
  box.replaceChildren(el('strong','','任务计划'));if(params.explanation)box.append(el('p','',params.explanation));
  for(const step of params.plan||[])box.append(el('div','plan-step '+step.status,(step.status==='completed'?'✓ ':step.status==='inProgress'?'◉ ':'○ ')+step.step));
  updateActivityGroup(group);scrollMessages();
}
function refreshActivityGroups(turnId) {
  for(const entry of [...state.items.values()].filter(entry=>entry.turnId===turnId))placeItem(entry);
  $$('.activity-group', $('#messages')).filter(group => group.dataset.turnId === turnId).forEach(updateActivityGroup);
}
function placeItem(entry) {
  const {item,node,turnId}=entry, oldGroup=node.closest('.activity-group');
  if(isActivity(item,turnId)) {
    const group=$$('.activity-group', $('#messages')).find(group=>group.dataset.turnId===turnId)||createActivityGroup(turnId);
    if(node.parentElement!==$('.activity-items',group))$('.activity-items',group).append(node);
    updateActivityGroup(group);
  } else if(node.parentElement!==$('#messages')) {
    const entries=[...state.items.values()], next=entries.slice(entries.indexOf(entry)+1).find(other=>other.node.parentElement===$('#messages'));
    $('#messages').insertBefore(node,next?.node||null);
  }
  if(oldGroup&&!$('.activity-items',oldGroup).children.length)oldGroup.remove();else updateActivityGroup(oldGroup);
}
function mountItem(item, node, done, turnId) {
  const existing = state.items.get(item.id);
  turnId = turnId || existing?.turnId || state.activeTurns.get(state.thread?.id) || '';
  node.dataset.item = item.id;
  if(existing) {if(node.tagName==='DETAILS')node.open=existing.node.open;existing.node.replaceWith(node);}
  const entry={item,node,done,turnId};state.items.set(item.id,entry);placeItem(entry);
  $('#welcome').hidden = true;$('#view-chat').classList.remove('empty'); scrollMessages();
}
function upsertItem(item, done = false, turnId = null) {
  if (!item?.id) return;
  mountItem(item, renderItem(item, done, turnId), done, turnId); state.live.delete(item.id);
}
function appendDelta(id, delta, type, turnId = null) {
  if (!id || typeof delta !== 'string') return;
  const entry = state.items.get(id); const text = (state.live.get(id) ?? (type === 'agentMessage' ? entry?.item.text : type === 'commandExecution' ? entry?.item.aggregatedOutput : '') ?? '') + delta;
  state.live.set(id, text); const item = { ...(entry?.item || {}), id, type };
  if (type === 'commandExecution') item.aggregatedOutput = text; else if (type === 'reasoning') item.summary = [text]; else item.text = text;
  mountItem(item, renderItem(item, entry?.done || false, turnId||entry?.turnId), entry?.done || false, turnId);
}
async function loadThreads(more = false) {
  const generation=++state.listGeneration,archived=state.archived,query=$('#thread-search').value||null;
  const result=await rpc('thread/list',{limit:40,archived,searchTerm:query,sortKey:'updated_at',...(more&&state.cursor?{cursor:state.cursor}:{})});
  if(generation!==state.listGeneration)return;
  const rows=more?[...state.threads,...result.data]:[...result.data];
  state.threads=rows;state.cursor=result.nextCursor;renderThreadList();
  // Native lists omit empty-preview forks. Profile-local read-only discovery
  // and observed IDs are hints; every supplemental fork is verified by native.
  if(state.status?.knownForksSupported){
    try{
      const index=await fetchJSON('/api/known-forks'),missing=index.threadIds.filter(id=>!rows.some(thread=>thread.id===id));
      const reads=[];
      for(let start=0;start<missing.length;start+=8){
        if(generation!==state.listGeneration)return;
        reads.push(...await Promise.allSettled(missing.slice(start,start+8).map(id=>rpc('thread/read',{threadId:id,includeTurns:false}))));
      }
      if(generation!==state.listGeneration)return;
      for(let i=0;i<reads.length;i++){
        const read=reads[i];
        if(read.status==='rejected'){toast('无法恢复已知分叉 '+missing[i]+'：'+nativeErrorMessage(read.reason));continue;}
        const thread=read.value.thread,isArchived=String(thread.path||'').split('/').includes('archived_sessions');
        if(thread.forkedFromId&&!thread.ephemeral&&isArchived===archived&&(!query||(thread.name||thread.preview||'').toLocaleLowerCase().includes(query.toLocaleLowerCase())))rows.push(thread);
      }
    }catch(error){if(generation===state.listGeneration)toast('分叉会话发现失败：'+nativeErrorMessage(error));}
  }
  if(generation!==state.listGeneration)return;
  state.threads=[...new Map(rows.map(thread=>[thread.id,thread])).values()].sort((a,b)=>b.updatedAt-a.updatedAt);
  state.cursor=result.nextCursor;renderThreadList();
}
function renderThreadArchiveControls() {
  $('#thread-list-label').textContent=state.archived?'已归档':'分析记录';
  $('#recent-toggle').setAttribute('aria-pressed',String(!state.archived));
  $('#archive-toggle').setAttribute('aria-pressed',String(state.archived));
  $('#archive-list-help').hidden=!state.archived;
  const archived=!!state.thread&&state.threadArchived;
  $('#thread-archive-status').hidden=!archived;

}
function setArchiveScope(archived) {
  state.archived=archived;
  try{sessionStorage.setItem('codex.historyArchived',archived?'1':'0');}catch{}
  renderThreadArchiveControls();
}
async function switchArchiveScope(archived,{reload=false}={}) {
  closeThreadMenu(false);
  if(state.archived===archived&&!reload)return;
  setArchiveScope(archived);state.threads=[];state.cursor=null;
  $('#thread-list').replaceChildren(el('div','empty-small subtle',archived?'正在读取已归档会话…':'正在读取分析记录…'));
  $('#threads-more').hidden=true;
  const generation=state.listGeneration+1;
  try{await loadThreads();}
  catch(error){
    if(state.archived===archived&&state.listGeneration===generation){
      const notice=el('div','empty-small');notice.dataset.threadListError='';notice.setAttribute('role','alert');
      notice.append(el('p','subtle','会话列表加载失败：'+nativeErrorMessage(error)),button('重试读取会话',()=>switchArchiveScope(archived,{reload:true}),'text-button'));
      $('#thread-list').replaceChildren(notice);
    }
    throw error;
  }
}
function showHistoryHelp() {
  openDialog('归档与永久删除',root=>{
    root.append(el('p','','归档：从「分析记录」移入左侧「已归档」，保留全部对话历史；可随时打开查看，或在会话右键及「…」菜单中恢复。'));
    root.append(el('p','','永久删除：在左侧对要删除的会话点击右键或「…」，选择「永久删除历史…」，确认后删除原生会话历史及其创建的子代理会话，无法恢复。已归档会话也可以直接永久删除。'));
    root.append(el('p','','归档或删除会话不会回滚工作区内已修改的文件，也不会删除数据库中的业务数据。'));
  },async()=>{},'知道了');
}
// Sidebar menu targets are snapshots, independent of the selected conversation.
state.threadActionPending=new Set();
function threadMenuOrigin(menu){return document.querySelector('[data-thread-menu="'+CSS.escape(menu.target.thread.id)+'"]')||menu.origin;}
function closeThreadMenu(restoreFocus=true){
  const menu=state.threadMenu;if(!menu)return;state.threadMenu=null;$('#thread-context-menu').hidden=true;
  for(const trigger of $$('[data-thread-menu]'))trigger.setAttribute('aria-expanded','false');
  if(restoreFocus){const origin=threadMenuOrigin(menu);if(origin?.isConnected)origin.focus();}
}
function dismissMovedThreadMenu(){
  const menu=state.threadMenu;if(!menu)return;
  const row=document.querySelector('.thread-row[data-thread-id="'+CSS.escape(menu.target.thread.id)+'"]'),box=row?.getBoundingClientRect();
  if(!box||menu.viewport.width!==innerWidth||menu.viewport.height!==innerHeight||['left','top','width','height'].some(key=>box[key]!==menu.anchorRect[key]))closeThreadMenu(false);
}
function threadActionReason(action,target){
  const id=target.thread.id,current=state.thread?.id===id;
  if(!state.ready)return '原生连接尚未就绪';
  if(state.threadActionPending.has(id))return '该会话的操作正在处理，请稍候';
  const thread=state.threads.find(thread=>thread.id===id)||state.knownThreads.get(id)||target.thread;
  const running=state.activeTurns.has(id)||thread.status?.type==='active';
  if(['compact','fork','review','revert'].includes(action)&&(!current||state.threadLoading||state.threadBusy))return '请先打开此会话，恢复为可编辑状态后使用';
  if(['compact','fork','review','revert'].includes(action)&&[...state.stopOperations.values()].some(operation=>operation.threadId===id&&operation.status==='pending'))return '本轮命令仍在回收，请等待停止结果后使用';
  if(target.archived&&['fork','compact','review','revert','archive'].includes(action))return '请先恢复已归档会话后使用';
  if(running&&['fork','compact','review','revert','archive'].includes(action))return '请先停止此会话中正在执行的任务';
  return '';
}
async function performThreadAction(id,work){
  if(state.threadActionPending.has(id))throw new Error('该会话的操作正在处理，请稍候');
  state.threadActionPending.add(id);refreshThreadMenu();
  try{return await work();}finally{state.threadActionPending.delete(id);refreshThreadMenu();}
}
function refreshThreadMenu(){
  const menu=state.threadMenu;if(!menu)return;
  for(const item of $$('[data-thread-action]',$('#thread-context-menu'))){const reason=threadActionReason(item.dataset.threadAction,menu.target);item.disabled=!!reason;item.title=reason;item.setAttribute('aria-disabled',String(!!reason));}
}
function openThreadMenu(target,origin,point=null){
  closeThreadMenu(false);const root=$('#thread-context-menu'),thread=target.thread;
  state.threadMenu={target:{thread:{...thread},archived:target.archived},origin};root.dataset.threadId=thread.id;root.replaceChildren();
  const name=thread.name||thread.preview||'未命名分析',heading=el('div','thread-menu-name',name);heading.title=name;root.append(heading);
  const entries=[['rename','重命名'],target.archived?['unarchive','恢复到分析记录']:['archive','归档（保留历史）'],null,['delete','永久删除历史…']];
  for(const entry of entries){
    if(!entry){const separator=el('div','thread-menu-separator');separator.setAttribute('role','separator');root.append(separator);continue;}
    const [action,label]=entry,item=button(label,()=>{const selected=state.threadMenu?.target;if(!selected)return;const reason=threadActionReason(action,selected);if(reason)throw new Error(reason);closeThreadMenu();return threadAction(action,selected);},'thread-menu-item'+(action==='delete'?' danger':''));
    item.dataset.threadAction=action;item.setAttribute('role','menuitem');root.append(item);
  }
  refreshThreadMenu();root.hidden=false;root.style.left='0px';root.style.top='0px';
  const box=root.getBoundingClientRect(),anchor=origin.getBoundingClientRect(),x=point?.x??anchor.right,y=point?.y??anchor.bottom;
  root.style.left=Math.max(8,Math.min(x,innerWidth-box.width-8))+'px';root.style.top=Math.max(8,Math.min(y,innerHeight-box.height-8))+'px';
  const trigger=document.querySelector('[data-thread-menu="'+CSS.escape(thread.id)+'"]');trigger?.setAttribute('aria-expanded','true');
  root.querySelector('[role=menuitem]:not(:disabled)')?.focus();
  const row=document.querySelector('.thread-row[data-thread-id="'+CSS.escape(thread.id)+'"]'),rowBox=(row||origin).getBoundingClientRect();
  state.threadMenu.anchorRect=Object.fromEntries(['left','top','width','height'].map(key=>[key,rowBox[key]]));
  state.threadMenu.viewport={width:innerWidth,height:innerHeight};
}
function threadMenuKey(event){
  if(!state.threadMenu)return;const root=$('#thread-context-menu');
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeThreadMenu();return;}
  if(event.key==='Tab'){closeThreadMenu();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const items=$$('[role=menuitem]:not(:disabled)',root);if(!items.length)return;
  event.preventDefault();const index=items.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();
}
function renderThreadList() {
  renderThreadArchiveControls();
  // A new thread can start before thread/list has observed its first rollout.
  if(!state.archived){const query=$('#thread-search').value.toLowerCase();for(const thread of state.knownThreads.values())if(state.activeTurns.has(thread.id)&&!state.threads.some(item=>item.id===thread.id)&&(!query||(thread.name||thread.preview||'').toLowerCase().includes(query)))state.threads.unshift(thread);}
  // Native paginated forks can have an empty preview and be omitted from list.
  // The current thread was confirmed by read/resume; keep its actual navigation entry.
  const selected=state.thread,query=$('#thread-search').value.toLowerCase();
  if(selected&&state.threadArchived===state.archived&&!state.threads.some(thread=>thread.id===selected.id)&&(!query||(selected.name||selected.preview||'').toLowerCase().includes(query)))state.threads.unshift(selected);
  const list = $('#thread-list'); list.replaceChildren();
  for(const thread of state.threads){
    const row=el('div','thread-row'+(state.thread?.id===thread.id?' active':''));row.dataset.threadId=thread.id;
    const name=thread.name||thread.preview||'未命名分析',target={thread:{...thread},archived:state.archived};
    const open=button('',()=>{closeThreadMenu(false);return openThread(thread.id);},'thread-open');open.dataset.threadOpen=thread.id;
    const dot=el('span','thread-dot'+(state.activeTurns.has(thread.id)?' running':''));if(state.activeTurns.has(thread.id))dot.title='此页面正在执行任务';
    open.append(dot,el('span','thread-name',name));const date=new Date(thread.updatedAt*1000);open.title=name+' · '+date.toLocaleString();open.append(el('time','',date.toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})));
    const trigger=button('…',()=>openThreadMenu(target,trigger),'menu-trigger');trigger.dataset.threadMenu=thread.id;trigger.ariaLabel='会话操作：'+name;trigger.title='会话操作';trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded',String(state.threadMenu?.target.thread.id===thread.id));
    row.oncontextmenu=event=>{event.preventDefault();openThreadMenu(target,event.target.closest('button')||open,{x:event.clientX,y:event.clientY});};
    row.onkeydown=event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();openThreadMenu(target,event.target.closest('button')||open);}};
    row.append(open,trigger);list.append(row);
  }
  if(state.threadMenu&&!state.threads.some(thread=>thread.id===state.threadMenu.target.thread.id))closeThreadMenu(false);
  if (!state.threads.length) list.append(el('div', 'empty-small subtle', query?'当前列表中没有匹配的会话。':state.archived?'暂无已归档会话。归档会保留历史，可在这里恢复。':'从一次新分析开始。'));
  $('#threads-more').hidden = !state.cursor;
}
function setCwd(path) { state.selectedCwd = path; localStorage.setItem('codex.cwd', path); const name = path.split('/').filter(Boolean).pop() || path; $('#project-name').textContent = name; $('#breadcrumb').textContent = name; $('#cwd-label').textContent = path; }
function threadRoute(){const params=new URLSearchParams(location.search);return {id:params.get('thread'),archived:params.get('archived')==='1'};}
function setThreadRoute(id=null,archived=false,replace=false){const url=new URL(location.href);url.searchParams.delete('token');url.searchParams.delete('thread');url.searchParams.delete('archived');if(id){url.searchParams.set('thread',id);if(archived)url.searchParams.set('archived','1');}if(url.href!==location.href)history[replace?'replaceState':'pushState'](null,'',url);}
function resetChat(route=true) {closeThreadMenu(false);rememberScroll();const fresh=state.composerKey==='new'&&composerState().pending;switchComposer('new',fresh);restoreDefaultModelChoice();$('#view-chat').classList.add('empty'); state.navigationGeneration++;state.hydration=null;state.historyPage=null;state.threadLoading=false;state.restoreError=false;if(route)setThreadRoute();state.thread = null; state.threadArchived=false;state.threadBusy=false; $('#prompt').disabled=false; $('#prompt').placeholder='描述分析问题、指标和时间范围，或添加资料'; state.turns = []; state.items.clear(); state.live.clear(); $('#messages').replaceChildren(); $('#welcome').hidden = false;$('#jump-latest').hidden=true;  $('#page-title').textContent = '新分析'; $('#plan-summary').hidden = true; renderContextUsage(); renderThreadList(); renderRequests(); updateSend(); resetNativeUI(); }
function adoptThread(thread,archived=false,busy=false) { state.knownThreads.set(thread.id,thread);if(state.composerKey!==thread.id)switchComposer(thread.id);if(state.thread?.id!==thread.id)$('#plan-summary').hidden=true; state.thread=thread;state.threadArchived=archived;state.threadBusy=busy;setThreadRoute(thread.id,archived,true);if(thread.cwd)setCwd(thread.cwd);$('#prompt').disabled=busy||archived;$('#prompt').placeholder=busy?'会话只读：请关闭占用页面后重试继续对话':archived?'会话已归档：请在侧栏恢复后继续对话':'继续提问、调整分析口径或补充资料';$('#page-title').textContent=thread.name||thread.preview||'新分析';selectThreadModel(thread.id);renderRequests();updateSend();renderContextUsage(); adoptNativeUI(thread); }
async function restoreThreadRoute(){const route=threadRoute();if(route.id){setArchiveScope(route.archived);await openThread(route.id,{archived:route.archived,replace:true});loadThreads().catch(report);}else resetChat(false);}
async function openThread(id,{archived=state.archived&&state.threads.some(thread=>thread.id===id),replace=false}={}) {
  closeThreadMenu(false);rememberScroll();saveComposer();const generation=++state.navigationGeneration;state.hydration={threadId:id,generation,events:[]};state.historyPage=null;state.threadLoading=true;state.restoreError=false;setThreadRoute(id,archived,replace);updateSend();
  showView('chat');$('#jump-latest').hidden=true;$('#view-chat').classList.remove('empty');$('#prompt').disabled=true;$('#welcome').hidden=true;$('#messages').replaceChildren(el('div','loading','读取原生会话…'));state.items.clear();state.live.clear();
  try {
    // Each WebSocket owns a new native process and identity guard. UI caches
    // survive reconnects, but cannot attest a thread to that new connection.
    const identity=await rpc('thread/read',{threadId:id,includeTurns:false});
    if(generation!==state.navigationGeneration)return;
    const provider=identity.thread.modelProvider;
    let result,busy=false;
    for(let attempt=0;attempt<4;attempt++){
      try{result=archived?identity:await rpc('thread/resume',{threadId:id,config:threadRuntimeConfig(provider),excludeTurns:true,initialTurnsPage:{limit:20,sortDirection:'desc',itemsView:'full'}});break;}
      catch(error){if(archived||!/already has an active writer/i.test(error.message))throw error;if(generation!==state.navigationGeneration)return;if(attempt<3){await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));if(generation!==state.navigationGeneration)return;}else{result=await rpc('thread/read',{threadId:id,includeTurns:false});busy=true;}}
    }
    if(generation!==state.navigationGeneration)return;if(result.collaborationMode)state.nativeModes.set(id,result.collaborationMode.mode);if(result.model)state.threadSettings.set(id,{model:result.model,modelProvider:result.modelProvider,serviceTier:result.serviceTier,collaborationMode:result.collaborationMode,sandboxPolicy:result.sandbox,approvalPolicy:result.approvalPolicy,approvalsReviewer:result.approvalsReviewer,effort:result.reasoningEffort});adoptThread(result.thread,archived,busy);if(typeof permissionsFromSnapshot==='function'&&result.model)permissionsFromSnapshot(id,state.threadSettings.get(id));
    await hydrateThread(result.thread,generation,state.responseSequence.get(result)||0,result.initialTurnsPage||null);
    if(generation!==state.navigationGeneration)return;if(busy){const notice=el('div','panel-error');notice.dataset.threadBusy='';notice.append(el('p','','此会话正在另一个页面中使用，当前显示历史记录。关闭该页面后，可重试继续会话。'),button('重试继续会话',()=>openThread(id,{archived,replace:true})));$('#messages').prepend(notice);}renderThreadList();
  } catch(error) {
    if(generation!==state.navigationGeneration)return;state.restoreError=true;state.thread=null;
    $('#messages').replaceChildren(el('div','panel-error','无法恢复此会话：'+nativeErrorMessage(error)),button('重试恢复会话',()=>openThread(id,{archived,replace:true})),button('新分析',()=>resetChat()));
  } finally {if(generation===state.navigationGeneration){state.hydration=null;state.threadLoading=false;$('#prompt').disabled=state.restoreError;updateSend();restoreScroll();}}
}
function finishHistoryRender(){for(const group of $$('.activity-group',$('#messages')))updateActivityGroup(group);}
function renderHistoryMore(){
  const root=$('#messages'),old=$('#history-pagination');if(old)old.remove();
  const page=state.historyPage;if(!page||page.threadId!==state.thread?.id||page.generation!==state.navigationGeneration||(!page.cursor&&!page.error))return;
  const box=el('div','history-pagination');box.id='history-pagination';
  const more=button(page.loading?'正在加载更早记录…':'加载更早记录',loadOlderHistory,'small-button');more.id='history-more';more.disabled=page.loading;more.setAttribute('aria-busy',String(page.loading));box.append(more);
  if(page.error){const error=el('p','panel-error','更早记录加载失败：'+page.error+'。可点击上方按钮重试。');box.append(error);}
  root.prepend(box);
}
async function loadOlderHistory(){
  const page=state.historyPage;if(!page||page.loading||!page.cursor||page.threadId!==state.thread?.id||page.generation!==state.navigationGeneration)return;
  page.loading=true;page.error=null;renderHistoryMore();
  try{
    const result=await rpc('thread/turns/list',{threadId:page.threadId,cursor:page.cursor,itemsView:'full',sortDirection:'desc',limit:20});
    if(state.historyPage!==page||state.thread?.id!==page.threadId||state.navigationGeneration!==page.generation)return;
    if(result.nextCursor&&result.nextCursor===page.cursor)throw new Error('原生返回了重复的历史游标，请重新打开会话后重试');
    const known=new Set(state.turns.map(turn=>turn.id)),older=[...result.data].reverse().filter(turn=>!known.has(turn.id));
    const root=$('#messages'),scroller=$('#conversation-scroll'),height=scroller.scrollHeight,top=scroller.scrollTop;
    const draft=composerState();draft.follow=false;
    // Keep existing live DOM/items intact: a response for older turns must not
    // replace streaming text, expanded tools, charts or the user's selection.
    $('#history-pagination')?.remove();const currentNodes=[...root.childNodes],currentItems=state.items,currentTurns=state.turns;
    state.items=new Map();state.turns=[...older,...currentTurns];state.renderingHistory=true;root.replaceChildren();
    try{
      for(const turn of older){for(const item of turn.items||[])upsertItem(item,turn.status!=='inProgress',turn.id);renderTurnOutcome(turn);}
      state.items=new Map([...state.items,...currentItems]);root.append(...currentNodes);
    }catch(error){state.items=currentItems;state.turns=currentTurns;root.replaceChildren(...currentNodes);throw error;}
    finally{state.renderingHistory=false;}
    page.cursor=result.nextCursor||null;page.loaded=state.turns.length;page.loading=false;
    finishHistoryRender();renderHistoryMore();scroller.scrollTop=top+scroller.scrollHeight-height;draft.scrollTop=scroller.scrollTop;updateScrollControl();
  }catch(error){if(state.historyPage===page)page.error=nativeErrorMessage(error);}
  finally{if(state.historyPage===page){page.loading=false;renderHistoryMore();}}
}
async function hydrateThread(thread,generation=state.navigationGeneration,snapshotSequence=state.eventSequence,initialPage=null) {
  const threadSnapshotSequence=snapshotSequence;
  let turns=thread.turns||[],page=initialPage;
  if(!page&&!turns.length){page=await rpc('thread/turns/list',{threadId:thread.id,itemsView:'full',sortDirection:'desc',limit:20});snapshotSequence=state.responseSequence.get(page)??snapshotSequence;}
  if(page)turns=[...page.data].reverse();
  if (state.thread?.id !== thread.id||generation!==state.navigationGeneration) return;
  state.turns = turns; $('#messages').replaceChildren(); state.items.clear(); state.activeTurns.delete(thread.id);
  state.historyPage={threadId:thread.id,generation,cursor:page?.nextCursor||null,loading:false,error:null,loaded:turns.length};
  state.renderingHistory=true;
  try{for (const turn of turns) { if (turn.status === 'inProgress'&&!state.finishedTurns.has(turn.id)) state.activeTurns.set(thread.id, turn.id); for (const item of turn.items || []) upsertItem(item, turn.status !== 'inProgress', turn.id); renderTurnOutcome(turn); }}
  finally{state.renderingHistory=false;}
  finishHistoryRender();renderHistoryMore();
  $('#welcome').hidden = turns.length > 0;$('#view-chat').classList.toggle('empty',turns.length===0);  $('#page-title').textContent = thread.name || thread.preview || '新分析';  const buffered=state.hydration?.generation===generation?state.hydration.events:[];state.hydration=null;
  // Full terminal items/outcomes are idempotent. Deltas already included in a
  // snapshot must not be appended a second time.
  // Turn pages do not contain usage/settings snapshots. Keep their independent
  // state events; only item deltas can be superseded by the later turn page.
  for(const event of buffered)if(event.sequence>snapshotSequence||event.method==='thread/tokenUsage/updated'||event.method==='turn/plan/updated'||(event.method==='thread/settings/updated'&&event.sequence>threadSnapshotSequence)||event.method==='item/completed'||event.method==='turn/completed')handleEvent(event);
  updateSend();restoreExecutionPlans();renderNativeMode();
}
async function ensureThread(context=null) {
  const draft=context?.draft||saveComposer();
  const target=context||{thread:state.thread,generation:state.navigationGeneration,cwd:state.selectedCwd,model:$('#model').value,provider:selectedModelProvider(),projectId:state.selectedProject,mode:currentMode(),draft};
  if(target.thread)return target.thread;
  if(!draft.creation)draft.creation=(async()=>{
    const config={...threadRuntimeConfig(target.provider),...(target.provider!==(state.runtimeDefaults?.model_provider||'openai')?{model_provider:target.provider}:{})};
    const permissions=typeof permissionStartParams==='function'?permissionStartParams(draft):{};
    const result=await rpc('thread/start',{cwd:target.cwd,model:target.model||null,...permissions,config:{...config,...permissions.config},projectId:target.projectId||undefined});
    state.nativeModes.set(result.thread.id,target.mode);
    state.threadSettings.set(result.thread.id,{model:result.model,modelProvider:result.modelProvider,serviceTier:result.serviceTier,collaborationMode:result.collaborationMode,sandboxPolicy:result.sandbox,approvalPolicy:result.approvalPolicy,approvalsReviewer:result.approvalsReviewer,effort:result.reasoningEffort});
    state.composers.set(result.thread.id,draft);
    if(target.generation===state.navigationGeneration&&composerState()===draft){adoptThread(result.thread);state.composers.set('new',{text:'',attachments:[],loads:0,pending:false,follow:true,scrollTop:null});persistDrafts();}
    loadThreads().catch(report);if(typeof confirmStartedPermissions==='function')confirmStartedPermissions(draft,result);return result.thread;
  })().finally(()=>{delete draft.creation;});
  return draft.creation;
}
function updateSend() {
  refreshThreadMenu();
  if(typeof renderPermissions==='function')renderPermissions();
  const permissionBlocked=typeof permissionSubmissionBlocked==='function'&&permissionSubmissionBlocked(),modeBlocked=state.nativeModePending||(typeof analysisModeChangeBlocked==='function'&&analysisModeChangeBlocked());
  const stop=[...state.stopOperations.values()].find(op=>op.threadId===state.thread?.id&&op.status==='pending');
  const turn=state.activeTurns.get(state.thread?.id),running=!state.threadBusy&&!state.threadArchived&&!!turn,stopping=!!stop||state.interrupting.has(turn),pending=composerState().pending;
  $('#send').disabled=((permissionBlocked||modeBlocked)&&!running)||!state.ready||state.threadLoading||state.restoreError||state.threadBusy||stopping||(!running&&(pending||state.threadArchived||state.attachmentLoads>0));
  $('#send').classList.toggle('running',running);const label=stopping?'正在停止并回收命令…':running?'中断当前任务':pending?'正在发送…':state.attachmentLoads>0?'正在读取附件':'发送任务';
  $('#send').title=label;$('#send').ariaLabel=label;$('#send').setAttribute('aria-busy',String(stopping||pending));
  $('#composer-status').textContent=modeBlocked?'正在切换模式，请等待原生配置确认':permissionBlocked?'权限更改正在确认或尚未确认，请核对原生状态后再发送任务':stopping?'正在等待回合结束并回收本轮命令…':pending?'正在发送，输入内容会保留至请求确认':state.attachmentLoads>0?'正在读取附件…':!state.ready?'连接尚未就绪，草稿已保留':state.threadBusy?'此会话被其他页面或 Codex 进程占用，当前只读；关闭占用方后重试继续':state.threadArchived?'此会话已归档，只能查看；在侧栏恢复后可继续对话':!running&&typeof currentMode==='function'&&currentMode()==='plan'?'计划模式已开启。输入需求生成计划，由你确认后执行。':'';
  if(typeof renderExecutionProgressBanner==='function')renderExecutionProgressBanner();

  if(typeof refreshAnalysisDownloads==='function')refreshAnalysisDownloads();
  if(typeof refreshAnalysisResultVisibility==='function')refreshAnalysisResultVisibility();
}
// A turn can finish while its resumable unified-exec commands remain alive.
// Keep ownership independent of the selected conversation and never clean all terminals.
function observeTurnStop(msg){
  const p=msg.params||{},turnId=p.turnId||p.turn?.id;if(!p.threadId||!turnId)return;
  if((msg.method==='item/started'||msg.method==='item/completed')&&p.item?.type==='commandExecution'){
    let commands=state.turnCommands.get(turnId);if(!commands)state.turnCommands.set(turnId,commands=new Set());commands.add(p.item.id);
    state.stopOperations.get(turnId)?.commands.add(p.item.id);
  }
  if(msg.method==='turn/completed'){
    const op=state.stopOperations.get(turnId);
    if(op&&op.threadId===p.threadId){for(const item of p.turn.items||[])if(item.type==='commandExecution')op.commands.add(item.id);op.turn=p.turn;op.resolveCompletion?.();}
    state.turnCommands.delete(turnId);
  }
}
function renderStopResult(op){
  if(state.thread?.id!==op.threadId)return;
  const turn=state.turns.find(turn=>turn.id===op.turnId)||op.turn;if(turn)renderTurnOutcome(turn);
}
async function backgroundTerminals(op){
  const data=[];let cursor=null;
  do{if(op.connection!==state.ws||!state.ready)throw new Error('原生连接已变化，无法确认旧进程回收；请检查原运行实例。');
    const result=await rpc('thread/backgroundTerminals/list',{threadId:op.threadId,cursor,limit:100});data.push(...result.data);cursor=result.nextCursor;
  }while(cursor);
  return data;
}
async function interruptTurn(threadId=state.thread?.id,turnId=state.activeTurns.get(threadId)){
  if(!turnId)return;
  const previous=state.stopOperations.get(turnId);if(previous?.status==='pending')return previous.promise;
  if(previous&&previous.connection!==state.ws)throw new Error('原停止请求所属连接已失效，不能在新运行实例中重试旧进程操作。');
  const commands=new Set(previous?.commands||state.turnCommands.get(turnId)||[]);
  if(state.thread?.id===threadId){for(const entry of state.items.values())if(entry.turnId===turnId&&entry.item.type==='commandExecution')commands.add(entry.item.id);}
  const op={threadId,turnId,commands,connection:state.ws,status:'pending',turn:previous?.turn,terminated:[]};state.stopOperations.set(turnId,op);state.interrupting.add(turnId);updateSend();renderStopResult(op);
  op.promise=(async()=>{
    let timer;
    // Subscribe before interrupt: completion may precede the interrupt response.
    const connectionClosed=()=>op.rejectCompletion?.(new Error('原生连接已断开，旧实例的命令回收尚未确认。'));op.connection.addEventListener('close',connectionClosed,{once:true});
    const completion=new Promise((resolve,reject)=>{op.resolveCompletion=resolve;op.rejectCompletion=reject;timer=setTimeout(()=>reject(new Error('等待原生回合结束超时；请检查事件后重试回收。')),30000);});
    // Attach a handler immediately, including when an RPC fails before the wait.
    completion.catch(()=>{});
    try{
      if(state.activeTurns.get(threadId)===turnId){await rpc('turn/interrupt',{threadId,turnId});await completion;}
      for(const terminal of await backgroundTerminals(op))if(op.commands.has(terminal.itemId)){
        if(op.connection!==state.ws)throw new Error('原生连接已变化，停止回收。');
        const result=await rpc('thread/backgroundTerminals/terminate',{threadId,processId:terminal.processId});if(result.terminated)op.terminated.push(terminal.processId);
      }
      const remaining=(await backgroundTerminals(op)).filter(terminal=>op.commands.has(terminal.itemId));
      if(remaining.length)throw new Error('原生仍报告本轮命令运行中：'+remaining.map(item=>item.processId).join(', '));
      op.status='completed';
    }catch(error){op.status='failed';op.error=nativeErrorMessage(error);throw error;}
    finally{clearTimeout(timer);op.connection.removeEventListener('close',connectionClosed);delete op.resolveCompletion;delete op.rejectCompletion;state.interrupting.delete(turnId);updateSend();renderStopResult(op);}
  })();return op.promise;
}
function parsePlanPrompt(text){const match=text.match(/^\/plan\s+([\s\S]+)$/);return match&&match[1].trim()?match[1].trim():null;}
function validateComposerCommand(text){
  if(text==='/'||text==='/plan'||parsePlanPrompt(text)!==null||!/^\/[a-z][\w-]*(?:\s|$)/i.test(text))return;
  if(/^\/compact(?:\s|$)/i.test(text))throw new Error('上下文按设置自动压缩；输入已保留，未发送任务。');
  if(/^\/(?:init|goal)(?:\s|$)/i.test(text))throw new Error('初始化和持续目标已移至「设置 → 高级设置」；输入已保留，未发送任务。');
  throw new Error('/ 菜单仅提供计划模式 /plan；输入已保留，未发送任务。');
}
async function submitPrompt(submission=null) {
  const preserveDraft=submission?.preserveDraft===true;
  if(preserveDraft&&typeof submission.text!=='string')throw new Error('独立任务缺少消息文本');
  closeCommandMenu();
  if(!state.ready)return toast('请等待原生运行时连接');

  if(state.nativeModePending||(typeof analysisModeChangeBlocked==='function'&&analysisModeChangeBlocked()))throw new Error('模式正在切换，请稍候再发送；输入已保留。');
  if(typeof permissionSubmissionBlocked==='function'&&permissionSubmissionBlocked())throw new Error('权限更改尚未确认，请重新打开会话核对后再发送任务');
  if(state.threadLoading||state.restoreError)return toast('请先完成当前会话的恢复');
  if(state.threadArchived)return toast('请先取消归档，再继续这个会话');
  if(state.threadBusy)return toast('会话被其他页面或 Codex 进程占用，当前只读；请关闭占用方后重试继续会话。输入已保留。');
  if(state.attachmentLoads)return toast('附件正在读取，请稍候');
  if([...state.stopOperations.values()].some(op=>op.threadId===state.thread?.id&&op.status==='pending'))return toast('本轮命令仍在回收，请等待停止结果。');
  const draft=saveComposer();if(draft.pending)return;
  const raw=preserveDraft?submission.text:draft.text,revision=draft.revision||0,sourceText=raw.trim(),planPrompt=preserveDraft?null:parsePlanPrompt(sourceText),text=planPrompt??sourceText,attachments=preserveDraft?[]:[...draft.attachments];if(!text&&!attachments.length)return;
  if(!preserveDraft)validateComposerCommand(sourceText);
  if(planPrompt!==null&&state.activeTurns.has(state.thread?.id))throw new Error('请先停止当前任务，再按计划模式发送；输入已保留。');
  const context={thread:state.thread,generation:state.navigationGeneration,cwd:state.selectedCwd,model:$('#model').value,effort:$('#effort').value,provider:selectedModelProvider(),projectId:state.selectedProject,mode:planPrompt!==null?'plan':currentMode(),draft};
  if(state.thread&&isRemovedModel(state.threadSettings.get(state.thread.id)?.model,modelProvider()))throw new Error('此历史会话使用的模型已移除。请新建 DeepSeek 会话；历史内容仍可查看。');
  if(planPrompt===null&&attachments.length&&(Object.hasOwn(nativeSlashActions(),text)||text==='/'))throw new Error('此本地命令不接收附件，请先移除附件再执行。输入与附件已保留。');
  const metadata=state.modelDetails?.find(model=>model.model===(context.model||state.runtimeDefaults?.model));
  const unsupported=metadata?.inputModalities?.length?attachments.filter(a=>['image','audio'].includes(a.input.type)&&!metadata.inputModalities.includes(a.input.type)):[];
  if(unsupported.length)throw new Error('当前模型 '+(context.model||state.runtimeDefaults?.model)+' 未声明支持这些附件：'+unsupported.map(a=>a.name).join('、')+'。请选择支持的模型或移除附件；输入与附件已保留。');
  const skills=preserveDraft?[]:(draft.skills||[]).filter(skill=>text.split(/[\s，,。!！?？]+/).includes('$'+skill.name));
  const collaborationMode=turnCollaborationMode(context.mode),input=[{type:'text',text,text_elements:[]},...skills.map(skill=>({type:'skill',name:skill.name,path:skill.path})),...attachments.map(a=>a.input)];
  draft.pending=true;updateSend();
  try{
    if(skills.length){const result=await rpc('skills/list',{cwds:[context.cwd],forceReload:true}),available=(result.data||[]).flatMap(group=>group.skills||[]);for(const skill of skills)if(!available.some(item=>item.path===skill.path&&item.name===skill.name&&item.enabled!==false))throw new Error('所选技能已停用或不可用：'+skill.name+'。输入已保留，请重新选择。');}
    if(planPrompt===null&&!preserveDraft&&!attachments.length&&await nativeSlashCommand(text))return;
    if(!preserveDraft&&sourceText==='/'&&!attachments.length)return showNativeMenu();
    if(typeof prepareAnalysisTools==='function')await prepareAnalysisTools();
    const thread=await ensureThread(context),running=state.activeTurns.get(thread.id);
    const result=running?await rpc('turn/steer',{threadId:thread.id,expectedTurnId:running,input}):await rpc('turn/start',{threadId:thread.id,input,model:context.model||null,effort:context.effort||null,collaborationMode,additionalContext:runtimeModelContext(thread.id,context)});
    if(!running&&typeof recordAnalysisSubmission==='function')recordAnalysisSubmission(thread.id,result.turn,context);
    if(result.turn&&!state.finishedTurns.has(result.turn.id)&&result.turn.status==='inProgress')state.activeTurns.set(thread.id,result.turn.id);
    if(!preserveDraft){
      if(composerState()===draft)saveComposer();
      if(draft.text===raw&&(draft.revision||0)===revision)draft.text='';
      draft.attachments.splice(0,draft.attachments.length,...draft.attachments.filter(a=>!attachments.includes(a)));
      persistDrafts();
      if(composerState()===draft){$('#prompt').value=draft.text;resizePrompt();renderAttachments();draft.follow=true;scrollMessages();}
    }
  }finally{draft.pending=false;renderNativeMode();updateSend();}
}
function runtimeModelContext(threadId,context=null){
  const settings=state.threadSettings.get(threadId)||{},model=context?.model||settings.model||state.runtimeDefaults?.model,provider=context?.provider||settings.modelProvider||state.runtimeDefaults?.model_provider;
  if(!model||!provider)return undefined;
  const details={'codex-web-runtime':{kind:'application',value:'Runtime configuration facts: model provider = '+provider+'; active model ID for this turn = '+model+'. Codex provides the agent runtime and tools. Use these actual runtime facts for model identity; Codex branding or an inherited model persona does not identify the underlying model. No external lookup is needed solely to identify this configured model.'}};
  if(typeof analysisTaskContext==='function')details['codex-web-analysis']={kind:'application',value:analysisTaskContext(context)};
  return details;
}
async function loadModels() {
  const [result,configuration]=await Promise.all([rpc('model/list',{includeHidden:true}),rpc('config/read',{includeLayers:false,cwd:state.selectedCwd})]);
  state.runtimeDefaults=configuration.config;if(typeof refreshPermissionDefaults==='function')refreshPermissionDefaults(configuration.config);state.modelDetails=(result.data||[]).filter(model=>!isRemovedModel(model.model,configuration.config?.model_provider||'openai'));state.models=state.modelDetails.filter(model=>!model.hidden);
  const configured=configuration.config?.model,provider=configuration.config?.model_provider||'openai',model=isRemovedModel(configured,provider)?null:configured||state.models.find(model=>model.isDefault)?.model;
  $('#model').replaceChildren(new Option(model?'默认 · '+model:'默认模型',''));
  $('#model').title='模型提供方：'+(configuration.config?.model_provider||'原生默认提供方');
  for(const model of state.models){const option=new Option(model.displayName||model.model,model.model);option.dataset.provider=configuration.config?.model_provider||'openai';$('#model').append(option);}
  const saved=localStorage.getItem('codex.model');if(saved&&!isRemovedModel(saved,provider)){if(!state.models.some(model=>model.model===saved)){const option=new Option(saved,saved);option.dataset.provider=provider;$('#model').append(option);}$('#model').value=saved;}loadEfforts();refreshProviderConnection();
}
function loadEfforts() { const model = (state.modelDetails||state.models).find(m => m.model === ($('#model').value||state.runtimeDefaults?.model)); const enums = state.schema?.definitions?.ReasoningEffort?.enum || []; $('#effort').replaceChildren(new Option('默认推理', '')); for (const effort of model?.supportedReasoningEfforts || enums.map(reasoningEffort => ({ reasoningEffort }))) $('#effort').append(new Option(effort.reasoningEffort, effort.reasoningEffort)); const saved = localStorage.getItem('codex.effort'); if ($$('#effort option').some(x => x.value === saved)) $('#effort').value = saved; renderNativeMode(); }
function refreshProviderConnection(){const provider=state.runtimeDefaults?.model_provider||'未配置';$('#account-name').textContent=provider==='deepseek'?'DeepSeek':provider;$('#account-status').textContent='模型服务连接';}
// Keep the original model and permission controls connected while rebuilding panels.
// Moving the same nodes preserves their listeners, values and native update targets.
function parkAdvancedControls(){
  const controls=$('#analysis-advanced-controls'),parking=$('#analysis-advanced-controls-parking');
  if(controls&&parking&&controls.parentNode!==parking)parking.append(controls);
}
function showView(view) {
  if(view==='plugins')return toast('插件管理入口已隐藏。');
  parkAdvancedControls();
  if(view!=='chat'&&typeof closeCommandMenu==='function')closeCommandMenu();
  state.view = view; $$('.main-nav .nav-button,.sidebar-footer .nav-button').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  $('#view-chat').hidden = view !== 'chat'; $('#view-panel').hidden = view === 'chat';
  if(window.innerWidth<760)document.body.classList.add('sidebar-hidden');
  if (view === 'chat') { $('#page-title').textContent = state.thread?.name || state.thread?.preview || '新分析'; $('#prompt').focus(); return; }
  const title = {databases:'数据源',skills:'技能',mcp:'MCP 服务',plugins:'本地插件',protocol:'原生能力',settings:'设置',account:'模型服务'}[view]; $('#page-title').textContent = title;
  $('#panel-content').replaceChildren(el('div', 'loading', '正在加载…'));
  ({ databases:renderDatabases, skills:renderSkills, mcp:renderMcp, plugins:renderPlugins, protocol:renderProtocol, settings:renderSettings, account:renderAccount })[view]?.().catch(error => { if (state.view === view) panelError(error); });
}
function panelError(error) { parkAdvancedControls();$('#panel-content').replaceChildren(el('div', 'panel-error', nativeErrorMessage(error)), button('重试', () => showView(state.view))); }
function panelHeading(title, description, iconName) { const header = el('div', 'panel-heading'), text = el('div'); text.append(el('h1', '', title), el('p', '', description)); header.append(text, icon(iconName)); parkAdvancedControls();$('#panel-content').replaceChildren(header); return $('#panel-content'); }
function showJSON(title, data) { openDialog(title, root => root.append(el('pre', '', pretty(redact(data)))), async () => {}, '关闭'); }
function openDialog(title, build, submit, submitLabel = '保存') {
  const generation=state.dialogGeneration=(state.dialogGeneration||0)+1;let submitting=false;
  $('#dialog-submit').disabled=false;$('#dialog-title').textContent = title; $('#dialog-body').replaceChildren(); build($('#dialog-body')); $('#dialog-submit').textContent = submitLabel;
  $('#dialog-form').onsubmit = async event => {event.preventDefault();if(submitting)return;submitting=true;$('#dialog-submit').disabled=true;try{await submit($('#dialog-body'));if(generation===state.dialogGeneration)$('#dialog').close();}catch(error){report(error);}finally{submitting=false;if(generation===state.dialogGeneration)$('#dialog-submit').disabled=false;}};
  $('#dialog').showModal();
}
function askText(title, label, value, submit, { secret=false, multiline=false } = {}) { openDialog(title, root => { root.append(el('label', '', label)); const input = el(multiline ? 'textarea' : 'input', multiline ? 'code-editor' : 'field-input'); input.id='dialog-value'; if (secret) input.type='password'; input.value=value; input.required=true; root.append(input); }, root => submit($('#dialog-value', root).value)); }
async function editProject() { askText('选择工作区', '输入项目的绝对路径。原生 Codex 会在这个目录执行任务。', state.selectedCwd, async path => { await rpc('fs/readDirectory', { path }); setCwd(path); resetChat(); showView('chat'); }); }
async function paged(method, params={},onPage=null) { const all=[]; let cursor=null; do { const result=await rpc(method,{...params,cursor}); onPage?.(result);all.push(...(result.data || [])); cursor=result.nextCursor; } while(cursor); return all; }
function formField(root,label,id,{value='',type='text',multiline=false,required=false,placeholder=''}={}) {
  const group=el('div','form-field'),caption=el('label','',label),input=el(multiline?'textarea':'input',multiline?'code-editor compact-editor':'field-input');
  input.id=id;caption.htmlFor=id;if(!multiline)input.type=type;input.value=value;input.required=required;input.placeholder=placeholder;group.append(caption,input);root.append(group);return input;
}
function readBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('无法读取 '+file.name));reader.readAsDataURL(file);});}
function skillPresentation(skill){
  const known=state.skillCatalog?.[skill.name];if(known)return known;
  const original=skill.shortDescription||skill.description||'';
  return {title:skill.interface?.displayName||skill.name,description:/[\u3400-\u9fff]/.test(original)?original:'已安装的自定义技能，启用后可在对话中让 Agent 按需要调用。',original};
}
async function renderSkills(){
  const data=await rpc('skills/list',{cwds:[state.selectedCwd],forceReload:true});if(state.view!=='skills')return;
  const root=panelHeading('技能','仅保留本版本 Codex 源码自带的技能。启用后可在对话中说明任务，由 Codex 按技能说明使用。','skill');
  const toolbar=el('div','skills-toolbar'),search=el('input','field-input');search.type='search';search.ariaLabel=search.placeholder='搜索技能名称或用途';search.value=state.skillQuery;
  toolbar.append(search);root.append(toolbar);
  const seen=new Set(),skills=[];
  for(const group of data.data||[])for(const skill of group.skills||[]){if(seen.has(skill.path)||!isRetainedNativeSkill(skill))continue;seen.add(skill.path);skills.push(skill);}
  const summary=el('p','subtle skill-count'),groups=el('div','skill-groups');root.append(summary,groups);
  const category=()=> 'common';
  const categories=[['common','Codex 原生技能']];
  function draw(){
    const query=state.skillQuery.trim().toLocaleLowerCase(),matching=skills.filter(skill=>{const p=skillPresentation(skill);return !query||[skill.name,p.title,p.description].join(' ').toLocaleLowerCase().includes(query);});
    summary.textContent=query?'找到 '+matching.length+' 项技能':'共 '+skills.length+' 项 Codex 源码自带技能';groups.replaceChildren();
    for(const [key,label]of categories){
      const members=matching.filter(skill=>category(skill)===key);if(!members.length)continue;
      const section=el('details','skill-group');section.dataset.skillGroup=key;section.open=!!query||state.skillGroups.has(key);const heading=el('summary');heading.append(el('span','',label),el('span','tag',members.length+' 项'));section.append(heading);section.ontoggle=()=>{if(!query){if(section.open)state.skillGroups.add(key);else state.skillGroups.delete(key);}};
      const grid=el('div','skill-grid');section.append(grid);groups.append(section);
      for(const skill of members){
        const p=skillPresentation(skill),enabled=skill.enabled!==false,card=el('article','card skill-card');card.dataset.skillPath=skill.path;card.dataset.skillName=skill.name;
        const header=el('div','skill-card-heading');header.append(el('h3','',p.title),el('span','tag '+(enabled?'enabled-tag':''),enabled?'已启用':'已停用'));card.append(header,el('p','skill-description',p.description));
        if(p.original&&!/[\u3400-\u9fff]/.test(p.original)){const original=el('details','skill-original');original.append(el('summary','','原始说明'),el('p','',p.original));card.append(original);}
        const actions=el('div','skill-card-footer');actions.append(el('span','subtle',({common:'内置技能',custom:skill.scope==='repo'?'当前项目':'个人技能',plugins:'插件提供',templates:'模板技能'})[key]),button(enabled?'停用':'启用',async()=>{await rpc('skills/config/write',{path:skill.path,enabled:!enabled});state.attachments=state.attachments.filter(a=>a.input?.path!==skill.path);renderAttachments();toast('技能已'+(enabled?'停用':'启用'));await renderSkills();}));card.append(actions);grid.append(card);
      }
    }
    if(!matching.length)groups.append(el('p','empty-small',query?'没有找到匹配的技能。':'未发现本版本自带技能，请检查原生运行时的技能安装状态。'));
  }
  search.oninput=()=>{state.skillQuery=search.value;draw();};draw();
  for(const group of data.data||[])for(const error of group.errors||[])root.append(el('p','panel-error',nativeErrorMessage(error.message||error)));
}
function parseStringObject(value,label){const object=JSON.parse(value||'{}');if(!object||Array.isArray(object)||typeof object!=='object'||Object.values(object).some(value=>typeof value!=='string'))throw new Error(label+' 必须是字符串值组成的 JSON 对象');return object;}
function customMcpDialog(existingNames) {
  openDialog('添加自定义 MCP',root=>{
    formField(root,'服务名称','mcp-name',{required:true,placeholder:'my-tools'}).pattern='[A-Za-z0-9][A-Za-z0-9_-]{0,63}';
    const caption=el('label','','连接方式'),transport=el('select','field-input');transport.id='mcp-transport';caption.htmlFor=transport.id;transport.append(new Option('stdio · 启动服务器上的命令','stdio'),new Option('HTTP · 连接 Streamable HTTP 服务','http'));root.append(caption,transport);
    const stdio=el('div'),http=el('div');http.hidden=true;root.append(stdio,http);
    formField(stdio,'启动命令','mcp-command',{placeholder:'npx / uvx / python3'});
    formField(stdio,'命令参数（JSON 数组）','mcp-args',{multiline:true,value:'[]',placeholder:'["-y", "@example/mcp-server"]'});
    formField(stdio,'工作目录（可选，服务器绝对路径）','mcp-cwd');
    formField(stdio,'环境变量（可选，JSON 对象）','mcp-env',{multiline:true,value:'{}'});
    formField(http,'服务 URL','mcp-url',{type:'url',placeholder:'https://example.com/mcp'});
    formField(http,'Bearer Token 环境变量名（可选）','mcp-bearer-env',{placeholder:'MY_MCP_TOKEN'});
    formField(http,'请求头（可选，JSON 对象）','mcp-headers',{multiline:true,value:'{}'});
    formField(http,'从环境变量读取请求头（可选，JSON 对象）','mcp-env-headers',{multiline:true,value:'{}',placeholder:'{"Authorization":"MY_AUTH_HEADER"}'});
    transport.onchange=()=>{stdio.hidden=transport.value!=='stdio';http.hidden=transport.value!=='http';$$('input,textarea',stdio).forEach(input=>input.disabled=stdio.hidden);$$('input,textarea',http).forEach(input=>input.disabled=http.hidden);};transport.onchange();
    const label=el('label','check-label'),enabled=el('input');enabled.type='checkbox';enabled.id='mcp-enabled';enabled.checked=true;label.append(enabled,document.createTextNode(' 添加后启用'));root.append(label,el('p','','命令和环境变量使用服务器环境。需要 OAuth 的 HTTP 服务可在添加后登录。保存的密钥仅写入本机 Codex 配置。'));
  },async root=>{
    const value=id=>$('#'+id,root).value.trim(),name=value('mcp-name');if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name))throw new Error('服务名只能包含英文字母、数字、短横线和下划线');
    const before=await rpc('config/read',{includeLayers:true,cwd:state.selectedCwd});if(existingNames.has(name)||Object.hasOwn(before.config?.mcp_servers||{},name))throw new Error('此服务名已存在，请更换名称');
    const config={enabled:$('#mcp-enabled',root).checked};
    if(value('mcp-transport')==='stdio'){
      if(!value('mcp-command'))throw new Error('请输入启动命令');config.command=value('mcp-command');
      config.args=JSON.parse(value('mcp-args')||'[]');if(!Array.isArray(config.args)||config.args.some(v=>typeof v!=='string'))throw new Error('命令参数必须为字符串 JSON 数组');
      const env=parseStringObject(value('mcp-env'),'环境变量');if(Object.keys(env).length)config.env=env;if(value('mcp-cwd')){if(!value('mcp-cwd').startsWith('/'))throw new Error('请输入服务器的绝对工作目录');config.cwd=value('mcp-cwd');}
    }else{
      const url=safeURL(value('mcp-url'));if(!url)throw new Error('请输入有效的 HTTP 或 HTTPS 地址');config.url=url;
      if(value('mcp-bearer-env'))config.bearer_token_env_var=value('mcp-bearer-env');
      const headers=parseStringObject(value('mcp-headers'),'请求头'),envHeaders=parseStringObject(value('mcp-env-headers'),'环境变量请求头');
      if(Object.keys(headers).length)config.http_headers=headers;if(Object.keys(envHeaders).length)config.env_http_headers=envHeaders;
    }
    await writeMcpConfig(name,config,before);toast(config.enabled?'MCP 已添加并启用':'MCP 已添加，当前停用');await renderMcp();
  },'添加');
}
async function writeMcpConfig(name,value,before,key='') {
  await rpc('config/batchWrite',{edits:[{keyPath:'mcp_servers.'+JSON.stringify(name)+(key?'.'+key:''),value,mergeStrategy:'replace'}],expectedVersion:before.layers?.find(layer=>layer.name?.type==='user'&&!layer.name?.profile)?.version,reloadUserConfig:true});
  invalidateMcpCache();
  try{await rpc('config/mcpServer/reload',null);}catch(error){throw new Error('配置已保存，但重新加载未完成：'+nativeErrorMessage(error));}
}
function invalidateMcpCache(){state.mcpRevision++;state.mcpCache.clear();state.mcpRequests.clear();}
function mcpStatusRequest(params,force=false){
  const key=JSON.stringify([state.selectedCwd,params]),cached=state.mcpCache.get(key);if(!force&&cached&&Date.now()-cached.time<30000)return Promise.resolve(cached.data);
  if(state.mcpRequests.has(key))return state.mcpRequests.get(key);
  const revision=state.mcpRevision;const promise=paged('mcpServerStatus/list',params).then(data=>{if(revision!==state.mcpRevision)return data;if(state.mcpCache.size>=32)state.mcpCache.delete(state.mcpCache.keys().next().value);state.mcpCache.set(key,{time:Date.now(),data});return data;}).finally(()=>{if(state.mcpRequests.get(key)===promise)state.mcpRequests.delete(key);});state.mcpRequests.set(key,promise);return promise;
}
async function showMcpDetails(name){
  let content;openDialog(name,root=>{content=el('div');content.append(el('p','loading','正在读取完整工具与资源…'));root.append(content);},async()=>{},'关闭');
  try{const params={limit:100,detail:'full',serverName:name};if(state.thread?.id&&!state.threadBusy&&!state.threadArchived)params.threadId=state.thread.id;const data=await mcpStatusRequest(params);if(content.isConnected)content.replaceChildren(el('pre','',pretty(redact(data.find(server=>server.name===name)||{message:'当前没有此服务的目录，请刷新连接状态。'}))));}
  catch(error){if(content.isConnected)content.replaceChildren(el('p','panel-error',nativeErrorMessage(error)),button('重试',()=>showMcpDetails(name)));}
}
function showMcpAuthResult(name,result){
  const url=safeURL(result.authorizationUrl);if(!url)throw new Error('原生 MCP 未返回有效的授权链接。');
  openDialog('MCP 服务授权',root=>{
    root.dataset.mcpOAuthName=name;root.dataset.mcpOAuthLoginId=result.loginId||'';
    root.append(el('p','','为 '+name+' 完成服务自身的授权。'));
    const link=el('a','small-button','打开授权页面');link.href=url;link.target='_blank';link.rel='noopener noreferrer';root.append(link);
    const status=el('p','subtle','等待服务的原生授权结果…');status.dataset.mcpOAuthStatus='';root.append(status,el('p','subtle','关闭此窗口只关闭显示，不会取消服务端授权。原生运行时会等待回调或超时。'));
  },async()=>{},'关闭');
}
function receiveMcpOAuth(result){
  invalidateMcpCache();
  const message=result.success?'MCP 授权已完成：'+result.name:'MCP 授权未完成：'+result.name+' · '+(result.error||'服务未返回成功结果');
  const root=$('#dialog-body');
  if(root.dataset.mcpOAuthName===result.name&&(!root.dataset.mcpOAuthLoginId||root.dataset.mcpOAuthLoginId===result.loginId)){
    const status=$('[data-mcp-oauth-status]',root);if(status){status.textContent=message;status.className=result.success?'subtle':'panel-error';}
  }
  toast(message);if(state.view==='mcp')renderMcp().catch(report);
}
async function renderMcp(){
  const root=panelHeading('MCP 服务','连接外部工具。添加并启用后，Agent 可在对话中按需调用。','mcp'),actions=el('div','card-actions'),status=el('p','subtle mcp-discovery-status');status.setAttribute('role','status');
  const names=new Set(),grid=el('div','card-grid management-grid mcp-grid');let configs={},servers=[],configLoading=true,statusLoading=true,configError=null,statusError=null;
  const params={limit:100,detail:'toolsAndAuthOnly'};if(state.thread?.id&&!state.threadBusy&&!state.threadArchived)params.threadId=state.thread.id;
  const cached=state.mcpCache.get(JSON.stringify([state.selectedCwd,params]));if(cached)servers=cached.data;
  const add=button('添加自定义 MCP',()=>customMcpDialog(names),'solid-button'),refresh=button('刷新连接状态',()=>loadStatus(true));
  actions.append(add,refresh,button('重新加载配置',async()=>{invalidateMcpCache();await rpc('config/mcpServer/reload',null);await renderMcp();}));root.append(actions,status,grid);
  const active=()=>state.view==='mcp'&&grid.isConnected;
  function draw(){
    if(!active())return;names.clear();for(const name of [...Object.keys(configs),...servers.map(server=>server.name)])names.add(name);
    add.disabled=configLoading;refresh.disabled=statusLoading;status.textContent=statusLoading?(servers.length?'已显示最近状态，正在后台更新…':'正在后台连接工具服务，页面可正常操作…'):statusError?'连接状态暂不可用，已保留服务配置。':'连接状态已更新 · 完整资源按需读取';
    grid.replaceChildren();if(configError)grid.append(el('p','panel-error','读取配置失败：'+nativeErrorMessage(configError)),button('重试读取配置',loadConfig));if(statusError)grid.append(el('p','panel-error',nativeErrorMessage(statusError)),button('重试连接状态',()=>loadStatus(true)));
    for(const name of names){
      const config=configs[name],server=servers.find(server=>server.name===name),enabled=config?.enabled!==false,card=el('article','card mcp-card');card.dataset.mcpName=name;
      const heading=el('div','skill-card-heading');heading.append(el('h3','',name),el('span','tag',enabled?'已启用':'已停用'));card.append(heading);
      if(config)card.append(el('p','subtle',config.url?new URL(config.url).origin+' · HTTP':config.command+' · stdio'));
      if(enabled){const needsAuth=server?.runtimeStatus==='authenticationRequired'||!!config?.url&&server?.authStatus==='notLoggedIn',runtime=needsAuth?'需要认证':({notStarted:'尚未连接',starting:'连接中',connected:'已连接',authenticationRequired:'需要认证',failed:'连接失败',cancelled:'连接已取消',disabled:'原生策略已停用'}[server?.runtimeStatus]||(server?.toolsError?'连接失败':null));card.append(el('p','mcp-state',server?(runtime||'工具目录已就绪')+' · '+Object.keys(server.tools||{}).length+' 个工具':statusError?'暂时无法获取连接状态':'正在读取连接状态…'));if(server?.toolsError)card.append(el('p','panel-error',nativeErrorMessage(new Error(server.toolsError))));}
      const controls=el('div','card-actions');if(config)controls.append(button(enabled?'停用':'启用',async()=>{const before=await rpc('config/read',{includeLayers:true,cwd:state.selectedCwd});await writeMcpConfig(name,!enabled,before,'enabled');toast('MCP 已'+(enabled?'停用':'启用')+'，从下一次任务开始生效');await renderMcp();}));
      if(enabled)controls.append(button('查看工具与资源',()=>showMcpDetails(name)));if(enabled&&config?.url)controls.append(button('OAuth 登录',async()=>showMcpAuthResult(name,await rpc('mcpServer/oauth/login',{name}))));card.append(controls);grid.append(card);
    }
    if(!names.size)grid.append(el('div','card subtle',configLoading?'正在读取服务配置…':statusLoading?'还没有自定义 MCP，可点击上方按钮添加。正在发现其他工具服务…':'还没有 MCP，点击上方按钮添加。'));
  }
  async function loadConfig(){configLoading=true;configError=null;draw();try{const result=await rpc('config/read',{includeLayers:true,cwd:state.selectedCwd});configs=result.config?.mcp_servers||{};}catch(error){configError=error;}finally{configLoading=false;draw();}}
  async function loadStatus(force=false){statusLoading=true;statusError=null;draw();try{servers=await mcpStatusRequest(params,force);}catch(error){statusError=error;}finally{statusLoading=false;draw();}}
  state.mcpViewUpdate=p=>{if(!active()||p.threadId&&p.threadId!==state.thread?.id)return;const server=servers.find(server=>server.name===p.name);if(server){server.runtimeStatus={starting:'starting',ready:'connected',failed:'failed',cancelled:'cancelled'}[p.status];if(p.error)server.toolsError=p.error;draw();}};
  draw();loadConfig();loadStatus();
}
async function renderPlugins(){
  const root=panelHeading('本地插件','原生目录中的扩展；具体服务和网络依赖由配置决定。','grid');
  const pluginSection=el('div','section-card');
  pluginSection.append(el('h3','','插件'),el('p','subtle','正在读取原生插件目录…'));root.append(pluginSection);
  rpc('plugin/list',{cwds:[state.selectedCwd]}).then(result=>{
    if(!pluginSection.isConnected)return;pluginSection.replaceChildren(el('h3','','插件'));const grid=el('div','card-grid');pluginSection.append(grid);
    for(const marketplace of result.marketplaces||[])for(const plugin of marketplace.plugins||[]){const card=el('article','card');card.append(el('h3','',plugin.interface?.displayName||plugin.name),el('p','',plugin.interface?.shortDescription||plugin.interface?.longDescription||''),el('span','tag',plugin.installed?(plugin.enabled?'已安装':'已停用'):'可安装'),el('div','path',marketplace.name));card.append(button('详情与原生操作',()=>{state.currentMethod=plugin.installed?'plugin/read':'plugin/install';showView('protocol');}),button('查看元数据',()=>showJSON(plugin.name,plugin)));grid.append(card);}
    if(!grid.children.length)pluginSection.append(el('p','subtle','当前配置没有可用插件目录。可配置本地插件源；远端市场需单独核实网络与服务依赖。'));for(const error of result.marketplaceLoadErrors||[])pluginSection.append(el('p','subtle',pretty(error)));
  }).catch(error=>{if(pluginSection.isConnected)pluginSection.replaceChildren(el('h3','','插件'),el('p','subtle',nativeErrorMessage(error)));});
  root.append(button('打开完整原生管理接口',()=>{state.currentMethod='plugin/list';showView('protocol');}));
}
function resolveSchema(schema, root=state.schema, seen=new Set()){if(!schema || typeof schema!=='object')return {};if(schema.$ref){const name=schema.$ref.split('/').pop();if(seen.has(name))return {};return resolveSchema(root.definitions?.[name],root,new Set([...seen,name]));}if(schema.allOf)return resolveSchema(schema.allOf[0],root,seen);return schema;}
function schemaSample(schema, root=state.schema, depth=0){schema=resolveSchema(schema,root);if(depth>7)return null;if(schema.default!==undefined)return schema.default;if(schema.enum)return schema.enum[0];if(schema.oneOf || schema.anyOf)return schemaSample((schema.oneOf||schema.anyOf).find(x=>x.type!=='null')||{},root,depth+1);const type=Array.isArray(schema.type)?schema.type.find(x=>x!=='null'):schema.type;if(type==='object'||schema.properties){const out={};for(const name of schema.required||[])out[name]=schemaSample(schema.properties?.[name]||{},root,depth+1);return out;}if(type==='array')return [];if(type==='boolean')return false;if(type==='integer'||type==='number')return 0;if(type==='string')return '';return null;}
function methodEntries(){return (state.schema?.oneOf||[]).map(entry=>({method:entry.properties.method.enum[0],schema:entry.properties.params||{},entry}));}
async function renderProtocol(){
  if(!state.schema)state.schema=await fetchJSON('/api/schema/ClientRequest.json');if(state.view!=='protocol')return;
  const entries=methodEntries().filter(entry=>!scopeExclusion(entry.method));const root=panelHeading('原生协议与可用范围','列出当前范围内的原生操作；完整协议定义仍由实际程序导出。接口存在不代表所有模型和网络条件已满足。','code');
  const strip=el('div','status-strip');strip.append(el('span','tag',entries.length+' 个原生接口'),el('span','tag',state.status?.version||'Codex'),el('span','tag','实验性协议已启用'));root.append(strip);
  const layout=el('div','protocol-layout'),left=el('div'),search=el('input','protocol-search'),list=el('div','protocol-methods'),right=el('div');search.placeholder='搜索方法，如 thread / fs';search.ariaLabel='搜索原生方法';left.append(search,list);layout.append(left,right);root.append(layout);
  function select(entry){state.currentMethod=entry.method;right.replaceChildren(el('h3','',entry.method));const schema=resolveSchema(entry.schema),exclusion=scopeExclusion(entry.method);if(exclusion)right.append(el('p','panel-error',exclusion));right.append(el('p','schema-description',schema.description||entry.entry.description||'请求将原样发送给 codex app-server。'));if(entry.method.startsWith('windowsSandbox/'))right.append(el('p','schema-description','Windows 专用接口。Linux 主机使用 Codex 原生 Linux 沙箱，无需运行此设置。'));if(entry.method.startsWith('thread/realtime/'))right.append(el('p','schema-description','需要模型服务支持实时 API；普通对话可独立使用。启动请求返回后，请继续查看下方原生事件中的连接结果。'));const editor=el('textarea','code-editor');editor.id='rpc-params';editor.ariaLabel='原生请求参数';const sample=schemaSample(entry.schema);if(sample && typeof sample==='object'){if('threadId' in sample)sample.threadId=state.thread?.id||'';if('cwd' in sample)sample.cwd=state.selectedCwd;if('path' in sample)sample.path=state.selectedCwd;}editor.value=pretty(sample);right.append(editor);const controls=el('div','protocol-controls');controls.append(button('查看完整参数定义',()=>showJSON(entry.method+' 参数',{$schema:state.schema.$schema,...schema,definitions:state.schema.definitions})),button('执行原生请求',async()=>{const result=$('#rpc-result');result.textContent='等待原生结果…';try{const value=await rpc(entry.method,JSON.parse(editor.value),600000);result.textContent=pretty(redact(value));}catch(error){result.textContent=error.message;}},'solid-button'));if(exclusion)controls.lastElementChild.disabled=true;right.append(controls);const result=el('pre','protocol-result','结果将显示在这里');result.id='rpc-result';right.append(result);$$('button',list).forEach(node=>node.classList.toggle('selected',node.textContent===entry.method));}
  function filter(){list.replaceChildren();for(const entry of entries.filter(x=>x.method.toLowerCase().includes(search.value.toLowerCase())))list.append(button(entry.method,()=>select(entry),'method'+(entry.method===state.currentMethod?' selected':'')));}search.oninput=filter;filter();select(entries.find(x=>x.method===state.currentMethod)||entries.find(x=>x.method==='config/read')||entries[0]);
  const events=el('div','section-card');events.style.marginTop='25px';events.append(el('h3','','原生事件流'));const log=el('div','events');log.id='event-log';events.append(log,button('清空事件',()=>{state.events=[];renderEvents();}));root.append(events);renderEvents();
}
function renderEvents(){const log=$('#event-log');if(!log)return;log.replaceChildren();for(const event of state.events.slice(-100).reverse()){const row=el('details','event-row');row.append(el('summary','',event.at+'  '+event.method),el('pre','',pretty(redact(event.params))));log.append(row);}if(!state.events.length)log.append(el('p','subtle','等待原生运行时事件…'));}
async function renderSettings(){
  const generation=state.settingsGeneration=(state.settingsGeneration||0)+1;
  const result=await rpc('config/read',{includeLayers:true,cwd:state.selectedCwd});
  if(state.view!=='settings'||generation!==state.settingsGeneration)return;
  state.config=result;const config=result.config||{};
  if(typeof refreshPermissionDefaults==='function')refreshPermissionDefaults(config);
  const root=panelHeading('分析设置','设置分析体验，管理可用的技能与工具。','settings');
  const appearance=el('div','section-card');appearance.append(el('h3','','使用偏好'));root.append(appearance);
  settingRow(appearance,'外观','保存在当前浏览器。',button(document.documentElement.dataset.theme==='dark'?'深色':'浅色',()=>{toggleTheme();return renderSettings();}));
  settingRow(appearance,'Skills 技能','查看、配置和启停当前可用的技能。',button('管理 Skills',()=>showView('skills')));
  settingRow(appearance,'MCP 工具','添加或配置服务，管理启停及连接状态。',button('管理 MCP',()=>showView('mcp')));
  const advanced=el('details','section-card analysis-advanced-settings');advanced.id='analysis-advanced-settings';advanced.open=!!state.settingsAdvancedOpen;
  advanced.append(el('summary','','高级设置'),el('p','subtle','原生运行配置和诊断工具。当前实例的用户均可操作；折叠入口不构成权限隔离。请先了解配置影响。'));
  advanced.ontoggle=()=>{state.settingsAdvancedOpen=advanced.open;};root.append(advanced);
  const controls=$('#analysis-advanced-controls');
  if(controls){const session=el('div','analysis-session-settings');session.append(el('h3','','当前分析的运行设置'),el('p','subtle','模型、推理强度与 Agent 文件执行权限沿用原生处理。Agent 沙箱权限不替代数据库访问控制。'),controls);advanced.append(session);}
  const workspace=el('div','section-card');workspace.append(el('h3','','分析空间与维护'));advanced.append(workspace);
  settingRow(workspace,'工作目录',state.selectedCwd,button('更改目录',editProject));
  settingRow(workspace,'分析空间','使用原生项目组织分析记录和工作目录。',button('管理空间',()=>showProjects()));
  settingRow(workspace,'目录浏览','查看原始工作目录与文件；日常成果请使用右上角「资料与成果」。',button('浏览原始目录',()=>fileBrowser()));
  settingRow(workspace,'工作区初始化','检查工作目录并生成 AGENTS.md。已有文件不会覆盖；此操作会提交真实任务。',button('初始化工作区',()=>initializeWorkspace()));
  settingRow(workspace,'持续目标','配置持续推进的目标及预算；与分析计划分开管理。',button('管理持续目标',()=>showGoalDialog()));
  settingRow(workspace,'原生协议诊断','直接查看并调用当前版本的原生接口，执行结果和错误保持可诊断。',button('打开原生协议',()=>showView('protocol')));
  settingRow(workspace,'模型服务','查看实际提供方、端点与凭据配置方式。',button('查看服务连接',()=>showView('account')));
  const databaseSettings=el('div');databaseSettings.id='analysis-advanced-databases';advanced.append(databaseSettings);
  const execution=el('div','section-card');execution.append(el('h3','','原生运行配置'));advanced.append(execution);
  const version=result.layers?.find(layer=>layer.name?.type==='user')?.version;
  for(const [label,key,values] of [['沙箱','sandbox_mode',['read-only','workspace-write','danger-full-access']],['审批策略','approval_policy',['untrusted','on-request','never']]]){
    const select=el('select');for(const value of values)select.append(new Option(value,value));select.value=typeof config[key]==='string'?config[key]:values[0];select.ariaLabel=label;
    select.onchange=async()=>{select.disabled=true;try{await rpc('config/value/write',{keyPath:key,value:select.value,mergeStrategy:'replace',expectedVersion:version,reloadUserConfig:true});toast('原生配置已保存');await renderSettings();}catch(error){report(error);await renderSettings();}finally{select.disabled=false;}};
    settingRow(execution,label,'由 Codex 原生执行；部分配置从新分析开始生效。',select);
  }
  const network=el('input');network.type='checkbox';network.ariaLabel='允许工作区沙箱访问网络';network.checked=config.sandbox_workspace_write?.network_access===true;
  network.onchange=async()=>{const enabled=network.checked;network.disabled=true;try{await rpc('config/value/write',{keyPath:'sandbox_workspace_write.network_access',value:enabled,mergeStrategy:'replace',expectedVersion:version,reloadUserConfig:true});const policy=state.threadSettings.get(state.thread?.id)?.sandboxPolicy;if(state.thread&&!state.threadBusy&&!state.threadArchived&&policy?.type==='workspaceWrite')await rpc('thread/settings/update',{threadId:state.thread.id,sandboxPolicy:{...policy,networkAccess:enabled}});toast('沙箱网络设置已保存，审批策略保持原样');await renderSettings();}catch(error){report(error);await renderSettings();}finally{network.disabled=false;}};
  settingRow(execution,'沙箱网络访问','允许 workspace-write 沙箱内联网。保留文件边界和原生危险操作审批；新分析使用此设置。',network);
  const currentPolicy=state.threadSettings.get(state.thread?.id)?.sandboxPolicy;
  if(state.thread&&!state.threadBusy&&!state.threadArchived&&currentPolicy?.type==='workspaceWrite'&&currentPolicy.networkAccess!==network.checked)settingRow(execution,'当前分析的网络设置','历史记录保留原生权限快照，仅同步网络设置，保留其他文件权限。',button('应用到当前分析',async()=>{await rpc('thread/settings/update',{threadId:state.thread.id,sandboxPolicy:{...currentPolicy,networkAccess:network.checked}});toast('已将网络设置应用到当前分析后续任务');await renderSettings();}));
  const planToggle=el('input');planToggle.type='checkbox';planToggle.ariaLabel='启用原生计划工具';planToggle.checked=result.layers?.find(layer=>layer.config?.tools?.update_plan?.enabled!==undefined)?.config.tools.update_plan.enabled===true;
  planToggle.onchange=async()=>{planToggle.disabled=true;try{await rpc('config/value/write',{keyPath:'tools.update_plan.enabled',value:planToggle.checked,mergeStrategy:'replace',reloadUserConfig:true});toast('已保存，从新分析开始生效');await renderSettings();}catch(error){report(error);await renderSettings();}finally{planToggle.disabled=false;}};
  settingRow(execution,'原生计划工具','允许 Codex 使用 update_plan 展示实际步骤，从新分析开始生效。',planToggle);
  settingRow(execution,'自定义模型','提供方配置中的模型名，可用性以实际请求为准。当前项目统一使用 DeepSeek Flash 验证。',button('设置模型名',()=>askText('自定义模型','模型 ID',$('#model').value,async value=>{if(isRemovedModel(value,modelProvider()))throw new Error('此模型已从本项目移除，请使用当前第三方提供方模型。');if(!$$('#model option').some(x=>x.value===value)){const option=new Option(value,value);option.dataset.provider=modelProvider();$('#model').append(option);}$('#model').value=value;localStorage.setItem(modelPreferenceKey(),value);loadEfforts();})));
  const editorCard=el('div','section-card');editorCard.append(el('h3','','用户配置 JSON'),el('p','subtle','仅保存修改的字段，并保留未修改的设置。含密钥字段已隐藏。'));
  const editor=el('textarea','code-editor');editor.ariaLabel='原生配置编辑器';const editable=result.layers?.find(layer=>layer.name?.type==='user'&&!layer.name?.profile)?.config||config;editor.value=pretty(redact(editable));
  editorCard.append(editor,button('保存修改的配置项',async()=>{const next=JSON.parse(editor.value);if(!next||typeof next!=='object'||Array.isArray(next))throw new Error('请输入 JSON 配置对象');const edits=configDiff(redact(editable),next);if(!edits.length)return toast('没有配置变更');if(pretty(edits).includes('[已隐藏]'))throw new Error('请通过原生协议诊断编辑含密钥的配置项');await rpc('config/batchWrite',{edits,expectedVersion:version,reloadUserConfig:true});toast('配置已保存');await renderSettings();}));advanced.append(editorCard);
  const about=el('div','section-card');about.append(el('h3','','源码与运行时'),el('pre','protocol-result',pretty(state.status)));if(state.status?.baseline?.sourceCommit)about.append(el('p','subtle','原生程序由此官方提交直接构建。启动时核对源码、程序校验值和完整协议；可通过官方更新脚本升级。'));advanced.append(about);
  if(typeof renderDatabaseSettings==='function')await renderDatabaseSettings(databaseSettings);
}
function settingRow(root,label,description,control){const row=el('div','settings-row'),text=el('div');text.append(el('label','',label),el('small','',description));row.append(text,control);root.append(row);}
async function rollbackThread(id){
  const generation=state.navigationGeneration,current=()=>state.thread?.id===id&&state.navigationGeneration===generation;
  const turns=await performThreadAction(id,()=>paged('thread/turns/list',{threadId:id,itemsView:'full',sortDirection:'desc',limit:100}));
  if(!current())return;
  const candidates=turns.filter(turn=>turn.items?.some(item=>item.type==='userMessage')&&!turn.items?.some(item=>['enteredReviewMode','exitedReviewMode','contextCompaction'].includes(item.type)));
  if(!candidates.length)throw new Error('没有可回退的普通用户任务');
  openDialog('回退用户任务',root=>{
    root.append(el('p','','将移除所选用户任务及其后的会话记录。磁盘文件不会因此撤销。'));
    const select=el('select','field-input');select.id='rollback-turn';select.ariaLabel='回退起点';
    for(const turn of candidates){const user=turn.items.find(item=>item.type==='userMessage');const text=(user.content||[]).map(item=>item.text||'').join(' ').slice(0,110)||turn.id;select.append(new Option(text,turn.id));}
    root.append(select);
  },async root=>{
    if(!current())throw new Error('当前会话已切换，请重新打开目标会话后选择回退');
    const reason=threadActionReason('revert',{thread:state.thread,archived:state.threadArchived});if(reason)throw new Error(reason);
    await performThreadAction(id,()=>rpc('thread/revert',{threadId:id,beforeTurnId:$('#rollback-turn',root).value}));
    if(current())await openThread(id);
  },'回退');
}
async function renderAccount(){
  const result=await rpc('config/read',{includeLayers:false,cwd:state.selectedCwd});if(state.view!=='account')return;
  const config=result.config||{},provider=config.model_provider||'openai',details=config.model_providers?.[provider]||{};
  const root=panelHeading('模型服务连接','查看当前提供方、服务端点与凭据配置方式。','settings');
  const card=el('div','section-card');card.append(el('h3','','当前默认提供方'),el('pre','protocol-result',pretty({provider,model:config.model,endpoint:details.base_url||'原生内置端点',credentialEnvironment:details.env_key||'由原生提供方管理'})),el('p','subtle','密钥通过提供方 env_key 指定的服务器环境变量注入，修改后重启本实例。密钥不保存在网页中。'),button('打开提供方配置',()=>showView('settings')));root.append(card);
  const scope=el('div','section-card');scope.append(el('h3','','运行与网络范围'),el('p','','验证统一使用 deepseek-flash；允许 DeepSeek 官方 API 和国内公网。'),el('p','subtle','此页面说明产品范围，不代替服务器出口策略。自定义模型、插件、Skills 和 MCP 需要逐项检查实际请求目标。'));root.append(scope);
}
function renderMcpRequest(request,card,choices) {
  const data=request.params||{},meta=data._meta||{},schema=data.requestedSchema||{},fields=[];
  card.insertBefore(el('p','',data.message||data.description||'MCP 服务需要你的确认'),choices);
  if(meta.tool_params)card.insertBefore(el('pre','',pretty(redact(meta.tool_params))),choices);
  if(data.url&&safeURL(data.url)){const link=el('a','small-button','打开 MCP 授权页面');link.href=safeURL(data.url);link.target='_blank';link.rel='noopener noreferrer';card.insertBefore(link,choices);}
  for(const [name,definition]of Object.entries(schema.properties||{})){
    const group=el('div','form-field'),label=el('label','',definition.title||name);let input;
    const options=definition.enum||definition.oneOf?.map(option=>option.const);
    if(options){input=el('select','field-input');options.forEach((value,index)=>input.append(new Option(definition.enumNames?.[index]||definition.oneOf?.[index]?.title||String(value),String(value))));}
    else if(definition.type==='array'){input=el('textarea','code-editor compact-editor');input.value=pretty(definition.default||[]);}
    else{input=el('input','field-input');input.type=definition.type==='boolean'?'checkbox':['number','integer'].includes(definition.type)?'number':'text';if(input.type==='checkbox')input.checked=definition.default===true;else input.value=definition.default??'';if(input.type==='number')input.step=definition.type==='integer'?'1':'any';}
    input.ariaLabel=definition.title||name;input.required=(schema.required||[]).includes(name)&&input.type!=='checkbox';
    for(const [attribute,key]of [['min','minimum'],['max','maximum'],['minLength','minLength'],['maxLength','maxLength'],['pattern','pattern']])if(definition[key]!=null)input[attribute]=definition[key];
    group.append(label,input);if(definition.description)group.append(el('p','subtle',definition.description));card.insertBefore(group,choices);fields.push({name,input,definition});
  }
  if(data.mode!=='openai/userVerification')choices.append(button(meta.codex_approval_kind==='mcp_tool_call'?'允许本次 MCP 调用':'确认并继续',()=>{
    const content=[];
    for(const {name,input,definition}of fields){if(!input.reportValidity())throw new Error('请检查 MCP 表单输入');if(!input.value&&!input.required&&input.type!=='checkbox')continue;let value=input.type==='checkbox'?input.checked:['number','integer'].includes(definition.type)?Number(input.value):definition.type==='array'?JSON.parse(input.value):input.value;if(definition.type==='array'&&(!Array.isArray(value)||value.some(v=>typeof v!=='string')))throw new Error('多选值必须是字符串 JSON 数组');content.push([name,value]);}
    sendResponse(request,{action:'accept',content:Object.fromEntries(content)});
  }));
  choices.append(button('拒绝 MCP 请求',()=>sendResponse(request,{action:'decline',content:null})),button('取消 MCP 请求',()=>sendResponse(request,{action:'cancel',content:null,_meta:{codex_approval_cancellation_reason:'user'}})));
}
function renderRequests(){
  const root=$('#requests');root.replaceChildren();
  const others=new Set();
  for(const request of state.requests.values()){
    const p=request.params||{};
    if(p.threadId&&p.threadId!==state.thread?.id){if(!others.has(p.threadId)){others.add(p.threadId);const name=state.threads.find(t=>t.id===p.threadId)?.name||'另一会话';root.append(button(name+' 正在等待回应 · 点击查看',()=>openThread(p.threadId),'small-button pending-request-link'));}continue;}
const card=el('div','request-card');card.append(el('h3','',request.method.includes('requestApproval')?'Codex 请求你的审批':'Codex 需要你的回应'),el('pre','',pretty(redact(p))));const choices=el('div','choices');card.append(choices);
    const method=request.method;
    if(method==='mcpServer/elicitation/request')renderMcpRequest(request,card,choices);
    else if(method==='item/commandExecution/requestApproval'||method==='item/fileChange/requestApproval'){for(const [label,decision] of [['允许一次','accept'],['本会话允许','acceptForSession'],['拒绝','decline'],['拒绝并中断','cancel']])choices.append(button(label,()=>sendResponse(request,{decision})));}
    else if(method==='item/tool/requestUserInput'){
      const inputs=[];for(const question of p.questions||[]){const group=el('div','question');group.append(el('p','',question.question));if(question.options?.length){for(const [index,option]of question.options.entries()){const label=el('label'),input=el('input');input.type='radio';input.name='q-'+request.id+'-'+question.id;input.value=option.label;label.append(input,document.createTextNode(' '+option.label+(option.description?' · '+option.description:'')));group.append(label);}}const input=el('input','field-input');input.placeholder='输入你的回答';input.ariaLabel=question.question;group.append(input);inputs.push({id:question.id,input,group});card.insertBefore(group,choices);}choices.append(button('提交回答',()=>{const answers={};for(const question of inputs){const value=question.input.value||$('input:checked',question.group)?.value;if(!value)throw new Error('请回答所有问题');answers[question.id]={answers:[value]};}sendResponse(request,{answers});},'solid-button'));
    } else if(method==='item/permissions/requestApproval'){choices.append(button('授予本次权限',()=>sendResponse(request,{permissions:p.permissions||{},scope:'turn'})),button('拒绝',()=>sendResponse(request,{permissions:{},scope:'turn'})));}
    if(method==='currentTime/read')choices.append(button('提供当前时间',()=>sendResponse(request,{currentTimeAt:Math.floor(Date.now()/1000)})));
    const editor=el('textarea','code-editor');editor.ariaLabel='原生响应 JSON';editor.value=pretty(responseSample(request));const details=el('details');details.append(el('summary','','自定义原生响应'),editor,button('发送响应',()=>sendResponse(request,JSON.parse(editor.value))),button('加载响应参数模板',async()=>{const entry=state.serverSchema.oneOf.find(x=>x.properties.method.enum[0]===method);const type=entry?.properties.params.$ref?.split('/').pop().replace(/Params$/,'Response');if(!type)throw new Error('该请求没有响应模板');const schema=await fetchJSON('/api/schema/'+type+'.json');editor.value=pretty(schemaSample(schema,schema));}));card.append(details);if(request.responded){card.append(el('p','subtle','决定已发送，等待 Codex 确认…'));for(const input of card.querySelectorAll('button,input,textarea,select'))input.disabled=true;}root.append(card);
  }
  if(typeof renderExecutionProgressBanner==='function')renderExecutionProgressBanner();
}
function responseSample(request){const method=request.method;if(method.includes('mcpServer/elicitation'))return {action:'decline',content:null};if(method==='item/tool/call')return {contentItems:[{type:'inputText',text:''}],success:false};if(method==='execCommandApproval'||method==='applyPatchApproval')return {decision:'denied'};if(method.includes('requestApproval'))return {decision:'decline'};return {};}
function renderAttachments(){composerState().attachments=state.attachments;const root=$('#attachments');root.replaceChildren();state.attachments.forEach((a,index)=>{const chip=el('div','attachment');if(a.preview){const img=el('img');img.src=a.preview;img.alt=a.name;chip.append(img);}chip.append(el('span','',a.name),button('×',()=>{state.attachments.splice(index,1);renderAttachments();},''));root.append(chip);});}
async function readAttachments(files,draft=composerState()) {
  for(const file of Array.from(files)){
    if(file.size>16*1024*1024){toast(file.name+' 超过 16 MiB');continue;}
    if(file.type.startsWith('image/')||file.type.startsWith('audio/')){
      const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('无法读取 '+file.name));reader.readAsDataURL(file);});
      draft.attachments.push({name:file.name,preview:file.type.startsWith('image/')?url:null,input:{type:file.type.startsWith('image/')?'image':'audio',url}});
    }else{const text=await file.text();draft.attachments.push({name:file.name,input:{type:'text',text:'文件 '+file.name+'\n'+text,text_elements:[]}});}
  }
  if(composerState()===draft)renderAttachments();
}

async function fileBrowser(path=state.selectedCwd){const data=await rpc('fs/readDirectory',{path});$('#file-panel').hidden=false;$('#file-path').textContent=path;$('#file-tree').replaceChildren(button('..',()=>fileBrowser(path.split('/').slice(0,-1).join('/')||'/'),'file-row'));$('#file-preview').hidden=true;for(const entry of data.entries||[]){const name=typeof entry==='string'?entry:entry.fileName||entry.name;const full=path.replace(/\/$/,'')+'/'+name;const isDirectory=entry.isDirectory||entry.type==='directory';const row=button('',async()=>{if(isDirectory)return fileBrowser(full);{const result=await rpc('fs/readFile',{path:full});const pre=$('#file-preview');pre.textContent=result.text||result.content||(result.dataBase64?new TextDecoder().decode(Uint8Array.from(atob(result.dataBase64),c=>c.charCodeAt(0))):pretty(result));pre.hidden=false;}},'file-row');row.append(icon(isDirectory?'folder':'file'),document.createTextNode(name));$('#file-tree').append(row);}}
async function threadAction(action,target=null){
  target=target||{thread:state.thread,archived:state.threadArchived};
  const thread=target.thread,id=thread?.id,generation=state.navigationGeneration;if(!id)return;
  const reason=threadActionReason(action,target);if(reason)throw new Error(reason);
  const perform=work=>performThreadAction(id,work);
  switch(action){
    case'delete':
      return openDialog('永久删除会话',root=>{
        root.append(el('p','','将永久删除“'+(thread.name||thread.preview||id)+'”的会话历史及其创建的子代理会话，无法撤销。'));
        root.append(el('p','','如果只是想从分析记录中收起，请取消后选择「归档（保留历史）」。永久删除不会回滚工作区文件或删除业务数据库。'));
        if(state.thread?.id===id&&state.threadBusy)root.append(el('p','','打开此历史时检测到其他页面或 Codex 进程占用。请关闭占用方，再点击「永久删除」重新检查；原生确认释放后才能删除，网页不会强制关闭其他连接。'));
        else if(state.activeTurns.has(id)||thread.status?.type==='active')root.append(el('p','','此会话中的当前任务会被停止。'));
        const error=el('p','thread-removal-error panel-error');error.hidden=true;error.setAttribute('role','alert');root.append(error);
      },async root=>{
        const notice=$('.thread-removal-error',root);notice.hidden=true;
        try{await perform(()=>rpc('thread/delete',{threadId:id}));}
        catch(error){
          const message=/already has an active writer/i.test(error.message)?'此会话仍被其他页面或 Codex 进程占用，历史尚未删除。请关闭占用方后，在此窗口再次点击「永久删除」重试。原生原因：'+nativeErrorMessage(error):/forked history still references it/i.test(error.message)?'此会话仍被分叉会话引用。请先删除相关分叉会话，再重试永久删除；历史尚未删除。原生原因：'+nativeErrorMessage(error):nativeErrorMessage(error);
          notice.textContent=message;notice.hidden=false;throw new Error(message);
        }
        if(state.thread?.id===id)resetChat();forgetThreadDraft(id);await loadThreads();toast('会话历史已永久删除，无法恢复。');
      },'永久删除');
    case'rename':return askText('重命名会话','会话名称',thread.name||'',async name=>{await perform(()=>rpc('thread/name/set',{threadId:id,name}));if(state.thread?.id===id){state.thread.name=name;$('#page-title').textContent=name;}await loadThreads();});
    case'fork':{const result=await perform(()=>rpc('thread/fork',{threadId:id}));if(generation===state.navigationGeneration)return openThread(result.thread.id);await loadThreads();return toast('分叉会话已创建，可从侧栏打开。');}
    case'compact':await perform(()=>rpc('thread/compact/start',{threadId:id}));return toast('已请求原生上下文压缩');
    case'review':await perform(()=>rpc('review/start',{threadId:id,target:{type:'uncommittedChanges'}}));return;
    case'revert':return rollbackThread(id);
    case'unarchive':
      await perform(()=>rpc('thread/unarchive',{threadId:id}));
      if(state.thread?.id===id&&generation===state.navigationGeneration){setArchiveScope(false);await openThread(id,{archived:false,replace:true});}
      await loadThreads();toast('已恢复到「分析记录」，可以继续对话。');return;
    case'archive':
      try{await perform(()=>rpc('thread/archive',{threadId:id}));}catch(error){if(/already has an active writer/i.test(error.message))throw new Error('此会话被其他页面或 Codex 进程占用，尚未归档。请关闭占用方后重试。原生原因：'+nativeErrorMessage(error));throw error;}if(state.thread?.id===id)resetChat();
      await loadThreads();toast('已归档，历史仍保留。可在左侧「已归档」中恢复或永久删除。');return;
    case'export':{const result={thread,turns:await paged('thread/turns/list',{threadId:id,itemsView:'full',sortDirection:'asc',limit:100})};const url=URL.createObjectURL(new Blob([pretty(result)],{type:'application/json'}));const link=el('a');link.href=url;link.download='codex-'+id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  }
}
function terminalFit(){
  if(!term||!termFit||$('#terminal-panel').hidden)return;
  const dimensions=termFit.proposeDimensions();if(!dimensions||dimensions.cols<2||dimensions.rows<2)return;
  termFit.fit();
  if(termWS?.readyState===WebSocket.OPEN)termWS.send(JSON.stringify({cols:term.cols,rows:term.rows}));
}
function terminalStatus(text){$('#terminal-status').textContent=text;}
function openTerminal(){
  $('#terminal-panel').hidden=false;
  if(!term){
    if(!window.Terminal||!window.FitAddon)return toast('本地终端组件缺失');
    term=new Terminal({fontFamily:'ui-monospace, SFMono-Regular, Consolas, monospace',fontSize:12,lineHeight:1.15,cursorBlink:true,disableStdin:true,theme:{background:'#161b17',foreground:'#dae3d8'},scrollback:10000,allowProposedApi:false});
    termFit=new FitAddon.FitAddon();term.loadAddon(termFit);term.open($('#terminal'));
    term.writeln('\x1b[90m点击上方「启动 CLI」进入 Codex 命令行。\r\n参数框使用 JSON 数组，默认 []；例如 ["--help"]。\x1b[0m');
    term.onData(data=>{if(termWS?.readyState===WebSocket.OPEN){term.scrollToBottom();termWS.send(JSON.stringify({data:btoa(String.fromCharCode(...new TextEncoder().encode(data)))}));}});
    termResize=new ResizeObserver(()=>{cancelAnimationFrame(termResizeFrame);termResizeFrame=requestAnimationFrame(terminalFit);});termResize.observe($('#terminal'));
    document.fonts?.ready.then(terminalFit);
  }
  terminalFit();if(termWS?.readyState===WebSocket.OPEN)term.focus();else $('#terminal-start').focus();
}
function startTerminal(){
  const args=JSON.parse($('#cli-args').value);if(!Array.isArray(args)||args.some(arg=>typeof arg!=='string'))throw new Error('CLI 参数必须为字符串数组');
  openTerminal();if(!term)return;
  termWS?.close();term.options.disableStdin=true;term.reset();term.writeln('\x1b[90m正在启动 Codex CLI…\x1b[0m');terminalStatus('连接中');
  const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/terminal?'+new URLSearchParams({cwd:state.selectedCwd,args:JSON.stringify(args)}));termWS=ws;
  ws.onopen=()=>{if(termWS!==ws)return;terminalFit();term.options.disableStdin=false;terminalStatus('运行中');term.focus();};
  ws.onmessage=event=>{if(termWS!==ws)return;const msg=JSON.parse(event.data);if(msg.data)term.write(Uint8Array.from(atob(msg.data),c=>c.charCodeAt(0)));if(msg.exit!=null){term.options.disableStdin=true;terminalStatus('已退出');term.writeln('\r\n\x1b[90m进程退出：'+msg.exit+'\x1b[0m');}if(msg.bridge==='error'){term.options.disableStdin=true;terminalStatus('启动失败');term.writeln(msg.message);}};
  ws.onclose=()=>{if(termWS!==ws)return;term.options.disableStdin=true;terminalStatus('连接已关闭');term.writeln('\r\n\x1b[90m终端连接已关闭，可点击「启动 CLI」重新进入。\x1b[0m');};
  ws.onerror=()=>{if(termWS===ws)terminalStatus('连接失败');};
}
function expandTerminal(){const expanded=$('.main').classList.toggle('terminal-expanded');$('#terminal-expand').textContent=expanded?'还原':'展开';$('#terminal-expand').ariaLabel=expanded?'还原终端面板':'展开终端面板';requestAnimationFrame(()=>{terminalFit();term?.focus();});}
function toggleTheme(){const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('codex.theme',theme);}
async function fetchJSON(path){const response=await fetch(path);if(!response.ok)throw new Error((await response.json()).error||'HTTP '+response.status);return response.json();}
async function init(){
  const cleanURL=new URL(location.href);cleanURL.searchParams.delete('token');history.replaceState(null,'',cleanURL);switchComposer(threadRoute().id||'new');state.threadLoading=!!threadRoute().id;updateSend();window.addEventListener('popstate',()=>restoreThreadRoute().catch(report));document.documentElement.dataset.theme=localStorage.getItem('codex.theme')||'light';if(innerWidth<760)document.body.classList.add('sidebar-hidden');
  $$('[data-view]').forEach(node=>node.onclick=()=>{if(node.id==='new-chat'){resetChat();}showView(node.dataset.view);});
  $('#collapse').onclick=()=>document.body.classList.add('sidebar-hidden');$('#show-sidebar').onclick=()=>document.body.classList.remove('sidebar-hidden');$('#theme-toggle').onclick=toggleTheme;
  $('#project-edit').onclick=()=>editProject().catch(report);$('#project-button').onclick=$('#project-edit').onclick;$('#cwd-button').onclick=$('#project-edit').onclick;
  $('#dialog-close').onclick=()=>$('#dialog').close();$('#dialog-cancel').onclick=()=>$('#dialog').close();
  $('#send').onclick=()=>{const active=!state.threadBusy&&!state.threadArchived&&state.activeTurns.get(state.thread?.id);Promise.resolve(active?interruptTurn():submitPrompt()).catch(report);};
  $('#prompt').onkeydown=event=>{if(commandMenuKey(event))return;if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();submitPrompt().catch(report);}};
  $('#prompt').oninput=()=>{const draft=saveComposer();draft.revision=(draft.revision||0)+1;resizePrompt();updateSend();updateCommandMenu();};
  $('#conversation-scroll').onscroll=()=>{rememberScroll();updateScrollControl();};
  $('#jump-latest').onclick=()=>{composerState().follow=true;restoreScroll();};
  window.addEventListener('pagehide',saveComposer);window.addEventListener('resize',positionToast);
  $$('[data-prompt]').forEach(node=>node.onclick=()=>{$('#prompt').value=node.dataset.prompt;$('#prompt').focus();});
  $('#thread-search').oninput=()=>{closeThreadMenu(false);clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadThreads().catch(report),300);};$('#threads-more').onclick=()=>loadThreads(true).catch(report);
  $('#recent-toggle').onclick=()=>switchArchiveScope(false).catch(report);$('#archive-toggle').onclick=()=>switchArchiveScope(true).catch(report);
  $('#history-help').onclick=showHistoryHelp;
  $('#model').onchange=()=>{const model=$('#model').value,provider=selectedModelProvider();localStorage.setItem(modelPreferenceKey(provider),model);loadEfforts();if(state.thread&&provider!==modelProvider())startProviderChat(model||state.runtimeDefaults.model,provider).catch(error=>{selectThreadModel(state.thread.id);report(error);});else $('#model').title='模型提供方：'+provider;};$('#effort').onchange=()=>localStorage.setItem('codex.effort',$('#effort').value);
  $('#attach-button').onclick=()=>$('#file-input').click();$('#file-input').onchange=()=>{const files=Array.from($('#file-input').files);$('#file-input').value='';const draft=composerState();draft.loads++;state.attachmentLoads=draft.loads;updateSend();readAttachments(files,draft).catch(report).finally(()=>{draft.loads--;if(composerState()===draft)state.attachmentLoads=draft.loads;updateSend();});};
  document.addEventListener('pointerdown',event=>{if(state.threadMenu&&!event.target.closest('#thread-context-menu')&&!event.target.closest('[data-thread-menu]'))closeThreadMenu(false);});
  document.addEventListener('keydown',threadMenuKey);
  window.addEventListener('resize',dismissMovedThreadMenu);
  document.addEventListener('scroll',event=>{if(state.threadMenu&&!$('#thread-context-menu').contains(event.target))dismissMovedThreadMenu();},true);
  $('#files-toggle').onclick=()=>fileBrowser().catch(report);$('#files-close').onclick=()=>$('#file-panel').hidden=true;
  $('#terminal-toggle').onclick=openTerminal;$('#terminal-start').onclick=()=>{try{startTerminal();}catch(error){report(error);}};$('#terminal-expand').onclick=expandTerminal;$('#terminal-close').onclick=()=>{termWS?.close();$('#terminal-panel').hidden=true;$('.main').classList.remove('terminal-expanded');$('#terminal-expand').textContent='展开';terminalStatus('未启动');};
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='k'){event.preventDefault();resetChat();showView('chat');}});
  const [status,schema,serverSchema,skillCatalog]=await Promise.all([fetchJSON('/api/status'),fetchJSON('/api/schema/ClientRequest.json'),fetchJSON('/api/schema/ServerRequest.json'),fetchJSON('/skill-catalog.zh-CN.json').catch(()=>({}))]);state.skillCatalog=skillCatalog;state.status=status;state.schema=schema;state.serverSchema=serverSchema;setCwd(state.selectedCwd||status.workspace);$('#runtime-pill').textContent=status.build?'源码 '+status.build.sourceCommit.slice(0,7):status.version.replace('codex-cli ','v');await connect();
}
init().catch(error=>showConnectionError(error.message));
