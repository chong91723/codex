from case_helpers import *
from pathlib import Path
import hashlib
rec={'case':'Flash-new-analysis-reads-user-correction','startedAt':utc()}
try:
 ctl('if(await native.locator(".analysis-memory-dialog").count())await native.locator(".analysis-memory-dialog").getByRole("button",{name:"关闭",exact:true}).click();return true;')
 fresh();home=Path(json.loads((B/'context.json').read_text())['home']);before={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (home/'memories_v2/extensions/ad_hoc/notes').glob('*.md')}
 rec['submission']=submit('请查阅当前已经保存的报告展示偏好，用一句话说明以后数据分析报告的开头要求和结论、依据顺序。不要新增或修改记忆，不查询数据库，也不执行命令。')
 rec['final']=terminal(180,submission=rec['submission']);assert rec['final']['turns'][-1]['status']=='completed';answer=messages(rec['final']);assert '溪云验收' in answer and '结论' in answer and '依据' in answer,answer
 after={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (home/'memories_v2/extensions/ad_hoc/notes').glob('*.md')};assert before==after,'Read unexpectedly wrote a new note'
 rec['answer']=answer;rec['wire']=wire(submission=rec['submission']);rec['notesUnchanged']=True;rec['passed']=True
 ctl('await native.screenshot({path:"/tmp/codex-memory-management-20261030/flash-corrected-analysis-read.png"});return true;')
finally:
 rec['finishedAt']=utc();save('flash-corrected-analysis-read',rec);print(json.dumps({k:v for k,v in rec.items() if k in ('case','passed','answer','startedAt','finishedAt','notesUnchanged')},ensure_ascii=False))
