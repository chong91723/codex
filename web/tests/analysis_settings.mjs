// Production settings and command guards exercised with deterministic DOM/RPC
// fixtures. Native/browser evidence is recorded separately by the acceptance run.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function implementation(start,end){const from=source.indexOf(start),to=source.indexOf(end,from);assert(from>=0&&to>from);return source.slice(from,to);}
const code=[implementation('function parkAdvancedControls(){','\nfunction showView('),implementation('function panelError(error) {','\nfunction showJSON('),implementation('async function renderSettings(){','\nasync function rollbackThread('),implementation('function parsePlanPrompt(text){','\nasync function submitPrompt(')].join('\n');
class Node {
  constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.parentNode=null;this.id='';this.value='';this.open=false;}
  append(...children){for(const child of children){if(child.parentNode)child.parentNode.children.splice(child.parentNode.children.indexOf(child),1);child.parentNode=this;this.children.push(child);}}
  replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...children);}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
}
function descendants(node){return [node,...node.children.flatMap(descendants)];}
function deferred(){let resolve,reject;return {promise:new Promise((yes,no)=>{resolve=yes;reject=no;}),get resolve(){return resolve;},get reject(){return reject;}};}
function fixture(transport){
  const documentRoot=new Node('body'),panel=new Node('div'),parking=new Node('div'),controls=new Node('div');panel.id='panel-content';parking.id='analysis-advanced-controls-parking';controls.id='analysis-advanced-controls';
  const model=new Node('select'),effort=new Node('select'),permissions=new Node('button');model.id='model';model.value='deepseek-flash';effort.id='effort';permissions.id='permissions-button';permissions.marker=()=>42;controls.append(model,effort,permissions);parking.append(controls);documentRoot.append(panel,parking);
  const state={view:'settings',selectedCwd:'/tmp/analysis-settings-fixture',thread:null,threadSettings:new Map(),status:{baseline:{sourceCommit:'test'}}},calls=[],actions=[];
  const $=selector=>descendants(documentRoot).find(node=>node.id===selector.slice(1))||null;
  const noop=()=>{};
  const context=vm.createContext({state,$,$$:()=>[],Option:function(text,value){const node=new Node('option',text);node.value=value;return node;},el:(tag,cls,text)=>{const node=new Node(tag,text);node.className=cls;return node;},icon:()=>new Node('svg'),button:(label,fn)=>{const node=new Node('button',label);node.onclick=fn;return node;},document:{documentElement:{dataset:{theme:'light'}}},rpc:async(method,params)=>{calls.push({method,params});return transport?transport(method,params):{config:{model_provider:'deepseek',model:'deepseek-flash'},layers:[]};},pretty:JSON.stringify,nativeErrorMessage:error=>error.message,redact:value=>value,refreshPermissionDefaults:noop,editProject:()=>actions.push('directory'),showProjects:()=>actions.push('projects'),fileBrowser:()=>actions.push('files'),initializeWorkspace:()=>actions.push('initialize'),showGoalDialog:()=>actions.push('goal'),showView:view=>actions.push(view),toggleTheme:noop,toast:noop,report:noop,askText:noop});
  vm.runInContext(code,context);
  return {state,panel,parking,controls,model,permissions,calls,actions,context,$,render:()=>context.renderSettings(),findButton:label=>descendants(panel).find(node=>node.tagName==='button'&&node.textContent===label)};
}
test('advanced controls stay the same connected objects across rerenders and unrelated panels',async()=>{
  const f=fixture();await f.render();const details=f.$('#analysis-advanced-settings');assert.equal(details.open,false);assert(details.contains(f.controls));assert.equal(f.$('#model'),f.model);assert.equal(f.permissions.marker(),42);
  f.model.value='deepseek-flash-local-selection';await f.render();assert.equal(f.$('#model'),f.model);assert.equal(f.model.value,'deepseek-flash-local-selection');assert.equal(f.$('#permissions-button'),f.permissions);
  f.context.panelHeading('other','description','settings');assert.equal(f.controls.parentNode,f.parking);assert.equal(f.$('#model'),f.model);assert.equal(f.permissions.marker(),42);
  f.context.panelError(new Error('fixture failure'));assert.equal(f.$('#model'),f.model);assert.equal(f.controls.parentNode,f.parking);
});
test('advanced collapse remains open during native settings refresh',async()=>{
  const f=fixture();await f.render();const details=f.$('#analysis-advanced-settings');details.open=true;details.ontoggle();await f.render();assert.equal(f.$('#analysis-advanced-settings').open,true);
});
test('hidden engineering actions retain their real handler and do not execute while rendering',async()=>{
  const f=fixture();await f.render();assert.deepEqual(f.actions,[]);assert.deepEqual(f.calls.map(call=>call.method),['config/read']);
  const detail=f.$('#analysis-advanced-settings');for(const [label,action] of [['初始化工作区','initialize'],['管理持续目标','goal'],['浏览原始目录','files'],['管理空间','projects'],['打开原生协议','protocol'],['查看服务连接','account']]){const control=f.findButton(label);assert(control,label);assert(detail.contains(control),label);await control.onclick();assert.equal(f.actions.at(-1),action);}
  for(const [label,action]of [['管理 Skills','skills'],['管理 MCP','mcp']]){const control=f.findButton(label);assert(!detail.contains(control));await control.onclick();assert.equal(f.actions.at(-1),action);}
});
test('older settings response cannot replace a newer settings render',async()=>{
  const earlier=deferred();let reads=0;const f=fixture(()=>++reads===1?earlier.promise:{config:{model:'newer'},layers:[]});const old=f.render();await f.render();earlier.resolve({config:{model:'older'},layers:[]});await old;assert.equal(f.state.config.config.model,'newer');assert.equal(f.$('#model'),f.model);
});
test('settings response after navigation does not rebuild the destination panel',async()=>{
  const held=deferred(),f=fixture(()=>held.promise),pending=f.render();f.state.view='skills';held.resolve({config:{},layers:[]});await pending;assert.equal(f.panel.children.length,0);assert.equal(f.controls.parentNode,f.parking);
});
test('failed config load propagates its diagnostic and preserves connected controls',async()=>{
  const f=fixture(()=>Promise.reject(new Error('native fixture rejected')));await assert.rejects(f.render(),/native fixture rejected/);assert.equal(f.controls.parentNode,f.parking);assert.equal(f.$('#model'),f.model);
});
for(const command of ['/init','/goal','/chat','/compact','/model','/mcp','/review','/export','/rollback','/fork','/status'])test('removed slash command stays local: '+command,()=>{
  const f=fixture();assert.throws(()=>f.context.validateComposerCommand(command),/输入已保留/);assert.equal(f.calls.length,0);
});
test('normal analysis questions, absolute paths and embedded slashes are permitted',()=>{
  const f=fixture();for(const text of ['分析本月销售额','请解释 /plan 的含义','/tmp/report.csv','2026/10 销售趋势'])assert.doesNotThrow(()=>f.context.validateComposerCommand(text));assert.equal(f.calls.length,0);
});

test('planning slash entry remains available while unrelated removed commands stay guarded',()=>{
  const f=fixture();for(const text of ['/','/plan','/plan 分析本月销售额'])assert.doesNotThrow(()=>f.context.validateComposerCommand(text));assert.equal(f.calls.length,0);
});
