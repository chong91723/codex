"""Original native MCP event -> private document -> actual Python evidence."""
from pathlib import Path
import sys
import unittest
from copy import deepcopy
sys.path[:0]=[str(Path(__file__).resolve().parents[1]/'database'),str(Path(__file__).resolve().parents[1])]
import test_analysis_evidence as base
from service import Gateway
from analysis_tools import AnalysisTools

class McpDataInputs(unittest.TestCase):
    setUp=base.EvidenceTests.setUp
    compute=base.EvidenceTests.compute
    ref=staticmethod(base.EvidenceTests.ref)

    def event(self):return {'method':'item/completed','params':{'threadId':'thread-A','turnId':'turn-A','item':{'id':'native-tool-call','type':'mcpToolCall','server':'external-fixture','tool':'read_sales','status':'completed','result':{'structuredContent':{'sales':[{'amount':'1.20'},{'amount':'2.30'}]}}}}}

    def test_original_output_is_imported_without_transcription_or_refreshing_age(self):
        self.evidence.observe(self.event())
        outputs=self.tools.import_mcp_result(server='external-fixture')['outputs'];self.assertEqual(len(outputs),1)
        doc=self.tools.import_mcp_result(outputs[0]['outputId'],server='external-fixture')
        result=self.compute("result=[{'value':sum(Decimal(row['amount']) for row in documents[parameters['doc']]['structuredContent']['sales'])}]",document_ids=[doc['documentId']],parameters={'doc':doc['documentId']})
        self.assertEqual(self.tools.publish('合计 {{v}}',{'v':self.ref(result)})['text'],'合计 3.50')
        metadata=self.gateway.snapshots.metadata(result['resultId']);self.assertEqual(metadata['acquisition'][0]['retrievedAt'],outputs[0]['createdAt'])
        self.assertEqual(metadata['inputSources'][0]['server'],'external-fixture')

    def test_failed_and_own_tools_are_excluded_and_other_threads_cannot_import(self):
        for changed in [dict(status='failed'),dict(server='codex_web_databases'),dict(result={'isError':True})]:
            event=self.event();event['params']['item'].update(changed);self.evidence.observe(event)
        self.assertEqual(self.tools.import_mcp_result()['outputs'],[])
        self.evidence.observe(self.event());identifier=self.tools.import_mcp_result()['outputs'][0]['outputId']
        other=AnalysisTools(Gateway(self.temp.name,thread_id='other',turn_id='turn-A'),'other')
        with self.assertRaisesRegex(ValueError,'当前会话'):other.import_mcp_result(identifier)
        with self.assertRaisesRegex(ValueError,'服务不一致'):self.tools.import_mcp_result(identifier,server='wrong')
        self.evidence.remove_thread('thread-A');self.assertFalse(self.evidence.path('documents','thread-A',identifier).exists())

    def test_repeated_event_is_idempotent_and_changed_same_call_cannot_overwrite(self):
        event=self.event();self.evidence.observe(event);self.evidence.observe(event)
        self.assertEqual(len(self.tools.import_mcp_result()['outputs']),1)
        changed=deepcopy(event);changed['params']['item']['result']['structuredContent']['sales'][0]['amount']='999.00'
        with self.assertRaisesRegex(ValueError,'不一致'):self.evidence.observe(changed)
