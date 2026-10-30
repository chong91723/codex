// Validate only skills embedded in the pinned Codex source, with real Flash turns.
// No fixture skill is created or imported; network installs are deliberately outside scope.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {ready, call, prompt} from './skills_mcp_helpers.mjs';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = process.env.REPORT_DIR || '/tmp/codex-web-flash-followup-audit/skills';
const source = path.resolve(import.meta.dirname, '../../upstream/codex-rs/skills/src/assets/samples');
const retained = ['openai-docs', 'review-agent', 'skill-creator', 'skill-installer'];
fs.mkdirSync(out, {recursive:true});
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_BIN, args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:1440,height:900}});
const results = [], errors = [], sent = [], uploads = [];
page.on('request',request=>{if(new URL(request.url()).pathname==='/api/skills/upload')uploads.push({method:request.method()});});
let home, workspace, nativeSkills = [];
page.on('pageerror', e => errors.push(e.message));
page.on('websocket', socket => socket.on('framesent', frame => {
  try {
    const message = JSON.parse(String(frame.payload));
    if (message.method) sent.push({method:message.method, model:message.params?.model, threadId:message.params?.threadId,
      input:message.params?.input?.map(item => ({type:item.type,name:item.name,path:item.path}))});
  } catch {}
}));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function directoryFiles(root) {
  const files = [];
  for (const item of fs.readdirSync(root,{withFileTypes:true})) {
    if (item.name === '__pycache__') continue;
    const full = path.join(root,item.name);
    if (item.isDirectory()) files.push(...directoryFiles(full));
    else if (item.isFile()) files.push(full);
  }
  return files;
}
async function check(name, fn) {
  if (process.env.AUDIT_ONLY && !new RegExp(process.env.AUDIT_ONLY).test(name)) return;
  try {results.push({name,status:'passed',evidence:await fn()});console.log('PASS '+name);}
  catch(error) {results.push({name,status:'failed',error:error.message});console.log('FAIL '+name+': '+error.message);await page.screenshot({path:out+'/failure-'+results.length+'.png'});}
  fs.writeFileSync(out+'/results.json',JSON.stringify({results,errors,sent},null,2));
}
async function select(name) {
  assert.notEqual(name,'skill-installer','Installer product action selects a local file; it must not start an agent task');
  await page.locator('#new-chat').click();
  await page.locator('[data-view="settings"]').click();
  await page.locator('#analysis-advanced-settings').waitFor();
  if(!await page.locator('#analysis-advanced-settings').evaluate(node=>node.open))await page.locator('#analysis-advanced-settings > summary').click();
  await page.locator('#model').selectOption('deepseek-flash');
  await page.locator('#effort').selectOption('low');
  await page.locator('[data-view="skills"]').click();
  const card=page.locator('.skill-card[data-skill-name="'+name+'"]');
  await card.getByRole('button',{name:'在分析中使用',exact:true}).click();
  assert.equal(await page.locator('#prompt').inputValue(),'$'+name+' ');
}
async function selectedTurn(name,text,timeout=240000) {
  await select(name);
  const before = sent.filter(item=>item.method==='turn/start').length;
  const result = await prompt(page,'$'+name+' '+text,false,timeout);
  assert.equal(result.settings.modelProvider,'deepseek');
  assert.equal(result.settings.model,'deepseek-flash');
  const turns = sent.filter(item=>item.method==='turn/start').slice(before);
  assert.equal(turns.length,1,'Exactly one native task should be sent');
  assert(turns[0].input.some(item=>item.type==='skill'&&item.name===name&&item.path===home+'/skills/.system/'+name+'/SKILL.md'),'Native UserInput.skill missing');
  const commands = result.items.filter(item=>item.type==='commandExecution');
  const answer = result.items.filter(item=>item.type==='agentMessage').map(item=>item.text).join('\n');
  assert(commands.some(item=>item.exitCode===0),'No real successful native command');
  assert(!commands.some(item=>/\b(curl|wget)\b|https?:\/\//i.test(item.command||'')),'Offline native-skill test attempted network command');
  return {result,commands,answer,evidence:{skill:name,provider:result.settings.modelProvider,model:result.settings.model,threadId:await page.evaluate(()=>state.thread.id),structuredSkillInput:true,commands:commands.map(item=>({command:item.command,exitCode:item.exitCode,output:item.aggregatedOutput}))}};
}
try {
  await page.goto(process.env.CODEX_WEB_URL||'http://127.0.0.1:8785');
  await ready(page);
  home = await page.evaluate(()=>state.runtimeInfo.codexHome);
  workspace = await page.evaluate(()=>state.selectedCwd);
  assert(home.startsWith('/tmp/')&&home.includes('audit'),'Isolated audit CODEX_HOME required');
  assert(workspace.startsWith('/tmp/')&&workspace.includes('audit'),'Isolated audit workspace required');
  assert(!fs.existsSync(home+'/auth.json'),'ChatGPT auth must not be present');

  await check('原生来源与列表：仅源码内置技能，openai-docs 保留，生图禁用',async()=>{
    const discovered = fs.readdirSync(source).filter(name=>fs.existsSync(path.join(source,name,'SKILL.md'))).sort();
    assert.deepEqual(discovered,['imagegen',...retained].sort());
    const response = await call(page,'skills/list',{cwds:[workspace],forceReload:true});
    nativeSkills = (response.data||[]).flatMap(group=>group.skills||[]);
    assert(nativeSkills.length>=4);
    assert(nativeSkills.every(item=>['imagegen',...retained].includes(item.name)),'Non-native skill still discovered');
    const hashes = {};
    for (const name of retained) {
      const metadata = nativeSkills.find(item=>item.name===name);
      assert(metadata&&metadata.enabled!==false,'Native skill unavailable: '+name);
      assert.equal(metadata.path,home+'/skills/.system/'+name+'/SKILL.md');
      const mismatches = [];
      const files = directoryFiles(path.join(source,name));
      for(const file of files) {
        const relative = path.relative(path.join(source,name),file);
        const installed = path.join(home,'skills/.system',name,relative);
        if(!fs.existsSync(installed)||sha(file)!==sha(installed))mismatches.push(relative);
      }
      assert.deepEqual(mismatches,[],'Native cache differs from pinned source: '+name);
      hashes[name]={files:files.length,skillSha256:sha(path.join(source,name,'SKILL.md'))};
    }
    const image = nativeSkills.find(item=>item.name==='imagegen');
    if(image)assert.equal(image.enabled,false,'Excluded imagegen must be disabled natively');
    await page.locator('[data-view="skills"]').click();
    await page.locator('.skill-card').first().waitFor();
    assert.deepEqual((await page.locator('.skill-card').evaluateAll(nodes=>nodes.map(node=>node.dataset.skillName))).sort(),[...retained].sort());
    await page.screenshot({path:out+'/native-skills-page.png'});
    return{embedded:discovered,retained,allRetainedFilesMatchSource:true,hashes,imagegenNativeDisabled:!image||image.enabled===false,nonNativeListed:false};
  });

  await check('review-agent：技能页选择、原生 Skill 输入与真实只读缺陷审查',async()=>{
    const target = path.join(workspace,'native-review-case-'+Date.now());
    fs.mkdirSync(target,{recursive:true});
    function git(args){const result=spawnSync('git',args,{cwd:target,encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
    git(['init','--quiet']);git(['config','user.name','Codex Web Audit']);git(['config','user.email','audit@example.invalid']);
    const file = path.join(target,'first_positive.py');
    const correct = 'def first_positive(values):\n    """Return first strictly positive value, or None."""\n    for value in values:\n        if value > 0:\n            return value\n    return None\n';
    fs.writeFileSync(file,correct);git(['add','first_positive.py']);git(['commit','--quiet','-m','Baseline correct positive selection']);
    const changed=correct.replace('value > 0','value >= 0');fs.writeFileSync(file,changed);
    const {answer,commands,evidence}=await selectedTurn('review-agent',`请只读审查 ${target} 这个独立 git 仓库的未提交变更。函数契约是返回第一个严格大于零的值。检查真实 git diff 和相关代码，指出新引入、可复现的缺陷及具体触发输入；不要修改文件、创建提交、联网或委派。使用原生命令工具读取，sandbox_permissions="use_default"，省略 justification/prefix_rule。`);
    assert.equal(fs.readFileSync(file,'utf8'),changed,'Read-only review modified target');
    assert(commands.some(item=>String(item.command).includes('git')&&String(item.command).includes('diff')),'No actual diff inspection');
    assert(/\[P[0-3]\]/.test(answer)&&/0|零/.test(answer),'Expected actionable zero-value regression was not reported');
    return{...evidence,realGitDiffInspected:true,readOnlyTargetPreserved:true,actionableFinding:true};
  });

  await check('skill-creator：运行源码自带验证器校验原生技能，不新建自定义技能',async()=>{
    const root=home+'/skills/.system';
    const {commands,evidence}=await selectedTurn('skill-creator',`对已经安装的原生技能做一次离线结构验收，不创建、安装或修改任何技能。请实际运行 python3 -B ${root}/skill-creator/scripts/quick_validate.py，分别验证 ${root}/skill-creator、${root}/skill-installer、${root}/openai-docs、${root}/review-agent 四个目录。运行原生命令工具，sandbox_permissions="use_default"，省略 justification/prefix_rule。依据真实标准输出报告，不联网。`);
    assert(commands.some(item=>String(item.command).includes('quick_validate.py')),'Native validator was not run');
    assert(commands.filter(item=>item.exitCode===0).map(item=>item.aggregatedOutput||'').join('\n').match(/Skill is valid!/g)?.length>=4,'Four native validations did not complete');
    return{...evidence,nativeValidatorActuallyExecuted:true,validatedNativeSkills:retained,customSkillCreated:false};
  });

  await check('skill-installer：本地上传入口，不触发模型或在线下载安装',async()=>{
    await page.locator('[data-view="skills"]').click();
    const card=page.locator('.skill-card[data-skill-name="skill-installer"]');
    await card.waitFor();
    assert.equal(await card.getByRole('button',{name:'在分析中使用',exact:true}).count(),0);
    await card.getByText(/GitHub 在线下载流程未接入本产品/).waitFor();
    const before=sent.filter(item=>['turn/start','turn/steer'].includes(item.method)).length,uploaded=uploads.length;
    const draft=await page.evaluate(()=>({text:document.querySelector('#prompt').value,skills:composerState().skills||[]}));
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),card.getByRole('button',{name:'上传本地技能',exact:true}).click()]);
    assert.equal(chooser.isMultiple(),false);
    assert.equal(await page.locator('#skill-upload-file').evaluate(node=>node.files.length),0);
    assert.equal(await page.locator('#skill-upload-file').getAttribute('accept'),'.zip,.md');
    assert.equal(await page.locator('.skill-upload').getByRole('button',{name:'上传技能',exact:true}).count(),1);
    assert.equal(sent.filter(item=>['turn/start','turn/steer'].includes(item.method)).length,before);
    assert.equal(uploads.length,uploaded);
    assert.deepEqual(await page.evaluate(()=>({text:document.querySelector('#prompt').value,skills:composerState().skills||[]})),draft);
    return{localFileChooserOpened:true,agentTasksStarted:0,uploadsSubmitted:0,skillInstalled:false,onlineListing:'outside_product_install_path',onlineInstallation:'outside_product_install_path'};
  });

  await check('openai-docs：保留原生绑定与离线参考读取，官方在线检索受网络条件阻塞',async()=>{
    const reference=home+'/skills/.system/openai-docs/references/codex-self-knowledge.md';
    const {commands,evidence}=await selectedTurn('openai-docs',`当前禁止访问国际公网，且没有本地官方文档服务。本次只验收已安装原生技能的离线参考链，不要求最新产品事实。请实际读取本地 ${reference}，概括本地技能发现与配置说明的查阅路径，并明确这仅依据随源码安装的本地参考，官方在线检索本轮未验证。用户网络约束优先于技能的在线检索步骤；不要查询网页、下载内容或创建文件。使用原生命令工具读取，sandbox_permissions="use_default"，省略 justification/prefix_rule。`);
    assert(commands.some(item=>item.exitCode===0&&String(item.command).includes('codex-self-knowledge.md')),'Local original reference not read');
    return{...evidence,nativeReferenceRead:true,officialOnlineDocumentation:'blocked_by_target_network_scope',chatgptLoginUsed:false};
  });
} finally {
  const report={scope:'Pinned-source built-in skills only; real DeepSeek Flash turns and native structured skill inputs; no custom skill fixtures, no ChatGPT auth, installer card opens local file chooser without model execution or online installations',results,errors,sent,conditions:{onlineSkillInstallation:'outside_product_install_path',openaiDocsOnlineRetrieval:'not_verified_target_network_scope'}};
  fs.writeFileSync(out+'/results.json',JSON.stringify(report,null,2));
  await browser.close();
  console.log(JSON.stringify({passed:results.filter(item=>item.status==='passed').length,failed:results.filter(item=>item.status==='failed').length,errors}));
  if(results.some(item=>item.status==='failed')||errors.length)process.exitCode=1;
}
