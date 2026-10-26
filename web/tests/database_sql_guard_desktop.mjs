// Fresh browser/native/MCP imports must execute the original guarded SQL on Flash.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {ready,call} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL,home=process.env.CODEX_TEST_HOME,workspace=process.env.CODEX_TEST_WORKSPACE;
const connectionId=process.env.CODEX_DB_CONNECTION_ID;
assert(base&&home?.startsWith('/tmp/codex-web-')&&workspace?.startsWith('/tmp/codex-web-')&&connectionId,'Explicit isolated service/home/workspace/database ID required');
const out=path.resolve(process.env.ARTIFACT_DIR||'test-results/final-fixes-2026-10-26/database-sql-guard/browser');fs.mkdirSync(out,{recursive:true});
const python=process.env.DATABASE_PYTHON||'/root/Codex/.toolchains/databases/bin/python';
const credentials=process.env.CODEX_DATABASE_CREDENTIALS||'/tmp/codex-database-work/fixture-credentials.json';
const sqls=["SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, COUNT(*) AS payment_count, SUM(CASE WHEN amount > 0 AND customer_id > 0 THEN amount ELSE 0 END) AS revenue FROM payment WHERE payment_date >= '2005-06-01' AND payment_date < '2005-09-01' GROUP BY DATE_FORMAT(payment_date, '%Y-%m') ORDER BY month",'SELECT COUNT(*) AS payment_count FROM payment WHERE amount = 0 OR amount > 0'];
const baselineCode=`import sys,json,pymysql\nfrom pathlib import Path\nsecrets=json.loads(Path(sys.argv[1]).read_text())\nconnection=pymysql.connect(host='127.0.0.1',port=13306,user='codex_reader',password=secrets['mysql']['password'],database='sakila',connect_timeout=5,read_timeout=15,autocommit=False)\ntry:\n cursor=connection.cursor(pymysql.cursors.DictCursor)\n cursor.execute('START TRANSACTION READ ONLY')\n result=[]\n for query in json.loads(sys.argv[2]):\n  cursor.execute(query);result.append(cursor.fetchall())\n print(json.dumps(result,default=str))\nfinally:\n connection.rollback();connection.close()\n`;
const baseline=()=>JSON.parse(execFileSync(python,['-c',baselineCode,credentials,JSON.stringify(sqls)],{encoding:'utf8'}));
const canonical=sql=>execFileSync(python,['-c','import sqlglot,sys;print(sqlglot.parse_one(sys.argv[1],read="mysql").sql(dialect="mysql"))',sql],{encoding:'utf8'}).trim();
const configHash=()=>crypto.createHash('sha256').update(fs.readFileSync(path.join(home,'config.toml'))).digest('hex');
const expected=baseline(),originalConfigHash=configHash(),canonicalSqls=sqls.map(canonical);
assert.equal(expected[0].length,3);assert.equal(expected[1][0].payment_count,16044);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const results=[],errors=[],requests=[],events=[],cleanup=[],owned=new Set();let creating=false,threadId,turnResult,nativeTurn;
const instruction=`这是实际数据库SQL回归，请仅用 codex_web_databases 工具和连接 ID ${connectionId}，不要使用任何命令、文件、其他MCP、计划或图表工具，不得修改数据或全局配置。先 list_databases 确认可用，再 describe_database 查看 payment 表字段。随后必须将以下两条SQL分别原样传给 query_database（每条单独调用一次，不能合批、改写或用常量月份/UNION替代），并对两个返回的结果ID分别调用 read_result 读取真实行。任何工具报错时明确报告并停止，不要换SQL绕过错误。\n\nSQL 1（月度统计，必须保留 DATE_FORMAT、CASE 和 AND）：\n${sqls[0]}\n\nSQL 2（必须保留 OR）：\n${sqls[1]}\n\n成功后用中文列出SQL 1的每月笔数和收入，以及SQL 2的总笔数；数字必须来自真实读回结果，金额保留两位小数。`;
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{
 socket.on('framesent',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method)requests.push(m);}catch{}});
 socket.on('framereceived',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method){events.push(m);if(creating&&m.method==='thread/started'&&m.params?.thread?.cwd===workspace)owned.add(m.params.thread.id);}}catch{}});
});
const args=item=>typeof item.arguments==='string'?JSON.parse(item.arguments):item.arguments||{};
const data=item=>{assert.equal(item.status,'completed',item.tool+' not completed');assert(!item.error,item.tool+' error: '+JSON.stringify(item.error));const result=item.result;assert(result&&!result.isError,item.tool+' native MCP failure');if(result.structuredContent)return result.structuredContent;for(const c of result.content||[]){if(c.type==='text'){try{return JSON.parse(c.text);}catch{}}}throw Error('Missing structured native database result');};
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({origin:'Fresh browser context -> native app-server -> fresh MCP -> deepseek-flash -> real isolated Sakila; original SQL compared with independent read-only baseline',base,home,workspace,connectionId,sqls,instruction,baseline:expected,results,browserErrors:errors,cleanup,requests,events,turnResult,nativeTurn},null,2));
try{
 await page.goto(base);await ready(page);
 assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),home);assert.equal(await page.evaluate(()=>state.status.workspace),workspace);
 await page.locator('[data-view=databases]').click();const card=page.locator('[data-connection-id="'+connectionId+'"]');await card.getByText('已连接',{exact:true}).waitFor();assert.match(await card.innerText(),/sakila/i);
 await page.locator('#new-chat').click();await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');
 creating=true;await page.locator('#prompt').fill(instruction);await page.locator('#prompt').press('Enter');
 let done=false,failure;const completion=page.waitForFunction(()=>state.thread&&state.turns.at(-1)?.status&&state.turns.at(-1).status!=='inProgress',null,{timeout:240000}).then(()=>{done=true;},error=>{done=true;failure=error;});let approvals=0;
 while(!done){const allow=page.getByRole('button',{name:'允许本次 MCP 调用',exact:true});if(await allow.isVisible()){const params=await page.evaluate(()=>[...state.requests.values()].map(request=>request.params));assert(params.every(p=>!p._meta?.tool_params?.connection_id||p._meta.tool_params.connection_id===connectionId),'Unexpected approval connection');assert(++approvals<=12,'Unexpected repeated approvals');await allow.click();}await page.waitForTimeout(150);}
 await completion;if(failure)throw failure;
 turnResult=await page.evaluate(()=>({thread:state.thread,turn:state.turns.at(-1),items:[...state.items.values()].filter(e=>e.turnId===state.turns.at(-1)?.id).map(e=>e.item),settings:state.threadSettings.get(state.thread.id)}));threadId=turnResult.thread.id;owned.add(threadId);
 assert.equal(turnResult.turn.status,'completed',JSON.stringify(turnResult.turn.error));assert.equal(turnResult.settings.model,'deepseek-flash');assert.equal(turnResult.settings.modelProvider,'deepseek');
 const history=(await call(page,'thread/turns/list',{threadId,itemsView:'full',sortDirection:'asc',limit:100})).data;nativeTurn=history.find(t=>t.id===turnResult.turn.id);assert(nativeTurn&&nativeTurn.status==='completed');
 assert(!nativeTurn.items.some(i=>['commandExecution','fileChange'].includes(i.type)),'Unexpected command or file write');
 const calls=nativeTurn.items.filter(i=>i.type==='mcpToolCall');assert(calls.length>=6);assert(calls.every(i=>i.server==='codex_web_databases'&&['list_databases','describe_database','query_database','read_result'].includes(i.tool)),'Unexpected MCP tool');for(const item of calls)data(item);
 assert(calls.some(i=>i.tool==='list_databases'));assert(calls.some(i=>i.tool==='describe_database'&&args(i).connection_id===connectionId&&args(i).table==='payment'));
 const queries=calls.filter(i=>i.tool==='query_database'),reads=calls.filter(i=>i.tool==='read_result');assert.equal(queries.length,2,'Must execute the two original queries without retries/fallbacks');assert.equal(reads.length,2,'Must read each actual query result once');assert(queries.every(i=>args(i).connection_id===connectionId));
 for(let index=0;index<sqls.length;index++){
  const query=queries.find(i=>canonical(args(i).query)===canonicalSqls[index]);assert(query,'Original SQL '+(index+1)+' was rewritten or omitted');
  const manifest=data(query);assert(manifest.complete&&manifest.resultId&&!manifest.rows);const read=reads.find(i=>args(i).result_id===manifest.resultId);assert(read,'Missing read_result for original SQL '+(index+1));const actual=data(read);assert.equal(actual.resultId,manifest.resultId);assert.deepEqual(actual.rows,expected[index]);
  results.push({name:index===0?'original_monthly_AND_CASE_DATE_FORMAT_query_and_read_result':'original_OR_query_and_read_result',status:'passed',evidence:{model:turnResult.settings.model,provider:turnResult.settings.modelProvider,query:args(query).query,resultId:manifest.resultId,rowCount:manifest.rowCount,rows:actual.rows,independentBaselineMatched:true,noQueryErrorOrFallback:true}});
 }
 const finalText=nativeTurn.items.filter(i=>i.type==='agentMessage').map(i=>i.text).join('\n').replace(/,/g,'');for(const row of expected[0]){assert(finalText.includes(row.month));assert(finalText.includes(String(row.payment_count)));assert(finalText.includes(row.revenue));}assert(finalText.includes('16044'));
 assert.deepEqual(baseline(),expected,'Database baseline changed');assert.equal(configHash(),originalConfigHash,'Global configuration changed');assert.equal(errors.length,0);
 await page.evaluate(()=>showView('chat'));await page.screenshot({path:path.join(out,'original-sql-native-flash.png')});
 results.push({name:'real_native_history_final_answer_and_unchanged_state',status:'passed',evidence:{threadId,turnId:nativeTurn.id,actualQueryCalls:queries.length,actualReadCalls:reads.length,finalText,browserErrors:0,databaseUnchanged:true,globalConfigUnchanged:true,noCommandsOrFileWrites:true,freshBrowserNativeAndMcp:true}});
}catch(error){results.push({name:'native_flash_sql_guard_regression',status:'failed',error:error.stack||error.message});console.error(error.stack||error.message);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{
 creating=false;for(const id of owned){try{await page.evaluate(async id=>{const turn=state.activeTurns.get(id);if(turn)await interruptTurn(id,turn);},id);await call(page,'thread/delete',{threadId:id});cleanup.push({threadId:id,deleted:true});}catch(error){cleanup.push({threadId:id,deleted:false,error:error.message});}}
 save();await browser.close();console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,browserErrors:errors,cleanup}));if(results.length!==3||results.some(r=>r.status==='failed')||errors.length||cleanup.some(r=>!r.deleted))process.exitCode=1;
}
