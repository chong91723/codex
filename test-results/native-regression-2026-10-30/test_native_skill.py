from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,time,sys
B=Path('/tmp/codex-audit-20261030');name=sys.argv[1];out=B/('T08-'+name+'.json')
def ctl(code,t=40):
 p=subprocess.run(['python3','-B',str(B/'call_driver.py'),str(t)],input=code,text=True,capture_output=True,timeout=t+5);x=json.loads(p.stdout);assert x['ok'],x.get('error');return x['result']
workspace=json.loads((B/'context.json').read_text())['workspace'];artifact=Path(workspace)/'test-artifacts';artifact.mkdir(exist_ok=True)
(artifact/'review_candidate.py').write_text('def mean(values):\n    return sum(values) / len(values)\n\ndef latest(rows):\n    return sorted(rows, key=lambda row: row["at"])[0]\n')
tasks={
'openai-docs':'请使用已选择的 openai-docs 技能，只核对本机固定版本 Codex 源码 /root/Codex/upstream/codex-rs/app-server-protocol 中 turn/interrupt 请求参数，说明 threadId 和 turnId 的作用。不要访问公网、ChatGPT 账户、业务数据库，不修改文件，不保存记忆；给出实际阅读到的本地依据，读不到就说明。',
'review-agent':'请使用已选择的 review-agent 技能，对 '+str(artifact/'review_candidate.py')+' 做一次只读审查，定位可实际触发的边界条件问题。不要修改文件，不查询数据库，不访问公网，不保存记忆。审查结果只作为测试输出，不由主测试者认定业务对错。',
'skill-creator':'请使用已选择的 skill-creator 技能，在 '+str(artifact/'uninstalled-skill-draft')+' 创建一个最小有效的、与具体业务无关的分析限制检查技能草稿，并实际运行原生技能提供的验证脚本。它只是测试文档：禁止安装到 .agents/skills 或任何用户技能目录，禁止启用，禁止下载依赖、访问公网或查询数据库，禁止新增记忆。只能写上述草稿目录。',
'skill-installer':'请使用已选择的 skill-installer 技能，检查当前 CODEX_HOME 中已经安装的 Codex 源码自带技能，以及原生安装脚本支持的参数。仅读取本地技能说明、脚本帮助和安装目录，不访问公网、不下载、不安装、不修改技能，不查询数据库或新增记忆。明确区分已实测的本地检查和未执行的在线安装。'}
receipt={'case':'T30-008','skill':name,'model':'deepseek-flash','startedAt':datetime.now(timezone.utc).isoformat(),'onlineInstallRequested':False,'customSkillInstalled':False}
try:
 ctl('await native.locator("#new-chat").click();await native.evaluate(()=>showView("skills"));const search=native.getByRole("searchbox",{name:"搜索技能名称或用途"});await search.fill('+json.dumps(name)+');await native.locator(".skill-card[data-skill-name='+name+']").getByRole("button",{name:"在分析中使用",exact:true}).click();const prefix=await native.locator("#prompt").inputValue();await native.locator("#prompt").fill(prefix+'+json.dumps(tasks[name])+');await native.locator("#send").click();return {submitted:true};',60)
 deadline=time.monotonic()+240
 while time.monotonic()<deadline:
  s=ctl('return await snap(native);');receipt['latest']=s
  if s.get('turns') and s['turns'][-1]['status'] in ('completed','failed','interrupted') and s['execution']['status']=='idle':break
  time.sleep(2)
 else:receipt['timedOut']=True;ctl('if(!await native.locator("#send").isDisabled())await native.locator("#send").click();return {stopRequested:true};')
 receipt['finishedAt']=datetime.now(timezone.utc).isoformat();receipt['retainedNativeSkillMention']=any(any(c.get('type')=='skill' and c.get('name')==name for c in x['item'].get('content',[])) for x in receipt.get('latest',{}).get('items',[]) if x['item']['type']=='userMessage');receipt['newCustomSkillDirs']=[str(p) for folder in (Path(workspace)/'.agents/skills',Path(json.loads((B/'context.json').read_text())['home'])/'skills') if folder.exists() for p in folder.iterdir() if p.is_dir() and p.name!='.system'];receipt['nativeStatus']=receipt.get('latest',{}).get('turns',[{}])[-1].get('status')
finally:
 out.write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in receipt.items() if k!='latest'},ensure_ascii=False))
