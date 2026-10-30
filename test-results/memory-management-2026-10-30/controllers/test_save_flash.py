from case_helpers import *
import sqlite3,hashlib
rec={'case':'native-Flash-save-explicit-durable-preference','startedAt':utc()}
try:
 idle();rec['before']=ctl('return await api(native,"result",{nativeMemory:{operation:"state"}});');assert rec['before']['body']['preferenceState']['state']=='empty'
 rec['submission']=submit('请长期记住一项报告展示偏好：以后我的所有数据分析报告，开头先写“雁栖验收”，然后先给结论、再给依据。这是跨会话持续适用的偏好，请通过可用的记忆工具实际保存，成功后简短确认；若保存失败请如实说明，不能只口头确认。本次不查询数据库、不执行命令。')
 rec['final']=terminal(240,submission=rec['submission']);assert rec['final']['turns'][-1]['status']=='completed';rec['wire']=wire(submission=rec['submission'])
 cfg=json.loads((B/'context.json').read_text());home=Path(cfg['home'])
 with sqlite3.connect((home/'state_5.sqlite').as_uri()+'?mode=ro',uri=True) as db:
  row=db.execute('SELECT rollout_path,memory_mode FROM threads WHERE id=?',(rec['submission']['threadId'],)).fetchone()
 assert row and row[1]=='disabled',row
 records=[json.loads(x) for x in Path(row[0]).read_text().splitlines() if x];calls=[x['payload'] for x in records if x.get('type')=='response_item' and x.get('payload',{}).get('type')=='function_call'];outputs=[x['payload'] for x in records if x.get('type')=='response_item' and x.get('payload',{}).get('type')=='function_call_output']
 native=[x for x in calls if x.get('namespace')=='memories' and str(x.get('name')).endswith('add_ad_hoc_note')];assert native,'No actual native memory tool call; do not mark saved from oral answer'
 notes=[]
 for p in (home/'memories_v2/extensions/ad_hoc/notes').glob('*.md'):
  if '雁栖验收' in p.read_text():notes.append({'path':str(p.relative_to(home)),'text':p.read_text(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 assert len(notes)==1,notes;assert not any(x.get('name')=='record_analysis_memory' for x in calls),'Duplicated adapter note'
 rec['nativeCalls']=native;rec['nativeOutputs']=[x for x in outputs if x.get('call_id') in {c['call_id'] for c in native}];rec['actualNotes']=notes;rec['memoryMode']='disabled';rec['after']=ctl('return await api(native,"result",{nativeMemory:{operation:"state"}});');assert rec['after']['body']['preferenceState']['availableToNewTasks'] is True
 rec['modelSettings']=ctl('return await native.evaluate(()=>state.threadSettings.get(state.thread.id));');assert rec['modelSettings']['model']=='deepseek-flash';assert rec['modelSettings']['modelProvider']=='deepseek'
 rec['passed']=True;ctl('await native.screenshot({path:"/tmp/codex-memory-management-20261030/flash-save-preference.png"});return true;')
finally:
 rec['finishedAt']=utc();save('flash-save-preference',rec);print(json.dumps({k:v for k,v in rec.items() if k in ('case','passed','startedAt','finishedAt','memoryMode','modelSettings')},ensure_ascii=False))
