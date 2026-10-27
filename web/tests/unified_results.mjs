// Actual result-card / ECharts-view functions with deterministic native-item,
// HTTP and canvas fixtures. No live model, database or browser is called here.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';
const sources=['databases.js','analysis-workspace.js'].map(name=>fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8'));
const appSource=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),renderItemSource=appSource.slice(appSource.indexOf('function renderItem('),appSource.indexOf('\nfunction isActivity('));
const resultA='a'.repeat(32),resultB='b'.repeat(32),chartA='c'.repeat(32),chartB='d'.repeat(32);
const copy=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve,reject;return {promise:new Promise((yes,no)=>{resolve=yes;reject=no;}),get resolve(){return resolve;},get reject(){return reject;}};};
const flush=async()=>{for(let n=0;n<8;n++)await Promise.resolve();};
function matches(node,selector){
 if(selector.includes(','))return selector.split(',').some(part=>matches(node,part.trim()));
 if(selector.startsWith('.'))return selector.slice(1).split('.').every(name=>node.className.split(/\s+/).includes(name));
 const attribute=selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);if(attribute){const value=node.getAttribute(attribute[1]);return attribute[2]===undefined?value!==null:String(value)===attribute[2];}
 return node.tagName===selector.toLowerCase();
}
class Node{
 constructor(tag,text=''){this.tagName=tag.toLowerCase();this.textContent=text;this.children=[];this.dataset={};this.className='';this.style={};this.attributes={};this.hidden=false;this.connected=true;this.listeners=new Map();this.parentNode=null;this.value='';this.tabIndex=0;this.focused=false;this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ');},remove:(...names)=>{this.className=this.className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');},toggle:(name,force)=>{const exists=this.className.split(/\s+/).includes(name),add=force===undefined?!exists:force;if(add)this.classList.add(name);else this.classList.remove(name);return add;},contains:name=>this.className.split(/\s+/).includes(name)};}
 get isConnected(){return this.connected&&(this.parentNode?.isConnected??true);}set isConnected(value){this.connected=value;}get parentElement(){return this.parentNode;}
 append(...nodes){for(const node of nodes){node.connected=true;if(node.parentNode)node.parentNode.children=node.parentNode.children.filter(child=>child!==node);node.parentNode=this;this.children.push(node);}}
 replaceChildren(...nodes){for(const child of this.children){child.parentNode=null;child.isConnected=false;}this.children=[];this.append(...nodes);}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;this.isConnected=false;}
 setAttribute(name,value){this.attributes[name]=String(value);if(name==='id')this.id=String(value);if(name==='role')this.role=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
 getAttribute(name){if(name==='class')return this.className;if(name==='id')return this.id??null;if(name.startsWith('data-'))return this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]??null;return this.attributes[name]??null;}
 removeAttribute(name){delete this.attributes[name];}
 querySelectorAll(selector){return this.children.flatMap(node=>[...(matches(node,selector)?[node]:[]),...node.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 addEventListener(type,listener){const list=this.listeners.get(type)||[];list.push(listener);this.listeners.set(type,list);}
 removeEventListener(type,listener){this.listeners.set(type,(this.listeners.get(type)||[]).filter(value=>value!==listener));}
 dispatchEvent(event){event.target??=this;for(const fn of this.listeners.get(event.type)||[])fn(event);return this['on'+event.type]?.(event);}
 click(){return this.dispatchEvent({type:'click',preventDefault(){}});}
 focus(){this.focused=true;}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}closest(selector){let node=this;while(node){if(matches(node,selector))return node;node=node.parentNode;}return null;}
 getBoundingClientRect(){let node=this;while(node){if(node.hidden)return {width:0,height:0};node=node.parentNode;}return {width:700,height:360};}
 get options(){return this.children;}get firstChild(){return this.children[0]||null;}get childElementCount(){return this.children.length;}
}
const item=(id,tool,resultId=resultA,extra={})=>({id,type:'mcpToolCall',server:'codex_web_databases',tool,status:'completed',result:{structuredContent:{resultId,connectionName:'分析库',rowCount:42}},...extra});
const chart=(chartId=chartA,resultId=resultA,title='销售趋势')=>({version:2,chartId,resultId,title});
const chartItem=(id='chart-A',value=chart())=>item(id,'create_chart',value.resultId,{server:'codex_web_databases',result:{structuredContent:{codexWebChart:value}}});
const fullChart=(value=chart())=>({...value,version:1,connectionName:'分析库',rowCount:42,createdAt:'2026-10-27T00:00:00Z',columns:[{name:'amount'}],rows:[{amount:1},{amount:2}],query:'SELECT amount FROM sales',option:{xAxis:{type:'category'},yAxis:{},series:[{type:'bar',data:[1,2]}]}});
const page=(offset=0,count=42)=>({resultId:resultA,rowCount:count,offset,columns:[{name:'amount'}],rows:Array.from({length:Math.max(0,Math.min(20,count-offset))},(_,index)=>({amount:offset+index+1})),executedQuery:'SELECT amount FROM sales'});
function fixture(transport=async(action,payload)=>action==='result'?page(payload.offset):fullChart(chart(payload.chartId))){
 const state={thread:{id:'thread-A',name:'销售分析'},navigationGeneration:7,threadLoading:false,restoreError:false,turns:[{id:'turn-A',status:'completed'}],items:new Map()},apiCalls=[],downloads=[],canvases=[],resizeObservers=[],mutationObservers=[],body=new Node('body'),document={body,documentElement:new Node('html'),createTextNode:text=>new Node('#text',text)};document.documentElement.dataset.theme='light';
 const context=vm.createContext({state,Map,Set,JSON,Error,Object,Number,String,Array,Promise,Blob,URL,Date,setTimeout,clearTimeout,queueMicrotask,document,requestAnimationFrame:callback=>queueMicrotask(callback),cancelAnimationFrame(){},getComputedStyle:node=>({display:node.hidden?'none':'block',getPropertyValue:name=>node.style[name]||''}),ResizeObserver:class{constructor(callback){this.callback=callback;this.nodes=[];resizeObservers.push(this);}observe(node){this.nodes.push(node);}disconnect(){this.nodes=[];}},MutationObserver:class{constructor(callback){this.callback=callback;this.observed=false;mutationObservers.push(this);}observe(node,options){this.node=node;this.options=options;this.observed=true;}disconnect(){this.observed=false;}},echarts:{init(plot){const canvas={plot,disposed:false,resized:0,option:null,setOption(option){this.option=option;},resize(){this.resized++;},dispose(){this.disposed=true;},getDataURL(){return 'data:image/png;base64,fixture';}};canvases.push(canvas);return canvas;}},el:(tag,cls,text)=>{const node=new Node(tag,text);node.className=cls||'';return node;},button:(label,fn,cls)=>{const node=new Node('button',label);node.className=cls||'';node.onclick=fn;return node;},pretty:JSON.stringify,redact:value=>value,nativeErrorMessage:error=>error.message});
 for(const source of sources)vm.runInContext(source,context);
 context.databaseApi=(action,payload)=>{apiCalls.push({action,payload});return transport(action,payload);};context.downloadDatabaseBlob=(blob,name)=>downloads.push({blob,name});
 const add=(value,turnId='turn-A')=>{const rendered=context.renderAnalysisToolResult(value,true);if(value.tool!=='read_result')assert(rendered,'supported completed result must return a result host');const node=rendered||new Node('div');body.append(node);state.items.set(value.id,{item:value,turnId,done:true,node});context.refreshAnalysisResultVisibility();return node;};
 const visibleCards=()=>body.querySelectorAll('[data-analysis-result-id]').filter(node=>!node.hidden&&(!node.parentNode||!node.parentNode.hidden));
 const resize=()=>{for(const observer of resizeObservers)if(observer.nodes.length)observer.callback(observer.nodes.map(target=>({target,contentRect:target.getBoundingClientRect()})));};
 const mutate=()=>{for(const observer of mutationObservers)if(observer.observed)observer.callback([{target:observer.node,attributeName:'data-rendered'}]);};
 return {state,context,apiCalls,downloads,canvases,body,add,visibleCards,resize,mutate};
}
const findButton=(root,label)=>root.querySelectorAll('button').find(node=>node.textContent===label);
const tabsOf=root=>root.querySelectorAll('[role="tab"]');
const selectedTab=root=>tabsOf(root).find(tab=>tab.getAttribute('aria-selected')==='true');
function keyboard(node,key){let prevented=false;node.dispatchEvent({type:'keydown',key,preventDefault(){prevented=true;}});assert(prevented,'tab navigation must prevent page scrolling');}

test('query, read_result and create_chart references share one card and one CSV footer',async()=>{
 const f=fixture();f.add(item('query-A','query_database'));f.add(item('read-A','read_result'));f.add(chartItem());await flush();
 const cards=f.visibleCards();assert.equal(cards.length,1);const card=cards[0];assert.equal(card.querySelectorAll('[role="tablist"]').length,1);assert.equal(tabsOf(card).length,2);assert.equal(card.querySelectorAll('a').filter(link=>link.href?.endsWith('.csv')).length,1);assert(card.querySelector('.analysis-result-footer').querySelector('a'));assert.equal(f.apiCalls.filter(call=>call.action==='result').length,1);
});
test('chart-first events and history replay keep the same mounted result and cached table',async()=>{
 const f=fixture();f.add(chartItem());const first=f.visibleCards()[0];f.add(item('query-A','query_database'));f.add(item('read-A','read_result'));await flush();
 assert.equal(f.visibleCards().length,1);assert.equal(f.visibleCards()[0],first);assert.match(first.querySelector('.analysis-result-metadata').textContent,/分析库/,'a late query manifest must update the chart-first card metadata');const before=f.apiCalls.filter(call=>call.action==='result').length;
 f.context.refreshAnalysisResultVisibility();f.context.refreshAnalysisResultVisibility();await flush();assert.equal(f.visibleCards()[0],first);assert.equal(f.apiCalls.filter(call=>call.action==='result').length,before);
});
test('restoring a running turn merges its already completed query and two charts through actual renderItem',async t=>{
 const f=fixture();f.state.turns[0].status='inProgress';f.context.toolNames={mcpToolCall:'MCP 调用'};vm.runInContext(renderItemSource,f.context);
 // hydrateThread derives done=false from the enclosing inProgress turn, even
 // for these items whose individual tool status is already completed. Use the
 // real app renderItem dispatch so its standalone-chart fallback is covered.
 for(const value of [item('query-A','query_database'),chartItem(),chartItem('chart-B',chart(chartB,resultA,'第二张图'))]){const done=false,node=f.context.renderItem(value,done);f.body.append(node);f.state.items.set(value.id,{item:value,turnId:'turn-A',done,node});}
 f.context.refreshAnalysisResultVisibility();await flush();f.resize();await flush();const cards=f.visibleCards(),csvLinks=cards.flatMap(card=>card.querySelectorAll('a')).filter(link=>link.href?.endsWith('.csv'));
 t.diagnostic(JSON.stringify({turnStatus:f.state.turns[0].status,completedToolStatuses:[...f.state.items.values()].map(entry=>entry.item.status),entryDone:[...f.state.items.values()].map(entry=>entry.done),visibleCards:cards.length,csvLinks:csvLinks.length}));
 assert.equal(cards.length,1,'completed outputs in a running-turn snapshot must share one result card');const card=cards[0];assert.equal(card.querySelector('select').options.length,2);assert.equal(csvLinks.length,1);assert(card.querySelector('tbody'));assert.equal(f.apiCalls.filter(call=>call.action==='result').length,1);
 // A turn/completed event does not replay item/completed for old snapshot
 // items, so this must remain correct without changing their done flags.
 f.state.turns[0].status='completed';f.context.refreshAnalysisResultVisibility();await flush();assert.equal(f.visibleCards().length,1);assert.equal(f.visibleCards()[0],card);assert.equal(card.querySelector('select').options.length,2);assert.equal([...f.state.items.values()].every(entry=>entry.done===false),true);
});
test('different results retain separate cards while repeated result references merge across turns',async()=>{
 const f=fixture();f.add(item('query-A','query_database'));f.add(chartItem());f.add(item('query-B','query_database',resultB),'turn-B');f.add(item('read-A','read_result'),'turn-B');await flush();
 assert.deepEqual(f.visibleCards().map(card=>card.dataset.analysisResultId),[resultA,resultB]);assert.equal(tabsOf(f.visibleCards()[0]).length,2);assert.equal(f.apiCalls.filter(call=>call.action==='result'&&call.payload.resultId===resultA).length,1);
});
test('two charts for one snapshot use one chart selector and preserve both chart identities',async()=>{
 const f=fixture();f.add(item('query-A','query_database'));f.add(chartItem());f.add(chartItem('chart-B',chart(chartB,resultA,'另一张图')));await flush();
 const card=f.visibleCards()[0],select=card.querySelector('select');assert(select,'multiple charts need an explicit selector in the shared card');assert.equal(select.hidden,false);assert.equal(select.options.length,2);assert.deepEqual(select.options.map(option=>option.value),[chartA,chartB]);assert.equal(f.visibleCards().length,1);assert.equal(tabsOf(card).length,2);
});
test('shared result tabs expose linked ARIA panels and keyboard switching hides the other view',async()=>{
 const f=fixture();f.add(item('query-A','query_database'));f.add(chartItem());await flush();const card=f.visibleCards()[0],tabs=tabsOf(card);assert.equal(tabs.length,2);
 for(const tab of tabs){const panel=card.querySelectorAll('[role="tabpanel"]').find(node=>node.id===tab.getAttribute('aria-controls'));assert(panel);assert.equal(panel.getAttribute('aria-labelledby'),tab.id);}
 const first=selectedTab(card),second=tabs.find(tab=>tab!==first);keyboard(first,'ArrowRight');assert.equal(selectedTab(card),second);assert.equal(second.tabIndex,0);assert(second.focused);assert.equal(card.querySelectorAll('[role="tabpanel"]').filter(panel=>!panel.hidden).length,1);keyboard(second,'Home');assert.equal(selectedTab(card),tabs[0]);keyboard(tabs[0],'End');assert.equal(selectedTab(card),tabs[1]);
});
test('single-page result omits pagination controls while keeping row status and one download',async()=>{
 const f=fixture(async(action,payload)=>action==='result'?page(payload.offset,10):fullChart());f.add(item('query-A','query_database'));await flush();const card=f.visibleCards()[0];assert.equal(card.querySelector('.analysis-result-pagination').hidden,true);assert.equal(card.querySelectorAll('a').filter(link=>link.href?.endsWith('.csv')).length,1);assert.match(card.querySelector('.analysis-result-status').textContent,/10/);
});
test('late result page from another navigation cannot update or attach to the current thread',async()=>{
 const gate=deferred();let reads=0;const f=fixture((action,payload)=>++reads===1?gate.promise:Promise.resolve(page(payload.offset)));f.add(item('query-A','query_database'));const old=f.visibleCards()[0];f.state.thread={id:'thread-B'};f.state.navigationGeneration++;gate.resolve(page());await flush();assert.equal(old.querySelectorAll('tbody').length,0,'the old DOM can remain mounted while the next history loads');f.state.items.clear();f.body.replaceChildren();f.add(item('query-B','query_database',resultB));await flush();assert.equal(f.visibleCards().length,1);assert.equal(f.visibleCards()[0].dataset.analysisResultId,resultB);
});
test('PNG is unavailable until the shared ECharts view has actually initialized',async()=>{
 const gate=deferred(),f=fixture(async(action,payload)=>action==='result'?page(payload.offset):gate.promise);f.add(item('query-A','query_database'));f.add(chartItem());await flush();const card=f.visibleCards()[0],png=findButton(card,'下载 PNG');assert(png);assert.equal(png.disabled,true);const chartTab=tabsOf(card).find(tab=>tab.textContent==='图表');assert(chartTab);await chartTab.click();gate.resolve(fullChart());await flush();f.resize();await flush();assert.equal(f.canvases.length,1);assert.equal(png.disabled,false);assert(f.canvases[0].option?.series);
});

test('data/chart switching and a late second chart preserve the page selected by the user',async()=>{
 const f=fixture();f.add(item('query-A','query_database'));f.add(chartItem());await flush();const card=f.visibleCards()[0],dataTab=tabsOf(card).find(tab=>tab.textContent==='数据');await dataTab.click();await findButton(card,'下一页').click();await flush();const table=card.querySelector('.analysis-result-table').children[0];assert.equal(table.querySelector('tbody').children[0].children[0].textContent,'21');
 await tabsOf(card).find(tab=>tab.textContent==='图表').click();await flush();await dataTab.click();f.add(chartItem('chart-B',chart(chartB,resultA,'第二张图')));await flush();assert.equal(selectedTab(card),dataTab);assert.equal(card.querySelector('.analysis-result-table').children[0],table);assert.deepEqual(f.apiCalls.filter(call=>call.action==='result').map(call=>call.payload.offset),[0,20]);assert.equal(findButton(card,'下载 PNG').hidden,true);
});
test('selecting the second chart changes only the plot and duplicate chart events create no duplicate option',async()=>{
 const f=fixture();f.add(item('query-A','query_database'));f.add(chartItem());f.add(chartItem('chart-B',chart(chartB,resultA,'第二张图')));await flush();const card=f.visibleCards()[0],selector=card.querySelector('select');selector.value=chartB;await selector.onchange();await flush();f.resize();await flush();assert.equal(f.apiCalls.filter(call=>call.action==='read_chart').length,2);assert.equal(f.canvases.length,2);assert.equal(findButton(card,'下载 PNG').disabled,false);f.add(chartItem('duplicate-chart-B',chart(chartB,resultA,'第二张图')));await flush();assert.equal(selector.options.length,2);assert.equal(selector.value,chartB);assert.equal(f.apiCalls.filter(call=>call.action==='read_chart').length,2);assert.equal(card.querySelectorAll('a').filter(link=>link.href?.endsWith('.csv')).length,1);
});
test('re-rendering a history item moves its existing result without resetting page or chart',async()=>{
 const f=fixture();const query=item('query-A','query_database');f.add(query);f.add(chartItem());await flush();const card=f.visibleCards()[0];await tabsOf(card).find(tab=>tab.textContent==='数据').click();await findButton(card,'下一页').click();await flush();const priorTable=card.querySelector('.analysis-result-table').children[0];f.add({...query});await flush();assert.equal(f.visibleCards().length,1);assert.equal(f.visibleCards()[0],card);assert.equal(card.querySelector('.analysis-result-table').children[0],priorTable);assert.deepEqual(f.apiCalls.filter(call=>call.action==='result').map(call=>call.payload.offset),[0,20]);
});
test('a different thread context disposes previous chart state and creates an independent result card',async()=>{
 const f=fixture();f.add(item('query-A','query_database'));f.add(chartItem());await flush();f.resize();await flush();const old=f.visibleCards()[0];assert.equal(f.canvases.length,1);f.state.thread={id:'thread-B'};f.state.navigationGeneration++;f.state.items.clear();f.body.replaceChildren();f.add(item('query-B','query_database'));f.add(chartItem('chart-B'));await flush();f.resize();await flush();assert.equal(f.visibleCards().length,1);assert.notEqual(f.visibleCards()[0],old);assert.equal(f.canvases[0].disposed,true);assert.equal(f.canvases.length,2);
});
test('failed or incomplete tool calls never expose a chart, rows or a successful download',()=>{
 const f=fixture();for(const value of [item('pending','query_database',resultA,{status:'inProgress'}),item('failed','query_database',resultA,{status:'failed'}),item('error','query_database',resultA,{result:{isError:true,structuredContent:{resultId:resultA}}}),{...chartItem(),status:'inProgress'},{...chartItem(),result:{isError:true,structuredContent:{codexWebChart:chart()}}}])assert.equal(f.context.renderAnalysisToolResult(value,true),null);assert.equal(f.apiCalls.length,0);assert.equal(f.canvases.length,0);assert.equal(f.downloads.length,0);
});
test('a failed chart remains in the same card and retry enables PNG only after ECharts succeeds',async()=>{
 let chartReads=0;const f=fixture((action,payload)=>action==='result'?Promise.resolve(page(payload.offset)):++chartReads===1?Promise.reject(new Error('fixture chart offline')):Promise.resolve(fullChart()));f.add(item('query-A','query_database'));f.add(chartItem());await flush();const card=f.visibleCards()[0],png=findButton(card,'下载 PNG'),retry=findButton(card,'重试加载图表');assert.equal(png.disabled,true);assert.equal(retry.hidden,false);assert.match(card.querySelector('.db-chart-view').querySelector('p').textContent,/fixture chart offline/);const pending=retry.onclick();await flush();f.resize();await flush();f.mutate();await pending;await flush();assert.equal(png.disabled,false);assert.equal(f.visibleCards()[0],card);assert.equal(card.querySelectorAll('a').filter(link=>link.href?.endsWith('.csv')).length,1);assert.equal(chartReads,2);
});
