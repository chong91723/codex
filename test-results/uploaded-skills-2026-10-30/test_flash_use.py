from case_helpers import *
import hashlib
rec={'case':'uploaded-skills-native-Flash-execution','startedAt':utc(),'model':'deepseek-flash'}
try:
 idle();rec['registered']=ctl('return await native.evaluate(()=>state.uploadedSkills);');proof=next(s for s in rec['registered'] if s['name']=='uploaded-skill-proof');doc=Path(proof['path']);rec['packageBefore']={str(p.relative_to(doc.parent)):hashlib.sha256(p.read_bytes()).hexdigest() for p in doc.parent.rglob('*') if p.is_file()};output=B/'live/workspace/acceptance/uploaded-skill-proof.json';assert not output.exists()
 prompt='$uploaded-skill-proof $Uploaded Data Helper\n请实际使用这两个已上传的技能做本地调用验收。先阅读主技能的references/format.md，然后调用附带scripts/proof.py，--text 使用 upload acceptance context，--output 使用 '+str(output)+'，--hold 使用12。等待真实脚本完成，最终只报告实际成功标记和输出文件路径，附上helper要求的标记。不得下载依赖、访问网络、切换模型、保存记忆或查询数据库；脚本错误就真实报告，不假称成功。'
 rec['submission']=submit(prompt);end=time.monotonic()+180
 while time.monotonic()<end:
  s=snap();cmd=[e for e in s['items'] if e['turnId']==rec['submission']['turnId'] and e['item'].get('type')=='commandExecution' and 'proof.py' in str(e['item']) and e['item'].get('status')=='inProgress']
  if cmd:break
  if terminal_once(submission=rec['submission'],snapshot=s):raise AssertionError('No real script execution window observed')
  time.sleep(.2)
 else:raise TimeoutError('No real skill script command observed; do not replay')
 rec['inflight']=s
 rec['removeDuringExecution']=ctl('return await native.evaluate(async payload=>{const r=await fetch("/api/skills/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});return {status:r.status,body:await r.json()};},'+json.dumps({'id':proof['id'],'expectedVersion':proof['version']})+');');assert rec['removeDuringExecution']['status']>=400,rec['removeDuringExecution'];assert doc.exists()
 rec['disableDuringExecution']=ctl('return await raw(native,"skills/config/write",'+json.dumps({'path':proof['path'],'enabled':False})+');');assert rec['disableDuringExecution'].get('error',{}).get('data',{}).get('type')=='userExecutionBusy',rec['disableDuringExecution']
 rec['managementUi']=ctl('await native.locator("[data-view=skills]").first().click();await native.getByRole("heading",{name:"技能",exact:true}).waitFor();const card=native.locator(".skill-card[data-skill-name=uploaded-skill-proof]");return {uploadDisabled:await native.getByRole("button",{name:"上传技能",exact:true}).isDisabled(),removeDisabled:await card.getByRole("button",{name:"移除",exact:true}).isDisabled(),toggleDisabled:await card.getByRole("button",{name:"停用",exact:true}).isDisabled()};');assert all(rec['managementUi'].values()),rec['managementUi']
 rec['final']=terminal(240,submission=rec['submission']);rec['wire']=wire(submission=rec['submission']);assert output.is_file(),'No native-generated proof artifact';rec['actualFile']=json.loads(output.read_text());assert rec['actualFile']['marker']=='UPLOAD_SKILL_OK';assert rec['actualFile']['sha256']==hashlib.sha256(b'upload acceptance context').hexdigest();assert rec['actualFile']['text']=='upload acceptance context'
 commands=[e['item'] for e in rec['final']['items'] if e['turnId']==rec['submission']['turnId'] and e['item'].get('type')=='commandExecution'];assert any(x.get('status')=='completed' and 'proof.py' in str(x) for x in commands),'Script command did not complete';answer=messages(rec['final']);assert 'UPLOAD_SKILL_OK' in answer and 'MULTIWORD_SKILL_OK' in answer,answer
 starts=[w['data'] for w in rec['wire'] if w.get('direction')=='sent' and w.get('data',{}).get('method')=='turn/start'];assert len(starts)==1;selected=[x for x in starts[0]['params']['input'] if x['type']=='skill'];assert {x['name'] for x in selected}=={'uploaded-skill-proof','Uploaded Data Helper'},selected
 rec['packageAfter']={str(p.relative_to(doc.parent)):hashlib.sha256(p.read_bytes()).hexdigest() for p in doc.parent.rglob('*') if p.is_file()};assert rec['packageAfter']==rec['packageBefore'],'Skill package was modified while using it';rec['actualNativeInputs']=selected;rec['passed']=True
 ctl('await native.evaluate(()=>showView("chat"));return true;');ctl('await native.screenshot({path:"/tmp/codex-uploaded-skills-20261030/flash-use.png"});return true;')
finally:
 rec['finishedAt']=utc();save('flash-use',rec);print(json.dumps({k:v for k,v in rec.items() if k in ('case','passed','startedAt','finishedAt','actualFile','managementUi')},ensure_ascii=False))
