"""Browser projection preserves native lifecycle and only hides registered IDs."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import MemoryThreadPresentation

class MemoryThreadViewTests(unittest.TestCase):
    def setUp(self):
        class Memory:
            def maintenance_thread_ids(self):return {'internal', 'removed-internal'}
            def maintenance_sessions(self):return [{'threadId':'internal','state':'running','pid':123}]
        self.view=MemoryThreadPresentation(Memory())
    def request(self, method, identity='internal', identifier=1):
        self.view.track({'id':identifier,'method':method,'params':{'threadId':identity}})
    def test_filter_only_registered_identity_keep_native_pagination(self):
        self.request('thread/list')
        rows=[{'id':'internal','preview':'arbitrary'}, {'id':'user','preview':'Internal memory-maintenance trigger.'}]
        original={'id':1,'result':{'data':rows,'nextCursor':'native-page-2','other':'kept'}}
        result,warning=self.view.present(original)
        self.assertIsNone(warning);self.assertEqual([rows[1]],result['result']['data'])
        self.assertEqual('native-page-2',result['result']['nextCursor']);self.assertEqual(2,len(original['result']['data']))
    def test_read_metadata_keeps_original_native_thread(self):
        self.request('thread/read');thread={'id':'internal','turns':[{'id':'t'}]}
        result,warning=self.view.present({'id':1,'result':{'thread':thread}})
        self.assertIsNone(warning);self.assertEqual(thread,result['result']['thread'])
        self.assertEqual('internal',result['result']['webMemoryMaintenance']['threadId'])
    def test_writer_error_is_enriched_not_replaced_or_suppressed(self):
        self.request('thread/delete');error={'code':-32600,'message':'thread internal already has an active writer','data':{'native':'retained'}}
        result,_=self.view.present({'id':1,'error':error})
        self.assertEqual(error['code'],result['error']['code']);self.assertEqual(error['message'],result['error']['message'])
        self.assertEqual('retained',result['error']['data']['native']);self.assertEqual(123,result['error']['data']['webMemoryMaintenance']['pid'])
        self.assertNotIn('webMemoryMaintenance',error['data'])
    def test_old_registered_identity_stays_distinct_without_latest_record(self):
        self.request('thread/read','removed-internal')
        result,_=self.view.present({'id':1,'result':{'thread':{'id':'removed-internal'}}})
        self.assertEqual('historical',result['result']['webMemoryMaintenance']['state'])
    def test_normal_user_native_error_unchanged(self):
        self.request('thread/delete','user');original={'id':1,'error':{'code':-32600,'message':'active writer'}}
        result,warning=self.view.present(original);self.assertIs(result,original);self.assertIsNone(warning)
    def test_server_request_does_not_consume_client_response_binding(self):
        self.request('thread/read');request={'id':1,'method':'item/commandExecution/requestApproval','params':{}}
        result,_=self.view.present(request);self.assertIs(request,result)
        result,_=self.view.present({'id':1,'result':{'thread':{'id':'internal'}}});self.assertIn('webMemoryMaintenance',result['result'])
    def test_registry_error_retains_native_ack_with_diagnostic(self):
        self.view.memory.maintenance_thread_ids=lambda:(_ for _ in ()).throw(ValueError('registry unavailable'))
        self.request('thread/list');original={'id':1,'result':{'data':[{'id':'user'}]}}
        result,warning=self.view.present(original);self.assertIs(result,original);self.assertIn('registry unavailable',warning)
    def test_unsupported_or_untracked_responses_remain_untouched(self):
        original={'id':3,'result':{'data':[{'id':'internal'}]}}
        result,warning=self.view.present(original);self.assertIs(original,result);self.assertIsNone(warning)
        self.view.track({'id':[],'method':'thread/list'})

if __name__=='__main__':unittest.main()
