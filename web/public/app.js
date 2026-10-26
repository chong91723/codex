'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
const icon = name => { const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS(node.namespaceURI, 'use'); use.setAttribute('href', '#i-' + name); node.append(use); return node; };
const pretty = value => JSON.stringify(value, null, 2);
function configDiff(before,after,prefix=''){const edits=[];const object=value=>value&&typeof value==='object'&&!Array.isArray(value);for(const key of new Set([...Object.keys(before),...Object.keys(after)])){const segment=/^[A-Za-z0-9_-]+$/.test(key)?key:JSON.stringify(key);const path=prefix?prefix+'.'+segment:segment;if(!(key in after)){edits.push({keyPath:path,value:null,mergeStrategy:'replace'});continue;}if(object(before[key])&&object(after[key]))edits.push(...configDiff(before[key],after[key],path));else if(JSON.stringify(before[key])!==JSON.stringify(after[key]))edits.push({keyPath:path,value:after[key],mergeStrategy:'replace'});}return edits;}
const safeURL = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
const state = { ws: null, pending: new Map(), counter: 0, ready: false, view: 'chat', thread: null, threadArchived:false, threadBusy:false, attachmentLoads:0, threadSettings:new Map(), imageCache:new Map(), mcpCache:new Map(), mcpRequests:new Map(), mcpRevision:0, skillGroups:new Set(["common","custom"]), skillQuery:"", runtimeDefaults:null, turns: [], items: new Map(), live: new Map(), activeTurns: new Map(), threads: [], cursor: null, archived: false, attachments: [], events: [], requests: new Map(), models: [], status: null, schema: null, serverSchema: null, currentMethod: null, reconnect: null, selectedCwd: localStorage.getItem('codex.cwd') || '', listGeneration: 0, navigationGeneration:0, threadLoading:false, restoreError:false };
let toastTimer, searchTimer, term, termWS, termResize, termFit, termResizeFrame;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 5500); }
function nativeErrorMessage(error){const message=error?.message||String(error);if(/cf_chl_|challenge-platform/i.test(message))return '远端服务要求浏览器验证（HTTP 403）。请检查代理出口，或在官方服务完成验证后重试。';if(/<html/i.test(message))return '远端服务返回网页错误，请检查网络连接和登录状态。';return message;}
function report(error) { toast(nativeErrorMessage(error)); }
function button(label, fn, cls = 'small-button') { const node = el('button', cls, label); node.type = 'button'; node.onclick = () => Promise.resolve().then(fn).catch(report); return node; }
function redact(value) { if (Array.isArray(value)) return value.map(redact); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, /token|secret|api.?key|authorization/i.test(key) && typeof val === 'string' ? '[已隐藏]' : redact(val)])); return value; }
function rpc(method, params = {}, timeout = 120000) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('原生运行时尚未连接'));
  const id = ++state.counter;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { state.pending.delete(id); reject(new Error(method + ' 等待超时；请求可能仍在原生运行时执行，请查看事件后决定是否重试。')); }, timeout);
    state.pending.set(id, { resolve, reject, timer });
    state.ws.send(JSON.stringify({ id, method, params }));
  });
}
function sendResponse(id, result) { state.ws.send(JSON.stringify({ id, result })); state.requests.delete(String(id)); renderRequests(); }
function setConnection(status, text) { $('#connection').className = 'connection ' + status; $('#connection').replaceChildren(el('i'), document.createTextNode(text)); }
async function connect() {
  clearTimeout(state.reconnect); setConnection('', '连接中');
  if (state.ws && state.ws.readyState !== WebSocket.CLOSED) { state.ws.onclose=null; state.ws.close(); for(const pending of state.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('原生连接正在重建'));}state.pending.clear(); }
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/rpc'); state.ws = ws;
  ws.onmessage = event => {
    let msg; try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.bridge) { if (msg.bridge === 'error') showConnectionError(msg.message); return; }
    if (msg.id != null && !msg.method) { const item = state.pending.get(msg.id); if (item) { state.pending.delete(msg.id); clearTimeout(item.timer); msg.error ? item.reject(Object.assign(new Error(nativeErrorMessage(msg.error)),{nativeError:msg.error})) : item.resolve(msg.result); } return; }
    if (msg.id != null && msg.method) { state.requests.set(String(msg.id), msg); renderRequests(); }
    addEvent(msg); handleEvent(msg);
  };
  ws.onopen = async () => {
    try {
      state.runtimeInfo = await rpc('initialize', { clientInfo: { name: 'codex_web_native', title: 'Codex Web', version: '1.0.0' }, capabilities: { experimentalApi: true } });
      ws.send(JSON.stringify({ method: 'initialized' })); invalidateMcpCache();state.ready = true;
      setConnection('online', '原生已连接'); $('#connection-error').hidden = true;
      const generation=state.navigationGeneration;
      await Promise.allSettled([loadThreads(), loadModels(), loadAccount()]);
      if(generation===state.navigationGeneration) await restoreThreadRoute();
    } catch (error) { showConnectionError(error.message); }
  };
  ws.onclose = () => {
    if (state.ws !== ws) return;
    state.ready = false; state.requests.clear(); renderRequests(); setConnection('offline', '连接已断开');
    for (const pending of state.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('连接已断开，请重连后检查原生执行状态')); } state.pending.clear();
    state.reconnect = setTimeout(connect, 4000);
  };
  ws.onerror = () => setConnection('offline', '连接失败');
}
function showConnectionError(message) { const banner = $('#connection-error'); banner.replaceChildren(document.createTextNode(message), button('重新连接', () => { state.ws?.close(); return connect(); }, 'text-button')); banner.hidden = false; }
function addEvent(msg) { state.events.push({ at: new Date().toLocaleTimeString(), ...msg }); if (state.events.length > 400) state.events.shift(); if ($('#event-log')) renderEvents(); }
function currentEvent(params) { return !params.threadId || params.threadId === state.thread?.id; }
function handleEvent(msg) {
  const p = msg.params || {}, method = msg.method;
  if(method==='mcpServer/startupStatus/updated'){invalidateMcpCache();state.mcpViewUpdate?.(p);}
  if (method === 'serverRequest/resolved') { state.requests.delete(String(p.requestId)); renderRequests(); }
  if (method === 'thread/settings/updated') {state.threadSettings.set(p.threadId,p.threadSettings);if(p.threadId===state.thread?.id&&state.view==='settings')renderSettings().catch(report);}
  if (method === 'thread/started') loadThreads().catch(() => {});
  if (method === 'thread/deleted') {state.activeTurns.delete(p.threadId);if(state.thread?.id===p.threadId)resetChat();loadThreads().catch(()=>{});}
  if (method === 'account/updated' || method === 'account/login/completed') loadAccount().catch(() => {});
  if (method === 'turn/started') { state.activeTurns.set(p.threadId, p.turn.id);renderThreadList(); updateSend(); }
  if (method === 'turn/completed') { state.activeTurns.delete(p.threadId);renderThreadList(); updateSend(); if (currentEvent(p)) { if (p.turn.error) toast(p.turn.error.message || pretty(p.turn.error)); const turn={...p.turn,items:p.turn.items?.length?p.turn.items:[...state.items.values()].filter(entry=>entry.turnId===p.turn.id).map(entry=>entry.item)};renderTurnOutcome(turn); const index=state.turns.findIndex(item=>item.id===turn.id); if(index<0)state.turns.push(turn);else state.turns[index]=turn; refreshActivityGroups(turn.id); loadThreads().catch(() => {}); } }
  if (method === 'thread/tokenUsage/updated') receiveContextUsage(p);
  if (!currentEvent(p)) return;
  if (method === 'item/autoApprovalReview/started' || method === 'item/autoApprovalReview/completed') renderGuardianReview(p);
  if (method === 'guardianWarning') toast(p.message);
  if (method === 'item/started' || method === 'item/completed') { upsertItem(p.item, method === 'item/completed', p.turnId); }
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
function scrollMessages() { const node = $('#conversation-scroll'); if (node.scrollHeight - node.scrollTop - node.clientHeight < 250 || state.activeTurns.has(state.thread?.id)) node.scrollTop = node.scrollHeight; }
function renderTurnOutcome(turn) { if(!turn.error && turn.status!=='interrupted')return; const old=$$('[data-turn-outcome]').find(node=>node.dataset.turnOutcome===turn.id);if(old)old.remove();const node=el('div','panel-error message',turn.error?'原生执行失败：'+(turn.error.message||pretty(turn.error)):'任务已中断');node.dataset.turnOutcome=turn.id;$('#messages').append(node); }
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
  if(!option){option=new Option((provider==='openai'?'ChatGPT · ':'')+settings.model,settings.model);option.dataset.provider=provider;$('#model').append(option);}
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
  figure.append(image);const caption=el('figcaption');caption.append(el('span','subtle','Codex 原生生图'),button('查看大图',()=>imagePreview(image.src,'生成的图片',path)),button('下载图片',()=>{const link=el('a');link.href=image.src;link.download=path?.split('/').pop()||'codex-image.png';link.click();}));figure.append(caption);return figure;
}
async function startProviderChat(model,provider){
  const result=await rpc('thread/start',{cwd:state.selectedCwd,model,config:{model_provider:provider}});
  resetChat();state.threadSettings.set(result.thread.id,{model:result.model,modelProvider:result.modelProvider,sandboxPolicy:result.sandbox,approvalPolicy:result.approvalPolicy,approvalsReviewer:result.approvalsReviewer,effort:result.reasoningEffort});adoptThread(result.thread);showView('chat');loadThreads().catch(report);
  toast('已创建 '+(provider==='openai'?'ChatGPT':'新模型')+' 会话，已启用的技能可在对话中调用');
}
function selectedModelProvider(){return $('#model').selectedOptions[0]?.dataset.provider||state.runtimeDefaults?.model_provider||'openai';}
function markdown(text) {
  const wrapper=el('div','markdown');
  if(!window.marked||!window.DOMPurify){wrapper.textContent=text||'';return wrapper;}
  const html=marked.parse(text||'',{gfm:true,breaks:true});
  wrapper.innerHTML=DOMPurify.sanitize(html,{USE_PROFILES:{html:true},FORBID_TAGS:['style','form','input','button','textarea','select','option'],FORBID_ATTR:['style','id','name']});
  for(const table of wrapper.querySelectorAll('table')){const scroll=el('div','table-scroll');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.ariaLabel='表格，可横向滚动';table.before(scroll);scroll.append(table);}
  for(const image of wrapper.querySelectorAll('img'))loadImageElement(image,image.getAttribute('src'),null,true);
  for(const link of wrapper.querySelectorAll('a[href]')){link.target='_blank';link.rel='noopener noreferrer';}
  return wrapper;
}
const toolNames = { reasoning:'思考过程', commandExecution:'执行命令', fileChange:'文件更改', mcpToolCall:'MCP 调用', dynamicToolCall:'工具调用', webSearch:'搜索网页', imageView:'查看图片', imageGeneration:'图像', collabAgentToolCall:'子代理', plan:'计划', contextCompaction:'压缩上下文', enteredReviewMode:'开始代码审查', exitedReviewMode:'审查结果' };
function renderItem(item, done = false) {
  const chart=databaseChart(item);if(chart)return renderDatabaseChart(chart);
  if(item.type==='imageGeneration'&&['completed','succeeded'].includes(item.status))return renderGeneratedImage(item);
  if (item.type === 'userMessage') { const node = el('div', 'message user'); for (const content of item.content || []) { if (content.text) node.append(document.createTextNode(content.text)); else if (content.type?.toLowerCase().includes('image')) {const source=content.url||content.imageUrl||content.path;if(source){const image=el('img','user-image');loadImageElement(image,source,content.path||null);node.append(image);}else node.append(el('div','subtle','[图片附件]'));} else node.append(el('div', 'subtle', pretty(redact(content)))); } return node; }
  if (item.type === 'agentMessage') { const node = el('div', 'message agent'); node.append(markdown(item.text || ''));if(item.phase==='final_answer'||!item.phase&&done){const actions=el('div','message-actions'),copy=button('',async()=>{await navigator.clipboard.writeText(item.text||'');toast('已复制回答');},'icon-button');copy.append(icon('copy'));copy.title=copy.ariaLabel='复制回答';actions.append(copy);node.append(actions);}return node; }
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
  if(databaseChart(item))return false;
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
  if (!group) return;
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
  mountItem(item, renderItem(item, done), done, turnId); state.live.delete(item.id);
}
function appendDelta(id, delta, type, turnId = null) {
  if (!id || typeof delta !== 'string') return;
  const entry = state.items.get(id); const text = (state.live.get(id) ?? (type === 'agentMessage' ? entry?.item.text : type === 'commandExecution' ? entry?.item.aggregatedOutput : '') ?? '') + delta;
  state.live.set(id, text); const item = { ...(entry?.item || {}), id, type };
  if (type === 'commandExecution') item.aggregatedOutput = text; else if (type === 'reasoning') item.summary = [text]; else item.text = text;
  mountItem(item, renderItem(item, entry?.done || false), entry?.done || false, turnId);
}
async function loadThreads(more = false) {
  const generation = ++state.listGeneration;
  const result = await rpc('thread/list', { limit: 40, archived: state.archived, searchTerm: $('#thread-search').value || null, sortKey:'updated_at', ...(more && state.cursor ? { cursor: state.cursor } : {}) });
  if (generation !== state.listGeneration) return;
  state.threads = more ? [...state.threads, ...result.data] : result.data; state.cursor = result.nextCursor; renderThreadList();
}
function renderThreadList() {
  const list = $('#thread-list'); list.replaceChildren();
  for (const thread of state.threads) { const row = button('', () => openThread(thread.id), 'thread-row' + (state.thread?.id === thread.id ? ' active' : '')); const dot=el('span','thread-dot'+(state.activeTurns.has(thread.id)?' running':''));if(state.activeTurns.has(thread.id))dot.title='此页面正在执行任务';row.append(dot, el('span', '', thread.name || thread.preview || '未命名会话')); const date = new Date(thread.updatedAt * 1000); row.title=(thread.name||thread.preview||'未命名会话')+' · '+date.toLocaleString();row.append(el('time', '', date.toLocaleDateString('zh-CN', { month:'numeric', day:'numeric' }))); list.append(row); }
  if (!state.threads.length) list.append(el('div', 'empty-small subtle', state.archived ? '暂无归档会话' : '从一次新会话开始。'));
  $('#threads-more').hidden = !state.cursor;
}
function setCwd(path) { state.selectedCwd = path; localStorage.setItem('codex.cwd', path); const name = path.split('/').filter(Boolean).pop() || path; $('#project-name').textContent = name; $('#breadcrumb').textContent = name; $('#cwd-label').textContent = path; }
function threadRoute(){const params=new URLSearchParams(location.search);return {id:params.get('thread'),archived:params.get('archived')==='1'};}
function setThreadRoute(id=null,archived=false,replace=false){const url=new URL(location.href);url.searchParams.delete('token');url.searchParams.delete('thread');url.searchParams.delete('archived');if(id){url.searchParams.set('thread',id);if(archived)url.searchParams.set('archived','1');}if(url.href!==location.href)history[replace?'replaceState':'pushState'](null,'',url);}
function resetChat(route=true) {restoreDefaultModelChoice();$('#view-chat').classList.add('empty'); state.navigationGeneration++;state.threadLoading=false;state.restoreError=false;if(route)setThreadRoute();state.thread = null; state.threadArchived=false;state.threadBusy=false; $('#prompt').disabled=false; $('#prompt').placeholder='询问任何问题'; state.turns = []; state.items.clear(); state.live.clear(); $('#messages').replaceChildren(); $('#welcome').hidden = false; $('#chat-toolbar').hidden = true; $('#page-title').textContent = '新建会话'; $('#plan-summary').hidden = true; renderContextUsage(); renderThreadList(); renderRequests(); updateSend(); }
function adoptThread(thread,archived=false,busy=false) { if(state.thread?.id!==thread.id)$('#plan-summary').hidden=true; state.thread=thread;state.threadArchived=archived;state.threadBusy=busy;setThreadRoute(thread.id,archived,true);if(thread.cwd)setCwd(thread.cwd);$('#prompt').disabled=archived||busy;$('#prompt').placeholder=busy?'此会话正在另一个页面中使用，请先关闭该页面再重试':archived?'会话已归档，请先取消归档以继续任务':'询问任何问题';$('#chat-toolbar').hidden=false;$('#thread-info').textContent=thread.id;$('#page-title').textContent=thread.name||thread.preview||'新会话';selectThreadModel(thread.id);renderRequests();updateSend();renderContextUsage(); }
async function restoreThreadRoute(){const route=threadRoute();if(route.id){state.archived=route.archived;$('#thread-list-label').textContent=route.archived?'归档会话':'最近会话';await openThread(route.id,{archived:route.archived,replace:true});loadThreads().catch(report);}else resetChat(false);}
async function openThread(id,{archived=state.archived&&state.threads.some(thread=>thread.id===id),replace=false}={}) {
  const generation=++state.navigationGeneration;state.threadLoading=true;state.restoreError=false;setThreadRoute(id,archived,replace);updateSend();
  showView('chat');$('#view-chat').classList.remove('empty');$('#prompt').disabled=true;$('#welcome').hidden=true;$('#messages').replaceChildren(el('div','loading','读取原生会话…'));state.items.clear();state.live.clear();
  try {
    let result,busy=false;
    for(let attempt=0;attempt<4;attempt++){
      try{result=await rpc(archived?'thread/read':'thread/resume',{threadId:id,...(archived?{includeTurns:false}:{})});break;}
      catch(error){if(archived||!/already has an active writer/i.test(error.message))throw error;if(generation!==state.navigationGeneration)return;if(attempt<3){await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));if(generation!==state.navigationGeneration)return;}else{result=await rpc('thread/read',{threadId:id,includeTurns:false});busy=true;}}
    }
    if(generation!==state.navigationGeneration)return;if(result.model)state.threadSettings.set(id,{model:result.model,modelProvider:result.modelProvider,sandboxPolicy:result.sandbox,approvalPolicy:result.approvalPolicy,approvalsReviewer:result.approvalsReviewer,effort:result.reasoningEffort});adoptThread(result.thread,archived,busy);
    await hydrateThread(result.thread,generation);
    if(generation!==state.navigationGeneration)return;if(busy){const notice=el('div','panel-error');notice.dataset.threadBusy='';notice.append(el('p','','此会话正在另一个页面中使用，当前显示历史记录。关闭该页面后，可重试继续会话。'),button('重试继续会话',()=>openThread(id,{archived,replace:true})));$('#messages').prepend(notice);}renderThreadList();
  } catch(error) {
    if(generation!==state.navigationGeneration)return;state.restoreError=true;state.thread=null;$('#chat-toolbar').hidden=true;
    $('#messages').replaceChildren(el('div','panel-error','无法恢复此会话：'+nativeErrorMessage(error)),button('重试恢复会话',()=>openThread(id,{archived,replace:true})),button('新建会话',()=>resetChat()));
  } finally {if(generation===state.navigationGeneration){state.threadLoading=false;$('#prompt').disabled=state.threadArchived||state.threadBusy||state.restoreError;updateSend();}}
}
async function hydrateThread(thread, generation=state.navigationGeneration) {
  let turns = thread.turns || [];
  if (!turns.length) turns = await paged('thread/turns/list', { threadId:thread.id, itemsView:'full', sortDirection:'asc', limit:100 });
  if (state.thread?.id !== thread.id||generation!==state.navigationGeneration) return;
  state.turns = turns; $('#messages').replaceChildren(); state.items.clear(); state.activeTurns.delete(thread.id);
  for (const turn of turns) { if (turn.status === 'inProgress') state.activeTurns.set(thread.id, turn.id); for (const item of turn.items || []) upsertItem(item, turn.status !== 'inProgress', turn.id); renderTurnOutcome(turn); }
  $('#welcome').hidden = turns.length > 0;$('#view-chat').classList.toggle('empty',turns.length===0); $('#chat-toolbar').hidden = false; $('#page-title').textContent = thread.name || thread.preview || '新会话'; $('#thread-info').textContent = thread.id; updateSend();
}
async function ensureThread() {

  if (state.thread) return state.thread;
  const provider=selectedModelProvider(),config=provider!==(state.runtimeDefaults?.model_provider||'openai')?{model_provider:provider}:undefined;
  const result = await rpc('thread/start', { cwd:state.selectedCwd, model:$('#model').value || null,config });
  state.threadSettings.set(result.thread.id,{model:result.model,modelProvider:result.modelProvider,sandboxPolicy:result.sandbox,approvalPolicy:result.approvalPolicy,approvalsReviewer:result.approvalsReviewer,effort:result.reasoningEffort});adoptThread(result.thread); loadThreads().catch(() => {}); return result.thread;
}
function updateSend() { const deletion=$('#thread-action option[value=delete]');if(deletion)deletion.disabled=state.threadBusy; const running = !state.threadBusy&&state.activeTurns.has(state.thread?.id); $('#send').disabled=state.threadLoading||state.restoreError||state.threadBusy||(!running&&(state.threadArchived||state.attachmentLoads>0)); $('#send').classList.toggle('running', running); $('#send').title = running ? '中断当前任务' : state.attachmentLoads>0?'正在读取附件':'发送'; $('#send').ariaLabel = running ? '中断当前任务' : '发送任务'; }
async function submitPrompt() {
  if (!state.ready) return toast('请等待原生运行时连接');
  if(state.threadLoading||state.restoreError)return toast('请先完成当前会话的恢复');
  if(state.threadArchived)return toast('请先取消归档，再继续这个会话');
  if(state.threadBusy)return toast('请先关闭使用此会话的其他页面，再重试继续会话');
  if(state.attachmentLoads)return toast('附件正在读取，请稍候');
  const text = $('#prompt').value.trim();
  if (!text && !state.attachments.length) return;
  if (text.startsWith('/') && !state.attachments.length) { const commands = { '/skills':'skills','/mcp':'mcp','/settings':'settings','/native':'protocol','/apps':'plugins' }; if (commands[text]) { $('#prompt').value=''; return showView(commands[text]); } if (text === '/') return toast('/skills · /mcp · /apps · /native · /settings'); }
  const thread = await ensureThread();
  const input = [{ type:'text', text, text_elements:[] }, ...state.attachments.map(a => a.input)];
  const running = state.activeTurns.get(thread.id);
  const result = running ? await rpc('turn/steer', { threadId:thread.id, expectedTurnId:running, input }) : await rpc('turn/start', { threadId:thread.id, input, model:$('#model').value || null, effort:$('#effort').value || null, additionalContext:runtimeModelContext(thread.id) });
  if (result.turn) state.activeTurns.set(thread.id, result.turn.id);
  $('#prompt').value='';$('#prompt').style.height='auto'; state.attachments=[]; renderAttachments(); updateSend();
}
function runtimeModelContext(threadId){
  const settings=state.threadSettings.get(threadId)||{},model=$('#model').value||settings.model||state.runtimeDefaults?.model,provider=settings.modelProvider||state.runtimeDefaults?.model_provider;
  if(!model||!provider)return undefined;
  return {'codex-web-runtime':{kind:'application',value:'Runtime configuration facts: model provider = '+provider+'; active model ID for this turn = '+model+'. Codex provides the agent runtime and tools. Use these actual runtime facts for model identity; Codex branding or an inherited model persona does not identify the underlying model. No external lookup is needed solely to identify this configured model.'}};
}
async function loadModels() {
  const [result,configuration]=await Promise.all([rpc('model/list',{includeHidden:true}),rpc('config/read',{includeLayers:false,cwd:state.selectedCwd})]);
  state.runtimeDefaults=configuration.config;state.modelDetails=result.data||[];state.models=state.modelDetails.filter(model=>!model.hidden);
  const model=configuration.config?.model||state.models.find(model=>model.isDefault)?.model;
  $('#model').replaceChildren(new Option(model?'默认 · '+model:'默认模型',''));
  $('#model').title='模型提供方：'+(configuration.config?.model_provider||'原生默认提供方');
  for(const model of state.models){const option=new Option(model.displayName||model.model,model.model);option.dataset.provider=configuration.config?.model_provider||'openai';$('#model').append(option);}
  if((configuration.config?.model_provider||'openai')!=='openai'&&state.modelDetails.some(model=>model.model==='gpt-5.6-luna')){const imageModel=new Option('ChatGPT · gpt-5.6-luna（支持生图）','gpt-5.6-luna');imageModel.dataset.provider='openai';$('#model').append(imageModel);}
  const saved=localStorage.getItem('codex.model');if(saved){if(!state.models.some(model=>model.model===saved))$('#model').append(new Option(saved,saved));$('#model').value=saved;}loadEfforts();
}
function loadEfforts() { const model = (state.modelDetails||state.models).find(m => m.model === ($('#model').value||state.runtimeDefaults?.model)); const enums = state.schema?.definitions?.ReasoningEffort?.enum || []; $('#effort').replaceChildren(new Option('默认推理', '')); for (const effort of model?.supportedReasoningEfforts || enums.map(reasoningEffort => ({ reasoningEffort }))) $('#effort').append(new Option(effort.reasoningEffort, effort.reasoningEffort)); const saved = localStorage.getItem('codex.effort'); if ($$('#effort option').some(x => x.value === saved)) $('#effort').value = saved; }
async function loadAccount() { const data = await rpc('account/read', { refreshToken:false }); state.account = data; $('#account-name').textContent = data.account?.email || (data.account?.type === 'apiKey' ? 'API 密钥账户' : '本地账户'); $('#account-status').textContent = data.account?.planType || data.account?.type || (data.requiresOpenaiAuth ? '需要登录' : '自定义模型提供方'); if (state.view === 'account') renderAccount(); }
function showView(view) {
  state.view = view; $$('.main-nav .nav-button,.sidebar-footer .nav-button').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  $('#view-chat').hidden = view !== 'chat'; $('#view-panel').hidden = view === 'chat';
  if (window.innerWidth < 760) document.body.classList.add('sidebar-hidden');
  if (view === 'chat') { $('#page-title').textContent = state.thread?.name || state.thread?.preview || '新建会话'; $('#prompt').focus(); return; }
  const title = {databases:'数据库',skills:'技能',mcp:'MCP 服务',plugins:'插件与应用',protocol:'原生能力',settings:'设置',account:'账户'}[view]; $('#page-title').textContent = title;
  $('#panel-content').replaceChildren(el('div', 'loading', '读取原生能力…'));
  ({ databases:renderDatabases, skills:renderSkills, mcp:renderMcp, plugins:renderPlugins, protocol:renderProtocol, settings:renderSettings, account:renderAccount })[view]?.().catch(error => { if (state.view === view) panelError(error); });
}
function panelError(error) { $('#panel-content').replaceChildren(el('div', 'panel-error', nativeErrorMessage(error)), button('重试', () => showView(state.view))); }
function panelHeading(title, description, iconName) { const header = el('div', 'panel-heading'), text = el('div'); text.append(el('h1', '', title), el('p', '', description)); header.append(text, icon(iconName)); $('#panel-content').replaceChildren(header); return $('#panel-content'); }
function showJSON(title, data) { openDialog(title, root => root.append(el('pre', '', pretty(redact(data)))), async () => {}, '关闭'); }
function openDialog(title, build, submit, submitLabel = '保存') {
  $('#dialog-title').textContent = title; $('#dialog-body').replaceChildren(); build($('#dialog-body')); $('#dialog-submit').textContent = submitLabel;
  $('#dialog-form').onsubmit = async event => { event.preventDefault(); $('#dialog-submit').disabled = true; try { await submit($('#dialog-body')); $('#dialog').close(); } catch(error) { report(error); } finally { $('#dialog-submit').disabled=false; } };
  $('#dialog').showModal();
}
function askText(title, label, value, submit, { secret=false, multiline=false } = {}) { openDialog(title, root => { root.append(el('label', '', label)); const input = el(multiline ? 'textarea' : 'input', multiline ? 'code-editor' : 'field-input'); input.id='dialog-value'; if (secret) input.type='password'; input.value=value; input.required=true; root.append(input); }, root => submit($('#dialog-value', root).value)); }
async function editProject() { askText('选择工作区', '输入项目的绝对路径。原生 Codex 会在这个目录执行任务。', state.selectedCwd, async path => { await rpc('fs/readDirectory', { path }); setCwd(path); resetChat(); showView('chat'); }); }
async function paged(method, params={}) { const all=[]; let cursor=null; do { const result=await rpc(method,{...params,cursor}); all.push(...(result.data || [])); cursor=result.nextCursor; } while(cursor); return all; }
function formField(root,label,id,{value='',type='text',multiline=false,required=false,placeholder=''}={}) {
  const group=el('div','form-field'),caption=el('label','',label),input=el(multiline?'textarea':'input',multiline?'code-editor compact-editor':'field-input');
  input.id=id;caption.htmlFor=id;if(!multiline)input.type=type;input.value=value;input.required=required;input.placeholder=placeholder;group.append(caption,input);root.append(group);return input;
}
function readBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('无法读取 '+file.name));reader.readAsDataURL(file);});}
function importSkillDialog() {
  let selected=[];
  openDialog('导入自定义 Skill',root=>{
    root.append(el('p','','选择 Mac 本机的 SKILL.md，或包含 SKILL.md、脚本和资源的完整文件夹。导入后可在所有项目中使用。'));
    const name=formField(root,'技能目录名称','skill-import-name',{required:true,placeholder:'my-custom-skill'});name.pattern='[A-Za-z0-9][A-Za-z0-9_-]{0,63}';
    const single=el('input'),folder=el('input');single.type=folder.type='file';single.accept='.md';folder.multiple=true;folder.setAttribute('webkitdirectory','');single.id='skill-file-input';folder.id='skill-folder-input';single.hidden=folder.hidden=true;
    const status=el('p','subtle','尚未选择文件'),actions=el('div','card-actions');actions.append(button('选择 SKILL.md',()=>single.click()),button('选择 Skill 文件夹',()=>folder.click()));root.append(actions,single,folder,status);
    function select(files,directory){
      selected=[];try{
        const source=Array.from(files);if(!source.length)return;
        if(source.length>1000)throw new Error('最多导入 1000 个文件');
        const paths=new Set();let total=0;
        for(const file of source){
          const path=directory?file.webkitRelativePath.split('/').slice(1).join('/'):'SKILL.md';
          if(!path||path.includes('\\')||path.split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('文件路径无效');
          if(paths.has(path))throw new Error('文件路径重复：'+path);paths.add(path);
          total+=file.size;if(file.size>16*1024*1024||total>64*1024*1024)throw new Error('单文件上限 16 MiB，总大小上限 64 MiB');
          selected.push({file,path});
        }
        if(!paths.has('SKILL.md'))throw new Error('所选文件夹的根目录必须包含 SKILL.md');
        if(!directory&&source[0].name!=='SKILL.md')throw new Error('请选择名为 SKILL.md 的文件');
        if(!name.value){const suggested=directory?source[0].webkitRelativePath.split('/')[0]:'custom-skill';name.value=suggested.replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^[^A-Za-z0-9]+/,'').slice(0,64)||'custom-skill';}
        status.textContent='已选择 '+selected.length+' 个文件 · '+(total/1024).toFixed(1)+' KiB';
      }catch(error){selected=[];status.textContent=error.message;report(error);}
    }
    single.onchange=()=>select(single.files,false);folder.onchange=()=>select(folder.files,true);
  },async root=>{
    if(!selected.length)throw new Error('请先选择有效的 Skill 文件');
    const name=$('#skill-import-name',root).value.trim();if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name))throw new Error('目录名只能包含英文字母、数字、短横线和下划线');
    const home=state.runtimeInfo?.codexHome;if(!home||!home.startsWith('/'))throw new Error('未取得原生 Codex 技能目录');
    const parent=home.replace(/\/$/,'')+'/skills',destination=parent+'/'+name;
    await rpc('fs/createDirectory',{path:parent});
    // Non-recursive mkdir is exclusive: an existing skill is never overwritten.
    try{await rpc('fs/createDirectory',{path:destination,recursive:false});}catch(error){throw new Error('无法创建技能目录；若名称已存在，请更换名称。'+nativeErrorMessage(error));}
    try{
      const directories=new Set([destination]);
      for(const {file,path}of selected){
        const target=destination+'/'+path,dir=target.slice(0,target.lastIndexOf('/'));
        if(!directories.has(dir)){await rpc('fs/createDirectory',{path:dir});directories.add(dir);}
        await rpc('fs/writeFile',{path:target,dataBase64:await readBase64(file)});
      }
      const data=await rpc('skills/list',{cwds:[state.selectedCwd],forceReload:true});
      const skills=(data.data||[]).flatMap(group=>group.skills||[]);const skill=skills.find(skill=>skill.path===destination+'/SKILL.md');
      if(!skill){const errors=(data.data||[]).flatMap(group=>group.errors||[]).filter(error=>String(error.path||'').startsWith(destination));throw new Error('Codex 无法加载此 Skill：'+(errors.length?errors.map(error=>error.message||pretty(error)).join('\n'):'请检查 SKILL.md 的 name 和 description 元数据'));}
      await rpc('skills/config/write',{path:skill.path,enabled:true});
    }catch(error){try{await rpc('fs/remove',{path:destination,recursive:true,force:true});}catch{throw new Error(nativeErrorMessage(error)+'；清理未完成，请检查 '+destination);}throw error;}
    toast('Skill 已导入并启用');await renderSkills();
  },'导入并启用');
}
function isPetSkill(skill){return skill.name.startsWith('work-pets:');}
function skillPresentation(skill){
  const known=state.skillCatalog?.[skill.name];if(known)return known;
  const original=skill.shortDescription||skill.description||'';
  return {title:skill.interface?.displayName||skill.name,description:/[\u3400-\u9fff]/.test(original)?original:'已安装的自定义技能，启用后可在对话中让 Agent 按需要调用。',original};
}
async function renderSkills(){
  const data=await rpc('skills/list',{cwds:[state.selectedCwd],forceReload:true});if(state.view!=='skills')return;
  const root=panelHeading('技能','启用后，Agent 会根据任务需要调用技能。你也可以直接在对话中提醒它使用。','skill');
  const toolbar=el('div','skills-toolbar'),search=el('input','field-input');search.type='search';search.ariaLabel=search.placeholder='搜索技能名称或用途';search.value=state.skillQuery;
  toolbar.append(search,button('导入自定义 Skill',importSkillDialog,'solid-button'));root.append(toolbar);
  const seen=new Set(),skills=[];
  for(const group of data.data||[])for(const skill of group.skills||[]){if(seen.has(skill.path)||isPetSkill(skill))continue;seen.add(skill.path);skills.push(skill);}
  const summary=el('p','subtle skill-count'),groups=el('div','skill-groups');root.append(summary,groups);
  const category=skill=>skill.scope==='system'?'common':skill.name.startsWith('openai-templates:')?'templates':skill.name.includes(':')?'plugins':'custom';
  const categories=[['common','常用技能'],['custom','自定义与项目技能'],['plugins','插件技能'],['templates','文档、表格与演示模板']];
  function draw(){
    const query=state.skillQuery.trim().toLocaleLowerCase(),matching=skills.filter(skill=>{const p=skillPresentation(skill);return !query||[skill.name,p.title,p.description].join(' ').toLocaleLowerCase().includes(query);});
    summary.textContent=query?'找到 '+matching.length+' 项技能':'共 '+skills.length+' 项技能 · 插件和模板按用途收起';groups.replaceChildren();
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
    if(!matching.length)groups.append(el('p','empty-small',query?'没有找到匹配的技能。':'还没有技能，点击上方按钮导入。'));
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
      if(enabled){const runtime={notStarted:'尚未连接',starting:'连接中',connected:'已连接',authenticationRequired:'需要认证',failed:'连接失败',cancelled:'连接已取消',disabled:'原生策略已停用'}[server?.runtimeStatus]||(server?.toolsError?'连接失败':null);card.append(el('p','mcp-state',server?(runtime||'工具目录已就绪')+' · '+Object.keys(server.tools||{}).length+' 个工具':statusError?'暂时无法获取连接状态':'正在读取连接状态…'));if(server?.toolsError)card.append(el('p','panel-error',nativeErrorMessage(new Error(server.toolsError))));}
      const controls=el('div','card-actions');if(config)controls.append(button(enabled?'停用':'启用',async()=>{const before=await rpc('config/read',{includeLayers:true,cwd:state.selectedCwd});await writeMcpConfig(name,!enabled,before,'enabled');toast('MCP 已'+(enabled?'停用':'启用')+'，从下一次任务开始生效');await renderMcp();}));
      if(enabled)controls.append(button('查看工具与资源',()=>showMcpDetails(name)));if(enabled&&config?.url)controls.append(button('OAuth 登录',async()=>showAuthResult(await rpc('mcpServer/oauth/login',{name}))));card.append(controls);grid.append(card);
    }
    if(!names.size)grid.append(el('div','card subtle',configLoading?'正在读取服务配置…':statusLoading?'还没有自定义 MCP，可点击上方按钮添加。正在发现其他工具服务…':'还没有 MCP，点击上方按钮添加。'));
  }
  async function loadConfig(){configLoading=true;configError=null;draw();try{const result=await rpc('config/read',{includeLayers:true,cwd:state.selectedCwd});configs=result.config?.mcp_servers||{};}catch(error){configError=error;}finally{configLoading=false;draw();}}
  async function loadStatus(force=false){statusLoading=true;statusError=null;draw();try{servers=await mcpStatusRequest(params,force);}catch(error){statusError=error;}finally{statusLoading=false;draw();}}
  state.mcpViewUpdate=p=>{if(!active()||p.threadId&&p.threadId!==state.thread?.id)return;const server=servers.find(server=>server.name===p.name);if(server){server.runtimeStatus={starting:'starting',ready:'connected',failed:'failed',cancelled:'cancelled'}[p.status];if(p.error)server.toolsError=p.error;draw();}};
  draw();loadConfig();loadStatus();
}
async function renderPlugins(){
  const root=panelHeading('插件与应用','原生目录中的扩展。可用性由 Codex 配置、账户和服务决定。','grid');
  const pluginSection=el('div','section-card'),appSection=el('div','section-card');
  pluginSection.append(el('h3','','插件'),el('p','subtle','正在读取原生插件目录…'));appSection.append(el('h3','','应用'),el('p','subtle','正在连接原生应用服务…'));root.append(pluginSection,appSection);
  rpc('plugin/list',{cwds:[state.selectedCwd]}).then(result=>{
    if(!pluginSection.isConnected)return;pluginSection.replaceChildren(el('h3','','插件'));const grid=el('div','card-grid');pluginSection.append(grid);
    for(const marketplace of result.marketplaces||[])for(const plugin of marketplace.plugins||[]){const card=el('article','card');card.append(el('h3','',plugin.interface?.displayName||plugin.name),el('p','',plugin.interface?.shortDescription||plugin.interface?.longDescription||''),el('span','tag',plugin.installed?(plugin.enabled?'已安装':'已停用'):'可安装'),el('div','path',marketplace.name));card.append(button('详情与原生操作',()=>{state.currentMethod=plugin.installed?'plugin/read':'plugin/install';showView('protocol');}),button('查看元数据',()=>showJSON(plugin.name,plugin)));grid.append(card);}
    if(!grid.children.length)pluginSection.append(el('p','subtle','当前账户没有可用插件目录。'));for(const error of result.marketplaceLoadErrors||[])pluginSection.append(el('p','subtle',pretty(error)));
  }).catch(error=>{if(pluginSection.isConnected)pluginSection.replaceChildren(el('h3','','插件'),el('p','subtle',nativeErrorMessage(error)));});
  paged('app/list',{limit:100}).then(apps=>{
    if(!appSection.isConnected)return;appSection.replaceChildren(el('h3','','应用'));const grid=el('div','card-grid');appSection.append(grid);for(const app of apps){const card=el('article','card');card.append(el('h3','',app.name||app.id),el('p','',app.description||''),button('查看应用',()=>showJSON(app.name||app.id,app)));grid.append(card);}if(!grid.children.length)appSection.append(el('p','subtle','当前账户没有可用应用。'));
  }).catch(error=>{if(appSection.isConnected)appSection.replaceChildren(el('h3','','应用'),el('p','subtle',nativeErrorMessage(error)));});
  root.append(button('打开完整原生管理接口',()=>{state.currentMethod='plugin/list';showView('protocol');}));
}
function resolveSchema(schema, root=state.schema, seen=new Set()){if(!schema || typeof schema!=='object')return {};if(schema.$ref){const name=schema.$ref.split('/').pop();if(seen.has(name))return {};return resolveSchema(root.definitions?.[name],root,new Set([...seen,name]));}if(schema.allOf)return resolveSchema(schema.allOf[0],root,seen);return schema;}
function schemaSample(schema, root=state.schema, depth=0){schema=resolveSchema(schema,root);if(depth>7)return null;if(schema.default!==undefined)return schema.default;if(schema.enum)return schema.enum[0];if(schema.oneOf || schema.anyOf)return schemaSample((schema.oneOf||schema.anyOf).find(x=>x.type!=='null')||{},root,depth+1);const type=Array.isArray(schema.type)?schema.type.find(x=>x!=='null'):schema.type;if(type==='object'||schema.properties){const out={};for(const name of schema.required||[])out[name]=schemaSample(schema.properties?.[name]||{},root,depth+1);return out;}if(type==='array')return [];if(type==='boolean')return false;if(type==='integer'||type==='number')return 0;if(type==='string')return '';return null;}
function methodEntries(){return (state.schema?.oneOf||[]).map(entry=>({method:entry.properties.method.enum[0],schema:entry.properties.params||{},entry}));}
async function renderProtocol(){
  if(!state.schema)state.schema=await fetchJSON('/api/schema/ClientRequest.json');if(state.view!=='protocol')return;
  const entries=methodEntries();const root=panelHeading('原生能力，完整保留','直接调用当前可执行程序导出的全部接口。参数和错误都由 Codex 原生校验。','code');
  const strip=el('div','status-strip');strip.append(el('span','tag',entries.length+' 个原生接口'),el('span','tag',state.status?.version||'Codex'),el('span','tag','实验性协议已启用'));root.append(strip);
  const layout=el('div','protocol-layout'),left=el('div'),search=el('input','protocol-search'),list=el('div','protocol-methods'),right=el('div');search.placeholder='搜索方法，如 thread / fs';search.ariaLabel='搜索原生方法';left.append(search,list);layout.append(left,right);root.append(layout);
  function select(entry){state.currentMethod=entry.method;right.replaceChildren(el('h3','',entry.method));const schema=resolveSchema(entry.schema);right.append(el('p','schema-description',schema.description||entry.entry.description||'请求将原样发送给 codex app-server。'));if(entry.method.startsWith('windowsSandbox/'))right.append(el('p','schema-description','Windows 专用接口。Linux 主机使用 Codex 原生 Linux 沙箱，无需运行此设置。'));if(entry.method.startsWith('thread/realtime/'))right.append(el('p','schema-description','需要模型服务支持实时 API；普通对话可独立使用。启动请求返回后，请继续查看下方原生事件中的连接结果。'));const editor=el('textarea','code-editor');editor.id='rpc-params';editor.ariaLabel='原生请求参数';const sample=schemaSample(entry.schema);if(sample && typeof sample==='object'){if('threadId' in sample)sample.threadId=state.thread?.id||'';if('cwd' in sample)sample.cwd=state.selectedCwd;if('path' in sample)sample.path=state.selectedCwd;}editor.value=pretty(sample);right.append(editor);const controls=el('div','protocol-controls');controls.append(button('查看完整参数定义',()=>showJSON(entry.method+' 参数',{$schema:state.schema.$schema,...schema,definitions:state.schema.definitions})),button('执行原生请求',async()=>{const result=$('#rpc-result');result.textContent='等待原生结果…';try{const value=await rpc(entry.method,JSON.parse(editor.value),600000);result.textContent=pretty(redact(value));}catch(error){result.textContent=error.message;}},'solid-button'));right.append(controls);const result=el('pre','protocol-result','结果将显示在这里');result.id='rpc-result';right.append(result);$$('button',list).forEach(node=>node.classList.toggle('selected',node.textContent===entry.method));}
  function filter(){list.replaceChildren();for(const entry of entries.filter(x=>x.method.toLowerCase().includes(search.value.toLowerCase())))list.append(button(entry.method,()=>select(entry),'method'+(entry.method===state.currentMethod?' selected':'')));}search.oninput=filter;filter();select(entries.find(x=>x.method===state.currentMethod)||entries.find(x=>x.method==='config/read')||entries[0]);
  const events=el('div','section-card');events.style.marginTop='25px';events.append(el('h3','','原生事件流'));const log=el('div','events');log.id='event-log';events.append(log,button('清空事件',()=>{state.events=[];renderEvents();}));root.append(events);renderEvents();
}
function renderEvents(){const log=$('#event-log');if(!log)return;log.replaceChildren();for(const event of state.events.slice(-100).reverse()){const row=el('details','event-row');row.append(el('summary','',event.at+'  '+event.method),el('pre','',pretty(redact(event.params))));log.append(row);}if(!state.events.length)log.append(el('p','subtle','等待原生运行时事件…'));}
async function renderSettings(){
  const result=await rpc('config/read',{includeLayers:true,cwd:state.selectedCwd});if(state.view!=='settings')return;state.config=result;const config=result.config||{};
  const root=panelHeading('按照你的方式工作','设置写入 Codex 的配置，不修改上游源码。当前运行时保留原生权限与沙箱。','settings');
  const appearance=el('div','section-card');appearance.append(el('h3','','工作区与外观'));root.append(appearance);
  settingRow(appearance,'工作区目录',state.selectedCwd,button('更改',editProject));settingRow(appearance,'外观','跟随你的偏好，保存在当前浏览器。',button(document.documentElement.dataset.theme==='dark'?'深色':'浅色',()=>{toggleTheme();return renderSettings();}));
  const execution=el('div','section-card');execution.append(el('h3','','原生运行配置'));root.append(execution);
  for(const [label,key,values] of [['沙箱','sandbox_mode',['read-only','workspace-write','danger-full-access']],['审批策略','approval_policy',['untrusted','on-request','never']]]){const select=el('select');for(const value of values)select.append(new Option(value,value));select.value=typeof config[key]==='string'?config[key]:values[0];select.ariaLabel=label;select.onchange=async()=>{try{await rpc('config/value/write',{keyPath:key,value:select.value,mergeStrategy:'replace',expectedVersion:result.layers?.find(layer=>layer.name?.type==='user')?.version,reloadUserConfig:true});toast('原生配置已保存');renderSettings();}catch(error){report(error);}};settingRow(execution,label,'由 Codex 原生执行；部分配置从新会话开始生效。',select);}
  const network=el('input');network.type='checkbox';network.ariaLabel='允许工作区沙箱访问网络';network.checked=config.sandbox_workspace_write?.network_access===true;
  network.onchange=async()=>{const enabled=network.checked;network.disabled=true;try{await rpc('config/value/write',{keyPath:'sandbox_workspace_write.network_access',value:enabled,mergeStrategy:'replace',expectedVersion:result.layers?.find(layer=>layer.name?.type==='user')?.version,reloadUserConfig:true});const policy=state.threadSettings.get(state.thread?.id)?.sandboxPolicy;if(state.thread&&!state.threadBusy&&!state.threadArchived&&policy?.type==='workspaceWrite')await rpc('thread/settings/update',{threadId:state.thread.id,sandboxPolicy:{...policy,networkAccess:enabled}});toast('沙箱网络设置已保存，审批策略保持原样');await renderSettings();}catch(error){report(error);await renderSettings();}finally{network.disabled=false;}};
  settingRow(execution,'沙箱网络访问','允许 workspace-write 沙箱内联网。保留文件边界和原生危险操作审批；新会话使用此设置。',network);
  const currentPolicy=state.threadSettings.get(state.thread?.id)?.sandboxPolicy;
  if(state.thread&&!state.threadBusy&&!state.threadArchived&&currentPolicy?.type==='workspaceWrite'&&currentPolicy.networkAccess!==network.checked)settingRow(execution,'当前会话的网络设置','历史会话保留原生权限快照，点击后仅同步网络设置，保留其他文件权限。',button('应用到当前会话',async()=>{await rpc('thread/settings/update',{threadId:state.thread.id,sandboxPolicy:{...currentPolicy,networkAccess:network.checked}});toast('已将网络设置应用到当前会话后续任务');await renderSettings();}));
  const planToggle=el('input');planToggle.type='checkbox';planToggle.ariaLabel='启用原生计划工具';planToggle.checked=result.layers?.find(layer=>layer.config?.tools?.update_plan?.enabled!==undefined)?.config.tools.update_plan.enabled===true;planToggle.onchange=async()=>{try{await rpc('config/value/write',{keyPath:'tools.update_plan.enabled',value:planToggle.checked,mergeStrategy:'replace',reloadUserConfig:true});toast('已保存，从新会话开始生效');await renderSettings();}catch(error){report(error);}};settingRow(execution,'原生计划工具','允许 Codex 使用 update_plan 展示任务步骤，从新会话开始生效。',planToggle);
  settingRow(execution,'自定义模型','例如提供方配置中的模型名。模型是否可用以实际请求为准。',button('设置模型名',()=>askText('自定义模型','模型 ID', $('#model').value,async value=>{if(!$$('#model option').some(x=>x.value===value)){const option=new Option(value,value);option.dataset.provider=modelProvider();$('#model').append(option);}$('#model').value=value;localStorage.setItem(modelPreferenceKey(),value);loadEfforts();})));
  const advanced=el('div','section-card');advanced.append(el('h3','','高级配置'),el('p','subtle','使用 JSON 编辑用户配置层。仅保存修改的字段，并保留未修改的设置。'));const editor=el('textarea','code-editor');editor.ariaLabel='原生配置编辑器';const editable=result.layers?.find(layer=>layer.name?.type==='user'&&!layer.name?.profile)?.config||config;editor.value=pretty(redact(editable));advanced.append(editor,button('保存修改的配置项',async()=>{const next=JSON.parse(editor.value);if(!next||typeof next!=='object'||Array.isArray(next))throw new Error('请输入 JSON 配置对象');const edits=configDiff(redact(editable),next);if(!edits.length)return toast('没有配置变更');if(pretty(edits).includes('[已隐藏]'))throw new Error('请通过原生能力面板编辑含密钥的配置项');await rpc('config/batchWrite',{edits,expectedVersion:result.layers?.find(layer=>layer.name?.type==='user')?.version,reloadUserConfig:true});toast('配置已保存');await renderSettings();}));root.append(advanced);
  const about=el('div','section-card');about.append(el('h3','','源码与运行时'),el('pre','protocol-result',pretty(state.status)));if(state.status?.baseline?.sourceCommit)about.append(el('p','subtle','原生程序由此官方提交直接构建。启动时核对源码、程序校验值和完整协议；可通过官方更新脚本升级。'));root.append(about);
}
function settingRow(root,label,description,control){const row=el('div','settings-row'),text=el('div');text.append(el('label','',label),el('small','',description));row.append(text,control);root.append(row);}
async function rollbackThread(id){const turns=await paged('thread/turns/list',{threadId:id,itemsView:'full',sortDirection:'desc',limit:100});const candidates=turns.filter(turn=>turn.items?.some(item=>item.type==='userMessage')&&!turn.items?.some(item=>['enteredReviewMode','exitedReviewMode','contextCompaction'].includes(item.type)));if(!candidates.length)throw new Error('没有可回退的普通用户任务');openDialog('回退用户任务',root=>{root.append(el('p','','将移除所选用户任务及其后的会话记录。磁盘文件不会因此撤销。'));const select=el('select','field-input');select.id='rollback-turn';select.ariaLabel='回退起点';for(const turn of candidates){const user=turn.items.find(item=>item.type==='userMessage');const text=(user.content||[]).map(item=>item.text||'').join(' ').slice(0,110)||turn.id;select.append(new Option(text,turn.id));}root.append(select);},async root=>{await rpc('thread/revert',{threadId:id,beforeTurnId:$('#rollback-turn',root).value});await openThread(id);},'回退');}
async function renderAccount(){
  const root=panelHeading('连接你的 Codex 账户','登录信息由原生 Codex 保存在本机，不写入 Web 项目。','settings');const card=el('div','section-card');root.append(card);card.append(el('h3','',state.account?.account?.email||'原生账户状态'),el('pre','protocol-result',pretty(redact(state.account||{}))));
  const actions=el('div','card-actions');actions.append(button('使用 ChatGPT 登录',async()=>showAuthResult(await rpc('account/login/start',{type:'chatgpt'}))),button('设备码登录（远程服务器）',async()=>showAuthResult(await rpc('account/login/start',{type:'chatgptDeviceCode'}))),button('使用 API 密钥',()=>askText('API 密钥登录','密钥只传给本机 Codex；API 地址在原生模型提供方配置中设置。','',async apiKey=>{await rpc('account/login/start',{type:'apiKey',apiKey});await loadAccount();},{secret:true})),button('退出登录',()=>openDialog('退出登录',r=>r.append(el('p','','将退出本机 Codex 当前账户。')),async()=>{await rpc('account/logout',null);await loadAccount();},'退出')));card.append(actions);
  const limits=el('div','section-card');limits.append(el('h3','','用量与额度'),button('查询原生额度',async()=>{const result=await rpc('account/rateLimits/read',null);showJSON('用量与额度',result);}));root.append(limits);
}
function showAuthResult(result){openDialog('完成原生登录',root=>{root.append(el('pre','',pretty(redact(result))));for(const [key,value] of Object.entries(result)){const url=typeof value==='string' && safeURL(value);if(url && /url/i.test(key)){const link=el('a','small-button','打开登录页面');link.href=url;link.target='_blank';link.rel='noopener noreferrer';root.append(link);}}if(result.loginId)root.append(button('取消登录',async()=>{await rpc('account/login/cancel',{loginId:result.loginId});$('#dialog').close();}));},async()=>loadAccount(),'检查登录状态');}
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
    sendResponse(request.id,{action:'accept',content:Object.fromEntries(content)});
  }));
  choices.append(button('拒绝 MCP 请求',()=>sendResponse(request.id,{action:'decline',content:null})),button('取消 MCP 请求',()=>sendResponse(request.id,{action:'cancel',content:null,_meta:{codex_approval_cancellation_reason:'user'}})));
}
function renderRequests(){
  const root=$('#requests');root.replaceChildren();
  for(const request of state.requests.values()){
    const p=request.params||{};if(p.threadId&&state.thread&&p.threadId!==state.thread.id)continue;const card=el('div','request-card');card.append(el('h3','',request.method.includes('requestApproval')?'Codex 请求你的审批':'Codex 需要你的回应'),el('pre','',pretty(redact(p))));const choices=el('div','choices');card.append(choices);
    const method=request.method;
    if(method==='mcpServer/elicitation/request')renderMcpRequest(request,card,choices);
    else if(method==='item/commandExecution/requestApproval'||method==='item/fileChange/requestApproval'){for(const [label,decision] of [['允许一次','accept'],['本会话允许','acceptForSession'],['拒绝','decline'],['拒绝并中断','cancel']])choices.append(button(label,()=>sendResponse(request.id,{decision})));}
    else if(method==='item/tool/requestUserInput'){
      const inputs=[];for(const question of p.questions||[]){const group=el('div','question');group.append(el('p','',question.question));if(question.options?.length){for(const [index,option]of question.options.entries()){const label=el('label'),input=el('input');input.type='radio';input.name='q-'+request.id+'-'+question.id;input.value=option.label;label.append(input,document.createTextNode(' '+option.label+(option.description?' · '+option.description:'')));group.append(label);}}const input=el('input','field-input');input.placeholder='输入你的回答';input.ariaLabel=question.question;group.append(input);inputs.push({id:question.id,input,group});card.insertBefore(group,choices);}choices.append(button('提交回答',()=>{const answers={};for(const question of inputs){const value=question.input.value||$('input:checked',question.group)?.value;if(!value)throw new Error('请回答所有问题');answers[question.id]={answers:[value]};}sendResponse(request.id,{answers});},'solid-button'));
    } else if(method==='item/permissions/requestApproval'){choices.append(button('授予本次权限',()=>sendResponse(request.id,{permissions:p.permissions||{},scope:'turn'})),button('拒绝',()=>sendResponse(request.id,{permissions:{},scope:'turn'})));}
    if(method==='currentTime/read')choices.append(button('提供当前时间',()=>sendResponse(request.id,{currentTimeAt:Math.floor(Date.now()/1000)})));
    const editor=el('textarea','code-editor');editor.ariaLabel='原生响应 JSON';editor.value=pretty(responseSample(request));const details=el('details');details.append(el('summary','','自定义原生响应'),editor,button('发送响应',()=>sendResponse(request.id,JSON.parse(editor.value))),button('加载响应参数模板',async()=>{const entry=state.serverSchema.oneOf.find(x=>x.properties.method.enum[0]===method);const type=entry?.properties.params.$ref?.split('/').pop().replace(/Params$/,'Response');if(!type)throw new Error('该请求没有响应模板');const schema=await fetchJSON('/api/schema/'+type+'.json');editor.value=pretty(schemaSample(schema,schema));}));card.append(details);root.append(card);
  }
}
function responseSample(request){const method=request.method;if(method.includes('mcpServer/elicitation'))return {action:'decline',content:null};if(method==='item/tool/call')return {contentItems:[{type:'inputText',text:''}],success:false};if(method==='execCommandApproval'||method==='applyPatchApproval')return {decision:'denied'};if(method.includes('requestApproval'))return {decision:'decline'};return {};}
function renderAttachments(){const root=$('#attachments');root.replaceChildren();state.attachments.forEach((a,index)=>{const chip=el('div','attachment');if(a.preview){const img=el('img');img.src=a.preview;img.alt=a.name;chip.append(img);}chip.append(el('span','',a.name),button('×',()=>{state.attachments.splice(index,1);renderAttachments();},''));root.append(chip);});}
async function readAttachments(files){for(const file of Array.from(files)){if(file.size>16*1024*1024){toast(file.name+' 超过 16 MiB');continue;}if(file.type.startsWith('image/')||file.type.startsWith('audio/')){const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});state.attachments.push({name:file.name,preview:file.type.startsWith('image/')?url:null,input:{type:file.type.startsWith('image/')?'image':'audio',url}});}else{const text=await file.text();state.attachments.push({name:file.name,input:{type:'text',text:'文件 '+file.name+'\n'+text,text_elements:[]}});}}renderAttachments();}
async function fileBrowser(path=state.selectedCwd){const data=await rpc('fs/readDirectory',{path});$('#file-panel').hidden=false;$('#file-path').textContent=path;$('#file-tree').replaceChildren(button('..',()=>fileBrowser(path.split('/').slice(0,-1).join('/')||'/'),'file-row'));$('#file-preview').hidden=true;for(const entry of data.entries||[]){const name=typeof entry==='string'?entry:entry.fileName||entry.name;const full=path.replace(/\/$/,'')+'/'+name;const isDirectory=entry.isDirectory||entry.type==='directory';const row=button('',async()=>{if(isDirectory)return fileBrowser(full);{const result=await rpc('fs/readFile',{path:full});const pre=$('#file-preview');pre.textContent=result.text||result.content||(result.dataBase64?new TextDecoder().decode(Uint8Array.from(atob(result.dataBase64),c=>c.charCodeAt(0))):pretty(result));pre.hidden=false;}},'file-row');row.append(icon(isDirectory?'folder':'file'),document.createTextNode(name));$('#file-tree').append(row);}}
async function threadAction(action){const id=state.thread?.id;if(!id)return;switch(action){case'delete':if(state.threadBusy)throw new Error('请先关闭使用此会话的其他页面，再执行永久删除');return openDialog('永久删除会话',root=>{root.append(el('p','','将永久删除“'+(state.thread.name||state.thread.preview||id)+'”的会话历史及其创建的子代理会话，无法撤销。'));if(state.activeTurns.has(id))root.append(el('p','','此会话中的当前任务会被停止。'));},async()=>{await rpc('thread/delete',{threadId:id});if(state.thread?.id===id)resetChat();await loadThreads();toast('会话历史已永久删除');},'永久删除');case'rename':return askText('重命名会话','会话名称',state.thread.name||'',async name=>{await rpc('thread/name/set',{threadId:id,name});state.thread.name=name;$('#page-title').textContent=name;await loadThreads();});case'fork':{const result=await rpc('thread/fork',{threadId:id});return openThread(result.thread.id);}case'compact':await rpc('thread/compact/start',{threadId:id});return toast('已请求原生上下文压缩');case'review':await rpc('review/start',{threadId:id,target:{type:'uncommittedChanges'}});return;case'revert':return rollbackThread(id);case'archive':case'unarchive':await rpc('thread/'+action,{threadId:id});resetChat();return loadThreads();case'export':{const result={thread:state.thread,turns:await paged('thread/turns/list',{threadId:id,itemsView:'full',sortDirection:'asc',limit:100})};const url=URL.createObjectURL(new Blob([pretty(result)],{type:'application/json'}));const link=el('a');link.href=url;link.download='codex-'+id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}}}
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
  const cleanURL=new URL(location.href);cleanURL.searchParams.delete('token');history.replaceState(null,'',cleanURL);state.threadLoading=!!threadRoute().id;updateSend();window.addEventListener('popstate',()=>restoreThreadRoute().catch(report));document.documentElement.dataset.theme=localStorage.getItem('codex.theme')||'light';if(innerWidth<760)document.body.classList.add('sidebar-hidden');
  $$('[data-view]').forEach(node=>node.onclick=()=>{if(node.id==='new-chat'){resetChat();}showView(node.dataset.view);});
  $('#collapse').onclick=()=>document.body.classList.add('sidebar-hidden');$('#show-sidebar').onclick=()=>document.body.classList.remove('sidebar-hidden');$('#theme-toggle').onclick=toggleTheme;
  $('#project-edit').onclick=()=>editProject().catch(report);$('#project-button').onclick=$('#project-edit').onclick;$('#cwd-button').onclick=$('#project-edit').onclick;
  $('#dialog-close').onclick=()=>$('#dialog').close();$('#dialog-cancel').onclick=()=>$('#dialog').close();
  $('#send').onclick=()=>{const active=state.activeTurns.get(state.thread?.id);Promise.resolve(active?rpc('turn/interrupt',{threadId:state.thread.id,turnId:active}):submitPrompt()).catch(report);};
  $('#prompt').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();submitPrompt().catch(report);}};
  $('#prompt').oninput=()=>{const node=$('#prompt');node.style.height='auto';node.style.height=Math.min(240,node.scrollHeight)+'px';};
  $$('[data-prompt]').forEach(node=>node.onclick=()=>{$('#prompt').value=node.dataset.prompt;$('#prompt').focus();});
  $('#thread-search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadThreads().catch(report),300);};$('#threads-more').onclick=()=>loadThreads(true).catch(report);
  $('#archive-toggle').onclick=()=>{state.archived=!state.archived;$('#thread-list-label').textContent=state.archived?'归档会话':'最近会话';loadThreads().catch(report);};
  $('#model').onchange=()=>{const model=$('#model').value,provider=selectedModelProvider();localStorage.setItem(modelPreferenceKey(provider),model);loadEfforts();if(state.thread&&provider!==modelProvider())startProviderChat(model||state.runtimeDefaults.model,provider).catch(error=>{selectThreadModel(state.thread.id);report(error);});else $('#model').title='模型提供方：'+provider;};$('#effort').onchange=()=>localStorage.setItem('codex.effort',$('#effort').value);
  $('#attach-button').onclick=()=>$('#file-input').click();$('#file-input').onchange=()=>{const files=Array.from($('#file-input').files);$('#file-input').value='';state.attachmentLoads++;updateSend();readAttachments(files).catch(report).finally(()=>{state.attachmentLoads--;updateSend();});};
  $('#thread-action').onchange=()=>{const action=$('#thread-action').value;$('#thread-action').value='';threadAction(action).catch(report);};
  $('#files-toggle').onclick=()=>{if(!$('#file-panel').hidden)$('#file-panel').hidden=true;else fileBrowser().catch(report);};$('#files-close').onclick=()=>$('#file-panel').hidden=true;
  $('#terminal-toggle').onclick=openTerminal;$('#terminal-start').onclick=()=>{try{startTerminal();}catch(error){report(error);}};$('#terminal-expand').onclick=expandTerminal;$('#terminal-close').onclick=()=>{termWS?.close();$('#terminal-panel').hidden=true;$('.main').classList.remove('terminal-expanded');$('#terminal-expand').textContent='展开';terminalStatus('未启动');};
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='k'){event.preventDefault();resetChat();showView('chat');}});
  const [status,schema,serverSchema,skillCatalog]=await Promise.all([fetchJSON('/api/status'),fetchJSON('/api/schema/ClientRequest.json'),fetchJSON('/api/schema/ServerRequest.json'),fetchJSON('/skill-catalog.zh-CN.json').catch(()=>({}))]);state.skillCatalog=skillCatalog;state.status=status;state.schema=schema;state.serverSchema=serverSchema;setCwd(state.selectedCwd||status.workspace);$('#runtime-pill').textContent=status.build?'源码 '+status.build.sourceCommit.slice(0,7):status.version.replace('codex-cli ','v');await connect();
}
init().catch(error=>showConnectionError(error.message));
