import json,sys
sys.path[:0]=['/root/Codex/web/tests','/root/Codex/web/database','/root/Codex/web']
import test_database_knowledge as base
case=base.DatabaseKnowledgeTests('test_initial_scan_saves_complete_immutable_structure_and_observed_candidates');case.setUp()
try:
 for i in range(510):case.catalog_value['tables'][0]['columns'].append({'name':'col_'+str(i),'dataType':'text','nullable':True,'comment':'Observed note for fixture column '+str(i),'position':i+4})
 state=case.scan();assert len(state['notes'])==500
 note=next(n for n in state['notes'] if n['target']=={'table':'orders','column':'amount'})
 case.decide(note['id']);state=case.state()
 try:case.knowledge.correct(case.source['id'],state['snapshot']['id'],{'kind':'note','id':note['id']},'Reviewed correction',expected_revision=state['revision'])
 except ValueError as exc:error=str(exc)
 else:raise AssertionError('Expected capacity rejection')
 assert '容量上限' in error
 print(json.dumps({'scope':'Real temporary SQLite and current management APIs; physical metadata and connectivity explicitly mocked; no model/real DB','physicalColumns':sum(len(t['columns']) for t in case.catalog_value['tables']),'savedNotes':len(state['notes']),'automaticObservedNotes':sum(n['origin']=='observed' for n in state['notes']),'correctionRejected':True,'error':error,'result':'One valid schema exploration can exhaust shared note history budget; no capacity remains to correct adopted observations'},ensure_ascii=False,indent=2))
finally:case.doCleanups()
