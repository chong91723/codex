// Actual MCP management handlers with deterministic DOM/RPC boundaries.
// Real native discovery, model use, and process lifecycle are separate evidence.
import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const code=section('function formField(', '\nfunction skillPresentation(')+section('function parseStringObject(', '\nfunction useAnalysisSkill(')+section('function sameMcpConfig(', '\nfunction mcpStatusRequest(');
class Node{constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.value='';this.disabled=false;this.dataset={};this.isConnected=true;}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}setAttribute(key,value){this[key]=value;}}
const descendants=node=>[node,...node.children.filter(item=>item instanceof Node).flatMap(descendants)];
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(initial={command:'/usr/bin/python3',args:['/tmp/analysis-mcp.py'],enabled:true}){
 const state={selectedCwd:'/tmp/mcp-management-audit',mcpRevision:0,mcpCache:new Map([['old',{}]]),mcpRequests:new Map([['old',{}]])},calls=[],messages=[];
 let config=clone(initial),version='v1',dialog,writeError,reloadError,retainInherited=false,renders=0;
 const response=()=>({config:{mcp_servers:config===undefined?{}:{analysis:clone(config)}},layers:[{name:{type:'user'},version}]});
 const context=vm.createContext({state,URL,Option:function(label,value){const node=new Node('option',label);node.value=value;return node;},document:{createTextNode:text=>text},el:(tag,cls,text)=>new Node(tag,text),$: (selector,root=dialog?.root)=>descendants(root).find(node=>node.id===selector.slice(1)),$$:(selector,root)=>descendants(root).filter(node=>['input','textarea'].includes(node.tagName)),safeURL:value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}},openDialog:(title,build,submit,label)=>{dialog={title,label,root:new Node('div'),submit};build(dialog.root);},toast:text=>messages.push(text),nativeErrorMessage:error=>error.message,renderMcp:async()=>{renders++;},rpc:async(method,params)=>{
  calls.push({method,params:params?clone(params):params});if(method==='config/read')return response();
  if(method==='config/batchWrite'){if(writeError)throw writeError;assert.equal(params.expectedVersion,version);const edit=params.edits[0];if(edit.value===null){if(!retainInherited)config=undefined;}else if(edit.keyPath.endsWith('.enabled'))config.enabled=edit.value;else config=clone(edit.value);version+='+';return {};}
  if(method==='config/mcpServer/reload'){if(reloadError)throw reloadError;return {};}
  throw Error('Unexpected RPC '+method);
 }});vm.runInContext(code,context);
 return{context,state,calls,messages,get config(){return config;},get dialog(){return dialog;},get renders(){return renders;},get: id=>descendants(dialog.root).find(node=>node.id===id),change:value=>{config=clone(value);version+='external';},writeError:error=>writeError=error,reloadError:error=>reloadError=error,inherit:()=>retainInherited=true};
}
test('editing preserves advanced options and unexposed credentials through native CAS and reload',async()=>{
 const original={command:'python3',args:['old.py'],env:{API_KEY:'test-secret'},env_vars:['EXTRA_TOKEN'],startup_timeout_sec:31,tool_timeout_sec:71,tools:{read:{enabled:false}},enabled:false},f=fixture(original);
 await f.context.editMcpConfig('analysis',original);assert.equal(f.dialog.label,'保存');assert(f.get('mcp-name').disabled);assert.equal(f.get('mcp-env').value,'');assert(!JSON.stringify(f.dialog.root).includes('test-secret'));
 f.get('mcp-command').value='/usr/bin/python3';f.get('mcp-args').value='["new.py"]';await f.dialog.submit(f.dialog.root);
 assert.deepEqual(f.config,{...original,command:'/usr/bin/python3',args:['new.py']});assert.deepEqual(f.calls.map(call=>call.method),['config/read','config/read','config/batchWrite','config/mcpServer/reload']);assert.equal(f.state.mcpCache.size,0);assert.equal(f.state.mcpRequests.size,0);assert.equal(f.renders,1);
});
test('stale editor refuses overwrite even when changed server is in the same browser',async()=>{
 const original={command:'python3',enabled:true},f=fixture(original);await f.context.editMcpConfig('analysis',original);f.change({...original,tool_timeout_sec:999});await assert.rejects(f.dialog.submit(f.dialog.root),/配置已变更/);assert(!f.calls.some(call=>call.method==='config/batchWrite'));assert.equal(f.config.tool_timeout_sec,999);assert.equal(f.get('mcp-command').value,'python3');
});
test('server change before opening editor is refused instead of showing stale settings',async()=>{
 const f=fixture({command:'changed'});await assert.rejects(f.context.editMcpConfig('analysis',{command:'old'}),/配置已变更/);assert.equal(f.dialog,undefined);
});
test('transport switch removes obsolete fields and keeps unrelated options',async()=>{
 const original={command:'python3',args:['service.py'],env:{KEY:'secret'},env_vars:['KEY'],cwd:'/tmp/work',tool_timeout_sec:72,enabled:true},f=fixture(original);await f.context.editMcpConfig('analysis',original);f.get('mcp-transport').value='http';f.get('mcp-url').value='http://127.0.0.1:12345/mcp';await f.dialog.submit(f.dialog.root);assert.deepEqual(f.config,{url:'http://127.0.0.1:12345/mcp',tool_timeout_sec:72,enabled:true});
});
test('HTTP editing retains headers without echoing them; explicit empty objects clear them',async()=>{
 const original={url:'http://127.0.0.1:12345/mcp',http_headers:{Authorization:'test-secret'},env_http_headers:{'X-Key':'MCP_KEY'},bearer_token_env_var:'BEARER',enabled:true},f=fixture(original);await f.context.editMcpConfig('analysis',original);assert.equal(f.get('mcp-headers').value,'');assert.equal(f.get('mcp-env-headers').value,'');assert(!JSON.stringify(f.dialog.root).includes('test-secret'));await f.dialog.submit(f.dialog.root);assert.deepEqual(f.config,original);
 await f.context.editMcpConfig('analysis',f.config);f.get('mcp-headers').value='{}';f.get('mcp-env-headers').value='{}';f.get('mcp-bearer-env').value='';await f.dialog.submit(f.dialog.root);assert.deepEqual(f.config,{url:original.url,enabled:true,http_headers:{},env_http_headers:{}});
});
test('invalid JSON leaves config unchanged and does not reload',async()=>{
 const original={command:'python3',enabled:true},f=fixture(original);await f.context.editMcpConfig('analysis',original);f.get('mcp-args').value='[1]';await assert.rejects(f.dialog.submit(f.dialog.root),/字符串 JSON 数组/);assert.deepEqual(f.config,original);assert(!f.calls.some(call=>call.method==='config/batchWrite'));
});
test('new server cannot overwrite a newly appeared configuration',async()=>{
 const f=fixture({command:'existing'});f.context.customMcpDialog(new Set());f.get('mcp-name').value='analysis';f.get('mcp-command').value='new';await assert.rejects(f.dialog.submit(f.dialog.root),/服务名已存在/);assert.equal(f.config.command,'existing');assert(!f.calls.some(call=>call.method==='config/batchWrite'));
});
test('native write rejection is not hidden or followed by reload and success',async()=>{
 const original={command:'python3',enabled:true},f=fixture(original);await f.context.editMcpConfig('analysis',original);f.get('mcp-command').value='changed-python';f.writeError(Error('Native version conflict'));await assert.rejects(f.dialog.submit(f.dialog.root),/Native version conflict/);assert(!f.calls.some(call=>call.method==='config/mcpServer/reload'));assert.deepEqual(f.messages,[]);
});
test('reload failure states that config was saved without claiming ready tools',async()=>{
 const original={command:'python3',enabled:true},f=fixture(original);await f.context.editMcpConfig('analysis',original);f.get('mcp-command').value='python-new';f.reloadError(Error('active tool reload rejected'));await assert.rejects(f.dialog.submit(f.dialog.root),/配置已保存.*active tool reload rejected/);assert.equal(f.config.command,'python-new');assert.deepEqual(f.messages,[]);
});
test('remove uses native deletion and read-back, preserves success distinction from inherited config',async()=>{
 const original={command:'python3',enabled:true},f=fixture(original);f.context.removeMcpConfig('analysis',original);assert.equal(f.calls.length,0);await f.dialog.submit();assert.equal(f.config,undefined);assert.deepEqual(f.calls.map(call=>call.method),['config/read','config/batchWrite','config/mcpServer/reload','config/read']);assert.match(f.messages[0],/已移除/);
 const inherited=fixture(original);inherited.inherit();inherited.context.removeMcpConfig('analysis',original);await assert.rejects(inherited.dialog.submit(),/其他配置层仍提供/);assert.deepEqual(inherited.messages,[]);assert.equal(inherited.renders,1);
});
test('remove refuses stale configuration and canonical comparisons preserve array order',async()=>{
 const f=fixture({command:'new'});f.context.removeMcpConfig('analysis',{command:'old'});await assert.rejects(f.dialog.submit(),/未覆盖已有修改/);assert(!f.calls.some(call=>call.method==='config/batchWrite'));assert(f.context.sameMcpConfig({b:2,a:1},{a:1,b:2}));assert(!f.context.sameMcpConfig({args:['a','b']},{args:['b','a']}));
});
test('one malformed address can be displayed without crashing the MCP service list',()=>{
 const f=fixture();assert.match(f.context.mcpConnectionLabel({url:'invalid://['}),/地址无效/);assert.equal(f.context.mcpConnectionLabel({url:'https://example.invalid/path'}),'https://example.invalid · HTTP');assert.equal(f.context.mcpConnectionLabel({command:'python3'}),'python3 · stdio');
});
test('visible enable/disable handler refuses an outdated card instead of overwriting external changes',async()=>{
 const original={command:'python3',enabled:true},f=fixture(original),panel=new Node('main');f.state.view='mcp';f.context.panelHeading=()=>panel;f.context.button=(label,fn)=>{const node=new Node('button',label);node.onclick=fn;return node;};f.context.mcpStatusRequest=async()=>[];vm.runInContext(section('async function renderMcp(){','\nasync function renderPlugins('),f.context);await f.context.renderMcp();await new Promise(resolve=>setImmediate(resolve));const stop=descendants(panel).find(node=>node.tagName==='button'&&node.textContent==='停用');assert(stop);assert(descendants(panel).some(node=>node.textContent==='编辑配置'));assert(descendants(panel).some(node=>node.textContent==='移除连接'));f.change({...original,enabled:false});await assert.rejects(stop.onclick(),/配置已变更/);assert(!f.calls.some(call=>call.method==='config/batchWrite'));assert.equal(f.config.enabled,false);
});
test('existing command-line secrets and credential URLs never enter edit controls and are preserved',async()=>{
 for(const original of [{command:'python3',args:['--password','arg-secret'],enabled:true},{url:'https://fixture-user:url-secret@example.invalid/mcp?key=query-secret',http_headers:{'X-Custom':'header-secret'},enabled:true}]){
  const f=fixture(original);await f.context.editMcpConfig('analysis',original);const displayed=JSON.stringify(f.dialog.root);for(const secret of ['arg-secret','url-secret','query-secret','header-secret'])assert(!displayed.includes(secret));assert.equal(f.get('mcp-args').value,'');assert.equal(f.get('mcp-url').value,'');await f.dialog.submit(f.dialog.root);assert.deepEqual(f.config,original);
 }
});
test('actual config/detail display redaction hides password variants, arbitrary env/header values, args and URL credentials',()=>{
 const f=fixture();vm.runInContext(section('function redact(value)', '\n// Product scope'),f.context);const original={password:'password-secret',db_password:'db-password-secret',pwd:'pwd-secret',cookie:'cookie-secret',env:{BUSINESS_DB_PASSWORD:'env-secret',CUSTOM_VALUE:'custom-secret'},http_headers:{'X-Custom':'header-secret'},args:['--password','arg-secret'],base_url:'https://user:url-secret@example.invalid/mcp?key=query-secret',model:'deepseek-flash'},shown=f.context.redact(original),text=JSON.stringify(shown);for(const secret of ['password-secret','db-password-secret','pwd-secret','cookie-secret','env-secret','custom-secret','header-secret','arg-secret','url-secret','query-secret'])assert(!text.includes(secret),secret);assert.equal(shown.model,'deepseek-flash');assert.equal(original.env.CUSTOM_VALUE,'custom-secret');
});
test('unchanged HTTP editor validates current config, reports no change, and never writes or reloads',async()=>{
 const original={url:'https://example.invalid/mcp',enabled:true,http_headers:{'X-Custom':'test-header-secret'},tool_timeout_sec:37},f=fixture(original);await f.context.editMcpConfig('analysis',original);f.get('mcp-url').value=original.url;await f.dialog.submit(f.dialog.root);assert.deepEqual(f.calls.map(call=>call.method),['config/read','config/read']);assert.deepEqual(f.messages,['配置未变更']);assert.deepEqual(f.config,original);assert.equal(f.renders,0);assert.equal(f.state.mcpRevision,0);
});
test('switching local HTTP with a header helper to stdio removes every HTTP-only field',async()=>{
 const original={url:'http://127.0.0.1:12345/mcp',http_headers_helper:'fixture-header-helper --token helper-secret',http_headers:{'X-Custom':'test'},env_http_headers:{'X-Token':'MCP_TOKEN'},bearer_token_env_var:'BEARER',enabled:true,tool_timeout_sec:37},f=fixture(original);await f.context.editMcpConfig('analysis',original);assert(!JSON.stringify(f.dialog.root).includes('helper-secret'));f.get('mcp-transport').value='stdio';f.get('mcp-command').value='python3';f.get('mcp-args').value='["stdio-server.py"]';await f.dialog.submit(f.dialog.root);assert.deepEqual(f.config,{command:'python3',args:['stdio-server.py'],enabled:true,tool_timeout_sec:37});vm.runInContext(section('function redact(value)', '\n// Product scope'),f.context);assert(!JSON.stringify(f.context.redact(original)).includes('helper-secret'));
});
test('config redaction preserves MCP tool schemas including fields named args, env and password',()=>{
 const f=fixture();vm.runInContext(section('function redact(value)', '\n// Product scope'),f.context);const schema={type:'object',properties:{args:{type:'array',items:{type:'string'}},env:{type:'object',additionalProperties:{type:'string'}},password:{type:'string',description:'A caller-supplied credential'}}},source={tools:{fixture:{inputSchema:schema,outputSchema:{type:'object',properties:{args:{type:'array'}}}}},env:{TOKEN:'test-secret'},args:['--token','test-secret']},shown=f.context.redact(source);assert.deepEqual(shown.tools.fixture.inputSchema,schema);assert.deepEqual(shown.tools.fixture.outputSchema,source.tools.fixture.outputSchema);assert.equal(shown.env,'[已隐藏]');assert.equal(shown.args,'[已隐藏]');
});
