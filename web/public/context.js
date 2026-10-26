/* A sampling snapshot already contains retained history. Never sum billing totals. */
const nativeContextUsage=new Map();
function receiveContextUsage(params){
  if(!params.threadId||!params.tokenUsage)return;
  const model=state.threadSettings.get(params.threadId)?.model||state.runtimeDefaults?.model;
  nativeContextUsage.set(params.threadId,{...params.tokenUsage,model,receivedAt:Date.now()});
  if(params.threadId===state.thread?.id)renderContextUsage();
}
// BEGIN context sampling calculation. No history totals or inferred model windows.
function contextUsageSnapshot(usage,metadata,pending=false){
  if(!usage)return null;
  const used=usage.last?.totalTokens;if(!Number.isFinite(used)||used<0)return null;
  const positive=n=>Number.isFinite(n)&&n>0?n:null;
  const catalogLimit=positive(metadata?.contextWindow),nativeLimit=positive(usage.modelContextWindow);
  const percent=metadata?.effectivePercent;
  // Native ModelInfo::usable_context_window floors physical*effectivePercent/100.
  // Global catalog metadata must not override a thread's different real window.
  const physical=!!(catalogLimit&&nativeLimit&&Number.isInteger(percent)&&percent>0&&percent<=100&&Math.trunc(catalogLimit*percent/100)===nativeLimit);
  return {usage,used,limit:physical?catalogLimit:nativeLimit,physical,catalogLimit,nativeLimit,
    autoCompactLimit:positive(metadata?.autoCompactLimit),
    estimated:usage.last.inputTokens===0&&usage.last.outputTokens===0,pending};
}
// END context sampling calculation.
function contextSnapshot(){
  const usage=nativeContextUsage.get(state.thread?.id);
  return contextUsageSnapshot(usage,state.status?.modelWindows?.[usage?.model],state.activeTurns.has(state.thread?.id));
}
function renderContextUsage(){
  const node=$('#usage-label');if(!node)return;const value=contextSnapshot();
  node.hidden=!state.thread||!value||(!state.turns.length&&!state.items.size&&!state.activeTurns.has(state.thread.id));node.replaceChildren();node.className='context-meter';
  delete node.dataset.used;delete node.dataset.limit;
  if(node.hidden)return;
  const ratio=value.limit?value.used/value.limit:null;
  if(ratio!==null){const ring=el('span','context-ring');ring.style.setProperty('--fill',Math.min(100,Math.max(0,ratio*100))+'%');node.append(ring);}
  node.append(document.createTextNode((value.estimated?'≈':'')+(ratio===null?value.used.toLocaleString()+' tokens':(ratio*100).toFixed(1)+'%')));
  node.classList.toggle('context-high',ratio>=0.7);node.classList.toggle('context-updating',value.pending);
  const denominator=value.limit?(value.physical?'模型完整窗口':'原生可用窗口'):'窗口未知';
  node.title='最近采样上下文占用：'+value.used.toLocaleString()+(value.limit?' / '+value.limit.toLocaleString():'')+' tokens（'+denominator+'）。'+(value.pending?'任务进行中，新内容等待原生统计更新。':'')+'这不是实时精确的当前保留量。点击查看详情。';
  node.ariaLabel='查看最近采样上下文占用 '+(ratio===null?value.used+' tokens':(ratio*100).toFixed(1)+'%');
  node.dataset.used=String(value.used);node.dataset.limit=String(value.limit||'');
}
function showContextDetails(){const value=contextSnapshot();openDialog('上下文占用',root=>{
  if(!value){root.append(el('p','','首次原生统计返回后显示上下文占用。'));return;}
  const number=n=>Number.isFinite(n)?n.toLocaleString():'未知',grid=el('div','context-stats');
  for(const [title,content]of [['统计时的模型',value.usage.model||'未知'],['最近采样输入与输出总量（占用分子）',number(value.used)+' tokens'],[value.physical?'模型完整窗口（占比分母）':'原生可用窗口（占比分母；完整窗口未确认）',number(value.limit)+' tokens'],['完整窗口参考（配置 / 目录）',number(value.catalogLimit)+' tokens'],['原生可用窗口（已预留安全空间）',number(value.nativeLimit)+' tokens'],['按占比分母计算的剩余空间（最近采样）',value.limit?number(Math.max(0,value.limit-value.used))+' tokens':'未知'],['累计消耗（不计入占用比例）',number(value.usage.total?.totalTokens)+' tokens'],['最近完整输入',number(value.usage.last?.inputTokens)+' tokens'],['其中缓存输入',number(value.usage.last?.cachedInputTokens)+' tokens'],['最近输出',number(value.usage.last?.outputTokens)+' tokens'],['其中推理输出',number(value.usage.last?.reasoningOutputTokens)+' tokens'],['页面收到统计的时间',new Date(value.usage.receivedAt).toLocaleTimeString()]]){const row=el('div');row.append(el('span','subtle',title),el('strong','',content));grid.append(row);}
  root.append(grid,el('p','subtle','占用分子取原生 last.totalTokens：最近一次采样的完整输入与输出总量，包含当时送入模型的历史、系统与开发指令、技能、工具定义及工具结果。缓存输入仍占窗口，已包含在输入中；推理输出已包含在输出中，都不重复相加。累计消耗不作分子。'),el('p','subtle',value.physical?'完整窗口与原生可用窗口已按目录中的安全比例核对一致，因此占比采用完整窗口。原生可用窗口已扣除运行时预留空间，两种占比口径不同。':'目录参考窗口未能与该次原生统计核对一致；占比采用实际返回的原生可用窗口，不用全局目录覆盖会话配置，也不反推未知完整窗口。'),el('p','subtle',(value.estimated?'当前数值为原生历史估算；工具定义等固定开销会在下一次完整请求中重新统计。':'这是原生最近一次采样快照。')+'生成中的新输入、工具结果和尚未完成的输出可能尚未计入；原生压缩检查还可包含后追加内容的本地估算，因此该百分比不是实时精确的当前保留量。压缩后采用原生重算值，页面历史仍保留。'));
  if(value.autoCompactLimit)root.append(el('p','subtle','配置 / 目录中的默认自动压缩阈值参考为 '+number(value.autoCompactLimit)+' tokens'+(value.catalogLimit?'（参考完整窗口的 '+(value.autoCompactLimit/value.catalogLimit*100).toFixed(1)+'%）':'')+'；实际触发还取决于会话配置、计数作用域及回合结束检查，不能只凭此徽标认定是否应压缩。'));
},async()=>{},'关闭');}
$('#usage-label').onclick=showContextDetails;renderContextUsage();
