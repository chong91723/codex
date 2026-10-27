// Production chart-view behavior with deterministic DOM, transport and ECharts
// fixtures. These tests do not claim browser, database, MCP or model validation.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync(new URL('../public/databases.js',import.meta.url),'utf8');
const resultId='a'.repeat(32),chartId='b'.repeat(32),otherId='c'.repeat(32);
const chart=(extra={})=>({version:1,resultId,title:'实际查询图',columns:[{name:'total'}],rows:[{total:9}],option:{dataset:{source:[{total:9}]},series:[{type:'bar'}]},...extra});
const reference=(extra={})=>({version:2,resultId,chartId,title:'实际查询图',...extra});
const item=value=>({type:'mcpToolCall',status:'completed',result:{structuredContent:{codexWebChart:value}}});
class Node {
 constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.dataset={};this.className='';this.hidden=false;this.connected=true;this.rect={width:700,height:390};}
 get isConnected(){return this.connected&&(this.parent?.isConnected??true);}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 setAttribute(name,value){this[name]=value;}
 getBoundingClientRect(){return this.hidden||this.parent?.hidden?{width:0,height:0}:this.rect;}
}
function deferred(){let resolve,reject;return {promise:new Promise((yes,no)=>{resolve=yes;reject=no;}),get resolve(){return resolve;},get reject(){return reject;}};}
 function fixture(transport=async()=>chart()){
 const nodes=[],reads=[],inits=[],observers=[],frames=new Map();let frameId=0,initError=null;
 class Observer {constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}observe(target){this.target=target;}disconnect(){this.disconnected=true;}fire(){if(!this.disconnected)this.callback();}}
 const context=vm.createContext({console,Error,Promise,Array,Object,String,Number,Set,Map,JSON,
  el:(tag,cls,text)=>{const node=new Node(tag,text);node.className=cls||'';nodes.push(node);return node;},
  button:(label,action)=>{const node=new Node('button',label);node.onclick=action;nodes.push(node);return node;},
  document:{body:new Node('body'),documentElement:{dataset:{theme:'light'}}},ResizeObserver:Observer,MutationObserver:Observer,
  requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
  echarts:{init:(node,theme,options)=>{if(initError)throw initError;const instance={node,theme,options,sets:[],resizes:0,disposed:false,exports:[],setOption(value,settings){this.sets.push({value,settings});},resize(){this.resizes++;},dispose(){this.disposed=true;},getDataURL(options){this.exports.push(options);return 'data:image/png;base64,ACTUAL_ECHARTS_FIXTURE';}};inits.push(instance);return instance;}},
 });
 vm.runInContext(source,context);
 // Keep production chart functions and replace only the remote transport.
 context.databaseApi=(action,payload)=>{reads.push({action,payload});return transport(action,payload);};
 return {context,nodes,reads,inits,observers,frames,set initError(value){initError=value;},flushFrames(){const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback();}};
}
const flush=async()=>{for(let index=0;index<8;index++)await Promise.resolve();};
const plain=value=>JSON.parse(JSON.stringify(value));

test('only completed successful calls with actual well formed chart identifiers are accepted',()=>{
 const f=fixture();assert.equal(f.context.databaseChart(item(chart())).resultId,resultId);assert.equal(f.context.databaseChart(item(reference())).chartId,chartId);
 for(const value of [chart({resultId:'../../secret'}),reference({chartId:'../chart'}),chart({option:{}}),reference({resultId:undefined})])assert.equal(f.context.databaseChart(item(value)),null);
 for(const value of [{...item(chart()),status:'inProgress'},{...item(chart()),status:'failed'},{...item(chart()),type:'agentMessage'},{...item(chart()),result:{isError:true,structuredContent:{codexWebChart:chart()}}}])assert.equal(f.context.databaseChart(value),null);
 const text=item(null);text.result.content=[{type:'text',text:JSON.stringify({codexWebChart:reference()})}];assert.equal(f.context.databaseChart(text).chartId,chartId);
});

