"""Published artifact delivery never weakens native-text verification."""
from pathlib import Path
import sys
import unittest
sys.path[:0]=[str(Path(__file__).resolve().parents[1]/'database'),str(Path(__file__).resolve().parents[1])]
import test_analysis_evidence as base

class PublishedReports(unittest.TestCase):
    setUp=base.EvidenceTests.setUp
    compute=base.EvidenceTests.compute
    ref=staticmethod(base.EvidenceTests.ref)

    def test_rewritten_native_text_is_rejected_but_canonical_report_is_available(self):
        result=self.compute();answer=self.tools.publish('原始金额 {{v}}',{'v':self.ref(result)},purpose='answer')
        self.assertEqual(self.evidence.verify('thread-A','turn-A',answer['text'].replace('原始','改写'),True)['status'],'rejected')
        delivered=self.evidence.published_answer('thread-A','turn-A')
        self.assertEqual(delivered['status'],'verified');self.assertEqual(delivered['text'],answer['text'])
        self.assertFalse(delivered['nativeMessageMatched']);self.assertEqual(delivered['delivery'],'published-report')
        self.assertEqual(self.evidence.published_answer('thread-A','other-turn')['status'],'unavailable')
        self.assertEqual(self.evidence.published_answer('other-thread','turn-A')['status'],'unavailable')

    def test_auxiliary_plan_and_legacy_unclassified_publications_are_not_complete_reports(self):
        result=self.compute()
        for purpose in ('auxiliary','plan','unclassified'):
            self.tools.publish('标题 '+purpose+' {{v}}',{'v':self.ref(result)},purpose=purpose)
            self.assertEqual(self.evidence.published_answer('thread-A','turn-A')['status'],'unavailable')

    def test_latest_explicit_answer_is_used_and_corrupt_evidence_is_not_delivered(self):
        result=self.compute()
        self.tools.publish('旧稿 {{v}}',{'v':self.ref(result)})
        latest=self.tools.publish('当前稿 {{v}}',{'v':self.ref(result)})
        self.assertEqual(self.evidence.published_answer('thread-A','turn-A')['text'],latest['text'])
        import json
        path=self.evidence.path('answers','thread-A',latest['answerId']).parent/'turn-A'/(latest['answerId']+'.json')
        record=json.loads(path.read_text());record['template']='额外数字 999';path.write_text(json.dumps(record))
        with self.assertRaises(ValueError):self.evidence.published_answer('thread-A','turn-A')
