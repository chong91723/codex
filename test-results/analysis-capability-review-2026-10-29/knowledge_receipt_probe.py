from pathlib import Path
import json,sys
sys.path[:0]=['/root/Codex/web/tests','/root/Codex/web/database','/root/Codex/web']
import test_database_knowledge as base
from mcp_server import knowledge_tool
case=base.DatabaseKnowledgeTests('test_initial_scan_saves_complete_immutable_structure_and_observed_candidates')
case.setUp()
try:
 state=case.scan()
 amount_note=next(n for n in state['notes'] if n['target']=={'table':'orders','column':'amount'})
 case.decide(amount_note['id'])
 page=knowledge_tool(case.gateway,'read_database_context',{'connection_id':case.source['id'],'table':'accounts','limit':1})
 assert not any(n['id']==amount_note['id'] for n in page['notes'])
 stamp=case.gateway.learning.before_query(case.source['id'])
 assert stamp['token']==page['knowledgeReceipt']['token']
 output={'scope':'Real temporary SQLite and actual knowledge APIs; physical collection and connectivity explicitly mocked; no model or real business DB','omittedAcceptedKnowledge':amount_note['content'],'requestedTable':'accounts','returnedNotes':[n['content'] for n in page['notes']],'result':'Source-level before_query passes after only reading a different table; receipt proves current revision but not applicable knowledge delivery'}
 print(json.dumps(output,ensure_ascii=False,indent=2))
finally:case.doCleanups()