test('plot view contains no independent table, SQL, CSV or extra result card',()=>{
 const f=fixture(),view=f.context.createDatabaseChartView(chart());assert.equal(view.node.className,'db-chart-view');assert.deepEqual(view.node.children.map(node=>node.tagName),['div','p','button']);assert.equal(view.node.children[0].className,'db-chart');assert.equal(view.node.dataset.resultId,resultId);assert.equal(f.reads.length,0);assert.equal(f.inits.length,0);
});

test('v1 initializes only after visible dimensions and exports the actual ECharts image',async()=>{
 const f=fixture(),value=chart(),view=f.context.createDatabaseChartView(value),plot=view.node.children[0];plot.rect={width:0,height:0};view.activate();f.flushFrames();assert.equal(f.inits.length,0);assert.throws(()=>view.downloadPNG(),/仍在加载/);
 plot.rect={width:700,height:390};f.observers[0].fire();f.flushFrames();assert.equal(await view.ready,f.inits[0]);assert.equal(f.inits.length,1);assert.deepEqual(plain(f.inits[0].sets[0]),{value:value.option,settings:{notMerge:true}});assert.equal(view.node.dataset.rendered,'true');assert.equal(view.node.children[1].hidden,true);assert.equal(view.downloadPNG(),'data:image/png;base64,ACTUAL_ECHARTS_FIXTURE');assert.deepEqual(plain(f.inits[0].exports[0]),{pixelRatio:2,backgroundColor:'#fff'});
});

test('v2 waits for attachment, reads chart once, and renders the original full option',async()=>{
 const gate=deferred(),f=fixture(()=>gate.promise),view=f.context.createDatabaseChartView(reference());view.node.connected=false;view.activate();assert.equal(f.reads.length,0);view.node.connected=true;view.activate();view.activate();assert.equal(f.reads.length,1);assert.deepEqual(plain(f.reads[0]),{action:'read_chart',payload:{chartId}});assert.equal(f.inits.length,0);
 const value=chart();gate.resolve(value);await flush();f.flushFrames();assert.equal(await view.ready,f.inits[0]);assert.deepEqual(plain(f.inits[0].sets[0].value),value.option);view.activate();f.flushFrames();assert.equal(f.reads.length,1);assert.equal(f.inits.length,1);assert.equal(f.inits[0].resizes,1);
});

test('a failed full-chart request exposes its error and retries the same reference',async()=>{
 let calls=0;const f=fixture(()=>++calls===1?Promise.reject(new Error('fixture unavailable')):Promise.resolve(chart())),view=f.context.createDatabaseChartView(reference());view.activate();await flush();await assert.rejects(view.ready,/fixture unavailable/);assert.match(view.node.children[1].textContent,/fixture unavailable/);assert.equal(view.node.children[1].role,'alert');assert.equal(view.node.children[2].hidden,false);assert.equal(f.inits.length,0);assert.throws(()=>view.downloadPNG(),/fixture unavailable/);
 const retry=view.node.children[2].onclick();await flush();f.flushFrames();await retry;assert.equal(f.inits.length,1);assert.equal(view.node.children[2].hidden,true);assert.deepEqual(f.reads.map(read=>plain(read.payload)),[{chartId},{chartId}]);
});

test('mismatched v2 result cannot render data from another query',async()=>{
 const f=fixture(async()=>chart({resultId:otherId})),view=f.context.createDatabaseChartView(reference());view.activate();await flush();await assert.rejects(view.ready,/不匹配/);f.flushFrames();assert.equal(f.inits.length,0);assert.throws(()=>view.downloadPNG(),/不匹配/);
});

test('switching to data and back retains a single chart and resizes on reactivation',async()=>{
 const f=fixture(),view=f.context.createDatabaseChartView(chart());view.activate();f.flushFrames();await view.ready;view.node.hidden=true;f.observers[0].fire();f.flushFrames();assert.equal(f.inits[0].resizes,0);assert.equal(f.inits[0].disposed,false);view.node.hidden=false;view.activate();f.flushFrames();assert.equal(f.inits.length,1);assert.equal(f.inits[0].resizes,1);assert.equal(view.node.dataset.rendered,'true');
});

