"""External report boundary checks; explicit sample reports, no database calls."""
from pathlib import Path
import json,sys,tempfile,unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'web/database'))
from schema_explorer import normalize_lints,inferred_associations,runtime,enhance_catalog,verify_schema_report
from cancellation import Cancellation

class SchemaExplorerTests(unittest.TestCase):
 def setUp(self):self.catalog={'tables':[{'name':'orders','namespace':'demo'}]}
 def test_unknown_objects_cannot_be_imported_from_external_tool(self):
  item={'linter-id':'test.Rule','object-key':{'key':['demo',None,'private']},'message':'x','severity':'low'}
  with self.assertRaisesRegex(ValueError,'范围以外'):normalize_lints({'lints':[item]},self.catalog)
 def test_lint_is_a_recommendation_and_preserves_original_text(self):
  item={'linter-id':'test.Rule','object-key':{'key':['demo',None,'orders']},'message':'<script>unsafe</script>','severity':'low','value':'original'}
  result=normalize_lints({'lints':[item]},self.catalog)
  self.assertEqual(result[0]['kind'],'structural_check');self.assertEqual(result[0]['message'],item['message']);self.assertNotIn('foreignKeys',result[0])
 def test_only_explicit_upstream_implicit_relations_are_hypotheses(self):
  text='demo.orders [table]\nForeign Keys\n  id --> demo.real.id\nImplicit Associations\nSC_ID [implicit association]\n  account_id ~~> demo.accounts.id\n'
  result=inferred_associations(text,self.catalog)
  self.assertEqual(len(result),1);self.assertEqual(result[0]['kind'],'inferred_association');self.assertEqual(result[0]['table'],'orders');self.assertEqual(result[0]['severity'],'hypothesis')
 def test_no_heuristic_assigns_other_schema_to_visible_table(self):
  text='private.orders [table]\nSC_ID [implicit association]\n  id ~~> private.accounts.id\n'
  self.assertEqual(inferred_associations(text,self.catalog),[])
 def test_empty_or_partial_tool_report_is_not_success(self):
  with self.assertRaisesRegex(ValueError,'全部对象'):verify_schema_report('empty report',self.catalog)
  verify_schema_report('demo.orders [table]\n',self.catalog)
 def test_tampered_runtime_rejected_before_any_execution(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);(p/'lib').mkdir();(p/'java').write_text('not executed');(p/'lib/a.jar').write_text('changed');(p/'manifest.json').write_text(json.dumps({'version':'17.16.0','artifacts':{'a.jar':'wrong'}}))
   with patch.dict('os.environ',{'CODEX_WEB_SCHEMACRAWLER_HOME':d}):
    with self.assertRaisesRegex(ValueError,'校验失败'):runtime()
 def test_specialized_adapter_does_not_claim_external_tool_ran(self):
  result=enhance_catalog({'engine':'elasticsearch'},self.catalog,Path('/unused'),Cancellation())
  self.assertEqual(result['mode'],'engine_specific');self.assertNotEqual(result['tool'],'SchemaCrawler CLI')
if __name__=='__main__':unittest.main()
