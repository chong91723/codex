from case_helpers import *
rec=json.loads((B/'remove-restore-pending.json').read_text())
try:
 rec['confirmedRemove']=ctl('await native.getByRole("button",{name:"确认移除",exact:true}).click();await native.waitForFunction(()=>!state.uploadedSkills.some(s=>s.name==="uploaded-skill-proof"));return await native.evaluate(()=>({registered:state.uploadedSkills,prompt:$("#prompt").value}));')
 rec['blockedStaleDraft']=ctl('await native.evaluate(()=>showView("chat"));const start=wire.length;const before=await native.locator("#prompt").inputValue();await native.locator("#prompt").press("Enter");await native.getByRole("status").filter({hasText:/停用|移除|不可用/}).first().waitFor().catch(async()=>{await native.waitForFunction(()=>[...document.querySelectorAll(".toast")].some(x=>/停用|移除|不可用/.test(x.innerText)));});return {before,after:await native.locator("#prompt").inputValue(),requests:wire.slice(start).filter(x=>x.direction==="sent"&&["turn/start","turn/steer"].includes(x.data?.method)),text:await native.locator("body").innerText()};')
 assert rec['blockedStaleDraft']['before']==rec['blockedStaleDraft']['after']
 assert len(rec['blockedStaleDraft']['requests'])==0
 rec['helperRemove']=ctl('await native.locator("[data-view=skills]").first().click();const card=native.locator(".skill-card[data-skill-name=\\\"Uploaded Data Helper\\\"]");await card.getByRole("button",{name:"移除",exact:true}).click();await native.getByRole("button",{name:"确认移除",exact:true}).click();await native.waitForFunction(()=>state.uploadedSkills.length===0);return await native.evaluate(async()=>({catalog:await(await fetch("/api/skills")).json(),cards:[...document.querySelectorAll(".skill-card")].map(x=>x.dataset.skillName),prompt:$("#prompt").value}));')
 rec['nativeAfterRemoval']=ctl('return await raw(native,"skills/list",{cwds:["/tmp/codex-uploaded-skills-20261030/live/workspace"],forceReload:true});')
 skills=rec['nativeAfterRemoval']['result']['data'][0]['skills'];names={x['name'] for x in skills};assert {'openai-docs','review-agent','skill-creator','skill-installer'}<=names
 assert not {'uploaded-skill-proof','Uploaded Data Helper'}&names
 assert rec['helperRemove']['catalog']['skills']==[]
 rec['proofArtifactPreserved']=(B/'live/workspace/acceptance/uploaded-skill-proof.json').is_file();assert rec['proofArtifactPreserved']
 rec['finalExecution']=idle();rec['passed']=True
 ctl('await native.screenshot({path:"/tmp/codex-uploaded-skills-20261030/ui-remove-restore.png"});return true;')
finally:
 rec['finishedAt']=utc();save('ui-remove-restore',rec);print(json.dumps({k:v for k,v in rec.items() if k in ('case','passed','startedAt','finishedAt','proofArtifactPreserved')},ensure_ascii=False))
