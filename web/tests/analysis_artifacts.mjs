// Actual production conversation output helpers with deterministic native-item
// fixtures. These tests make no model calls and do not simulate database success.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';
const source=fs.readFileSync(new URL('../public/analysis-workspace.js',import.meta.url),'utf8');
const idA='a'.repeat(32),idB='b'.repeat(32),idC='c'.repeat(32);
const resultItem=(extra={})=>({id:'tool-A',type:'mcpToolCall',server:'codex_web_databases',tool:'query_database',status:'completed',result:{structuredContent:{resultId:idA,connectionName:'销售库',rowCount:42}},...extra});
const answer=(extra={})=>({id:'answer-A',type:'agentMessage',phase:'final_answer',text:'本月销售额为 123，较上月增长 8%。',...extra});
class Node {
 constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.dataset={};this.className='';this.hidden=false;this.style={};this.isConnected=true;this.attributes={};this.parentNode=null;this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...names])].join(' ');}};}
 append(...children){for(const node of children){if(node.parentNode)node.parentNode.children=node.parentNode.children.filter(child=>child!==node);node.parentNode=this;this.children.push(node);}}replaceChildren(...children){for(const node of this.children)node.parentNode=null;this.children=[];this.append(...children);}setAttribute(name,value){this[name]=value;this.attributes[name]=String(value);}getAttribute(name){return this.attributes[name]??null;}removeAttribute(name){delete this.attributes[name];}addEventListener(type,fn){this['on'+type]=fn;}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;this.isConnected=false;}focus(){this.focused=true;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){const matches=node=>selector.startsWith('.')?node.className.split(' ').includes(selector.slice(1)):selector==='[data-export-analysis-report]'?!!node.dataset.exportAnalysisReport:selector==='[data-analysis-result-id]'?!!node.dataset.analysisResultId:selector==='[data-analysis-result-host]'?!!node.dataset.analysisResultHost:selector.startsWith('[role=')?node.role===selector.match(/role=["']?([^"'\]]+)/)[1]:node.tagName===selector;return this.children.flatMap(node=>[...(matches(node)?[node]:[]),...node.querySelectorAll(selector)]);}
}

const pageData=(offset=0,rowCount=42)=>({rowCount,offset,columns:[{name:'amount'}],rows:Array.from({length:Math.max(0,Math.min(20,rowCount-offset))},(_,index)=>({amount:offset+index+1})),executedQuery:'SELECT amount FROM sales'});
function fixture(transport=async(action,payload)=>pageData(payload.offset)){
 const state={thread:{id:'thread-A',name:'销售分析'},navigationGeneration:7,threadLoading:false,restoreError:false,turns:[{id:'turn-A',status:'completed'}],items:new Map()},downloads=[],opened=[],apiCalls=[];
 const context=vm.createContext({state,Map,Set,JSON,Error,Object,Number,String,Array,Blob,setTimeout,clearTimeout,queueMicrotask,el:(tag,cls,text)=>{const node=new Node(tag,text);node.className=cls||'';return node;},button:(label,fn,cls)=>{const node=new Node('button',label);node.className=cls||'';node.onclick=fn;return node;},pretty:JSON.stringify,redact:value=>value,nativeErrorMessage:error=>error.message,downloadDatabaseBlob:(blob,name)=>downloads.push({blob,name}),showDatabaseResult:id=>opened.push(id),databaseApi:(action,payload)=>{apiCalls.push({action,payload});return transport(action,payload);},databaseTable:(columns,rows)=>{const node=new Node('table');node.data={columns,rows};return node;}});
 const chartSource=fs.readFileSync(new URL('../public/databases.js',import.meta.url),'utf8');vm.runInContext(chartSource.slice(chartSource.indexOf('function validDatabaseChart('),chartSource.indexOf('function downloadDatabaseBlob(')),context);vm.runInContext(source,context);
 const add=(item,turnId='turn-A',done=true,node=new Node('div'))=>{state.items.set(item.id,{item,turnId,done,node});return state.items.get(item.id);};add(answer());
 return {state,context,downloads,opened,apiCalls,add};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
function deferred(){let resolve,reject;return {promise:new Promise((yes,no)=>{resolve=yes;reject=no;}),get resolve(){return resolve;},get reject(){return reject;}};}
function pager(root){const bar=root.querySelector('.analysis-result-pagination'),buttons=root.querySelectorAll('button'),control=label=>buttons.find(node=>node.textContent===label);return {bar,previous:control('上一页'),label:bar.children[1],next:control('下一页'),jump:bar.querySelector('input'),go:control('跳转'),table:root.querySelector('.analysis-result-table'),status:root.querySelector('.analysis-result-status')||root.querySelector('[role="status"]'),retry:control('重试读取结果')};}

const plain=value=>JSON.parse(JSON.stringify(value));
test('only completed successful MCP items expose actual well formed result ids',()=>{
 const f=fixture();assert.deepEqual(plain(f.context.analysisResultReferences(resultItem())),[{id:idA,name:'销售库',rowCount:42}]);
 for(const item of [resultItem({type:'agentMessage'}),resultItem({status:'inProgress'}),resultItem({status:'failed'}),resultItem({result:{isError:true,structuredContent:{resultId:idA}}}),resultItem({result:null})])assert.deepEqual(plain(f.context.analysisResultReferences(item)),[]);
});
test('result refs merge structured and JSON content without using row values or arbitrary text ids',()=>{
 const f=fixture(),item=resultItem({result:{structuredContent:{resultId:idA,connectionName:'销售库',rows:[{resultId:idB}]},content:[{type:'text',text:JSON.stringify({data:[{resultId:idA,rowCount:9},{resultId:idC,connectionName:'客户库',rowCount:3}]})},{type:'text',text:'普通文字提到 '+idB},{type:'text',text:'{bad JSON'}]}});
 assert.deepEqual(plain(f.context.analysisResultReferences(item)),[{id:idA,name:'销售库',rowCount:9},{id:idC,name:'客户库',rowCount:3}]);
});
test('invalid identifiers and overly deep payloads cannot produce internal download paths',()=>{
 const f=fixture();for(const resultId of ['../../etc/passwd','A'.repeat(32),'g'.repeat(32),'a'.repeat(31),idA+'.csv'])assert.deepEqual(plain(f.context.analysisResultReferences(resultItem({result:{structuredContent:{resultId}}}))),[]);
 let nested={resultId:idA};for(let depth=0;depth<9;depth++)nested={nested};assert.deepEqual(plain(f.context.analysisResultReferences(resultItem({result:{structuredContent:nested}}))),[]);
});
test('inline database result auto-loads a table and has exactly one CSV below it without a detail popup',async()=>{
 const f=fixture();assert.equal(f.context.renderAnalysisToolResult(resultItem({status:'inProgress'}),false),null);assert.equal(f.context.renderAnalysisToolResult(resultItem({status:'failed'}),true),null);const current=resultItem(),card=f.context.renderAnalysisToolResult(current,true);f.add(current,'turn-A',true,card);f.context.refreshAnalysisResultVisibility();await flush();const row=card.querySelector('[data-analysis-result-id]');assert(row);
 const links=row.querySelectorAll('a');assert.equal(links.length,1);assert.equal(links[0].href,'/api/databases/results/'+idA+'.csv');assert(row.querySelector('table'));assert.equal(row.querySelector('table').data.rows.length,20);assert.equal(row.querySelector('pre').textContent,'SELECT amount FROM sales');assert.deepEqual(f.opened,[]);assert.equal(f.apiCalls.length,1);assert.deepEqual(plain(f.apiCalls[0]),{action:'result',payload:{resultId:idA,offset:0,limit:20}});assert.equal(f.downloads.length,0);
});
test('read_result, foreign MCP servers and unfinished calls do not create duplicate database result cards',()=>{
 const f=fixture();for(const item of [resultItem({tool:'read_result'}),resultItem({server:'other_mcp'}),resultItem({server:undefined}),resultItem({status:'inProgress'})])assert.equal(f.context.renderAnalysisToolResult(item,true),null);assert.equal(f.apiCalls.length,0);
});
test('pager requests actual offsets 20 and 40 and returns to 20 on previous',async()=>{
 const f=fixture(),root=f.context.renderInlineAnalysisResult({id:idA,name:'销售库',rowCount:42}),p=pager(root);await flush();await p.next.onclick();assert.equal(p.table.children[0].data.rows[0].amount,21);await p.next.onclick();assert.equal(p.table.children[0].data.rows.length,2);assert.equal(p.next.disabled,true);assert.match(p.label.textContent,/第 3 \/ 3 页/);await p.previous.onclick();assert.deepEqual(f.apiCalls.map(call=>call.payload.offset),[0,20,40,20]);assert.equal(p.table.children[0].data.rows[0].amount,21);
});
test('concurrent page actions are blocked while one real page request is pending',async()=>{
 const gate=deferred();let calls=0;const f=fixture((action,payload)=>++calls===1?Promise.resolve(pageData(0)):gate.promise),root=f.context.renderInlineAnalysisResult({id:idA,name:'销售库'}),p=pager(root);await flush();const oldTable=p.table.children[0],pending=p.next.onclick();assert.equal(p.next.disabled,true);assert.equal(p.go.disabled,true);await p.next.onclick();p.jump.value='3';await p.go.onclick();assert.equal(f.apiCalls.length,2);assert.equal(p.table.children[0],oldTable);gate.resolve(pageData(20));await pending;assert.equal(p.jump.value,'2');assert.equal(p.go.disabled,false);assert.deepEqual(f.apiCalls.map(call=>call.payload.offset),[0,20]);
});
test('invalid and out of range jumps produce no API calls and retain current page',async()=>{
 const f=fixture(),root=f.context.renderInlineAnalysisResult({id:idA,name:'销售库'}),p=pager(root);await flush();const oldTable=p.table.children[0];for(const target of ['0','4','1.5','not-a-page','-1']){p.jump.value=target;await p.go.onclick();assert.equal(f.apiCalls.length,1);assert.equal(p.table.children[0],oldTable);assert.equal(p.jump.value,'1');assert.match(p.status.textContent,/整数页码/);}await p.previous.onclick();assert.equal(f.apiCalls.length,1);
});
test('failed page keeps previous rows and retry uses the failed target instead of edited jump input',async()=>{
 let reads=0;const f=fixture((action,payload)=>++reads===2?Promise.reject(new Error('fixture page failure')):Promise.resolve(pageData(payload.offset))),root=f.context.renderInlineAnalysisResult({id:idA,name:'销售库'}),p=pager(root);await flush();const previous=p.table.children[0];await p.next.onclick();assert.equal(p.table.children[0],previous);assert.equal(p.retry.hidden,false);assert.match(p.status.textContent,/fixture page failure/);assert.match(p.label.textContent,/第 1 \/ 3 页/);p.jump.value='3';await p.retry.onclick();assert.equal(p.table.children[0].data.rows[0].amount,21);assert.equal(p.retry.hidden,true);assert.deepEqual(f.apiCalls.map(call=>call.payload.offset),[0,20,20]);
});
test('initial read failure exposes retry without inventing rows and succeeds only after actual reply',async()=>{
 let reads=0;const f=fixture(()=>++reads===1?Promise.reject(new Error('initial fixture failure')):Promise.resolve(pageData(0))),root=f.context.renderInlineAnalysisResult({id:idA,name:'销售库'}),p=pager(root);await flush();assert.equal(p.table.children.length,0);assert.equal(p.retry.hidden,false);assert.equal(p.previous.disabled,true);assert.equal(p.next.disabled,true);await p.retry.onclick();assert.equal(p.table.children[0].data.rows.length,20);assert.deepEqual(f.apiCalls.map(call=>call.payload.offset),[0,0]);
});
test('zero row result is one empty page with no invalid next or previous request',async()=>{
 const f=fixture(async()=>pageData(0,0)),root=f.context.renderInlineAnalysisResult({id:idA,name:'销售库',rowCount:0}),p=pager(root);await flush();assert.equal(p.table.children[0].data.rows.length,0);assert.match(p.status.textContent,/没有符合条件/);assert.match(p.label.textContent,/第 1 \/ 1 页/);assert.match(root.querySelector('.analysis-result-metadata').textContent,/0 行/);assert.equal(p.bar.hidden,true);assert.equal(p.previous.disabled,true);assert.equal(p.next.disabled,true);await p.next.onclick();await p.previous.onclick();assert.equal(f.apiCalls.length,1);
});
test('repeated result ids across completed tool items keep one visible table while other ids remain visible',async()=>{
 const f=fixture(),firstItem=resultItem(),secondItem=resultItem({id:'duplicate-tool'}),thirdItem=resultItem({id:'other-tool',tool:'analyze_result',result:{structuredContent:{resultId:idB,connectionName:'客户库',rowCount:42}}}),first=f.context.renderAnalysisToolResult(firstItem,true),second=f.context.renderAnalysisToolResult(secondItem,true),third=f.context.renderAnalysisToolResult(thirdItem,true);f.add(firstItem,'turn-A',true,first);f.add(secondItem,'turn-B',true,second);f.add(thirdItem,'turn-B',true,third);await flush();f.context.refreshAnalysisResultVisibility();assert.equal(first.hidden,false);assert.equal(second.hidden,true);assert.equal(second.children[0].hidden,true);assert.equal(third.hidden,false);f.context.refreshAnalysisResultVisibility();assert.equal(first.hidden,false);assert.equal(second.hidden,true);
});
test('report snapshots include exactly the chosen actual answer and same-turn completed results',()=>{
 const f=fixture();f.add(resultItem());f.add(resultItem({id:'tool-B',result:{structuredContent:{resultId:idB,connectionName:'其他轮',rowCount:9}}}),'turn-B');f.add(resultItem({id:'tool-C',result:{structuredContent:{resultId:idC}}}),'turn-A',false);f.add(answer({id:'other-answer',text:'不能混入这一段'}),'turn-B');
 const snapshot=f.context.analysisReportSnapshot('answer-A');assert.equal(snapshot.threadId,'thread-A');assert.equal(snapshot.generation,7);assert.equal(snapshot.text,answer().text);assert.deepEqual(plain(snapshot.results),[{id:idA,name:'销售库',rowCount:42}]);assert(!JSON.stringify(snapshot).includes('不能混入'));
});
test('same-turn failed or error tool results never become report query evidence',()=>{
 const f=fixture();f.add(resultItem({status:'failed'}));f.add(resultItem({id:'error-tool',result:{isError:true,structuredContent:{resultId:idB}}}));assert.deepEqual(plain(f.context.analysisReportSnapshot('answer-A').results),[]);
});
for(const [name,item,done,turnStatus]of [['pending answer',answer(),false,'completed'],['commentary',answer({phase:'commentary'}),true,'completed'],['running turn',answer(),true,'inProgress'],['failed turn',answer(),true,'failed'],['interrupted turn',answer(),true,'interrupted'],['proposal',answer({text:'<proposed_plan>先查看指标口径</proposed_plan>'}),true,'completed'],['non-answer',resultItem({id:'answer-A'}),true,'completed']])test('report rejects '+name,()=>{
 const f=fixture();f.add(item,'turn-A',done);f.state.turns[0].status=turnStatus;assert.throws(()=>f.context.analysisReportSnapshot('answer-A'),/不能作为分析结论导出/);assert.equal(f.downloads.length,0);
});
test('unknown answer or missing turn cannot be exported as a completed conclusion',()=>{
 const f=fixture();assert.throws(()=>f.context.analysisReportSnapshot('missing'),/不能作为/);f.state.turns=[];assert.throws(()=>f.context.analysisReportSnapshot('answer-A'),/不能作为/);
});
test('snapshot remains a stable value after the current answer text and thread change',()=>{
 const f=fixture();f.add(resultItem());const snapshot=f.context.analysisReportSnapshot('answer-A');f.state.items.get('answer-A').item.text='新的回答';f.state.thread={id:'thread-B',name:'别的分析'};assert.equal(snapshot.text,answer().text);assert.equal(snapshot.threadId,'thread-A');assert.equal(snapshot.title,'销售分析');
});
for(const mismatch of ['thread','generation','loading','restore failure'])test('report download refuses stale or recovering view: '+mismatch,()=>{
 const f=fixture();let threadId='thread-A',generation=7;if(mismatch==='thread')threadId='thread-B';if(mismatch==='generation')generation=6;if(mismatch==='loading')f.state.threadLoading=true;if(mismatch==='restore failure')f.state.restoreError=true;
 assert.throws(()=>f.context.exportAnalysisReport('answer-A',threadId,generation),/当前分析已切换或正在恢复/);assert.equal(f.downloads.length,0);
});
test('Markdown export contains actual selected answer and same-turn ids without other-turn material',async()=>{
 const f=fixture();f.add(resultItem());f.add(resultItem({id:'other-tool',result:{structuredContent:{resultId:idB}}}),'turn-B');f.state.thread.name='销售/分析\n2026';f.context.exportAnalysisReport('answer-A','thread-A',7);assert.equal(f.downloads.length,1);const exported=f.downloads[0],text=await exported.blob.text();assert.equal(exported.name,'销售-分析-2026.md');assert.equal(exported.blob.type,'text/markdown;charset=utf-8');assert(text.includes(answer().text));assert(text.includes(idA));assert(!text.includes(idB));assert(text.startsWith('# 销售/分析 2026\n'));
});
test('answer download is attached inside existing message actions and bound to its original navigation',()=>{
 const f=fixture(),node=new Node('div'),actions=new Node('div');actions.className='message-actions';const copy=new Node('button','复制');actions.append(copy);node.append(actions);f.context.decorateAnalysisAnswer(node,answer(),true);assert.equal(node.children.length,1);assert.equal(actions.children[0],copy);const download=actions.children[1];assert.equal(download.dataset.exportAnalysisReport,'answer-A');f.state.navigationGeneration++;assert.throws(()=>download.onclick(),/当前分析已切换/);assert.equal(f.downloads.length,0);
});
test('pending, commentary and proposal messages receive no conclusion download action',()=>{
 const f=fixture();for(const [item,done]of [[answer(),false],[answer({phase:'commentary'}),true],[answer({text:'<proposed_plan>计划</proposed_plan>'}),true]]){const node=new Node('div');f.context.decorateAnalysisAnswer(node,item,done);assert.equal(node.children.length,0);}
});
test('download visibility follows actual completed turn status rather than done message alone',()=>{
 const f=fixture(),entry=f.state.items.get('answer-A');f.context.decorateAnalysisAnswer(entry.node,entry.item,true);const download=entry.node.querySelectorAll('[data-export-analysis-report]')[0];f.state.turns[0].status='inProgress';f.context.refreshAnalysisDownloads();assert.equal(download.hidden,true);f.state.turns[0].status='completed';f.context.refreshAnalysisDownloads();assert.equal(download.hidden,false);entry.done=false;f.context.refreshAnalysisDownloads();assert.equal(download.hidden,true);
});

test('legacy and unknown verification warnings survive actual Markdown download',async()=>{
 for(const status of ['legacy','unknown']){
  const f=fixture(),entry=f.state.items.get('answer-A');entry.node.dataset.analysisVerification=status;
  f.context.exportAnalysisReport('answer-A','thread-A',7);const text=await f.downloads[0].blob.text();
  assert.match(text,status==='legacy'?/历史回答：未按当前数值规则核验/:/未取得可确认的数值核验状态/);assert(text.includes(entry.item.text));
 }
});
test('report keeps proof version and acquisition policy while copying a stable evidence snapshot',()=>{
 const f=fixture(),entry=f.state.items.get('answer-A');entry.node.dataset.analysisVerification='verified';
 entry.node.analysisEvidence={status:'verified',publicationChecks:{version:'analysis-publication-v2',freshness:[{maxAgeMinutes:30,status:'notConfigured',retrievedAt:'2026-10-01T00:00:00Z'}]},evidence:[{value:'123'}],sources:{}};
 const snapshot=f.context.analysisReportSnapshot('answer-A');entry.node.analysisEvidence.evidence[0].value='tampered-later';
 const text=f.context.analysisReportMarkdown(snapshot);assert.match(text,/不能据此认定为最新/);assert(text.includes('2026-10-01'));assert(text.includes('analysis-publication-v2'));assert(!text.includes('tampered-later'));assert.match(text,/业务字段来源、公式口径/);
 entry.node.analysisEvidence={status:'verified'};assert.match(f.context.analysisReportMarkdown(f.context.analysisReportSnapshot('answer-A')),/旧规则记录/);
});
