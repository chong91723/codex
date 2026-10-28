// The supported native process/spawn inherits the service environment in memory.
// No credential is read, serialized, copied to a file or printed. The child has
// independent CODEX_HOME/database state, so memory tests cannot pollute users.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {fileURLToPath} from 'node:url';import {spawn,spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=process.env.REPORT_DIR||path.join(root,'test-results/report-learning-isolated-2026-10-28');fs.mkdirSync(out,{recursive:true});
assert.equal(process.env.CODEX_CONFIRM_LIVE_MODEL_TEST,'1');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||path.join(root,'.toolchains/playwright/node_modules/playwright/index.mjs'));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN||path.join(root,'.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome'),args:['--no-sandbox']});
const page=await browser.newPage(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-learning-model-')),home=path.join(temp,'profile'),workspace=path.join(temp,'workspace');fs.mkdirSync(workspace,{mode:0o700});
const prepare=spawnSync('python3',['-B','-c','import sys;from pathlib import Path;sys.path.insert(0,"web");from start import deepseek_profile;deepseek_profile(Path(sys.argv[1]))',home],{cwd:root,encoding:'utf8'});assert.equal(prepare.status,0,prepare.stderr);
const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const handle='isolated-learning-audit-'+Date.now(),url='http://127.0.0.1:'+port,receipt={scope:'Actual Flash with separate profile/database registry, inherited env through native process/spawn; no credential retrieval',port,home,workspace,serviceStarted:false,serviceStopped:false,temporaryProfileRemoved:false};
const rpc=(method,params)=>page.evaluate(({method,params})=>rpc(method,params),{method,params});
let child;
try{
 await page.goto(process.env.CODEX_PARENT_WEB_URL||'http://127.0.0.1:8765');await page.waitForFunction(()=>typeof state!=='undefined'&&state.ready,null,{timeout:45000});
 await rpc('process/spawn',{processHandle:handle,command:['/usr/bin/python3','-B',path.join(root,'web/server.py'),'--codex',path.join(root,'native/bin/codex'),'--bind','127.0.0.1','--port',String(port),'--workspace',workspace],cwd:root,timeoutMs:null,outputBytesCap:16384,env:{CODEX_HOME:home,CODEX_WEB_DB_STATE:path.join(home,'web-databases'),CODEX_WEB_ANALYSIS_ROOTS:workspace,CODEX_WEB_TOKEN:null,CODEX_WEB_PUBLIC_DIR:null,CODEX_WEB_MEMORY_CHECK_INTERVAL:'5'}});
 receipt.serviceStarted=true;const deadline=Date.now()+45000;while(Date.now()<deadline){try{const response=await fetch(url);if(response.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 const env={...process.env,CODEX_CONFIRM_LIVE_MODEL_TEST:'1'};
 child=spawn(path.join(root,'.toolchains/databases/bin/python'),['-B',path.join(root,'web/tests/run_adventureworks_audit.py'),'--live-url',url,'--report-dir',out,'--phases',process.env.CODEX_AUDIT_PHASES||'corrections,learning-loop,configuration,native-memory-loop'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});receipt.testExitCode=code;
 assert(!fs.existsSync(path.join(home,'auth.json')),'ChatGPT credentials must not be created');
 if(code!==0)process.exitCode=1;
}catch(error){receipt.error=error.message;console.error(error.stack);process.exitCode=1;}
finally{
 if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
 const live=(pid,birth)=>{try{const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8').split(')').at(-1).trim().split(/\s+/);return !['Z','X'].includes(stat[0])&&(!birth||birth===stat[19]);}catch{return false;}};
 const pidFile=path.join(home,'web-memory/scheduler.json');let scheduler;
 try{scheduler=JSON.parse(fs.readFileSync(pidFile,'utf8'));}catch{}
 if(receipt.serviceStarted)try{await rpc('process/kill',{processHandle:handle});}catch(error){receipt.stopError=error.message;process.exitCode=1;}
 await browser.close();
 // A kill acknowledgment is not an exit receipt. Retain the profile on failed
 // cleanup instead of deleting files still used by a live owned process.
 if(scheduler?.ownerPid){const deadline=Date.now()+20000;while(Date.now()<deadline&&(live(scheduler.ownerPid)||live(scheduler.pid,scheduler.birth)))await new Promise(resolve=>setTimeout(resolve,200));receipt.serviceStopped=!live(scheduler.ownerPid);receipt.schedulerStopped=!live(scheduler.pid,scheduler.birth);try{receipt.schedulerLastState=JSON.parse(fs.readFileSync(pidFile,'utf8')).status;}catch{}}
 if(receipt.serviceStarted&&(!receipt.serviceStopped||!receipt.schedulerStopped)){receipt.cleanupError='Owned server or scheduler exit was not verified; isolated profile retained';process.exitCode=1;}
 else if(temp.startsWith(path.join(os.tmpdir(),'codex-learning-model-'))){fs.rmSync(temp,{recursive:true,force:true});receipt.temporaryProfileRemoved=true;}
 fs.writeFileSync(path.join(out,'isolated-service.json'),JSON.stringify(receipt,null,2)+'\n');
}
