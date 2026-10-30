/* Native collaboration events, rendered inside their parent conversation.
   A completed spawn/wait RPC never by itself proves a child completed. */
const subagentReadStates=new Map();
function renderSubagentActivity(item,turnId){const host=el('section','message agent subagent-panel');host.dataset.subagentTurn=turnId||'';host.dataset.subagentItem=item.id;return host;}
function subagentRecords(items,latestItems=items){
  const records=new Map();
  for(const item of items){
    for(const id of new Set([...(item.receiverThreadIds||[]),...Object.keys(item.agentsStates||{})])){
      let record=records.get(id);if(!record){record={id,prompt:'',model:null,status:'unknown',message:null,actions:[]};records.set(id,record);}
      if(item.tool==='spawnAgent'){record.prompt=item.prompt||record.prompt;record.model=item.model||record.model;}
      const observed=item.agentsStates?.[id];if(observed){record.status=observed.status||'unknown';record.stateEvent=JSON.stringify([item.id,item.status,observed]);if(observed.message)record.message=observed.message;}
      record.actions.push({tool:item.tool,status:item.status,prompt:item.prompt});
    }
  }
  for(const item of latestItems)for(const [id,observed]of Object.entries(item.agentsStates||{})){const record=records.get(id);if(record&&observed){record.status=observed.status||'unknown';record.stateEvent=JSON.stringify([item.id,item.status,observed]);if(observed.message)record.message=observed.message;}}
  return [...records.values()].map(record=>{const read=subagentReadStates.get(record.id);return read&&read.stateEvent===record.stateEvent&&['unknown','pendingInit','running'].includes(record.status)?{...record,status:read.status}:record;});
}
function subagentStatus(status){return {pendingInit:'正在初始化',running:'执行中',completed:'已完成',errored:'执行失败',interrupted:'已中断',shutdown:'已关闭',notFound:'子任务不可用'}[status]||'等待原生状态';}
async function loadSubagentDetails(record,body,control,context){
  const current=()=>body.isConnected&&state.thread?.id===context.thread&&state.navigationGeneration===context.generation;
  control.disabled=true;body.replaceChildren(el('p','subtle','正在读取子任务过程…'));
  try{
    const result=await rpc('thread/read',{threadId:record.id,includeTurns:true});if(!current())return;
    if(result.thread?.id!==record.id)throw new Error('返回的子任务标识不一致。');
    body.replaceChildren();const turns=result.thread.turns||[];
    const status={inProgress:'running',completed:'completed',failed:'errored',interrupted:'interrupted'}[turns.at(-1)?.status];
    if(status){if(subagentReadStates.size>=128)subagentReadStates.delete(subagentReadStates.keys().next().value);subagentReadStates.set(record.id,{status,stateEvent:record.stateEvent});}
    if(!turns.length)body.append(el('p','subtle','子任务尚无可读取的过程，稍后可刷新。'));
    for(const turn of turns){
      const section=el('section','subagent-turn');section.append(el('strong','','执行状态：'+({completed:'已完成',inProgress:'执行中',interrupted:'已中断',failed:'失败'}[turn.status]||turn.status||'未知')));
      for(const item of turn.items||[]){
        if(item.type==='agentMessage')section.append(markdown(item.text||''));
        else if(item.type==='mcpToolCall'||item.type==='commandExecution')section.append(el('p','subtle',(item.tool||'执行命令')+' · '+({completed:'已完成',inProgress:'执行中',failed:'失败'}[item.status]||item.status||'未知')));
      }
      if(turn.error)section.append(el('p','db-error',nativeErrorMessage(turn.error)));body.append(section);
    }
    refreshSubagentPanels();
  }catch(error){if(current())body.replaceChildren(el('p','db-error','读取子任务失败：'+nativeErrorMessage(error)));}
  finally{if(control.isConnected)control.disabled=false;if(body.viewButton?.isConnected)body.viewButton.disabled=false;}
}
function refreshSubagentPanels(){
  const groups=new Map();
  for(const entry of state.items.values())if(entry.item?.type==='collabAgentToolCall'&&entry.node?.isConnected){const key=entry.turnId||'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(entry);}
  for(const entries of groups.values()){
    const host=entries[0].node;for(const entry of entries.slice(1))entry.node.hidden=true;host.hidden=false;
    const records=subagentRecords(entries.map(entry=>entry.item),[...state.items.values()].filter(entry=>entry.item?.type==='collabAgentToolCall').map(entry=>entry.item)),signature=JSON.stringify(records);if(host.dataset.subagentSignature===signature)continue;
    // Preserve expanded child cards when a later native event updates status.
    const opened=new Set([...host.querySelectorAll('details[data-child-id][open]')].map(node=>node.dataset.childId));
    const traces=new Map([...host.querySelectorAll('.subagent-card')].map(card=>[card.dataset.childId,card.querySelector('.subagent-trace')]));
    host.dataset.subagentSignature=signature;host.replaceChildren();const finished=records.filter(record=>record.status==='completed').length;
    host.append(el('h3','','子代理任务 · '+finished+' / '+records.length+' 已完成'),el('p','subtle','显示最近原生状态，可刷新查看过程；子任务完成后仍由主任务整合与检查依据。'));
    for(const [index,record]of records.entries()){
      const card=el('details','subagent-card');card.dataset.childId=record.id;card.open=opened.has(record.id);
      const firstLine=record.prompt.split('\n').find(line=>line.trim())||'子任务 '+(index+1);
      card.append(el('summary','','子任务 '+(index+1)+' · '+subagentStatus(record.status)),el('p','subagent-task',firstLine),el('p','subtle','模型：'+(record.model||'原生事件未提供')+' · 会话：'+record.id));
      if(record.prompt){const assignment=el('details','subagent-assignment');assignment.append(el('summary','','查看任务要求'),el('pre','',record.prompt));card.append(assignment);}
      if(record.message){const reply=el('div','subagent-reply');reply.append(el('strong','','子任务返回'),markdown(record.message));card.append(reply);}
      const trace=traces.get(record.id)||el('div','subagent-trace'),context={thread:state.thread?.id,generation:state.navigationGeneration};const view=button('查看或刷新子任务过程',()=>loadSubagentDetails(record,trace,view,context));trace.viewButton=view;card.append(view,trace);host.append(card);
    }
  }
}
