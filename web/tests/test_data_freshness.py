"""Actual policy storage and isolated calculations; controlled time receipts are fixtures."""
from datetime import datetime,timezone,timedelta
from decimal import Decimal
import json
from pathlib import Path
import sys,tempfile,unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
sys.path[:0]=[str(ROOT/'web'),str(ROOT/'web/database')]
from analysis_evidence import has_number,Evidence
from analysis_tools import AnalysisTools
from data_freshness import receipt,check_freshness
from service import Gateway

class DataFreshnessTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='codex-freshness-');self.addCleanup(self.temp.cleanup)
        self.gateway=Gateway(self.temp.name,thread_id='fixture',turn_id='task-a');self.tools=AnalysisTools(self.gateway,'fixture')
        self.record=self.gateway.store.save({'engine':'postgresql','name':'fixture source','host':'127.0.0.1','database':'fixture','username':'reader'})
        self.record=self.gateway.store.status(self.record,'connected')
        self.now=datetime.now(timezone.utc)
    def snapshot(self,age=0):
        acquired=receipt('database','fixture','task-a',self.record['id']);acquired['retrievedAt']=(self.now-timedelta(minutes=age)).isoformat()
        metadata={'connectionId':self.record['id'],'connectionName':'fixture source','connectionVersion':self.record['version'],'engine':'postgresql','connectionDependencies':[{'id':self.record['id'],'version':self.record['version']}],'acquisition':[acquired]}
        result=self.gateway.snapshots.write(metadata,iter([([{'name':'amount','type':'number','nativeType':'Decimal'},{'name':'count','type':'number','nativeType':'int'}],[{'amount':Decimal('3.50'),'count':2}])]))
        self.tools.remember(result);return result
    @staticmethod
    def ref(result,column='amount'):return {'result_id':result['resultId'],'row':0,'column':column}
    def test_shared_language_corpus_and_strict_financial_number_rejection(self):
        corpus=json.loads((ROOT/'web/tests/numeric_language_cases.json').read_text())
        for text in corpus['positive']:self.assertTrue(has_number(text),text)
        for text in corpus['negative']:self.assertFalse(has_number(text),text)
        evidence=Evidence(self.temp.name)
        for text in ['一共十二','壹佰元']:
            self.assertEqual(evidence.verify('fixture','task-a',text,True)['status'],'rejected')
            with self.assertRaisesRegex(ValueError,'未引用'):self.tools.publish(text,{})
        self.assertEqual(evidence.verify('fixture','task-a','字段为一致格式',True)['status'],'notRequired')
    def test_source_bound_setting_persists_and_late_probe_cannot_overwrite_it(self):
        other=self.gateway.store.save({'engine':'mysql','name':'other','host':'127.0.0.1','database':'other','username':'reader'})
        value=self.gateway.store.set_freshness(self.record['id'],30)
        self.assertEqual(value['version'],self.record['version']);self.assertEqual(value['status'],'connected')
        self.gateway.store.status(self.record,'connected')
        self.assertEqual(self.gateway.store.get(self.record['id'])['maxAgeMinutes'],30)
        self.assertIsNone(self.gateway.store.get(other['id'])['maxAgeMinutes'])
        self.gateway.store.set_freshness(self.record['id'],None)
        self.assertIsNone(self.gateway.store.get(self.record['id'])['maxAgeMinutes'])
        for bad in [-1,True,1.2,'30',525601]:
            with self.subTest(bad=bad),self.assertRaises(ValueError):self.gateway.store.set_freshness(self.record['id'],bad)
    def test_configured_age_boundary_unknown_and_task_only_rule(self):
        source=receipt('database','fixture','task-a',self.record['id']);source['retrievedAt']=(self.now-timedelta(minutes=30)).isoformat()
        metadata={'acquisition':[source]};self.gateway.store.set_freshness(self.record['id'],30)
        check_freshness([metadata],self.gateway.store.get,'fixture','task-b',now=self.now)
        with self.assertRaisesRegex(ValueError,'复用时长'):check_freshness([metadata],self.gateway.store.get,'fixture','task-b',now=self.now+timedelta(microseconds=1))
        for bad_time in [None,'invalid','2026-01-01T00:00:00',(self.now+timedelta(seconds=1)).isoformat()]:
            source['retrievedAt']=bad_time
            with self.subTest(time=bad_time),self.assertRaises(ValueError):check_freshness([metadata],self.gateway.store.get,'fixture','task-b',now=self.now)
        self.gateway.store.set_freshness(self.record['id'],0)
        check_freshness([metadata],self.gateway.store.get,'fixture','task-a',now=self.now)
        with self.assertRaises(ValueError):check_freshness([metadata],self.gateway.store.get,'fixture','task-b',now=self.now)
    def test_unconfigured_reuse_is_explicit_and_changing_rule_enforces_on_existing_snapshot(self):
        result=self.snapshot(age=60);self.gateway.turn_id='task-b'
        with patch.object(self.gateway,'probe',return_value=dict(self.record,status='connected')):
            answer=self.tools.publish('金额 {{v}}',{'v':self.ref(result)})
            checks=answer['publicationChecks'];self.assertEqual(checks['freshness'][0]['status'],'notConfigured')
            self.gateway.store.set_freshness(self.record['id'],30)
            with self.assertRaisesRegex(ValueError,'复用时长'):self.tools.publish('金额 {{v}}',{'v':self.ref(result)})
        # Viewing/downloading immutable history remains available.
        self.assertEqual(self.gateway.result(result['resultId'])['rows'][0]['amount'],'3.50')
        self.assertTrue(Path(self.gateway.export(result['resultId'],'csv')['path']).is_file())
    def test_actual_python_and_duckdb_keep_original_source_time(self):
        result=self.snapshot(age=20);self.gateway.store.set_freshness(self.record['id'],30)
        with patch.object(self.gateway,'probe',return_value=dict(self.record,status='connected')):
            output=self.tools.calculate("result=[{'value':sum(row['amount'] for row in datasets[parameters['id']])}]",[result['resultId']],parameters={'id':result['resultId']})
            analyzed=self.gateway.analyze(result['resultId'],'SELECT SUM(amount) AS value FROM result')
        for derived in [output,analyzed]:
            self.assertEqual(derived['acquisition'],result['acquisition']);self.assertNotEqual(derived['createdAt'],result['createdAt'])
            self.tools.remember(derived)
            self.gateway.store.set_freshness(self.record['id'],10)
            with patch.object(self.gateway,'probe',return_value=dict(self.record,status='connected')):
                with self.assertRaisesRegex(ValueError,'复用时长'):self.tools.publish('值 {{v}}',{'v':self.ref(derived,'value')})
            self.gateway.store.set_freshness(self.record['id'],30)
    def test_strictest_of_multiple_sources_and_legacy_derived_age_is_unknown(self):
        first=self.snapshot(age=20)
        second=self.gateway.store.save({'engine':'mysql','name':'second','host':'127.0.0.1','database':'second','username':'reader'})
        self.gateway.store.set_freshness(self.record['id'],30);self.gateway.store.set_freshness(second['id'],10)
        sources=[dict(first['acquisition'][0]),dict(first['acquisition'][0],connectionId=second['id'])]
        with self.assertRaisesRegex(ValueError,'second'):check_freshness([{'acquisition':sources}],self.gateway.store.get,'fixture','task-a',now=self.now)
        legacy={'sourceKind':'python','createdAt':self.now.isoformat(),'connectionDependencies':[{'id':self.record['id']} ]}
        with self.assertRaisesRegex(ValueError,'来源读取时间'):check_freshness([legacy],self.gateway.store.get,'fixture','task-a',now=self.now)
    def test_publish_checks_connections_once_per_source_and_pages_once_per_row_then_rechecks_next_call(self):
        first=self.snapshot();second=self.snapshot();refs={'a':self.ref(first),'n':self.ref(first,'count'),'b':self.ref(second)}
        with patch.object(self.gateway,'probe',return_value=dict(self.record,status='connected')) as probe,patch.object(self.gateway.snapshots,'page',wraps=self.gateway.snapshots.page) as page:
            self.tools.publish('金额 {{a}}，记录 {{n}}，金额 {{b}}',refs)
            self.assertEqual(probe.call_count,1);self.assertEqual(page.call_count,2)
            self.tools.publish('金额 {{a}}，记录 {{n}}，金额 {{b}}',refs)
            self.assertEqual(probe.call_count,2);self.assertEqual(page.call_count,4)

    def test_source_disabled_after_first_read_is_rechecked_before_commit_without_another_probe(self):
        result=self.snapshot();original=self.gateway.snapshots.page
        def read_then_disable(*args,**kwargs):
            page=original(*args,**kwargs);self.gateway.store.toggle(self.record['id'],False);return page
        with patch.object(self.gateway,'probe',return_value=dict(self.record,status='connected')) as probe,patch.object(self.gateway.snapshots,'page',side_effect=read_then_disable):
            with self.assertRaisesRegex(ValueError,'未启用'):self.tools.publish('金额 {{v}}',{'v':self.ref(result)})
            self.assertEqual(probe.call_count,1)
        self.assertFalse((Evidence(self.temp.name).root/'answers').exists())

if __name__=='__main__':unittest.main()