test('detachment disposes ECharts and disconnects both observers',async()=>{
 const f=fixture(),view=f.context.createDatabaseChartView(chart());view.activate();f.flushFrames();await view.ready;view.node.connected=false;f.observers[1].fire();assert.equal(f.inits[0].disposed,true);assert(f.observers.every(observer=>observer.disconnected));assert.throws(()=>view.downloadPNG(),/已关闭/);view.activate();f.flushFrames();assert.equal(f.inits.length,1);
});

test('disposed pending v2 ignores late responses and cancels queued rendering',async()=>{
 const gate=deferred(),f=fixture(()=>gate.promise),view=f.context.createDatabaseChartView(reference());view.activate();view.dispose();gate.resolve(chart());await flush();f.flushFrames();assert.equal(await view.ready,null);assert.equal(f.inits.length,0);assert(f.observers.every(observer=>observer.disconnected));assert.equal(view.node.dataset.rendered,undefined);
});

test('a removed pending view ignores late responses even before mutation delivery',async()=>{
 const gate=deferred(),f=fixture(()=>gate.promise),view=f.context.createDatabaseChartView(reference());view.activate();view.node.connected=false;gate.resolve(chart());await flush();f.flushFrames();assert.equal(await view.ready,null);assert.equal(f.inits.length,0);assert(f.observers.every(observer=>observer.disconnected));
});

test('legacy fallback can be inserted after construction without a second explicit activate',async()=>{
 const f=fixture(),create=f.context.el;f.context.el=(...args)=>{const node=create(...args);if(args[1]==='db-chart-view')node.connected=false;return node;};const node=f.context.renderDatabaseChart(chart());f.flushFrames();assert.equal(f.inits.length,0);node.connected=true;f.observers[1].fire();f.flushFrames();assert.equal(f.inits.length,1);assert.equal(node.dataset.rendered,'true');
});

test('theme patch reads page variables and leaves actual datasets and semantic series colors unchanged',()=>{
 const f=fixture(),palette={ink:'#ededed',muted:'#b0b0b0',surface:'#121212',border:'#505050',hover:'#333333'};f.context.getComputedStyle=()=>({getPropertyValue:name=>' '+palette[name.slice(2)]+' '});
 const option={color:['#d70000','#00a000'],textStyle:{fontFamily:'custom'},legend:{selected:{total:false}},tooltip:{trigger:'axis'},xAxis:[{id:'period',type:'category',data:['June']}],yAxis:{type:'value'},series:[{id:'total',type:'bar',color:'#f10',itemStyle:{color:'#a12'},label:{show:true}}],dataset:{source:[{total:9}]},dataZoom:[{type:'inside',start:20,end:60}]},before=JSON.stringify(option);
 const colors=f.context.databaseChartPalette(new Node('div')),patch=f.context.databaseChartThemePatch(option,colors);assert.deepEqual(plain(colors),palette);assert.equal(patch.textStyle.color,palette.ink);assert.equal(patch.legend.textStyle.color,palette.ink);assert.equal(patch.tooltip.backgroundColor,palette.surface);assert.equal(patch.xAxis[0].axisLabel.color,palette.ink);assert.equal(patch.xAxis[0].id,'period');assert.equal(patch.yAxis.axisLine.lineStyle.color,palette.border);assert.equal(patch.dataZoom[0].textStyle.color,palette.ink);assert.equal(patch.series[0].id,'total');assert.equal(patch.series[0].label.color,palette.ink);
 assert.equal('dataset' in patch,false);assert.equal('color' in patch,false);assert.equal('color' in patch.series[0],false);assert.equal('itemStyle' in patch.series[0],false);assert.equal('selected' in patch.legend,false);assert.equal('start' in patch.dataZoom[0],false);assert.equal('end' in patch.dataZoom[0],false);assert.equal(JSON.stringify(option),before);
});

