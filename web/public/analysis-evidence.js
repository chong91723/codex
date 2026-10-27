/* Numerical answers are projections of persisted, executed data evidence. */
const analysisEvidenceRequests=new Map(),analysisTurnRegistrations=new Map();
function registerAnalysisTurn(threadId,turnId){const key=JSON.stringify([threadId,turnId]);if(!analysisTurnRegistrations.has(key)){const pending=databaseApi('result',{analysisEvidence:{action:'register',threadId,turnId}});pending.catch(()=>{});analysisTurnRegistrations.set(key,pending);}return analysisTurnRegistrations.get(key);}
async function removeAnalysisThreadEvidence(threadId){
  const marker=JSON.stringify([threadId]).slice(0,-1)+',';
  for(const key of analysisEvidenceRequests.keys())if(key.startsWith(marker))analysisEvidenceRequests.delete(key);
  const pending=[];for(const [key,value]of analysisTurnRegistrations)if(key.startsWith(marker)){pending.push(value);analysisTurnRegistrations.delete(key);}
  await Promise.allSettled(pending);
  try{await databaseApi('result',{analysisEvidence:{action:'remove_thread',threadId}});}catch(error){report(new Error('原生会话已删除，但分析原文与数值证据清理失败：'+nativeErrorMessage(error)));}
}
function analysisHasNumbers(text){text=text.replaceAll('千位分隔符','');return /(?<![A-Za-z_])(?:zero|nought|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|half|quarter|once|twice)(?![A-Za-z_])/i.test(text)||/(?:总计|合计|数量|总额|金额|平均值|平均额|结果|答案|记录数|最大值|最小值|等于|达到)\s*[负零〇一二三四五六七八九十百千万亿两]+(?![\u4e00-\u9fffA-Za-z])|(?:^|[\s，。；：、（(])[负零〇一二三四五六七八九十百千万亿两]+(?=[\s，。；、）)]|$)/u.test(text)|| /\p{N}/u.test(text)||/(?:第[零〇一二三四五六七八九十百千万亿两]+|[零〇一二三四五六七八九十百千万亿两]+(?:个|条|笔|天|日|月|年|元|万|亿|倍|成|位|次|项|组|类|种|页|行|列|份|点|步|轮|名|户|家|只|支|股|%|％)|(?:为|是|：|:)\s*[零〇一二三四五六七八九十百千万亿两]+|百分之[零〇一二三四五六七八九十百千万亿两]+)/u.test(text);}
function analysisEvidenceInstructions(){return 'Numerical evidence policy numeric-evidence-v1: Every number you state (amount, count, date, percentage, change, prediction, numeric identifier) must come from an actual database query or Python execution. Never calculate mentally, invent, or transcribe numbers into narrative. Use run_python for calculations and date parameters. To present a numerical answer or plan, call publish_answer with a prose template using {{name}} for every numeric/date/identifier value and references mapping names to {result_id,row,column}. Output the returned text EXACTLY; adding dates, numbered list markers, numeric URLs or changing wording requires publishing again. Use qualitative titles without numbers for run_python and charts. If a chart title needs numbers, publish that title first with actual field references. Do not embed plot images in prose. ECharts create_chart is the ONLY visualization path. Do not install or use Matplotlib, Plotly, seaborn or other plotting libraries. Python is only for fetching/parsing/cleaning/computation, with preinstalled NumPy/pandas/Decimal; its isolated runner has no network. For external sources use fetch_data (its description lists allowed origins) or import_data_file, then run_python documents. Do not use shell commands to fetch analysis data, probe runtimes, or install packages; do not query an unrelated database with SELECT literals/UNION to manufacture result IDs. Data from APIs, files or Python results can be charted directly by result ID without any database. Only discover database schemas for actual database questions. Commentary must remain qualitative: do not repeat user-provided numeric precision, dates, ranges or counts before publication, including Chinese expressions such as 三位小数. Plans before execution should describe rules qualitatively, with unnumbered bullets: say 字段唯一 instead of 一个字段, and avoid restating numerical amounts, dates, counts, thresholds, numbered headings or numeric paths. If a numerical threshold must appear in a plan, materialize it through Python and publish the complete plan with field references first. In publish_answer templates, precision/count words also require references, for example 保留{{precision}}位小数. Python result must be a flat table: all rows have the same columns and cells are scalar; do not nest dictionaries or lists. Use separate calculations for detail and summary, or repeat scalar summary fields alongside chart rows. Never claim an answer verified unless publish_answer succeeds. A refused publication is an error to fix using the same native tool workflow, not permission to output unverified figures.';}
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
        root.dataset.analysisVerification=result.status;
        const content=renderItem({...item,_analysisVerified:true},done,targetTurn);content.classList.remove('message');root.replaceChildren(content);
        if(result.status==='legacy')root.prepend(el('p','subtle analysis-evidence-legacy','历史回答：未按当前数值规则核验。'));
        if(result.status==='verified'){
          const evidence=el('details','analysis-number-evidence');evidence.append(el('summary','','数值依据：查询或 Python 已核验'),el('pre','',pretty({values:result.evidence,sources:result.sources})));root.append(evidence);
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
      parts.push(button('请 Codex 补充依据',()=>{if(!active())return;const prompt=$('#prompt');if(prompt.value.trim())return toast('当前草稿已保留，请发送或保存后再补充依据。');prompt.value='请核对上一条回答中的全部数字，完成必要查询或 Python 计算，再基于有依据的结果重新回答。';saveComposer();resizePrompt();prompt.focus();},'text-button'));
    }
    parts.push(original);root.replaceChildren(...parts);
  }
  verify();return root;
}
