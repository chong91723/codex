/* Numerical answers are projections of persisted, executed data evidence. */
const analysisEvidenceRequests=new Map(),analysisTurnRegistrations=new Map();
async function downloadAnalysisMetricProof(metric,isCurrent=()=>true){
  if(!isCurrent())throw new Error('当前分析已切换，请在原回答中重新下载推导记录。');
  const record=await databaseApi('result',{metricRules:{operation:'proof',resultId:metric.resultId}});
  if(!isCurrent())throw new Error('当前分析已切换，未下载上一条分析的推导记录。');
  if(record.proofHash!==metric.proofHash||record.proof?.resultId!==metric.resultId)throw new Error('推导记录与本条回答引用不一致，未下载。');
  downloadDatabaseBlob(new Blob([JSON.stringify(record,null,2)],{type:'application/json;charset=utf-8'}),'metric-proof-'+metric.resultId+'.json');
}
function registerAnalysisTurn(threadId,turnId){const key=JSON.stringify([threadId,turnId]);if(!analysisTurnRegistrations.has(key)){const pending=databaseApi('result',{analysisEvidence:{action:'register',threadId,turnId}});pending.catch(()=>{});analysisTurnRegistrations.set(key,pending);}return analysisTurnRegistrations.get(key);}
async function removeAnalysisThreadEvidence(threadId){
  const marker=JSON.stringify([threadId]).slice(0,-1)+',';
  for(const key of analysisEvidenceRequests.keys())if(key.startsWith(marker))analysisEvidenceRequests.delete(key);
  const pending=[];for(const [key,value]of analysisTurnRegistrations)if(key.startsWith(marker)){pending.push(value);analysisTurnRegistrations.delete(key);}
  await Promise.allSettled(pending);
  try{await databaseApi('result',{analysisEvidence:{action:'remove_thread',threadId}});}catch(error){report(new Error('原生会话已删除，但分析原文与数值证据清理失败：'+nativeErrorMessage(error)));}
}
const analysisChineseDigits='零〇一二三四五六七八九十百千万亿兆两兩壹贰貳叁參肆伍陆陸柒捌玖拾佰仟萬億',analysisChineseNumber=new RegExp('[负負'+analysisChineseDigits+']+','gu');
const analysisNumberUnit=/^(?:个|條|条|笔|天|日|月|年|元|圆|圓|角|分|倍|成|位|次|项|组|类|种|页|行|列|份|点|步|轮|名|户|家|只|支|股|吨|克|米|秒|%|％)/u,analysisNumberPrefix=/(?:一共|总共|共有|共计|总计|合计|数量|总额|金额|平均值|平均额|结果|答案|记录数|最大值|最小值|等于|达到|为|是|：|:)\s*$/u;
function analysisHasNumbers(text){
  for(const phrase of ['千位分隔符','一致','一律','统一','唯一','一并','一般','一起','一旦','一键','万一','进一步'])text=text.replaceAll(phrase,'');
  if(/\p{N}/u.test(text)||/(?<![A-Za-z_])(?:zero|nought|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|half|quarter|once|twice)(?![A-Za-z_])/i.test(text))return true;
  const boundary='，。；：、（）()';
  for(const match of text.matchAll(analysisChineseNumber)){
    if(![...match[0]].some(c=>analysisChineseDigits.includes(c)))continue;
    const before=text.slice(Math.max(0,match.index-30),match.index),after=text.slice(match.index+match[0].length,match.index+match[0].length+4);
    if(analysisNumberUnit.test(after)||before.endsWith('百分之')||before.endsWith('第'))return true;
    if(analysisNumberPrefix.test(before)&&(!after||!/[\u4e00-\u9fffA-Za-z]/u.test(after[0])))return true;
    if((!before||/\s/u.test(before.at(-1))||boundary.includes(before.at(-1)))&&(!after||/\s/u.test(after[0])||boundary.includes(after[0])))return true;
  }
  return false;
}
function analysisEvidenceInstructions(){return 'Numerical evidence policy numeric-evidence-v1: Every number you state (amount, count, date, percentage, change, prediction, numeric identifier) must come from an actual database query or Python execution. Never calculate mentally, invent, or transcribe numbers into narrative. Use run_python for calculations and date parameters. To present a numerical answer or plan, call publish_answer with a prose template using {{name}} for every numeric/date/identifier value and references mapping names to {result_id,row,column}. For Markdown tables, header, delimiter and body rows must have matching column counts; include a delimiter cell for each header. Output the returned text EXACTLY; adding dates, numbered list markers, numeric URLs or changing wording requires publishing again. Use qualitative titles without numbers for run_python and charts. If a chart title needs numbers, publish that title first with actual field references. Do not embed plot images in prose. ECharts create_chart is the ONLY visualization path. Do not install or use Matplotlib, Plotly, seaborn or other plotting libraries. Python is only for fetching/parsing/cleaning/computation, with preinstalled NumPy/pandas/Decimal; its isolated runner has no network. For external sources use fetch_data (its description lists allowed origins) or import_data_file, then run_python documents. Do not use shell commands to fetch analysis data, probe runtimes, or install packages; do not query an unrelated database with SELECT literals/UNION to manufacture result IDs. Data from APIs, files or Python results can be charted directly by result ID without any database. Only discover database schemas for actual database questions. Commentary must remain qualitative: do not repeat user-provided numeric precision, dates, ranges or counts before publication, including Chinese expressions such as 三位小数. Before execution, plans contain intended operations rather than observed statistics. Avoid quantified phrases such as 两个年度, 一个订单 or 一对多 in unexecuted plans: use 比较期与基期, 订单头粒度 and 连接放大风险. Before returning ANY final proposed plan, call publish_answer with the COMPLETE plan body as template and empty references if qualitative. Fix all validation errors in the SAME native turn; use run_python for necessary numerical parameters and reference them. This validates the proposal text and does not approve or execute the analysis. Copy the returned text exactly inside the proposed_plan block; never add headings or numbering afterwards. Plans before execution should describe rules qualitatively, with unnumbered bullets: say 字段唯一 instead of 一个字段, and avoid restating numerical amounts, dates, counts, thresholds, numbered headings or numeric paths. If a numerical threshold must appear in a plan, materialize it through Python and publish the complete plan with field references first. In publish_answer templates, precision/count words also require references, for example 保留{{precision}}位小数. Python result must be a flat table: all rows have the same columns and cells are scalar; do not nest dictionaries or lists. Use separate calculations for detail and summary, or repeat scalar summary fields alongside chart rows. Data reuse limits are set by the user for each database source and enforced by the analysis tools. Re-reading or recalculating a cached result does not refresh its source acquisition time. A source with no configured reuse limit is not certified current; query the source again for latest/current questions. For business metrics, first list_metric_rules and select an applicable user-confirmed rule and parameters. Use execute_metric for that governed calculation; the tool records actual derivation and enforces the configured formula, units and data quality. Never self-confirm a rule. If no applicable rule exists, propose a candidate definition and continue exploratory analysis only with its limitation made clear. Free SQL/Python outputs do not inherit metric proof from their inputs. Publication always matches numbers to execution records; only metric-annotated fields additionally have versioned rule execution evidence. Never describe an arbitrary paragraph as business-correct: a metric value must retain its actual metric name, unit and scope. Scope/definition correctness still needs the business owner. Never claim business correctness verified just because publish_answer succeeds. A refused publication is an error to fix using the same native tool workflow, not permission to output unverified figures.';}
async function prepareAnalysisTools(){
  let status=await databaseApi();if(!status.ready)return;
  if(!status.mcpConfig?.env?.CODEX_WEB_ANALYSIS_ROOTS)status=await databaseApi('result',{analysisEvidence:{action:'configuration',workspace:state.status?.workspace||state.selectedCwd}});
  const current=await rpc('config/read',{includeLayers:true,cwd:state.selectedCwd}),existing=current.config?.mcp_servers?.[status.mcpName];
  // Only migrate missing settings of our managed extension, preserving user overrides.
  if(existing){
    if(existing.enabled===false||existing.command!==status.mcpConfig.command||JSON.stringify(existing.args)!==JSON.stringify(status.mcpConfig.args))return;
    const missing=Object.fromEntries(Object.entries(status.mcpConfig.env||{}).filter(([name])=>!Object.hasOwn(existing.env||{},name)));
    if(!Object.keys(missing).length)return;
    await writeMcpConfig(status.mcpName,{...existing,env:{...existing.env,...missing}},current);return;
  }
  await writeMcpConfig(status.mcpName,status.mcpConfig,current);
}
function renderGroundedAnalysisItem(item,done,turnId){
  if(item._analysisVerified||!['agentMessage','plan'].includes(item.type))return null;
  const text=item.text||'',numeric=analysisHasNumbers(text),image=/!\[[^\]]*\]\(|<(?:img|svg|iframe)\b/i.test(text);
  if(!numeric&&!image)return null;
  const root=el('div','message agent analysis-evidence-answer'),status=el('p','analysis-evidence-status','正在核验回答中的数值依据…');status.setAttribute('role','status');root.append(status);root.dataset.analysisVerification='pending';
  if(!done&&!state.renderingHistory){status.textContent='正在生成回答，数值依据将在内容完成后核验。';return root;}
  const threadId=state.thread?.id,generation=state.navigationGeneration,targetTurn=turnId||state.items.get(item.id)?.turnId||state.activeTurns.get(threadId)||'',key=JSON.stringify([threadId,targetTurn,item.id,text]);
  const active=()=>root.isConnected&&state.thread?.id===threadId&&state.navigationGeneration===generation;
  async function verify(retry=false){
    if(retry)analysisEvidenceRequests.delete(key);
    if(!analysisEvidenceRequests.has(key)){if(analysisEvidenceRequests.size>=128)analysisEvidenceRequests.delete(analysisEvidenceRequests.keys().next().value);const payload={threadId,turnId:targetTurn,text,requireEvidence:analysisTurnRegistrations.has(JSON.stringify([threadId,targetTurn]))};const registration=analysisTurnRegistrations.get(JSON.stringify([threadId,targetTurn]))||Promise.resolve();analysisEvidenceRequests.set(key,registration.then(()=>state.status?.analysisEvidenceVersion==='numeric-evidence-v1'?databaseApi('verify_answer',payload):databaseApi('result',{analysisEvidence:{action:'verify',...payload}})));}
    try{
      const result=await analysisEvidenceRequests.get(key);if(!active())return;
      if(['verified','notRequired','legacy'].includes(result.status)){
        root.dataset.analysisVerification=result.status;root.analysisEvidence=result;
        const content=renderItem({...item,_analysisVerified:true},done,targetTurn);content.classList.remove('message');root.replaceChildren(content);
        if(result.status==='legacy')root.prepend(el('p','subtle analysis-evidence-legacy','历史回答：未按当前数值规则核验。'));
        if(result.status==='verified'){
          const evidence=el('details','analysis-number-evidence');evidence.append(el('summary','','数值依据：已匹配查询或 Python 执行记录'),el('pre','',pretty({publicationChecks:result.publicationChecks,values:result.evidence,sources:result.sources})));root.append(evidence);
          const metrics=(result.evidence||[]).filter(value=>value.metric);
          if(metrics.length){
            const info=el('details','analysis-metric-evidence');info.append(el('summary','','指标口径与推导检查'),el('p','subtle','以下引用已按用户确认的口径执行。检查对应这些指标字段；不证明整段回答语义、业务定义或源数据真实。这里保存的是发布时的状态。'));
            for(const value of metrics){const metric=value.metric;info.append(el('p','',String(metric.name||value.column)+' · '+String(metric.unit||'未指定单位')+' · 口径版本 '+String(metric.version)+' · 结果 '+String(value.value??'空值')),el('pre','',pretty({...metric,context:result.sources?.[value.resultId]?.metricContext})));}
            const downloads=new Set();for(const value of metrics){const metric=value.metric;if(!metric.resultId||downloads.has(metric.resultId))continue;downloads.add(metric.resultId);const link=button('下载完整推导记录',async()=>{link.disabled=true;link.textContent='正在读取推导记录…';try{await downloadAnalysisMetricProof(metric,active);}finally{link.disabled=false;link.textContent='下载完整推导记录';}},'text-button');info.append(link);}
            root.append(info);
          }
          const checks=result.publicationChecks;
          if(checks?.version!=='analysis-publication-v2')root.prepend(el('p','subtle analysis-evidence-policy','旧规则记录：未应用当前数据源时效检查。'));
          else if(checks.freshness?.some(source=>source.status==='notConfigured'))evidence.prepend(el('p','subtle','部分来源未设置复用时长，不能据此认定为最新数据。'));
        }
        refreshAnalysisDownloads();return;
      }
      reject(result.reason||'数值依据核验未通过。');
    }catch(error){if(active()){analysisEvidenceRequests.delete(key);reject('数值依据核验失败：'+nativeErrorMessage(error));}}
  }
  function reject(reason){
    root.dataset.analysisVerification='rejected';const commentary=item.type==='agentMessage'&&item.phase==='commentary';status.textContent=commentary?'过程说明含未核验数字，未作为分析结论展示。':reason;status.setAttribute('role',commentary?'status':'alert');
    const original=el('details','analysis-unverified-original');original.append(el('summary','','查看未核验的原始输出（仅供排查）'),el('pre','',text));const parts=[status];
    if(!commentary){
      parts.push(button('重试核验',()=>{root.replaceChildren(status);status.textContent='正在重新核验…';status.setAttribute('role','status');root.dataset.analysisVerification='pending';verify(true);},'text-button'));
      const isPlan=item.type==='plan'||typeof extractAnalysisProposal==='function'&&!!extractAnalysisProposal(text);
      if(isPlan)status.textContent='方案含未核验的数值描述，暂不能确认执行。请修订方案；这还不是已执行的分析结论。';
      parts.push(button(isPlan?'修订方案中的未核验数值':'请 Codex 补充依据',()=>{if(!active())return;const prompt=$('#prompt');if(prompt.value.trim())return toast('当前草稿已保留，请发送或保存后再补充依据。');prompt.value=isPlan?'上一条是待确认的分析方案，还未批准执行。请只修订方案，不开始经营查询或执行分析。用比较期与基期、订单头粒度、连接放大风险等定性表达，去掉两个年度、一个订单、一对多等未核验的数量说法，使用无编号项目符号；不能省略分析要求。确需写出数值门槛或日期时，先用 Python 实际计算并通过 publish_answer 发布完整方案。无论是否包含数值，先把完整方案正文通过 publish_answer 校验（定性文本用空 references）；若工具拒绝，在本轮修正，不要输出尚未通过的方案。最后将返回正文原样放入 <proposed_plan>...</proposed_plan>，等待用户确认。':'请核对上一条回答中的全部数字，完成必要查询或 Python 计算，再基于有依据的结果重新回答。';saveComposer();resizePrompt();prompt.focus();},'text-button'));
    }
    parts.push(original);root.replaceChildren(...parts);
  }
  verify();return root;
}
