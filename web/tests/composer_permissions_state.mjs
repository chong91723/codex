// Deterministic state/protocol fixtures for actual product functions. These are
// unit tests, separate from the recorded native/browser/Flash acceptance runs.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync(new URL('../public/permissions.js',import.meta.url),'utf8');
const workspace={type:'workspaceWrite',writableRoots:['/tmp/permission-unit'],networkAccess:false,excludeTmpdirEnvVar:true,excludeSlashTmp:true};
const settings=mode=>({approvalPolicy:mode==='full'?'never':'on-request',approvalsReviewer:mode==='auto'?'auto_review':'user',sandboxPolicy:mode==='full'?{type:'dangerFullAccess'}:{...workspace,writableRoots:[...workspace.writableRoots]}});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture(mode='ask'){
 const draft={pending:false},calls=[],timers=new Map(),nodes=new Map(),ack=deferred();let timerId=0;
 const state={thread:{id:'A',status:{type:'idle'}},threadSettings:new Map([['A',settings(mode)]]),runtimeDefaults:{sandbox_mode:'workspace-write',approval_policy:'on-request'},ready:true,navigationGeneration:1,activeTurns:new Map(),stopOperations:new Map()};
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{dataset:{},replaceChildren(){},setAttribute(){},classList:{toggle(){}}});return nodes.get(selector);};
 const context=vm.createContext({state,Map,Set,JSON,Error,console,$:node,el:()=>({}),icon:()=>({}),composerState:()=>draft,updateSend(){},report(){},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),rpc:(method,params)=>{calls.push({method,params});return ack.promise;}});
 vm.runInContext(source,context);
 return {state,draft,calls,timers,nodes,ack,context,node,apply:mode=>context.applyPermissionMode(mode,{id:'A',generation:1,draft},{blocked:{},config:{}}),snapshot:(id,value)=>{state.threadSettings.set(id,value);context.permissionsFromSnapshot(id,value);}};
}
test('sandbox confirmation ignores JSON field order',()=>{
 const f=fixture();const reordered={excludeSlashTmp:true,networkAccess:false,writableRoots:['/tmp/permission-unit'],type:'workspaceWrite',excludeTmpdirEnvVar:true};
 assert.equal(f.context.samePermissionPolicy(workspace,reordered),true);assert.equal(f.context.samePermissionPolicy(workspace,{...reordered,networkAccess:true}),false);
});
test('native custom read-only permissions never masquerade as a workspace preset',()=>{
 const f=fixture();assert.equal(f.context.permissionMode({...settings('ask'),sandboxPolicy:{type:'readOnly',networkAccess:false}}),'custom');
});
test('matching native notification settles before a held acknowledgement and cancels deadline',async()=>{
 const f=fixture(),changing=f.apply('auto');assert.equal(f.state.permissionUpdates.has('A'),true);f.snapshot('A',settings('auto'));await changing;
 assert.equal(f.timers.size,0);assert.equal(f.state.permissionUpdates.has('A'),false);assert.equal(f.state.permissionUnconfirmed.has('A'),false);
 f.ack.resolve({});await Promise.resolve();assert.equal(f.state.permissionUnconfirmed.has('A'),false);assert.equal(f.calls.length,1);
});
test('fresh native resume snapshot can confirm an operation without replaying old notifications',async()=>{
 const f=fixture(),changing=f.apply('auto');f.ack.resolve({});await Promise.resolve();assert.equal(f.state.permissionUpdates.has('A'),true);
 f.snapshot('A',settings('auto'));await changing;assert.equal(f.state.permissionUpdates.has('A'),false);
});
test('another conversation snapshot cannot settle a pending update',async()=>{
 const f=fixture(),changing=f.apply('auto');f.snapshot('B',settings('auto'));assert.equal(f.state.permissionUpdates.has('A'),true);
 f.snapshot('A',settings('auto'));await changing;
});
test('deadline ends UI waiting even while acknowledgement remains pending, without replaying request',async()=>{
 const f=fixture(),changing=f.apply('auto');const error=assert.rejects(changing,/尚未收到原生确认/);[...f.timers.values()][0]();await error;
 assert.equal(f.state.permissionUnconfirmed.has('A'),true);assert.equal(f.state.permissionUpdates.has('A'),false);assert.equal(f.calls.length,1);
 f.ack.resolve({});await Promise.resolve();assert.equal(f.state.permissionUnconfirmed.has('A'),true);
});
test('disconnect settles once, blocks new submission, and a later genuine snapshot restores known state',async()=>{
 const f=fixture(),changing=f.apply('auto');const error=assert.rejects(changing,/断线/);f.context.cancelPermissionUpdates('断线，需核对权限');await error;
 assert.equal(f.context.permissionSubmissionBlocked(),true);assert.equal(f.timers.size,0);f.snapshot('A',settings('auto'));assert.equal(f.context.permissionSubmissionBlocked(),false);
});
test('native rejection keeps previous permissions and does not fabricate success',async()=>{
 const f=fixture(),changing=f.apply('auto');const error=assert.rejects(changing,/native test rejection/);f.ack.reject(new Error('native test rejection'));await error;
 assert.equal(f.context.permissionMode(f.state.threadSettings.get('A')),'ask');assert.equal(f.state.permissionUnconfirmed.has('A'),false);assert.equal(f.calls.length,1);
});
test('reviewer-only changes preserve native permission-profile provenance',async()=>{
 const f=fixture(),changing=f.apply('auto');assert.equal(Object.hasOwn(f.calls[0].params,'sandboxPolicy'),false);assert.equal(f.calls[0].params.approvalsReviewer,'auto_review');
 f.snapshot('A',settings('auto'));await changing;
});
test('new native thread permission mismatch blocks task submission and retains requested choice',()=>{
 const f=fixture();f.draft.pendingPermissions={mode:'auto'};const actual=settings('ask');assert.throws(()=>f.context.confirmStartedPermissions(f.draft,{...actual,sandbox:actual.sandboxPolicy}),/任务尚未发送/);assert.equal(f.draft.pendingPermissions.mode,'auto');
});
test('matching new-thread receipt clears only its pending choice after native confirmation',()=>{
 const f=fixture();f.draft.pendingPermissions={mode:'auto'};const actual=settings('auto');f.context.confirmStartedPermissions(f.draft,{...actual,sandbox:actual.sandboxPolicy});assert.equal(f.draft.pendingPermissions,undefined);
});
test('uncertain permission changes block sending but keep an active task stoppable',()=>{
 const f=fixture();Object.assign(f.state,{stopOperations:new Map(),interrupting:new Set(),restoreError:false,threadBusy:false,attachmentLoads:0});
 f.context.refreshThreadMenu=()=>{};f.context.renderPermissions=()=>{};f.state.permissionUnconfirmed.add('A');
 const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),start=app.indexOf('function updateSend() {'),end=app.indexOf('\n// A turn can finish',start);assert(start>0&&end>start);vm.runInContext(app.slice(start,end),f.context);
 f.state.activeTurns.set('A','T');f.context.updateSend();assert.equal(f.node('#send').disabled,false);assert.equal(f.node('#send').ariaLabel,'中断当前任务');
 f.state.activeTurns.delete('A');f.context.updateSend();assert.equal(f.node('#send').disabled,true);
});

test('command cleanup keeps permission changes disabled after its turn has already ended',()=>{
 const f=fixture();f.state.stopOperations.set('T',{threadId:'A',status:'pending'});assert.match(f.context.permissionUnavailable(),/命令仍在回收/);
 f.state.stopOperations.get('T').status='completed';assert.equal(f.context.permissionUnavailable(),'');
});
test('fresh global defaults refresh only a new chat summary, preserving existing native thread snapshots',()=>{
 const f=fixture();f.context.refreshPermissionDefaults({sandbox_mode:'read-only',approval_policy:'on-request',approvals_reviewer:'user'});
 assert.equal(f.context.permissionMode(f.context.currentPermissionSettings()),'ask');f.state.thread=null;
 assert.equal(f.context.permissionMode(f.context.currentPermissionSettings()),'custom');
 f.context.refreshPermissionDefaults({sandbox_mode:'danger-full-access',approval_policy:'never',approvals_reviewer:'user'});
 assert.equal(f.context.permissionMode(f.context.currentPermissionSettings()),'full');
});
