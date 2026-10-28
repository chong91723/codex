/* Read native phase-one output even while global consolidation is cooling down.
   The native SQLite data is read-only; corrections become user notes. */
function createNativeMemoryHistoryPanel(api,run,onCorrect){
  const node=el('details','analysis-native-history'),body=el('div'),preview=el('pre','analysis-memory-preview'),reading=el('div','db-toolbar');node.append(el('summary','','原生逐会话总结（无需等待全局合并）'),el('p','subtle','满足原生提取条件后，这些记录即可供 Agent 按需查阅。全局摘要合并另有六小时冷却。历史内容不替代当前已确认的业务定义。'),body,preview,reading);
  let offset=0,selected=null,part=0,sha=null;
  async function load(){const value=await api({operation:'summary_search',offset,limit:10});if(!node.isConnected)return;body.replaceChildren();
    if(!value.records.length)body.append(el('p','subtle','尚无逐会话提取记录。原始对话需满足至少一小时闲置条件，且有可保留的信息；即时笔记与用户编辑已可跨会话使用。'));
    for(const item of value.records){const row=el('div','exploration-note-card');row.append(el('p','subtle',new Date(item.sourceUpdatedAt*1000).toLocaleString()+' · '+item.version),el('p','',item.preview+(item.truncated?'…':'')),button('查看全文',()=>run(async()=>{selected=item;part=0;sha=null;await read();})),button('补充/纠正这份记忆',()=>onCorrect(item)));body.append(row);}
    const prev=button('上一页',()=>run(async()=>{offset=Math.max(0,offset-10);await load();})),next=button('下一页',()=>run(async()=>{offset+=10;await load();}));prev.disabled=!offset;next.disabled=!value.hasMore;body.append(prev,el('span','subtle',' 共 '+value.total+' 条提取记录 '),next);
  }
  async function read(){if(!selected)return;const value=await api({operation:'summary_read',threadId:selected.threadId,version:selected.version,offset:part,limit:8000,...(sha?{expectedHash:sha}:{})});if(!node.isConnected)return;sha=value.sha256;preview.textContent=value.text;reading.replaceChildren();const prev=button('上一段',()=>run(async()=>{part=Math.max(0,part-8000);await read();})),next=button('下一段',()=>run(async()=>{part=value.nextOffset;await read();}));prev.disabled=!part;next.disabled=!value.hasMore;reading.append(prev,el('span','subtle',(part+1)+'–'+Math.min(value.characters,part+value.text.length)+' / '+value.characters+' 字符'),next);}
  node.ontoggle=()=>{if(node.open)run(load);};
  return {node,reset(){node.open=false;body.replaceChildren();preview.textContent='';reading.replaceChildren();selected=null;part=offset=0;sha=null;}};
}
