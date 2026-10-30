/* Report presentation never changes the original answer or numerical proof. */
function decorateReportReading(node,item){
  const body=node.querySelector('.markdown');if(!body)return;
  const headings=[...body.querySelectorAll('h1,h2,h3')];
  if(headings.length<3&&String(item.text||'').length<1800)return;
  node.classList.add('analysis-report');body.classList.add('analysis-report-body');
  const restored=!!item._reportRestored||state.renderingHistory||state.threadLoading,thread=state.thread?.id,generation=state.navigationGeneration;
  if(!restored)queueMicrotask(()=>{if(node.isConnected&&thread===state.thread?.id&&generation===state.navigationGeneration&&composerState().follow){composerState().follow=false;node.scrollIntoView({block:'start'});if(typeof updateScrollControl==='function')updateScrollControl();}});
  if(headings.length>1){const nav=el('details','analysis-report-outline'),links=el('nav');nav.append(el('summary','','报告目录'));links.ariaLabel='报告章节';
    for(const heading of headings){const link=button(heading.textContent,()=>{heading.scrollIntoView({block:'start',behavior:'smooth'});heading.tabIndex=-1;heading.focus({preventScroll:true});},'text-button');link.dataset.level=heading.tagName;links.append(link);}nav.append(links);body.before(nav);}
}
async function analysisReportKnowledge(snapshot){
  if(snapshot.verification?.status!=='verified')return {status:'untracked'};
  return databaseApi('result',{learning:{operation:'report_status',threadId:snapshot.threadId,turnId:snapshot.turnId,answerId:snapshot.verification.answerId}});
}
function reportKnowledgeText(value){return value?.status==='affected'?'业务知识、指标口径或来源文件已变化，此报告需要复核。原报告保留，不代表其中所有数值均错误。':value?.status==='current'?'已跟踪的业务知识、指标与文件依赖仍有效；数据时效以发布时的检查为准。':'此历史报告没有完整的业务知识版本记录，不能判断纠错影响。';}
async function refreshReportKnowledge(entry){
  if(!entry.done||entry.item?.phase==='commentary'||entry.node?.dataset.analysisVerification!=='verified'||state.turns.find(turn=>turn.id===entry.turnId)?.status!=='completed')return;
  const root=entry.node,thread=state.thread?.id,generation=state.navigationGeneration;
  try{const snapshot=analysisReportSnapshot(entry.item.id),value=await analysisReportKnowledge(snapshot);if(!root.isConnected||thread!==state.thread?.id||generation!==state.navigationGeneration)return;
    let info=root.querySelector('.analysis-report-knowledge');if(!info){info=el('p','subtle analysis-report-knowledge');root.prepend(info);}info.textContent=reportKnowledgeText(value);info.dataset.status=value.status;root.analysisKnowledgeStatus=value;
  }catch(error){if(root.isConnected&&thread===state.thread?.id&&generation===state.navigationGeneration){let info=root.querySelector('.analysis-report-knowledge');if(!info){info=el('p','subtle analysis-report-knowledge');root.prepend(info);}info.textContent='业务知识影响检查未完成：'+nativeErrorMessage(error);info.dataset.status='unknown';}}
}
const reportKnowledgeRefreshes=new Map();
function refreshVisibleReportKnowledge(){
  const key=JSON.stringify([state.thread?.id,state.navigationGeneration]);
  if(reportKnowledgeRefreshes.has(key))return reportKnowledgeRefreshes.get(key);
  const entries=[...state.items.values()].filter(entry=>entry.done&&entry.node?.isConnected&&entry.node.dataset.analysisVerification==='verified');let cursor=0;
  async function worker(){while(cursor<entries.length)await refreshReportKnowledge(entries[cursor++]);}
  // A history page can contain many answers. Bound local worker processes and
  // coalesce repeated focus events without delaying the report body itself.
  const pending=Promise.all([worker(),worker()]).finally(()=>reportKnowledgeRefreshes.delete(key));
  reportKnowledgeRefreshes.set(key,pending);return pending;
}
document.addEventListener('analysis-knowledge-changed',()=>{refreshVisibleReportKnowledge();if(state.view==='databases')refreshLearningReview().catch(report);});
window.addEventListener('focus',refreshVisibleReportKnowledge);

function reportEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function reportHTML(snapshot,figures){
  const content=markdown(snapshot.text);for(const image of content.querySelectorAll('img'))image.remove();
  for(const link of content.querySelectorAll('a')){const href=link.getAttribute('href')||'';if(!/^https?:\/\//i.test(href))link.removeAttribute('href');}
  const status=analysisReportVerificationLines(snapshot).join('\n'),notes=markdown(status);
  const charts=figures.map(f=>'<figure><img src="'+f.url+'" alt="'+reportEscape(f.title)+'"><figcaption>'+reportEscape(f.title)+(f.notice?' · '+reportEscape(f.notice):'')+'</figcaption></figure>').join('');
  return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>'+reportEscape(snapshot.title)+'</title><style>body{font:16px/1.85 system-ui,sans-serif;color:#202124;max-width:980px;margin:48px auto;padding:0 28px;overflow-wrap:anywhere}h1,h2,h3{line-height:1.4;margin-top:1.6em}table{border-collapse:collapse;min-width:50%;font-size:14px}td,th{padding:10px 14px;border:1px solid #ddd;text-align:left}th{background:#f7f8fa}pre{white-space:pre-wrap;background:#f6f7f8;padding:18px;font-size:13px}blockquote{border-left:3px solid #bbb;margin-left:0;padding-left:16px;color:#555}.table-scroll{overflow:auto}img{max-width:100%}figure{margin:28px 0;break-inside:avoid}figcaption{color:#555}footer{border-top:1px solid #ddd;margin-top:40px;font-size:13px;color:#666}@media print{body{margin:0;max-width:none;padding:0;font-size:11pt}.table-scroll{overflow:visible}table{max-width:100%}pre{white-space:pre-wrap}h1,h2,h3{break-after:avoid}}</style><body><header><h1>'+reportEscape(snapshot.title)+'</h1><p>分析报告 · '+reportEscape(new Date(snapshot.exportedAt).toLocaleString())+'</p><p>'+reportEscape(reportKnowledgeText(snapshot.knowledgeStatus))+'</p></header><main>'+content.innerHTML+charts+'</main><footer>'+notes.innerHTML+'<p>图表为导出时的静态快照；交互图表和完整 CSV 保留在原对话。技术依据可从原回答单独下载，不在正文中重复展开。</p><p>分析记录：'+reportEscape(snapshot.threadId)+'</p></footer></body></html>';
}
async function reportFigures(snapshot,isCurrent){
  const figures=[];
  for(const ref of snapshot.charts||[]){
    if(!isCurrent())throw new Error('当前分析已切换，已取消导出。');
    const data=ref.version===1?ref:await databaseApi('read_chart',{chartId:ref.chartId});
    if(!validDatabaseChart(data)||data.resultId!==ref.resultId)throw new Error('报告图表与原结果不一致，未导出不完整的报告。');
    // SVG SSR is synchronous, independent of hidden tabs, animation and viewport.
    const chart=echarts.init(null,null,{renderer:'svg',ssr:true,width:1000,height:520});
    try{chart.setOption({...data.option,animation:false,backgroundColor:'#fff'});const svg=chart.renderToSVGString();figures.push({title:data.title||ref.title||'分析图表',notice:data.precisionNotice||null,url:'data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)))});}finally{chart.dispose();}
  }
  return figures;
}
async function exportAnalysisReportFormat(itemId,threadId,generation,format='markdown'){
  const current=()=>!state.threadLoading&&!state.restoreError&&threadId===state.thread?.id&&generation===state.navigationGeneration;
  if(!current())throw new Error('当前分析已切换或正在恢复，请在目标回答中重新下载。');
  let snapshot=analysisReportSnapshot(itemId);
  // Re-read server-owned scope, never export a badge inferred from the text or DOM.
  const verification=await databaseApi('result',{analysisEvidence:{action:'verify',threadId:snapshot.threadId,turnId:snapshot.turnId,text:snapshot.text,requireEvidence:false}});
  if(!current())throw new Error('当前分析已切换，已取消导出。');
  const checked=analysisReportSnapshot(itemId,verification);
  if(checked.text!==snapshot.text)throw new Error('回答内容已更新，请重新下载；未将旧依据用于新内容。');
  snapshot=checked;
  snapshot.exportedAt=new Date().toISOString();snapshot.knowledgeStatus=await analysisReportKnowledge(snapshot);
  let text,mime,suffix;
  if(format==='html'){const figures=await reportFigures(snapshot,current);snapshot.knowledgeStatus=await analysisReportKnowledge(snapshot);text=reportHTML(snapshot,figures);mime='text/html';suffix='.html';}
  else if(format==='evidence'){text=JSON.stringify({title:snapshot.title,threadId:snapshot.threadId,turnId:snapshot.turnId,exportedAt:snapshot.exportedAt,knowledgeStatus:snapshot.knowledgeStatus,verification:snapshot.verification,results:snapshot.results,charts:snapshot.charts,artifactScope:'same-turn-and-explicit-evidence-lineage'},null,2);mime='application/json';suffix='-依据.json';}
  else{text=analysisReportMarkdown(snapshot);mime='text/markdown';suffix='.md';}
  if(!current())throw new Error('当前分析已切换，已取消导出。');
  const name=snapshot.title.replace(/[\\/:*?"<>|\r\n]/g,'-').slice(0,70)||'分析报告';downloadDatabaseBlob(new Blob([text],{type:mime+';charset=utf-8'}),name+suffix);
}