test('live theme changes patch the same chart instance and keep dark PNG backgrounds readable',async()=>{
 const f=fixture(),option={...chart().option,legend:{},tooltip:{trigger:'axis'},xAxis:{type:'category'},yAxis:{type:'value'}},view=f.context.createDatabaseChartView(chart({option}));view.activate();f.flushFrames();await view.ready;const instance=f.inits[0];assert.equal(instance.sets.length,2);assert.equal(instance.sets[1].value.legend.textStyle.color,'#252724');f.context.document.documentElement.dataset.theme='dark';f.observers[2].fire();f.flushFrames();assert.equal(f.inits.length,1);assert.equal(f.inits[0],instance);assert.equal(instance.disposed,false);assert.equal(instance.sets.length,3);const patch=instance.sets[2];assert.equal(patch.settings.notMerge,false);assert.equal(patch.value.xAxis.axisLabel.color,'#eceee7');assert.equal(patch.value.legend.textStyle.color,'#eceee7');assert.equal(patch.value.tooltip.backgroundColor,'#252825');view.downloadPNG();assert.equal(instance.exports.at(-1).backgroundColor,'#252825');
 f.context.document.documentElement.dataset.theme='light';f.observers[2].fire();f.flushFrames();assert.equal(f.inits.length,1);assert.equal(instance.sets.at(-1).value.xAxis.axisLabel.color,'#252724');view.dispose();assert(f.observers.every(observer=>observer.disconnected));
});

test('unrelated body mutations do not reactivate or resize an already connected chart',async()=>{
 const f=fixture(),view=f.context.createDatabaseChartView(chart());view.activate();f.flushFrames();await view.ready;const sets=f.inits[0].sets.length;for(let index=0;index<5;index++){f.observers[1].fire();f.flushFrames();}assert.equal(f.inits[0].resizes,0);assert.equal(f.inits[0].sets.length,sets);assert.equal(f.frames.size,0);f.observers[0].fire();f.flushFrames();assert.equal(f.inits[0].resizes,1);
});

test('a hidden chart applies the latest page theme when shown without creating a second instance',async()=>{
 const f=fixture(),view=f.context.createDatabaseChartView(chart());view.activate();f.flushFrames();await view.ready;view.node.hidden=true;const before=f.inits[0].sets.length;f.context.document.documentElement.dataset.theme='dark';f.observers[2].fire();f.flushFrames();assert.equal(f.inits[0].sets.length,before);view.node.hidden=false;view.activate();f.flushFrames();assert.equal(f.inits.length,1);assert.equal(f.inits[0].sets.at(-1).value.textStyle.color,'#eceee7');
});

test('PNG download applies a just-changed theme before the next animation frame',async()=>{
 const f=fixture(),view=f.context.createDatabaseChartView(chart());view.activate();f.flushFrames();await view.ready;f.context.document.documentElement.dataset.theme='dark';view.downloadPNG();assert.equal(f.inits[0].sets.at(-1).value.textStyle.color,'#eceee7');assert.equal(f.inits[0].exports.at(-1).backgroundColor,'#252825');assert.equal(f.inits.length,1);
});

test('render failure offers a retry and does not report success or export an image',async()=>{
 const f=fixture(),view=f.context.createDatabaseChartView(chart());f.initError=new Error('fixture canvas failure');view.activate();f.flushFrames();await assert.rejects(view.ready,/canvas failure/);assert.equal(view.node.dataset.rendered,'false');assert.equal(view.node.children[2].hidden,false);assert.throws(()=>view.downloadPNG(),/canvas failure/);f.initError=null;const retry=view.node.children[2].onclick();f.flushFrames();await retry;assert.equal(f.inits.length,1);assert.equal(view.node.dataset.rendered,'true');
});

test('legacy render path delegates to unified result card without creating another plot',()=>{
 const f=fixture(),value=chart(),expected=new Node('article');let received;f.context.renderStandaloneAnalysisChart=data=>{received=data;return expected;};assert.equal(f.context.renderDatabaseChart(value),expected);assert.equal(received,value);assert.equal(f.nodes.length,0);assert.equal(f.inits.length,0);
});
