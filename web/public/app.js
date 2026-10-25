'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
const icon = name => { const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS(node.namespaceURI, 'use'); use.setAttribute('href', '#i-' + name); node.append(use); return node; };
const pretty = value => JSON.stringify(value, null, 2);
function configDiff(before,after,prefix=''){const edits=[];const object=value=>value&&typeof value==='object'&&!Array.isArray(value);for(const key of new Set([...Object.keys(before),...Object.keys(after)])){const segment=/^[A-Za-z0-9_-]+$/.test(key)?key:JSON.stringify(key);const path=prefix?prefix+'.'+segment:segment;if(!(key in after)){edits.push({keyPath:path,value:null,mergeStrategy:'replace'});continue;}if(object(before[key])&&object(after[key]))edits.push(...configDiff(before[key],after[key],path));else if(JSON.stringify(before[key])!==JSON.stringify(after[key]))edits.push({keyPath:path,value:after[key],mergeStrategy:'replace'});}return edits;}
const safeURL = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
const state = { ws: null, pending: new Map(), counter: 0, ready: false, view: 'chat', thread: null, threadArchived:false, attachmentLoads:0, turns: [], items: new Map(), live: new Map(), activeTurns: new Map(), threads: [], cursor: null, archived: false, attachments: [], events: [], requests: new Map(), models: [], status: null, schema: null, serverSchema: null, currentMethod: null, reconnect: null, selectedCwd: localStorage.getItem('codex.cwd') || '', listGeneration: 0 };
let toastTimer, searchTimer, term, termWS, termResize;
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
      ws.send(JSON.stringify({ method: 'initialized' })); state.ready = true;
      setConnection('online', '原生已连接'); $('#connection-error').hidden = true;
      await Promise.allSettled([loadThreads(), loadModels(), loadAccount()]);
      if (state.thread) { const id = state.thread.id; const archived=state.threadArchived;const result = await rpc(archived?'thread/read':'thread/resume', { threadId: id,...(archived?{includeTurns:false}:{}) }); if (state.thread?.id === id) { adoptThread(result.thread,archived); await hydrateThread(result.thread); } }
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
  if (method === 'serverRequest/resolved') { state.requests.delete(String(p.requestId)); renderRequests(); }
  if (method === 'thread/started') loadThreads().catch(() => {});
  if (method === 'account/updated' || method === 'account/login/completed') loadAccount().catch(() => {});
  if (method === 'turn/started') { state.activeTurns.set(p.threadId, p.turn.id); updateSend(); }
  if (method === 'turn/completed') { state.activeTurns.delete(p.threadId); updateSend(); if (currentEvent(p)) { if (p.turn.error) toast(p.turn.error.message || pretty(p.turn.error)); renderTurnOutcome(p.turn); const index=state.turns.findIndex(turn=>turn.id===p.turn.id); if(index<0)state.turns.push(p.turn);else state.turns[index]=p.turn; refreshActivityGroups(p.turn.id); loadThreads().catch(() => {}); } }
  if (!currentEvent(p)) return;
  if (method === 'item/autoApprovalReview/started' || method === 'item/autoApprovalReview/completed') renderGuardianReview(p);
  if (method === 'guardianWarning') toast(p.message);
  if (method === 'item/started' || method === 'item/completed') { upsertItem(p.item, method === 'item/completed', p.turnId); }
  if (method === 'item/agentMessage/delta') appendDelta(p.itemId, p.delta, 'agentMessage', p.turnId);
  if (method === 'item/reasoning/summaryTextDelta' || method === 'item/reasoning/textDelta') appendDelta(p.itemId, p.delta, 'reasoning', p.turnId);
  if (method === 'item/commandExecution/outputDelta') appendDelta(p.itemId, p.delta, 'commandExecution', p.turnId);
  if (method === 'item/fileChange/outputDelta') appendDelta(p.itemId, p.delta, 'fileChange', p.turnId);
  if (method === 'turn/diff/updated') { state.lastDiff = p.diff; }
  if (method === 'turn/plan/updated') { const box = $('#plan-summary'); box.replaceChildren(); if (p.explanation) box.append(el('p', '', p.explanation)); for (const step of p.plan || []) box.append(el('div', 'plan-step ' + step.status, (step.status === 'completed' ? '✓ ' : step.status === 'inProgress' ? '◉ ' : '○ ') + step.step)); box.hidden = false; }
  if (method === 'thread/tokenUsage/updated') { const usage = p.tokenUsage?.total || p.tokenUsage?.last || p.tokenUsage; if (usage) $('#usage-label').textContent = (usage.totalTokens || usage.inputTokens || 0).toLocaleString() + ' tokens'; }
  if (method === 'thread/realtime/error') toast(p.message||'实时连接失败');
  if (method === 'windowsSandbox/setupCompleted' && !p.success) toast(p.error||'Windows 沙箱设置未完成');
  if (method === 'error') toast(p.error?.message || p.message || '原生运行时返回错误');
}
function scrollMessages() { const node = $('#conversation-scroll'); if (node.scrollHeight - node.scrollTop - node.clientHeight < 250 || state.activeTurns.has(state.thread?.id)) node.scrollTop = node.scrollHeight; }
function renderTurnOutcome(turn) { if(!turn.error && turn.status!=='interrupted')return; const old=$$('[data-turn-outcome]').find(node=>node.dataset.turnOutcome===turn.id);if(old)old.remove();const node=el('div','panel-error message',turn.error?'原生执行失败：'+(turn.error.message||pretty(turn.error)):'任务已中断');node.dataset.turnOutcome=turn.id;$('#messages').append(node); }
function guardianAssessment(p){const snake=value=>String(value).replace(/[A-Z]/g,char=>'_'+char.toLowerCase());const action=Object.fromEntries(Object.entries(p.action).map(([key,value])=>[snake(key),['type','source'].includes(key)?snake(value):value]));return{id:p.reviewId,turn_id:p.turnId,target_item_id:p.targetItemId,started_at_ms:p.startedAtMs,completed_at_ms:p.completedAtMs,status:snake(p.review.status),risk_level:p.review.riskLevel,user_authorization:p.review.userAuthorization,rationale:p.review.rationale,decision_source:p.decisionSource?snake(p.decisionSource):undefined,action};}
function renderGuardianReview(p){let node=$$('[data-guardian-review]').find(node=>node.dataset.guardianReview===p.reviewId);if(!node){node=el('div','request-card');node.dataset.guardianReview=p.reviewId;$('#messages').append(node);}node.replaceChildren(el('h3','','原生自动审批 · '+p.review.status),el('p','',p.review.rationale||'正在评估此操作…'),el('pre','',pretty(redact(p.action))));if(p.review.status==='denied'){const confirm=button('确认允许此操作',async()=>{await rpc('thread/approveGuardianDeniedAction',{threadId:p.threadId,event:guardianAssessment(p)});confirm.disabled=true;confirm.textContent='已记录你的确认';toast('已记录对该操作的确认，可继续向 Codex 发送任务。');});node.append(confirm);}$('#welcome').hidden=true;scrollMessages();}
// Escaping happens before the small Markdown renderer. Raw HTML never executes.
function markdown(text) {
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const blocks = [], safe = escape(text || '').replace(/```([^\n]*)\n?([\s\S]*?)```/g, (_, lang, code) => { blocks.push('<pre><code>' + code + '</code></pre>'); return '\u0000' + (blocks.length - 1) + '\u0000'; });
  let html = safe.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^##? (.+)$/gm, '<h2>$1</h2>').replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.split(/\n\n+/).map(block => /^\u0000\d+\u0000$/.test(block) || /^<h/.test(block) ? block : '<p>' + block.replace(/\n/g, '<br>') + '</p>').join('');
  html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
  const wrapper = el('div', 'markdown'); wrapper.innerHTML = html; return wrapper;
}
const toolNames = { reasoning:'思考过程', commandExecution:'执行命令', fileChange:'文件更改', mcpToolCall:'MCP 调用', dynamicToolCall:'工具调用', webSearch:'搜索网页', imageView:'查看图片', imageGeneration:'图像', collabAgentToolCall:'子代理', plan:'计划', contextCompaction:'压缩上下文', enteredReviewMode:'开始代码审查', exitedReviewMode:'审查结果' };
function renderItem(item, done = false) {
  if (item.type === 'userMessage') { const node = el('div', 'message user'); for (const content of item.content || []) { if (content.text) node.append(document.createTextNode(content.text)); else if (content.type?.toLowerCase().includes('image')) node.append(el('div', 'subtle', '[图片附件]')); else node.append(el('div', 'subtle', pretty(redact(content)))); } return node; }
  if (item.type === 'agentMessage') { const node = el('div', 'message agent'); node.append(markdown(item.text || '')); return node; }
  const node = el('details', 'tool-item'); node.open = item.type === 'fileChange';
  const title = toolNames[item.type] || item.type || '原生事件'; const status = item.status || (done ? 'completed' : 'inProgress');
  node.append(el('summary', '', (['completed','succeeded'].includes(status) ? '✓ ' : status === 'failed' ? '✕ ' : '· ') + title + (item.command ? ' · ' + item.command : item.tool ? ' · ' + item.tool : '')));
  const body = el('div', 'tool-body');
  if (item.type === 'fileChange' && item.changes) { for (const change of item.changes) { body.append(el('strong', '', change.path + '\n')); for (const line of (change.diff || '').split('\n')) body.append(el('div', line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : '', line)); } }
  else if (item.type === 'reasoning') body.textContent = (item.summary || []).map(x => typeof x === 'string' ? x : x.text || '').join('\n') || (item.content || []).map(x=>typeof x==='string'?x:x.text||'').join('\n') || item.text || '';
  else body.textContent = item.aggregatedOutput || item.output || item.text || pretty(redact(item));
  node.append(body); return node;
}
function isActivity(item) {
  return !['userMessage','agentMessage','fileChange','imageView','imageGeneration','enteredReviewMode','exitedReviewMode'].includes(item.type);
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
  const tools = entries.length - thoughts - commands, counts = [];
  if (thoughts) counts.push(thoughts + ' 次思考');
  if (commands) counts.push(commands + ' 条命令');
  if (tools) counts.push(tools + ' 项工具活动');
  const latest = pending.at(-1)?.item;
  const label = turn?.status === 'interrupted' ? '执行已中断' : turn?.status === 'failed' ? '执行失败' :
    latest ? (latest.type === 'reasoning' ? '正在思考…' : latest.type === 'commandExecution' ? '正在执行命令…' : '正在调用工具…') :
    failed ? '思考与执行 · ' + failed + ' 项未成功' : '思考与执行';
  $('.activity-label', group).textContent = label; $('.activity-count', group).textContent = counts.join(' · ');
  $('.activity-dot', group).hidden = !pending.length;
  group.classList.toggle('running', pending.length > 0); group.classList.toggle('has-errors', failed > 0 || turn?.status === 'failed');
}
function refreshActivityGroups(turnId) {
  $$('.activity-group', $('#messages')).filter(group => group.dataset.turnId === turnId).forEach(updateActivityGroup);
}
function mountItem(item, node, done, turnId) {
  const existing = state.items.get(item.id);
  turnId = turnId || existing?.turnId || state.activeTurns.get(state.thread?.id) || '';
  node.dataset.item = item.id;
  let group = existing?.node.closest('.activity-group');
  if (existing) {
    if (node.tagName === 'DETAILS') node.open = existing.node.open;
    existing.node.replaceWith(node);
  } else if (isActivity(item)) {
    group = $('#messages').lastElementChild;
    if (!group?.classList.contains('activity-group') || group.dataset.turnId !== turnId) group = createActivityGroup(turnId);
    $('.activity-items', group).append(node);
  } else $('#messages').append(node);
  state.items.set(item.id, { item, node, done, turnId }); updateActivityGroup(group);
  $('#welcome').hidden = true; scrollMessages();
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
  for (const thread of state.threads) { const row = button('', () => openThread(thread.id), 'thread-row' + (state.thread?.id === thread.id ? ' active' : '')); row.append(el('span', 'thread-dot'), el('span', '', thread.name || thread.preview || '未命名会话')); const date = new Date(thread.updatedAt * 1000); row.append(el('time', '', date.toLocaleDateString('zh-CN', { month:'numeric', day:'numeric' }))); list.append(row); }
  if (!state.threads.length) list.append(el('div', 'empty-small subtle', state.archived ? '暂无归档会话' : '从一次新会话开始。'));
  $('#threads-more').hidden = !state.cursor;
}
function setCwd(path) { state.selectedCwd = path; localStorage.setItem('codex.cwd', path); const name = path.split('/').filter(Boolean).pop() || path; $('#project-name').textContent = name; $('#breadcrumb').textContent = name; $('#cwd-label').textContent = path; }
function resetChat() { state.thread = null; state.threadArchived=false; $('#prompt').disabled=false; $('#prompt').placeholder='向 Codex 描述任务，或输入 / 查看操作'; state.turns = []; state.items.clear(); state.live.clear(); $('#messages').replaceChildren(); $('#welcome').hidden = false; $('#chat-toolbar').hidden = true; $('#page-title').textContent = '新建会话'; $('#plan-summary').hidden = true; $('#usage-label').textContent = '原生 Codex 运行时'; renderThreadList(); renderRequests(); updateSend(); }
function adoptThread(thread,archived=false) { if(state.thread?.id!==thread.id)$('#plan-summary').hidden=true; state.thread=thread;state.threadArchived=archived;if(thread.cwd)setCwd(thread.cwd);$('#prompt').disabled=archived;$('#prompt').placeholder=archived?'会话已归档，请先取消归档以继续任务':'向 Codex 描述任务，或输入 / 查看操作';$('#chat-toolbar').hidden=false;$('#thread-info').textContent=thread.id;$('#page-title').textContent=thread.name||thread.preview||'新会话';updateSend(); }
async function openThread(id) {
  showView('chat'); $('#welcome').hidden = true; $('#messages').replaceChildren(el('div', 'loading', '读取原生会话…')); state.items.clear(); state.live.clear();
  const archived=state.archived&&state.threads.some(thread=>thread.id===id);
  const result = await rpc(archived?'thread/read':'thread/resume', { threadId:id,...(archived?{includeTurns:false}:{}) }); adoptThread(result.thread,archived);
  await hydrateThread(result.thread); renderThreadList(); updateSend();
}
async function hydrateThread(thread) {
  let turns = thread.turns || [];
  if (!turns.length) turns = await paged('thread/turns/list', { threadId:thread.id, itemsView:'full', sortDirection:'asc', limit:100 });
  if (state.thread?.id !== thread.id) return;
  state.turns = turns; $('#messages').replaceChildren(); state.items.clear(); state.activeTurns.delete(thread.id);
  for (const turn of turns) { if (turn.status === 'inProgress') state.activeTurns.set(thread.id, turn.id); for (const item of turn.items || []) upsertItem(item, turn.status !== 'inProgress', turn.id); renderTurnOutcome(turn); }
  $('#welcome').hidden = turns.length > 0; $('#chat-toolbar').hidden = false; $('#page-title').textContent = thread.name || thread.preview || '新会话'; $('#thread-info').textContent = thread.id; updateSend();
}
async function ensureThread() {
  if (state.thread) return state.thread;
  const result = await rpc('thread/start', { cwd:state.selectedCwd, model:$('#model').value || null });
  adoptThread(result.thread); loadThreads().catch(() => {}); return result.thread;
}
function updateSend() { const running = state.activeTurns.has(state.thread?.id); $('#send').disabled=!running&&(state.threadArchived||state.attachmentLoads>0); $('#send').classList.toggle('running', running); $('#send').title = running ? '中断当前任务' : state.attachmentLoads>0?'正在读取附件':'发送'; $('#send').ariaLabel = running ? '中断当前任务' : '发送任务'; }
async function submitPrompt() {
  if (!state.ready) return toast('请等待原生运行时连接');
  if(state.threadArchived)return toast('请先取消归档，再继续这个会话');
  if(state.attachmentLoads)return toast('附件正在读取，请稍候');
  const text = $('#prompt').value.trim();
  if (!text && !state.attachments.length) return;
  if (text.startsWith('/') && !state.attachments.length) { const commands = { '/skills':'skills','/mcp':'mcp','/settings':'settings','/native':'protocol','/apps':'plugins' }; if (commands[text]) { $('#prompt').value=''; return showView(commands[text]); } if (text === '/') return toast('/skills · /mcp · /apps · /native · /settings'); }
  const thread = await ensureThread();
  const input = [{ type:'text', text, text_elements:[] }, ...state.attachments.map(a => a.input)];
  const running = state.activeTurns.get(thread.id);
  const result = running ? await rpc('turn/steer', { threadId:thread.id, expectedTurnId:running, input }) : await rpc('turn/start', { threadId:thread.id, input, model:$('#model').value || null, effort:$('#effort').value || null });
  if (result.turn) state.activeTurns.set(thread.id, result.turn.id);
  $('#prompt').value=''; state.attachments=[]; renderAttachments(); updateSend();
}
async function loadModels() { const result = await rpc('model/list', { includeHidden:false }); state.models = result.data || []; $('#model').replaceChildren(new Option('默认模型', '')); for (const model of state.models) $('#model').append(new Option(model.displayName || model.model, model.model)); const saved = localStorage.getItem('codex.model'); if (saved) { if (!state.models.some(m => m.model === saved)) $('#model').append(new Option(saved, saved)); $('#model').value = saved; } loadEfforts(); }
function loadEfforts() { const model = state.models.find(m => m.model === $('#model').value); const enums = state.schema?.definitions?.ReasoningEffort?.enum || []; $('#effort').replaceChildren(new Option('默认推理', '')); for (const effort of model?.supportedReasoningEfforts || enums.map(reasoningEffort => ({ reasoningEffort }))) $('#effort').append(new Option(effort.reasoningEffort, effort.reasoningEffort)); const saved = localStorage.getItem('codex.effort'); if ($$('#effort option').some(x => x.value === saved)) $('#effort').value = saved; }
async function loadAccount() { const data = await rpc('account/read', { refreshToken:false }); state.account = data; $('#account-name').textContent = data.account?.email || (data.account?.type === 'apiKey' ? 'API 密钥账户' : '本地账户'); $('#account-status').textContent = data.account?.planType || data.account?.type || (data.requiresOpenaiAuth ? '需要登录' : '自定义模型提供方'); if (state.view === 'account') renderAccount(); }
function showView(view) {
  state.view = view; $$('.main-nav .nav-button,.sidebar-footer .nav-button').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  $('#view-chat').hidden = view !== 'chat'; $('#view-panel').hidden = view === 'chat';
  if (window.innerWidth < 760) document.body.classList.add('sidebar-hidden');
  if (view === 'chat') { $('#page-title').textContent = state.thread?.name || state.thread?.preview || '新建会话'; $('#prompt').focus(); return; }
  const title = {skills:'技能',mcp:'MCP 服务',plugins:'插件与应用',protocol:'原生能力',settings:'设置',account:'账户'}[view]; $('#page-title').textContent = title;
  $('#panel-content').replaceChildren(el('div', 'loading', '读取原生能力…'));
  ({ skills:renderSkills, mcp:renderMcp, plugins:renderPlugins, protocol:renderProtocol, settings:renderSettings, account:renderAccount })[view]?.().catch(error => { if (state.view === view) panelError(error); });
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
async function renderSkills() {
  const data = await rpc('skills/list', { cwds:[state.selectedCwd], forceReload:true }); if (state.view !== 'skills') return;
  const root = panelHeading('为任务添加技能', '使用本机 Codex 发现的技能。技能由原生运行时加载与执行。', 'skill'); const grid=el('div','card-grid'); root.append(grid);
  for (const group of data.data || []) { for (const skill of group.skills || []) { const card=el('article','card'); card.append(el('h3','',skill.interface?.displayName || skill.name), el('p','',skill.shortDescription || skill.description), el('span','tag',skill.scope || '本地技能'), el('div','path',skill.path)); const actions=el('div','card-actions'); actions.append(button('在会话中使用', () => { state.attachments.push({ name:skill.name, input:{type:'skill',name:skill.name,path:skill.path} }); renderAttachments(); showView('chat'); }),button(skill.enabled === false ? '启用' : '停用', async () => { await rpc('skills/config/write',{path:skill.path, enabled:skill.enabled === false}); await renderSkills(); })); card.append(actions); grid.append(card); } for (const error of group.errors || []) grid.append(el('div','panel-error',pretty(error))); }
  if (!grid.children.length) grid.append(el('div','card subtle','当前项目尚未发现技能。可以在 Codex 技能目录添加 SKILL.md。'));
}
async function paged(method, params={}) { const all=[]; let cursor=null; do { const result=await rpc(method,{...params,cursor}); all.push(...(result.data || [])); cursor=result.nextCursor; } while(cursor); return all; }
async function renderMcp() {
  const data=await paged('mcpServerStatus/list', { limit:100 }); if(state.view!=='mcp')return;
  const root=panelHeading('连接你的工具', '原生 MCP 服务器、工具、资源与 OAuth 登录。', 'mcp'); root.append(button('重新加载配置',async()=>{await rpc('config/mcpServer/reload',null);await renderMcp();})); const grid=el('div','card-grid'); grid.style.marginTop='20px';root.append(grid);
  for(const server of data){const card=el('article','card');card.append(el('h3','',server.name),el('span','tag',server.authStatus || '已配置'),el('p','',Object.keys(server.tools||{}).length+' 个工具 · '+(server.resources||[]).length+' 个资源'));const actions=el('div','card-actions');actions.append(button('查看工具与资源',()=>showJSON(server.name,server)),button('OAuth 登录',async()=>{const result=await rpc('mcpServer/oauth/login',{name:server.name});showAuthResult(result);}));card.append(actions);grid.append(card);}
  if(!data.length)grid.append(el('div','card subtle','尚未配置 MCP 服务器。可在设置中通过原生 config 接口配置。'));
}
async function renderPlugins(){
  const [plugins,apps]=await Promise.allSettled([rpc('plugin/list',{cwds:[state.selectedCwd]}),paged('app/list',{limit:100})]);if(state.view!=='plugins')return;
  const root=panelHeading('插件与应用','原生目录中的扩展。可用性由 Codex 配置、账户和服务决定。','grid');
  const pluginSection=el('div','section-card');pluginSection.append(el('h3','','插件'));root.append(pluginSection);
  if(plugins.status==='fulfilled'){
    const grid=el('div','card-grid');pluginSection.append(grid);
    for(const marketplace of plugins.value.marketplaces||[])for(const plugin of marketplace.plugins||[]){
      const card=el('article','card');card.append(el('h3','',plugin.interface?.displayName||plugin.name),el('p','',plugin.interface?.shortDescription||plugin.interface?.longDescription||''),el('span','tag',plugin.installed?(plugin.enabled?'已安装':'已停用'):'可安装'),el('div','path',marketplace.name));
      card.append(button('详情与原生操作',()=>{state.currentMethod=plugin.installed?'plugin/read':'plugin/install';showView('protocol');}),button('查看元数据',()=>showJSON(plugin.name,plugin)));grid.append(card);
    }
    if(!grid.children.length)pluginSection.append(el('p','subtle','当前账户没有可用插件目录。'));
    for(const error of plugins.value.marketplaceLoadErrors||[])pluginSection.append(el('p','subtle',pretty(error)));
  }else pluginSection.append(el('p','subtle',plugins.reason.message));
  const appSection=el('div','section-card');appSection.append(el('h3','','应用'));root.append(appSection);
  if(apps.status==='fulfilled'){
    const grid=el('div','card-grid');appSection.append(grid);for(const app of apps.value){const card=el('article','card');card.append(el('h3','',app.name||app.id),el('p','',app.description||''),button('查看应用',()=>showJSON(app.name||app.id,app)));grid.append(card);}if(!grid.children.length)appSection.append(el('p','subtle','当前账户没有可用应用。'));
  }else appSection.append(el('p','subtle',apps.reason.message));
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
  const planToggle=el('input');planToggle.type='checkbox';planToggle.ariaLabel='启用原生计划工具';planToggle.checked=result.layers?.find(layer=>layer.config?.tools?.update_plan?.enabled!==undefined)?.config.tools.update_plan.enabled===true;planToggle.onchange=async()=>{try{await rpc('config/value/write',{keyPath:'tools.update_plan.enabled',value:planToggle.checked,mergeStrategy:'replace',reloadUserConfig:true});toast('已保存，从新会话开始生效');await renderSettings();}catch(error){report(error);}};settingRow(execution,'原生计划工具','允许 Codex 使用 update_plan 展示任务步骤，从新会话开始生效。',planToggle);
  settingRow(execution,'自定义模型','例如提供方配置中的模型名。模型是否可用以实际请求为准。',button('设置模型名',()=>askText('自定义模型','模型 ID', $('#model').value,async value=>{if(!$$('#model option').some(x=>x.value===value))$('#model').append(new Option(value,value));$('#model').value=value;localStorage.setItem('codex.model',value);loadEfforts();})));
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
function renderRequests(){
  const root=$('#requests');root.replaceChildren();
  for(const request of state.requests.values()){
    const p=request.params||{};const card=el('div','request-card');card.append(el('h3','',request.method.includes('requestApproval')?'Codex 请求你的审批':'Codex 需要你的回应'),el('pre','',pretty(redact(p))));const choices=el('div','choices');card.append(choices);
    const method=request.method;
    if(method==='item/commandExecution/requestApproval'||method==='item/fileChange/requestApproval'){for(const [label,decision] of [['允许一次','accept'],['本会话允许','acceptForSession'],['拒绝','decline'],['拒绝并中断','cancel']])choices.append(button(label,()=>sendResponse(request.id,{decision})));}
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
async function threadAction(action){const id=state.thread?.id;if(!id)return;switch(action){case'rename':return askText('重命名会话','会话名称',state.thread.name||'',async name=>{await rpc('thread/name/set',{threadId:id,name});state.thread.name=name;$('#page-title').textContent=name;await loadThreads();});case'fork':{const result=await rpc('thread/fork',{threadId:id});return openThread(result.thread.id);}case'compact':await rpc('thread/compact/start',{threadId:id});return toast('已请求原生上下文压缩');case'review':await rpc('review/start',{threadId:id,target:{type:'uncommittedChanges'}});return;case'revert':return rollbackThread(id);case'archive':case'unarchive':await rpc('thread/'+action,{threadId:id});resetChat();return loadThreads();case'export':{const result={thread:state.thread,turns:await paged('thread/turns/list',{threadId:id,itemsView:'full',sortDirection:'asc',limit:100})};const url=URL.createObjectURL(new Blob([pretty(result)],{type:'application/json'}));const link=el('a');link.href=url;link.download='codex-'+id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}}}
function terminalFit(){if(!term||$('#terminal-panel').hidden)return;const node=$('#terminal');const cols=Math.max(20,Math.floor((node.clientWidth-28)/8));const rows=Math.max(5,Math.floor((node.clientHeight-22)/15));term.resize(cols,rows);if(termWS?.readyState===WebSocket.OPEN)termWS.send(JSON.stringify({cols,rows}));}
function openTerminal(){ $('#terminal-panel').hidden=false;if(!term){if(!window.Terminal)return toast('本地 xterm.js 组件缺失');term=new Terminal({fontFamily:'ui-monospace, SFMono-Regular, Consolas, monospace',fontSize:12,lineHeight:1.15,cursorBlink:true,theme:{background:'#161b17',foreground:'#dae3d8'},scrollback:10000,allowProposedApi:false});term.open($('#terminal'));term.onData(data=>{if(termWS?.readyState===WebSocket.OPEN)termWS.send(JSON.stringify({data:btoa(String.fromCharCode(...new TextEncoder().encode(data)))}));});termResize=new ResizeObserver(terminalFit);termResize.observe($('#terminal'));}terminalFit();term.focus(); }
function startTerminal(){openTerminal();if(!term)return;const args=JSON.parse($('#cli-args').value);if(!Array.isArray(args)||args.some(arg=>typeof arg!=='string'))throw new Error('CLI 参数必须为字符串数组');termWS?.close();term.reset();term.writeln('\x1b[90m启动本机原生 Codex CLI…\x1b[0m');const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/terminal?'+new URLSearchParams({cwd:state.selectedCwd,args:JSON.stringify(args)}));termWS=ws;ws.onopen=terminalFit;ws.onmessage=event=>{if(termWS!==ws)return;const msg=JSON.parse(event.data);if(msg.data)term.write(Uint8Array.from(atob(msg.data),c=>c.charCodeAt(0)));if(msg.exit!=null)term.writeln('\r\n\x1b[90m进程退出：'+msg.exit+'\x1b[0m');if(msg.bridge==='error')term.writeln(msg.message);};ws.onclose=()=>{if(termWS===ws)term.writeln('\r\n\x1b[90m终端连接已关闭\x1b[0m');};term.focus();}
function toggleTheme(){const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('codex.theme',theme);}
async function fetchJSON(path){const response=await fetch(path);if(!response.ok)throw new Error((await response.json()).error||'HTTP '+response.status);return response.json();}
async function init(){
  history.replaceState(null,'',location.pathname);document.documentElement.dataset.theme=localStorage.getItem('codex.theme')||'light';if(innerWidth<760)document.body.classList.add('sidebar-hidden');
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
  $('#model').onchange=()=>{localStorage.setItem('codex.model',$('#model').value);loadEfforts();};$('#effort').onchange=()=>localStorage.setItem('codex.effort',$('#effort').value);
  $('#attach-button').onclick=()=>$('#file-input').click();$('#file-input').onchange=()=>{const files=Array.from($('#file-input').files);$('#file-input').value='';state.attachmentLoads++;updateSend();readAttachments(files).catch(report).finally(()=>{state.attachmentLoads--;updateSend();});};
  $('#thread-action').onchange=()=>{const action=$('#thread-action').value;$('#thread-action').value='';threadAction(action).catch(report);};
  $('#files-toggle').onclick=()=>{if(!$('#file-panel').hidden)$('#file-panel').hidden=true;else fileBrowser().catch(report);};$('#files-close').onclick=()=>$('#file-panel').hidden=true;
  $('#terminal-toggle').onclick=openTerminal;$('#terminal-start').onclick=()=>{try{startTerminal();}catch(error){report(error);}};$('#terminal-close').onclick=()=>{termWS?.close();$('#terminal-panel').hidden=true;};
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='k'){event.preventDefault();resetChat();showView('chat');}});
  const [status,schema,serverSchema]=await Promise.all([fetchJSON('/api/status'),fetchJSON('/api/schema/ClientRequest.json'),fetchJSON('/api/schema/ServerRequest.json')]);state.status=status;state.schema=schema;state.serverSchema=serverSchema;setCwd(state.selectedCwd||status.workspace);$('#runtime-pill').textContent=status.build?'源码 '+status.build.sourceCommit.slice(0,7):status.version.replace('codex-cli ','v');await connect();
}
init().catch(error=>showConnectionError(error.message));
