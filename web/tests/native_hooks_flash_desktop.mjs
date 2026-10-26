// Source-native command hooks with thread-local config only; no global writes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {ready,call,prompt} from './skills_mcp_helpers.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.CODEX_WEB_URL||'http://127.0.0.1:8789';
const out=path.resolve(process.env.ARTIFACT_DIR||'/root/Codex/test-results/flash-followup-2026-10-26/hooks-current');
const expectedWorkspace=process.env.CODEX_TEST_WORKSPACE||'/tmp/codex-web-flash-final-audit/workspace';
assert(expectedWorkspace.startsWith('/tmp/'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),results=[],errors=[],sent=[],nativeHookEvents=[];
page.setDefaultTimeout(30000);
let home,baselineHash,baselineConfig,workspace,report={};
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{
 socket.on('framesent',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method)sent.push({method:m.method,threadId:m.params?.threadId,model:m.params?.model,keyPath:m.params?.keyPath});}catch{}});
 socket.on('framereceived',frame=>{try{const m=JSON.parse(String(frame.payload));if(m.method&&/hook/i.test(m.method))nativeHookEvents.push(m);}catch{}});
});
try{
 await page.goto(base);await ready(page);
 home=await page.evaluate(()=>state.runtimeInfo.codexHome);assert(home.startsWith('/tmp/')&&home.includes('flash'));assert.equal(await page.evaluate(()=>state.status.workspace),expectedWorkspace);
 baselineHash=digest(path.join(home,'config.toml'));
 baselineConfig=(await call(page,'config/read',{includeLayers:false,cwd:expectedWorkspace})).config;
 workspace=path.join(expectedWorkspace,'hooks-acceptance-'+Date.now());fs.mkdirSync(workspace,{recursive:true});
 const log=path.join(workspace,'native-hook-events.jsonl');
 const command='python3 /root/Codex/web/tests/hook_fixture.py '+log;
 const eventNames=['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','Stop'];
 const declarations=Object.fromEntries(eventNames.map(event=>[event,[{hooks:[{type:'command',command,timeout:10}]}]]));
 const params={cwd:workspace,model:'deepseek-flash',config:{'features.hooks':true,hooks:declarations}};
 const probe=await call(page,'thread/start',params);
 const catalog=await call(page,'hooks/list',{threadId:probe.thread.id});
 const metadata=(catalog.data||[]).flatMap(entry=>entry.hooks||[]).filter(hook=>hook.command===command);
 assert.equal(metadata.length,eventNames.length,'Thread-local hook declarations were not discovered by native hooks/list');
 const state=Object.fromEntries(metadata.map(hook=>[hook.key,{trusted_hash:hook.currentHash}]));
 const probeLog=fs.existsSync(log)?fs.readFileSync(log,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
 if(fs.existsSync(log))fs.unlinkSync(log);
 const started=await call(page,'thread/start',{...params,config:{'features.hooks':true,hooks:{...declarations,state}}});
 assert.equal(started.model,'deepseek-flash');assert.equal(started.modelProvider,'deepseek');
 const activeCatalog=await call(page,'hooks/list',{threadId:started.thread.id});
 const loaded=(activeCatalog.data||[]).flatMap(entry=>entry.hooks||[]).filter(hook=>hook.command===command);
 assert.equal(loaded.length,5);assert(loaded.every(hook=>hook.enabled&&['trusted','builtin','managed'].includes(hook.trustStatus)),'Native hook trust was not accepted: '+JSON.stringify(loaded.map(hook=>({event:hook.eventName,trust:hook.trustStatus}))));
 await page.evaluate(r=>{resetChat();state.threadSettings.set(r.thread.id,{model:r.model,modelProvider:r.modelProvider,serviceTier:r.serviceTier,collaborationMode:r.collaborationMode,sandboxPolicy:r.sandbox,approvalPolicy:r.approvalPolicy,approvalsReviewer:r.approvalsReviewer,effort:r.reasoningEffort});adoptThread(r.thread);showView('chat');},started);
 await page.locator('#model').selectOption('deepseek-flash');await page.locator('#effort').selectOption('low');
 const result=await prompt(page,'这是独立目录的原生Hooks验收。只用 exec_command（sandbox_permissions="use_default"，省略 justification 与 prefix_rule）执行 printf HOOK_FLASH_NATIVE_OK > hook-agent-result.txt，再用 cat 读取该文件。最后简短回复 HOOKS_COMPLETE。不要访问网络，不创建技能或其他代理。',false,180000);
 assert.equal(result.settings.model,'deepseek-flash');assert.equal(result.settings.modelProvider,'deepseek');
 assert(result.items.some(item=>item.type==='commandExecution'&&item.exitCode===0&&JSON.stringify(item).includes('HOOK_FLASH_NATIVE_OK')),'Real command was not executed');
 assert.equal(fs.readFileSync(path.join(workspace,'hook-agent-result.txt'),'utf8'),'HOOK_FLASH_NATIVE_OK');
 const deadline=Date.now()+30000;
 let received=[];
 do{if(fs.existsSync(log))received=fs.readFileSync(log,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));if(eventNames.every(name=>received.some(event=>event.event===name)))break;assert(Date.now()<deadline,'Native hooks did not emit all five lifecycle events: '+JSON.stringify(received));await page.waitForTimeout(100);}while(true);
 assert.equal(digest(path.join(home,'config.toml')),baselineHash,'Global config file changed');
 const after=(await call(page,'config/read',{includeLayers:false,cwd:expectedWorkspace})).config;
 assert(isDeepStrictEqual(after,baselineConfig),'Global effective configuration changed at keys: '+Object.keys(after).filter(key=>!isDeepStrictEqual(after[key],baselineConfig[key])).join(', '));
 assert(!sent.some(message=>['config/value/write','config/batchWrite'].includes(message.method)),'Test wrote global settings');
 assert(!sent.some(message=>message.method.startsWith('account/')));
 results.push({name:'线程级原生Hook发现、信任及五类真实生命周期事件',status:'passed',evidence:{threadId:started.thread.id,probeThreadId:probe.thread.id,workspace,model:result.settings.model,provider:result.settings.modelProvider,events:received,probeEvents:probeLog,trustedHookCount:loaded.length,metadata:loaded.map(hook=>({event:hook.eventName,key:hook.key,currentHash:hook.currentHash,trustStatus:hook.trustStatus})),realCommandAndFile:true,globalConfigUnchanged:true,noGlobalWrites:true}});
 report.status='passed';console.log('PASS thread-local native hooks and five actual lifecycle events with Flash');
}catch(error){report.status='failed';report.error=error.stack||error.message;results.push({name:'线程级原生Hooks',status:'failed',error:report.error});console.log('FAIL '+error.message);await page.screenshot({path:path.join(out,'hooks-failure.png')}).catch(()=>{});process.exitCode=1;}
finally{
 report={...report,scope:'Only deepseek-flash. Existing upstream-compatible hook fixture. Thread-local declarations/trust only, no shared config or policy mutation.',base,home,workspace,results,errors,sent,nativeHookEvents,baselineConfigSha256:baselineHash,finalConfigSha256:home?digest(path.join(home,'config.toml')):null};
 fs.writeFileSync(path.join(out,'hooks-results.json'),JSON.stringify(report,null,2));await browser.close();if(errors.length)process.exitCode=1;
}
