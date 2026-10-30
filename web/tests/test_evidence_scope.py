"""Generic provenance boundaries, actual snapshots and isolated Python; no model."""
import json
from pathlib import Path
import sys
import unittest
sys.path[:0]=[str(Path(__file__).resolve().parents[1]/'database'),str(Path(__file__).resolve().parents[1])]
import test_analysis_evidence as base

class EvidenceScope(unittest.TestCase):
    setUp=base.EvidenceTests.setUp
    compute=base.EvidenceTests.compute
    ref=staticmethod(base.EvidenceTests.ref)

    def activity(self, thread='thread-A',turn='turn-A',tool='query_database'):
        self.evidence.observe({'method':'item/completed','params':{'threadId':thread,'turnId':turn,'item':{
            'id':'call-scope','type':'mcpToolCall','server':'codex_web_databases','tool':tool,
            'status':'completed','result':{'isError':False}}}})

    def test_words_and_numerals_never_select_the_verification_policy(self):
        for text in ['三角形','三角函数','2025年，分3步','HTTP 401','用户指定阈值80','类别甲最常见','总数为999']:
            before=self.evidence.verify('thread-A','turn-A',text)
            self.assertEqual(before['status'],'notRequired')
            self.assertEqual(before['verificationScope'],'conversation')
        self.activity()
        for text in ['三角形','类别甲最常见','总数为999']:
            self.assertEqual(self.evidence.verify('thread-A','turn-A',text)['status'],'rejected')
        # Rejected means no linked fields, not hidden text or semantic falsity.

    def test_classification_is_not_a_client_switch_or_keyword_and_is_thread_scoped(self):
        self.activity()
        self.assertEqual(self.evidence.verify('thread-A','turn-A','仅作普通说明')['status'],'rejected')
        self.assertEqual(self.evidence.verify('thread-B','turn-A','仅作普通说明')['status'],'legacy')
        self.assertEqual(self.evidence.verify('thread-A','turn-B','仅作普通说明')['status'],'legacy')

    def test_text_and_boolean_fields_receive_actual_reference_proof(self):
        result=self.compute("result=[{'category':'类别甲','flag':True,'stamp':'2025-01-01'}]")
        answer=self.tools.publish('说明分3步。观察字段 {{category}} / {{flag}} / {{stamp}}',
                                  {name:self.ref(result,name) for name in ['category','flag','stamp']})
        checked=self.evidence.verify('thread-A','turn-A',answer['text'])
        self.assertEqual(checked['status'],'verified')
        self.assertEqual([field['value'] for field in checked['evidence']],['类别甲',True,'2025-01-01'])
        self.assertEqual(checked['assurance']['source']['status'],'linked')
        self.assertEqual(checked['assurance']['execution']['status'],'recorded')
        self.assertEqual(checked['assurance']['metric']['status'],'not-applied')
        self.assertEqual(checked['assurance']['narrative']['status'],'not-assessed')

    def test_unreferenced_prose_is_never_included_in_the_verified_field_set(self):
        result=self.compute();answer=self.tools.publish('普通说明999；字段 {{value}}',{'value':self.ref(result)})
        verified=self.evidence.verify('thread-A','turn-A',answer['text'])
        self.assertEqual(verified['assurance']['source']['fields'],['value'])
        self.assertEqual([item['value'] for item in verified['evidence']],['3.50'])
        self.assertEqual(verified['assurance']['narrative']['status'],'not-assessed')

    def test_registration_is_idempotent_and_does_not_erase_native_activity(self):
        self.activity()
        self.evidence.observe({'method':'turn/started','params':{'threadId':'thread-A','turn':{'id':'turn-A'}}})
        self.assertTrue(self.evidence.context('thread-A','turn-A')['dataActivity'])
        path=self.evidence.path('turns','thread-A','old-turn');self.evidence.write(path,{'version':'numeric-evidence-v1'})
        self.evidence.observe({'method':'turn/started','params':{'threadId':'thread-A','turn':{'id':'old-turn'}}})
        self.assertEqual(self.evidence.context('thread-A','old-turn')['version'],'numeric-evidence-v1')

    def test_corrupt_template_cannot_be_recertified_after_removing_digit_scanner(self):
        result=self.compute();answer=self.tools.publish('字段 {{v}}',{'v':self.ref(result)})
        path=self.evidence.path('answers','thread-A',answer['answerId']).parent/'turn-A'/(answer['answerId']+'.json')
        record=json.loads(path.read_text());record['template']='不同文字但相同数字3.50';path.write_text(json.dumps(record))
        with self.assertRaisesRegex(ValueError,'不一致'):self.evidence.verify('thread-A','turn-A',answer['text'])

    def test_remove_cleans_only_own_activity_while_archive_does_not(self):
        self.activity();self.activity(thread='thread-B')
        self.evidence.remove_thread('thread-A')
        self.assertFalse(self.evidence.context('thread-A','turn-A')['dataActivity'])
        self.assertTrue(self.evidence.context('thread-B','turn-A')['dataActivity'])

    def test_empty_results_use_actual_snapshot_metadata_without_fabricated_sql_or_python(self):
        result=self.compute("result=[];columns=['category','value']")
        answer=self.tools.publish('符合条件的记录数 {{n}}；字段数 {{c}}',
            {'n':{'result_id':result['resultId'],'metadata':'rowCount'},'c':{'result_id':result['resultId'],'metadata':'columnCount'}})
        checked=self.evidence.verify('thread-A','turn-A',answer['text'])
        self.assertEqual([field['value'] for field in checked['evidence']],[0,2])
        self.assertTrue(all(field['referenceKind']=='metadata' and not field.get('metric') for field in checked['evidence']))
        with self.assertRaises(ValueError):self.tools.publish('{{n}}',{'n':{'result_id':result['resultId'],'metadata':'injected'}})

    def test_failed_tool_is_runtime_information_not_successful_data_evidence(self):
        self.evidence.observe({'method':'item/completed','params':{'threadId':'thread-A','turnId':'turn-A','item':{
            'id':'failed-call','type':'mcpToolCall','server':'codex_web_databases','tool':'query_database',
            'status':'failed','result':{'isError':True}}}})
        checked=self.evidence.verify('thread-A','turn-A','查询失败，HTTP 401')
        self.assertEqual(checked['status'],'notRequired')
        self.assertEqual(checked['verificationScope'],'conversation')

if __name__=='__main__':unittest.main()
