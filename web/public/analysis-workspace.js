'use strict';
// All decisions and execution remain native turns. The web only renders outputs
// and applies an idle-thread mode change after an explicit model proposal.
function analysisTaskContext(){return 'You assist data analysts using natural language. Discover available enabled and authorized databases through the configured MCP tools; no manual data-source selection is required. Preserve the user\'s stated analysis approach. Clarify metric definitions, dates, comparisons and ambiguous sources before drawing conclusions. Use actual tools and exact computations; never invent rows, figures, charts or execution. Choose the analysis workflow yourself from the meaning and scope of the request. A single well-defined metric or small direct lookup can be queried and answered immediately. Treat an investigation with multiple independent analytical questions plus charts or a report, causal interpretation, several metric definitions, or a staged comparison as requiring a plan. For those multi-stage analyses, first investigate only what is necessary to establish the approach and present a complete plan for confirmation; do not execute the full business queries before that confirmation. Also plan first whenever the user explicitly requests it. In Default mode, signal this decision by making your final answer exactly one <proposed_plan>...</proposed_plan> block containing the actual plan. The web will then enter native Plan mode for the subsequent discussion after this turn completes. This marker is a proposal, never approval. In native Plan mode follow its instructions. For an approved execution task, use native update_plan for real progress, cite available result IDs and data/metric limitations, generate charts from real query results, and answer every user question. The user does not need to write SQL or code. These instructions do not grant database or file permissions, replace tool approvals, or promise transaction-level pause/resume.';}
function extractAnalysisProposal(text){const match=typeof text==='string'&&text.match(/^\s*<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>\s*$/);return match&&match[1].trim()&&!/<\/?proposed_plan>/.test(match[1])?match[1].trim():null;}
function analysisResultReferences(item){
  if(item.type!=='mcpToolCall'||item.status!=='completed'||item.result?.isError)return [];
  const results=new Map();
  const visit=(value,depth=0)=>{if(!value||typeof value!=='object'||depth>6)return;if(Array.isArray(value)){for(const v of value)visit(v,depth+1);return;}
    if(typeof value.resultId==='string'&&/^[a-f0-9]{32}$/.test(value.resultId)){const prior=results.get(value.resultId)||{};results.set(value.resultId,{...prior,id:value.resultId,name:value.connectionName||prior.name||'查询结果',rowCount:value.rowCount??prior.rowCount});}
    for(const [key,child]of Object.entries(value))if(key!=='rows')visit(child,depth+1);
  };visit(item.result?.structuredContent);for(const part of item.result?.content||[])if(part.type==='text')try{visit(JSON.parse(part.text));}catch{}return [...results.values()];
}
function isAnalysisResultItem(item){return item.server==='codex_web_databases'&&['query_database','analyze_result'].includes(item.tool)&&analysisResultReferences(item).length>0;}
function renderInlineAnalysisResult(result){
  const root=el('article','analysis-query-result');root.dataset.analysisResultId=result.id;
  const title=el('h3','',result.name==='查询结果'?'查询结果':result.name+' · 查询结果'),table=el('div','analysis-result-table'),status=el('p','subtle','正在读取查询结果…');status.setAttribute('role','status');root.append(title,status,table);
  const toolbar=el('div','analysis-result-pagination'),previous=button('上一页',()=>loadPage(page-1)),next=button('下一页',()=>loadPage(page+1)),label=el('span','subtle'),jump=el('input','field-input'),go=button('跳转',()=>loadPage(Number(jump.value))),csv=el('a','small-button','下载完整 CSV');
  let page=1,totalPages=1,rowCount=result.rowCount??null,loading=false,request=0,lastTarget=1;const pageSize=20;
  jump.type='number';jump.min='1';jump.step='1';jump.value='1';jump.ariaLabel='结果页码';jump.style.width='72px';jump.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();loadPage(Number(jump.value));}};
  csv.href='/api/databases/results/'+result.id+'.csv';csv.download='query-result.csv';toolbar.append(previous,label,next,el('span','subtle','第'),jump,el('span','subtle','页'),go,csv);root.append(toolbar);
  const details=el('details','analysis-query-details'),sql=el('pre');details.append(el('summary','','查看查询语句'),sql);details.hidden=true;root.append(details);
  const retry=button('重试读取结果',()=>loadPage(lastTarget));retry.hidden=true;root.append(retry);
  function controls(){previous.disabled=loading||page<=1;next.disabled=loading||page>=totalPages;jump.disabled=go.disabled=loading;jump.max=String(totalPages);label.textContent=rowCount===null?'正在读取':'第 '+page+' / '+totalPages+' 页 · 共 '+rowCount.toLocaleString()+' 行';}
  async function loadPage(target){
    if(loading)return;
    if(!Number.isInteger(target)||target<1||target>totalPages){status.textContent='请输入 1 至 '+totalPages+' 之间的整数页码。';status.setAttribute('role','alert');jump.value=String(page);return;}
    loading=true;lastTarget=target;const version=++request;controls();retry.hidden=true;status.textContent='正在读取第 '+target+' 页…';status.setAttribute('role','status');
    try{const data=await databaseApi('result',{resultId:result.id,offset:(target-1)*pageSize,limit:pageSize});if(version!==request||root.isConnected===false)return;
      rowCount=data.rowCount;totalPages=Math.max(1,Math.ceil(rowCount/pageSize));page=target;jump.value=String(page);table.replaceChildren(databaseTable(data.columns,data.rows));status.textContent=rowCount?((target-1)*pageSize+1)+'–'+((target-1)*pageSize+data.rows.length)+' / '+rowCount.toLocaleString()+' 行':'查询完成，没有符合条件的数据。';
      sql.textContent=data.executedQuery||data.query||'';details.hidden=!sql.textContent;
    }catch(error){if(version===request&&root.isConnected!==false){status.textContent='结果读取失败：'+nativeErrorMessage(error);status.setAttribute('role','alert');retry.hidden=false;}}
    finally{if(version===request){loading=false;controls();}}
  }
  controls();loadPage(1);return root;
}
function renderAnalysisToolResult(item,done){
  if(!done||!isAnalysisResultItem(item))return null;const card=el('section','message agent analysis-results');
  for(const result of analysisResultReferences(item))card.append(renderInlineAnalysisResult(result));return card;
}
function refreshAnalysisResultVisibility(){
  const seen=new Set();
  for(const entry of state.items.values()){
    if(!isAnalysisResultItem(entry.item))continue;
    const rows=entry.node?.querySelectorAll('[data-analysis-result-id]')||[];let visible=0;
    for(const row of rows){const id=row.dataset.analysisResultId;row.hidden=seen.has(id);if(!row.hidden){seen.add(id);visible++;}}
    if(rows.length)entry.node.hidden=visible===0;
  }
}
function analysisReportSnapshot(itemId){
  const entry=state.items.get(itemId),turn=state.turns.find(turn=>turn.id===entry?.turnId);
  if(!entry?.done||entry.item.type!=='agentMessage'||entry.item.phase==='commentary'||turn?.status!=='completed'||extractAnalysisProposal(entry.item.text))throw new Error('该回答尚未完成，或仍是待确认方案，不能作为分析结论导出。');
  const results=new Map();for(const candidate of state.items.values())if(candidate.done&&candidate.turnId===entry.turnId)for(const result of analysisResultReferences(candidate.item))results.set(result.id,result);
  return {threadId:state.thread?.id,generation:state.navigationGeneration,itemId,title:state.thread?.name||state.thread?.preview||'分析结论',text:entry.item.text||'',results:[...results.values()]};
}
function analysisReportMarkdown(snapshot){return ['# '+snapshot.title.replace(/[\r\n]+/g,' '),'',snapshot.text,'','---','分析记录：'+snapshot.threadId,'',...(snapshot.results.length?['## 本轮相关查询结果','',...snapshot.results.map(r=>'- '+r.name+' · '+r.id+(Number.isInteger(r.rowCount)?' · '+r.rowCount+' 行':'')),'']:[]),'此文件导出本条已完成回答及同轮已加载的查询结果编号；完整数据和查询语句可在原对话查看。'].join('\n');}
function exportAnalysisReport(itemId,threadId,generation){
  if(state.threadLoading||state.restoreError||threadId!==state.thread?.id||generation!==state.navigationGeneration)throw new Error('当前分析已切换或正在恢复，请在目标回答中重新下载。');
  const snapshot=analysisReportSnapshot(itemId),name=snapshot.title.replace(/[\\/:*?"<>|\r\n]/g,'-').slice(0,70)||'分析结论';downloadDatabaseBlob(new Blob([analysisReportMarkdown(snapshot)],{type:'text/markdown;charset=utf-8'}),name+'.md');
}
function decorateAnalysisAnswer(node,item,done){
  if(!done||item.phase==='commentary'||extractAnalysisProposal(item.text))return;
  let actions=node.querySelector('.message-actions');if(!actions){actions=el('div','message-actions');node.append(actions);}
  const threadId=state.thread?.id,generation=state.navigationGeneration,download=button('下载结论',()=>exportAnalysisReport(item.id,threadId,generation),'text-button');download.dataset.exportAnalysisReport=item.id;download.hidden=true;download.title='下载本条回答为 Markdown，并附同轮查询结果编号';actions.append(download);
}
function refreshAnalysisDownloads(){for(const entry of state.items.values())for(const button of entry.node?.querySelectorAll('[data-export-analysis-report]')||[]){const turn=state.turns.find(t=>t.id===entry.turnId);button.hidden=!entry.done||turn?.status!=='completed';}}
const analysisOwnedTurns=new Map(),analysisLiveTurns=new Map(),analysisModeChanges=new Map();
function analysisModeChangeBlocked(threadId=state.thread?.id){return analysisModeChanges.get(threadId)?.status==='pending';}
function analysisNotifyChange(){renderNativeMode();updateSend();}
function recordAnalysisSubmission(threadId,turn,context){
  if(!turn?.id||context.mode!=='default')return;
  analysisOwnedTurns.set(turn.id,{threadId,connection:state.ws,model:context.model||state.threadSettings.get(threadId)?.model||state.runtimeDefaults?.model,effort:context.effort||null});
  const observed=analysisLiveTurns.get(turn.id);if(observed?.status==='completed')queueMicrotask(()=>maybeEnterAnalysisPlan(turn.id));
}
function analysisUIEvent(message){
  const p=message.params||{};
  if(['item/completed','turn/completed'].includes(message.method))queueMicrotask(()=>{refreshAnalysisDownloads();refreshAnalysisResultVisibility();});
  if(message.method==='thread/settings/updated'&&p.threadSettings?.collaborationMode?.mode==='plan')analysisModeChanges.get(p.threadId)?.confirm?.();
  if(message.method==='thread/deleted'){analysisModeChanges.delete(p.threadId);for(const [id,record]of analysisOwnedTurns)if(record.threadId===p.threadId){analysisOwnedTurns.delete(id);analysisLiveTurns.delete(id);}}
  if(!p.threadId)return;
  const id=p.turnId||p.turn?.id;if(!id)return;
  if(!analysisLiveTurns.has(id)){if(analysisLiveTurns.size>=128){const oldest=analysisLiveTurns.keys().next().value;analysisLiveTurns.delete(oldest);analysisOwnedTurns.delete(oldest);}analysisLiveTurns.set(id,{threadId:p.threadId});}
  const observed=analysisLiveTurns.get(id);if(observed.threadId!==p.threadId)return;
  if(message.method==='item/completed'&&p.item?.type==='agentMessage'&&p.item.phase!=='commentary'){const proposal=extractAnalysisProposal(p.item.text);observed.proposal=proposal?{id:p.item.id,text:proposal}:null;}
  if(message.method==='turn/completed'){observed.status=p.turn?.status;if(observed.status==='completed')queueMicrotask(()=>maybeEnterAnalysisPlan(id));}
}
async function maybeEnterAnalysisPlan(turnId){
  const own=analysisOwnedTurns.get(turnId),observed=analysisLiveTurns.get(turnId);if(!own||!observed?.proposal||observed.status!=='completed'||observed.handled||own.threadId!==observed.threadId)return;
  observed.handled=true;const threadId=own.threadId;
  const operation={status:'pending',turnId,proposal:observed.proposal};analysisModeChanges.set(threadId,operation);analysisNotifyChange();
  let timer,resolve,reject;const confirmed=new Promise((yes,no)=>{resolve=yes;reject=no;});confirmed.catch(()=>{});
  operation.confirm=()=>resolve();const closed=()=>reject(new Error('连接已断开，尚未确认进入计划模式。'));
  try{
    if(own.connection!==state.ws||!state.ready)throw new Error('原生连接已改变，未自动切换计划模式。');
    if(state.activeTurns.has(threadId))throw new Error('该分析已有新任务运行，未自动切换模式；请停止后使用 /plan。');
    own.connection?.addEventListener?.('close',closed,{once:true});timer=setTimeout(()=>reject(new Error('尚未收到原生计划模式确认，请恢复会话核对；未自动重发。')),15000);
    const result=rpc('thread/settings/update',{threadId,collaborationMode:{mode:'plan',settings:{model:own.model,reasoning_effort:own.effort,developer_instructions:null}}});
    result.catch(reject);await Promise.race([Promise.all([result,confirmed]),confirmed.then(()=>null)]);
    if(own.connection!==state.ws)throw new Error('原生连接已改变，请恢复会话确认模式。');
    operation.status='applied';
  }catch(error){operation.status='failed';operation.error=nativeErrorMessage(error);}
  finally{clearTimeout(timer);own.connection?.removeEventListener?.('close',closed);delete operation.confirm;analysisNotifyChange();refreshAutomaticPlanNotice(threadId);}
}
function refreshAutomaticPlanNotice(threadId=state.thread?.id){
  if(threadId!==state.thread?.id)return;
  const operation=analysisModeChanges.get(threadId);
  for(const node of $$('[data-automatic-analysis-plan]')){
    let notice=node.querySelector('.analysis-plan-notice');if(!notice){notice=el('p','analysis-plan-notice subtle');node.append(notice);}
    notice.textContent=operation?.status==='pending'?'方案已提出，正在等待原生确认进入计划模式。':operation?.status==='failed'?'分析方案已保留，自动进入计划模式失败：'+operation.error+' 可重试 /plan。':'这是待确认的分析方案，确认后才提交执行任务。';notice.setAttribute('role',operation?.status==='failed'?'alert':'status');
  }
}
function renderAutomaticAnalysisPlan(item,done){const text=done&&extractAnalysisProposal(item.text);if(!text||item.phase==='commentary')return null;const node=renderProposedPlan({id:'analysis-'+item.id,text},true);node.dataset.automaticAnalysisPlan=item.id;node.append(el('p','analysis-plan-notice subtle','这是 Codex 提出的待确认分析方案，确认后才提交执行任务。'));return node;}
