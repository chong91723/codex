// Native step status calculation; no model calls and no generated percentages.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../public/native-ui.js',import.meta.url),'utf8');
const block=source.split('// BEGIN execution progress status.')[1].split('// END execution progress status.')[0].split('\n').slice(1).join('\n');
const context=vm.createContext({});vm.runInContext(block,context);
const plan=[{step:'读取真实数据',status:'completed'},{step:'按口径统计',status:'inProgress'},{step:'回答用户',status:'pending'}];
const calculate=overrides=>JSON.parse(JSON.stringify(context.executionProgressStatus({plan,...overrides})));
const cases=[
 ['running',{active:true},'running','执行中'],
 ['interrupted native turn',{active:false,turn:{status:'interrupted'}},'interrupted','已停止'],
 ['failed native turn',{turn:{status:'failed'}},'failed','执行失败'],
 ['interrupt still pending',{active:true,interrupting:true},'stopping','正在停止'],
 ['tool approval',{active:true,request:{method:'item/commandExecution/requestApproval',params:{}}},'waiting','等待审批'],
 ['MCP approval',{active:true,request:{method:'mcpServer/elicitation/request',params:{_meta:{codex_approval_kind:'mcp_tool_call'}}}},'waiting','等待审批'],
 ['user question',{active:true,request:{method:'item/tool/requestUserInput',params:{}}},'waiting','等待你的回应'],
 ['response awaits native resolution',{active:true,request:{method:'item/commandExecution/requestApproval',responded:true}},'responded','决定已发送，等待确认'],
 ['disconnected',{active:true,connected:false},'disconnected','连接已断开，状态待恢复'],
 ['incomplete native completion',{turn:{status:'completed'}},'incomplete','本轮已结束，计划未全部报告完成'],
 ['all steps while final answer streams',{active:true,plan:plan.map(step=>({...step,status:'completed'}))},'running','步骤已完成，正在整理结果'],
 ['actual complete',{turn:{status:'completed'},plan:plan.map(step=>({...step,status:'completed'}))},'completed','已完成'],
 ['no restored turn status',{},'unknown','状态待恢复']
];
for(const [name,args,status,label]of cases){const result=calculate(args);assert.equal(result.status,status,name);assert.equal(result.label,label,name);assert.equal(result.total,3,name);assert.equal(result.completed,args.plan?3:1,name);assert(!Object.keys(result).includes('percent'),name);console.log('PASS '+name);}
assert.equal(calculate({active:true}).current,'按口径统计');
console.log(JSON.stringify({passed:cases.length,failed:0,scope:'Unit status logic only; steps are native update_plan values.'}));
