/* Read native phase-one output even while global consolidation is cooling down.
   The native SQLite data is read-only; corrections become user notes. */
function createNativeMemoryHistoryPanel(api,run,onCorrect){
  const node=el('details','analysis-native-history'),body=el('div'),preview=el('pre','analysis-memory-preview'),reading=el('div','db-toolbar');node.append(el('summary','','历史任务摘要（原生提取记录）'),el('p','subtle','这里只读展示已有原生提取记录，供 Agent 查找历史任务线索，不代表当前事实。普通新分析关闭整段对话自动提取；明确保存的偏好另行跨会话使用。记录可能晚于原始会话更新，全局摘要也另行异步整理。'),body,preview,reading);
  let offset=0,selected=null,part=0,sha=null;
  async function load(){const value=await api({operation:'summary_search',offset,limit:10});if(!node.isConnected)return;body.replaceChildren();
    if(!value.records.length)body.append(el('p','subtle','尚无历史任务提取记录。普通新分析不会因闲置而自动生成这里的摘要；已成功保存的即时偏好与用户编辑可供后续任务使用。'));
    for(const item of value.records){const row=el('div','exploration-note-card');row.append(el('p','subtle','来源会话：'+item.threadId+' · 提取依据时间：'+new Date(item.sourceUpdatedAt*1000).toLocaleString()),el('p','subtle',({current:'来源会话在提取后尚无已知更新；内容仍仅作历史线索。',stale:'来源会话已有更新，这份摘要尚未同步；请回到原会话核对。',missing:'来源会话已不存在；本记录仅用于历史解释。',unknown:'来源状态未确认；不可视为当前事实。'}[item.sourceState]||'来源状态未确认；不可视为当前事实。')+' · '+item.version),el('p','',item.preview+(item.truncated?'…':'')),button('查看全文',()=>run(async()=>{selected=item;part=0;sha=null;await read();})),button('补充长期偏好纠正',()=>onCorrect(item)));body.append(row);}
    const prev=button('上一页',()=>run(async()=>{offset=Math.max(0,offset-10);await load();})),next=button('下一页',()=>run(async()=>{offset+=10;await load();}));prev.disabled=!offset;next.disabled=!value.hasMore;body.append(prev,el('span','subtle',' 共 '+value.total+' 条提取记录 '),next);
  }
  async function read(){if(!selected)return;const value=await api({operation:'summary_read',threadId:selected.threadId,version:selected.version,offset:part,limit:8000,...(sha?{expectedHash:sha}:{})});if(!node.isConnected)return;sha=value.sha256;preview.textContent=value.text;reading.replaceChildren();const prev=button('上一段',()=>run(async()=>{part=Math.max(0,part-8000);await read();})),next=button('下一段',()=>run(async()=>{part=value.nextOffset;await read();}));prev.disabled=!part;next.disabled=!value.hasMore;reading.append(prev,el('span','subtle',(part+1)+'–'+Math.min(value.characters,part+value.text.length)+' / '+value.characters+' 字符'),next);}
  node.ontoggle=()=>{if(node.open)run(load);};
  return {node,reset(){node.open=false;body.replaceChildren();preview.textContent='';reading.replaceChildren();selected=null;part=offset=0;sha=null;}};
}
