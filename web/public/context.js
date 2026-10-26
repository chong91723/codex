/* A sampling snapshot already contains retained history. Never sum billing totals. */
const nativeContextUsage=new Map();
function receiveContextUsage(params){
  if(!params.threadId||!params.tokenUsage)return;
  const model=state.threadSettings.get(params.threadId)?.model||state.runtimeDefaults?.model;
  nativeContextUsage.set(params.threadId,{...params.tokenUsage,model,receivedAt:Date.now()});
  if(params.threadId===state.thread?.id)renderContextUsage();
}
function contextSnapshot(){
  const usage=nativeContextUsage.get(state.thread?.id);if(!usage)return null;
  const used=usage.last?.totalTokens;if(!Number.isFinite(used)||used<0)return null;
  const metadata=state.status?.modelWindows?.[usage.model];
  const physical=metadata?.contextWindow;
  const limit=Number.isFinite(physical)&&physical>0?physical:usage.modelContextWindow;
  return {usage,used,limit:Number.isFinite(limit)&&limit>0?limit:null,physical:!!physical,
    estimated:usage.last.inputTokens===0&&usage.last.outputTokens===0,pending:state.activeTurns.has(state.thread?.id)};
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
  node.title='当前保留上下文最近统计：'+value.used.toLocaleString()+(value.limit?' / '+value.limit.toLocaleString():'')+' tokens。'+(value.pending?'任务进行中，新内容等待原生统计更新。':'')+'点击查看详情。';
  node.ariaLabel='查看上下文占用 '+(ratio===null?value.used+' tokens':(ratio*100).toFixed(1)+'%');
  node.dataset.used=String(value.used);node.dataset.limit=String(value.limit||'');
}
function showContextDetails(){const value=contextSnapshot();openDialog('上下文占用',root=>{
  if(!value){root.append(el('p','','首次原生统计返回后显示上下文占用。'));return;}
  const number=n=>Number.isFinite(n)?n.toLocaleString():'未知',grid=el('div','context-stats');
  for(const [title,content]of [['统计时的模型',value.usage.model||'未知'],['当前保留上下文（最近统计）',number(value.used)+' tokens'],[value.physical?'模型完整窗口':'原生可用窗口（完整窗口未知）',number(value.limit)+' tokens'],['剩余空间',value.limit?number(Math.max(0,value.limit-value.used))+' tokens':'未知'],['累计消耗（不计入占用比例）',number(value.usage.total?.totalTokens)+' tokens'],['最近完整输入',number(value.usage.last?.inputTokens)+' tokens'],['其中缓存输入',number(value.usage.last?.cachedInputTokens)+' tokens'],['最近输出',number(value.usage.last?.outputTokens)+' tokens'],['其中推理输出',number(value.usage.last?.reasoningOutputTokens)+' tokens'],['统计时间',new Date(value.usage.receivedAt).toLocaleTimeString()]]){const row=el('div');row.append(el('span','subtle',title),el('strong','',content));grid.append(row);}
  root.append(grid,el('p','subtle','占用 = 最近一次原生上下文总量 ÷ 模型完整窗口。该输入包含当前保留的历史、系统与开发指令、技能和工具定义、已送入模型的工具结果；不是只计算最后一句话。缓存输入仍占窗口，推理输出已包含在输出中，不重复相加。累计消耗不能作为分子。'),el('p','subtle',(value.estimated?'压缩后当前数值为原生历史估算，工具定义等固定开销会在下一次完整请求中重新统计。':'原生接口返回最近一次完整请求的统计。')+'生成中的新输入、工具结果和尚未完成的输出可能尚未计入，下一次统计会替换旧值；页面不伪造实时精确值。压缩后以保留摘要和后续内容重新计算，页面历史仍保留。'));
  if(/^deepseek/.test(value.usage.model||''))root.append(el('p','subtle','DeepSeek 完整窗口为 1M（1,048,576 tokens），达到 70%（734,003 tokens）由原生运行时自动压缩；包含回合结束后的检查。'));
},async()=>{},'关闭');}
$('#usage-label').onclick=showContextDetails;renderContextUsage();
