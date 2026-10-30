from case_helpers import *
rec={'case':'uploaded-skills-new-draft-remove-and-stale-selection','startedAt':utc()}
try:
 idle()
 rec['newDraftGlobalCatalog']=ctl('return await native.evaluate(()=>({threadId:state.thread?.id??null,skills:state.skills,registered:state.uploadedSkills}));')
 assert rec['newDraftGlobalCatalog']['threadId'] is None
 assert len(rec['newDraftGlobalCatalog']['registered'])==2
 rec['selection']=ctl('const card=native.locator(".skill-card[data-skill-name=uploaded-skill-proof]");await card.getByRole("button",{name:"在分析中使用",exact:true}).click();await native.locator("#prompt").fill("$uploaded-skill-proof 请使用上传的本地技能");return await native.evaluate(()=>({prompt:$("#prompt").value,selected:state.selectedSkills??null,view:state.view}));')
 rec['remove']=ctl('await native.locator("[data-view=skills]").first().click();const card=native.locator(".skill-card[data-skill-name=uploaded-skill-proof]");await card.getByRole("button",{name:"移除",exact:true}).click();return await native.evaluate(()=>({dialogs:[...document.querySelectorAll("dialog[open],.modal:not([hidden]),[role=dialog]")].map(x=>x.innerText),buttons:[...document.querySelectorAll("button")].filter(x=>x.offsetParent).map(x=>x.innerText).slice(-12)}));')
 print(json.dumps(rec['remove'],ensure_ascii=False))
finally:
 rec['finishedAt']=utc();save('remove-restore-pending',rec)
