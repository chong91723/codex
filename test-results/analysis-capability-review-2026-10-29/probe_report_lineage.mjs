// Actual report helpers; native transcript and proof are explicit fixtures.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const resultId='a'.repeat(32), chartId='b'.repeat(32);
const sourceTurn='earlier-turn', reportTurn='followup-turn';
const query={id:'query',type:'mcpToolCall',tool:'query_database',server:'codex_web_databases',status:'completed',result:{structuredContent:{resultId,connectionName:'Synthetic sales',rowCount:2}}};
const chart={id:'chart',type:'mcpToolCall',tool:'create_chart',status:'completed',chart:{version:2,resultId,chartId,title:'Synthetic sales chart'}};
const answer={id:'answer',type:'agentMessage',phase:'final_answer',text:'Revenue is 42.'};
const proof={status:'verified',answerId:'proof-fixture',evidence:[{resultId,row:0,column:'revenue',value:42}],sources:{[resultId]:{query:'Fixture SELECT'}}};
const state={thread:{id:'fixture-thread',name:'Cross-turn report'},navigationGeneration:1,
  turns:[{id:sourceTurn,status:'completed'},{id:reportTurn,status:'completed'}],
  items:new Map([
    ['query',{item:query,turnId:sourceTurn,done:true,node:{dataset:{}}}],
    ['chart',{item:chart,turnId:sourceTurn,done:true,node:{dataset:{}}}],
    ['answer',{item:answer,turnId:reportTurn,done:true,node:{dataset:{analysisVerification:'verified'},analysisEvidence:proof}}],
  ])};
const context=vm.createContext({state,Map,Set,JSON,Error,Object,Number,String,Array,Date,
  window:{addEventListener(){}},document:{addEventListener(){}},databaseChart:item=>item.chart||null});
vm.runInContext(fs.readFileSync('/root/Codex/web/public/analysis-workspace.js','utf8'),context);
vm.runInContext(fs.readFileSync('/root/Codex/web/public/analysis-reports.js','utf8'),context);
const snapshot=context.analysisReportSnapshot('answer');
assert.equal(snapshot.verification.evidence[0].resultId,resultId);
assert.equal(snapshot.results.length,0);
assert.equal(snapshot.charts.length,0);
const figures=await context.reportFigures(snapshot,()=>true);
assert.equal(figures.length,0);
const result={reproduced:true,scope:'Production JavaScript helpers with explicit two-turn transcript/proof fixtures; no browser/model/database requests',
  evidenceReferencesPreviousResult:true,earlierChartPresentInConversation:true,
  exportedRelatedResults:snapshot.results.length,exportedFigures:figures.length,
  expected:'Include explicitly referenced earlier artifacts or clearly state the export excludes them',
  classification:'Cross-turn report artifact linkage gap; existing implementation intentionally limits collection to the report turn'};
fs.writeFileSync('/tmp/codex-cross-feature-review-20261029/report-lineage.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
