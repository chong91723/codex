"""Real immutable snapshots: context paging changes delivery, never the data."""
from pathlib import Path
from decimal import Decimal
import sys,tempfile,unittest,json
ROOT=Path('/root/Codex');sys.path[:0]=[str(ROOT/'web'),str(ROOT/'web/database')]
from service import Gateway
from adapters import DatabaseError
class ResultContextTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.gateway=Gateway(directory=self.tmp.name)
 def write(self,rows,columns=None):
  columns=columns or [{'name':'index','type':'number','nativeType':'int'},{'name':'text','type':'string','nativeType':'str'}]
  return self.gateway.snapshots.write({'sourceKind':'python'},[(columns,rows)])['resultId']
 def test_adaptive_pages_have_no_gaps_duplicates_or_mutation(self):
  rows=[{'index':i,'text':'宽表保留原文'*40} for i in range(81)];rid=self.write(rows);before=self.gateway.snapshots.path(rid).read_bytes();seen=[];offset=0
  while True:
   page=self.gateway.result(rid,offset,limit=20,model=True);self.assertLessEqual(len(json.dumps({'columns':page['columns'],'rows':page['rows']},ensure_ascii=False)),5000);self.assertEqual(page['returnedRows'],len(page['rows']));seen.extend(page['rows']);self.assertTrue(page['complete']);self.assertFalse(page['truncated'])
   if not page['hasMore']:self.assertIsNone(page['nextOffset']);break
   self.assertTrue(page['pageLimitedByContext']);self.assertEqual(page['nextOffset'],offset+page['returnedRows']);offset=page['nextOffset']
  self.assertEqual(seen,rows);self.assertEqual(before,self.gateway.snapshots.path(rid).read_bytes())
 def test_browser_keeps_requested_page_and_all_columns(self):
  rows=[{'index':i,'text':'x'*1000} for i in range(20)];rid=self.write(rows);p=self.gateway.result(rid,limit=20);self.assertEqual(p['rows'],rows);self.assertNotIn('pageLimitedByContext',p)
 def test_single_oversized_cell_is_not_silently_cut(self):
  rid=self.write([{'index':1,'text':'中'*6000}]);self.assertRaisesRegex(DatabaseError,'columns',self.gateway.result,rid,model=True);p=self.gateway.result(rid,columns=['index'],model=True);self.assertEqual(p['rows'],[{'index':1}]);self.assertIsNone(p['nextOffset'])
 def test_empty_and_exact_fit_pages_keep_normal_pagination(self):
  rid=self.write([]);p=self.gateway.result(rid,model=True);self.assertEqual(p['returnedRows'],0);self.assertIsNone(p['nextOffset']);rid=self.write([{'index':i,'text':'ok'} for i in range(4)]);p=self.gateway.result(rid,offset=1,limit=2,model=True);self.assertEqual(p['nextOffset'],3);self.assertNotIn('pageLimitedByContext',p)
 def test_decimal_values_stay_exact_through_adaptive_read_and_chart(self):
  exact=Decimal('0.12345678901234567890123456789');rid=self.write([{'index':i,'text':'x'*900,'value':exact} for i in range(7)],[{'name':'index','type':'number','nativeType':'int'},{'name':'text','type':'string','nativeType':'str'},{'name':'value','type':'number','nativeType':'Decimal'}]);p=self.gateway.result(rid,model=True);self.assertTrue(p['pageLimitedByContext']);self.assertEqual(p['rows'][0]['value'],str(exact));ref=self.gateway.chart(rid,'bar','index',['value'],'Decimal directly');chart=self.gateway.read_chart(ref['chartId']);self.assertEqual(chart['rows'][0]['value'],str(exact));self.assertIn('近似',chart['precisionNotice'])
 def test_numeric_looking_text_is_not_coerced_to_chart_metric(self):
  rid=self.write([{'index':1,'text':'00123'}]);self.assertRaisesRegex(ValueError,'Decimal',self.gateway.chart,rid,'bar','index',['text']);self.assertEqual(self.gateway.result(rid)['rows'][0]['text'],'00123')
 def test_actual_mcp_keeps_page_limit_and_next_offset_receipt(self):
  import os,subprocess,select
  rows=[{'index':i,'text':'x'*900} for i in range(20)];rid=self.gateway.snapshots.write({'sourceKind':'python','ownerThreadId':'page-thread'},[([{'name':'index','type':'number','nativeType':'int'},{'name':'text','type':'string','nativeType':'str'}],rows)])['resultId']
  env=dict(os.environ,CODEX_HOME=self.tmp.name,CODEX_WEB_DB_STATE=self.tmp.name)
  process=subprocess.Popen([sys.executable,'-B',str(ROOT/'web/database/mcp_server.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
  try:
   request={'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'read_result','arguments':{'result_id':rid,'offset':0,'limit':20},'_meta':{'threadId':'page-thread','x-codex-turn-metadata':json.dumps({'turn_id':'page-turn'})}}}
   process.stdin.write(json.dumps(request)+'\n');process.stdin.flush();self.assertTrue(select.select([process.stdout],[],[],20)[0]);response=json.loads(process.stdout.readline());self.assertNotIn('error',response);result=response['result'];self.assertFalse(result['isError']);value=result['structuredContent'];self.assertTrue(value['pageLimitedByContext']);self.assertEqual(value['requestedLimit'],20);self.assertEqual(value['nextOffset'],value['returnedRows']);self.assertIn('完整结果未截断',value['contextNotice']);self.assertEqual(json.loads(result['content'][0]['text']),value)
  finally:
   process.stdin.close()
   try:process.wait(timeout=5)
   except subprocess.TimeoutExpired:process.kill();process.wait()
   process.stdout.close();process.stderr.close()
 def test_inflight_connection_edit_reports_change_before_unverified_status(self):
  from unittest.mock import patch
  source=self.gateway.store.save({'engine':'mysql','name':'owned fixture','host':'127.0.0.1','port':3306,'database':'fixture','username':'reader','password':'fixture-only'})
  self.gateway.store.status(source,'connected',None)
  outer=self
  class Adapter:
   def cancel(self):pass
   def close(self):pass
   def stream(self,sql):
    outer.gateway.store.save(dict(source,name='changed fixture',expectedVersion=source['version']))
    yield ([{'name':'value','type':'number','nativeType':'int'}],[{'value':1}])
  with patch('service.connect',return_value=Adapter()):
   self.assertRaisesRegex(DatabaseError,'查询期间连接配置已变更',self.gateway.query,source['id'],'SELECT value FROM orders')
if __name__=='__main__':unittest.main()
