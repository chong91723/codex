// One natural multi-question user turn; actual native database tools and independent SQL baseline.
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
const out=path.resolve(process.env.ARTIFACT_DIR||'test-results/final-fixes-2026-10-26/database-multiquestion');fs.mkdirSync(out,{recursive:true});
const credentials=process.env.CODEX_DATABASE_CREDENTIALS||'/tmp/codex-database-work/fixture-credentials.json';
const baselineCode=`import json,sys,decimal,pymysql\nsecrets=json.load(open(sys.argv[1]))\nconnection=pymysql.connect(host='127.0.0.1',port=13306,user='codex_reader',password=secrets['mysql']['password'],database='sakila',autocommit=False,connect_timeout=5,read_timeout=15)\ntry:\n cursor=connection.cursor(pymysql.cursors.DictCursor)\n cursor.execute('START TRANSACTION READ ONLY')\n result={}\n for name,sql in [('rentals','SELECT COUNT(*) AS rental_count FROM rental'),('payments','SELECT COUNT(*) AS payment_count,SUM(amount) AS total_amount,AVG(amount) AS average_amount,ROUND(AVG(amount),2) AS rounded_average FROM payment'),('top_categories','SELECT c.name,COUNT(r.rental_id) AS rental_count FROM category c JOIN film_category fc ON fc.category_id=c.category_id JOIN inventory i ON i.film_id=fc.film_id JOIN rental r ON r.inventory_id=i.inventory_id GROUP BY c.category_id,c.name ORDER BY rental_count DESC,c.name LIMIT 3')]:\n  cursor.execute(sql);result[name]=cursor.fetchall()\n print(json.dumps(result,default=lambda value:str(value) if isinstance(value,decimal.Decimal) else value))\nfinally:\n connection.rollback();connection.close()\n`;
const baseline=()=>JSON.parse(execFileSync(process.env.DATABASE_PYTHON||'/root/Codex/.toolchains/databases/bin/python',['-c',baselineCode,credentials],{encoding:'utf8'}));
const configHash=()=>crypto.createHash('sha256').update(fs.readFileSync(path.join(home,'config.toml'))).digest('hex');
const initialConfigHash=configHash(),expected=baseline();
fs.writeFileSync(path.join(out,'independent-baseline.json'),JSON.stringify(expected,null,2));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),requests=[],events=[],errors=[],owned=new Set(),cleanup=[],results=[];
let ownCreate=false,threadId,turnResult,nativeTurn;
const instruction='请使用已配置的 Sakila 数据库（连接 ID：'+connectionId+'），一次回答下面三个问题：\n1. 全库累计发生了多少笔租借？\n2. 共有多少笔付款，付款总金额是多少，平均每笔金额是多少？金额保留两位小数。\n3. 租借次数最多的前三个电影类型是什么，各有多少笔租借？请按租借记录统计，避免联表重复计数。\n请实际使用 codex_web_databases 的工具查询并读取结果，分别给出三个问题的答案和简要统计口径。不要用 shell、文件命令或其他工具替代数据库 MCP，也不要修改数据。';
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{
 socket.on('framesent',frame=>{try{const message=JSON.parse(String(frame.payload));if(message.method)requests.push(message);}catch{}});
 socket.on('framereceived',frame=>{try{const message=JSON.parse(String(frame.payload));if(message.method){events.push(message);if(ownCreate&&message.method==='thread/started'&&message.params?.thread?.cwd===workspace)owned.add(message.params.thread.id);}}catch{}});
});
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({base,home,workspace,connectionId,instruction,model:'deepseek-flash',provider:'deepseek',baseline:expected,results,browserErrors:errors,cleanup,requests,events,turnResult,nativeTurn},null,2));
function data(item){assert.equal(item.status,'completed',item.tool+' did not complete');assert(!item.error,item.tool+' returned error');const result=item.result;assert(result,'Missing native MCP result');if(result.structuredContent)return result.structuredContent;for(const part of result.content||[]){if(part.type==='text'){try{return JSON.parse(part.text);}catch{}}}throw Error('Missing structured database result');}
try{
 await page.goto(base);await ready(page);
 assert.equal(await page.evaluate(()=>state.runtimeInfo.codexHome),home);assert.equal(await page.evaluate(()=>state.status.workspace),workspace);
 await page.locator('[data-view=databases]').click();const card=page.locator('[data-connection-id="'+connectionId+'"]');await card.getByText('已连接',{exact:true}).waitFor();assert.match(await card.innerText(),/sakila/i);
 await page.locator('#new-chat').click();await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');
 ownCreate=true;await page.locator('#prompt').fill(instruction);await page.locator('#prompt').press('Enter');
 let done=false,failure;const terminal=page.waitForFunction(()=>state.thread&&state.turns.at(-1)?.status&&state.turns.at(-1).status!=='inProgress',null,{timeout:240000}).then(()=>{done=true;},error=>{done=true;failure=error;});let approvals=0;
 while(!done){const allow=page.getByRole('button',{name:'允许本次 MCP 调用',exact:true});if(await allow.isVisible()){const params=await page.evaluate(()=>[...state.requests.values()].map(request=>request.params));assert(params.every(value=>!value._meta?.tool_params?.connection_id||value._meta.tool_params.connection_id===connectionId),'Unexpected database approval target');assert(++approvals<=20,'Unexpected repeated approvals');await allow.click();}await page.waitForTimeout(150);}
 await terminal;if(failure)throw failure;
 turnResult=await page.evaluate(()=>({thread:state.thread,turn:state.turns.at(-1),items:[...state.items.values()].filter(entry=>entry.turnId===state.turns.at(-1)?.id).map(entry=>entry.item),settings:state.threadSettings.get(state.thread.id)}));
 threadId=turnResult.thread.id;owned.add(threadId);assert.equal(turnResult.turn.status,'completed',JSON.stringify(turnResult.turn.error));assert.equal(turnResult.settings.model,'deepseek-flash');assert.equal(turnResult.settings.modelProvider,'deepseek');
 const history=(await call(page,'thread/turns/list',{threadId,itemsView:'full',sortDirection:'asc',limit:100})).data;nativeTurn=history.find(turn=>turn.id===turnResult.turn.id);assert(nativeTurn);assert.equal(nativeTurn.status,'completed');
 assert(!nativeTurn.items.some(item=>item.type==='commandExecution'),'Model used commands instead of database MCP');
 const toolCalls=nativeTurn.items.filter(item=>item.type==='mcpToolCall');assert(toolCalls.length>0);assert(toolCalls.every(item=>item.server==='codex_web_databases'),'Model used an unrelated MCP server');
 const queries=toolCalls.filter(item=>item.tool==='query_database'),reads=toolCalls.filter(item=>item.tool==='read_result');assert(queries.length&&reads.length,'Missing actual query_database or read_result');assert(queries.every(item=>item.arguments.connection_id===connectionId));
 const manifests=queries.flatMap(item=>{const result=data(item);return result.results||[result];});assert(manifests.length>=1,'Actual query result references missing');const resultIds=new Set(manifests.map(value=>value.resultId));const pages=reads.map(item=>data(item));assert(pages.every(value=>resultIds.has(value.resultId)),'Read result did not come from the actual query');
 const rows=pages.flatMap(value=>value.rows||[]),numbers=rows.flatMap(row=>Object.values(row)).filter(value=>typeof value==='number'||typeof value==='string'&&/^[-+]?\d+(?:\.\d+)?$/.test(value)).map(Number);
 const rent=expected.rentals[0].rental_count,pay=expected.payments[0];assert(numbers.filter(value=>value===rent).length>=2,'Actual read results missing rental/payment counts');assert(numbers.some(value=>Math.abs(value-Number(pay.total_amount))<0.00001),'Actual total amount differs');assert(numbers.some(value=>Math.abs(value-Number(pay.average_amount))<0.005),'Actual average differs');
 for(const category of expected.top_categories)assert(rows.some(row=>Object.values(row).includes(category.name)&&Object.values(row).some(value=>Number(value)===category.rental_count)),'Actual category result differs: '+category.name);
 const finalText=nativeTurn.items.filter(item=>item.type==='agentMessage').map(item=>item.text).join('\n'),normalized=finalText.replace(/,/g,'');assert((normalized.match(new RegExp(String(rent),'g'))||[]).length>=2,'Final answer omitted separate rental/payment counts');assert(normalized.includes(pay.total_amount),'Final answer omitted correct payment total');assert(normalized.includes(pay.rounded_average),'Final answer omitted rounded average');for(const category of expected.top_categories)assert(normalized.includes(category.name)&&normalized.includes(String(category.rental_count)),'Final answer omitted top category '+category.name);assert(/租借/.test(finalText)&&/付款|支付/.test(finalText)&&/平均/.test(finalText),'Not all three question topics answered');
 assert.deepEqual(baseline(),expected,'Independent read-only baseline changed during model task');assert.equal(configHash(),initialConfigHash,'Global configuration changed during this audit');assert.equal(errors.length,0,'Browser errors observed');
 await page.locator('.thread-row[data-thread-id="'+threadId+'"]').click();await page.waitForFunction(id=>state.thread?.id===id&&!state.threadLoading,threadId);await page.screenshot({path:path.join(out,'multiquestion-desktop.png')});
 results.push({name:'one_normal_chat_turn_answers_three_questions_from_real_database_results',status:'passed',evidence:{threadId,turnId:nativeTurn.id,model:turnResult.settings.model,provider:turnResult.settings.modelProvider,actualQueryCalls:queries.length,actualReadCalls:reads.length,actualResultSets:manifests.length,legalBatchQueriesAccepted:true,independentSqlMatched:true,databaseUnchanged:true,globalConfigUnchanged:true,finalText}});
}catch(error){results.push({name:'one_normal_chat_turn_answers_three_questions_from_real_database_results',status:'failed',error:error.stack||error.message});console.error(error.message);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{
 ownCreate=false;for(const id of owned){try{await page.evaluate(async id=>{const turn=state.activeTurns.get(id);if(turn)await interruptTurn(id,turn);},id);await call(page,'thread/delete',{threadId:id});cleanup.push({threadId:id,deleted:true});}catch(error){cleanup.push({threadId:id,deleted:false,error:error.message});}}
 save();await browser.close();console.log(JSON.stringify({passed:results.filter(value=>value.status==='passed').length,failed:results.filter(value=>value.status==='failed').length,browserErrors:errors,cleanup}));if(results.length!==1||results.some(value=>value.status==='failed')||errors.length||cleanup.some(value=>!value.deleted))process.exitCode=1;
}
