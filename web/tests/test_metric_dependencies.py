"""Rule currentness survives derivation without certifying arbitrary formulas."""
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent))
from test_metric_rules import MetricRulesTests as Fixture
from analysis_tools import AnalysisTools


class MetricDependencies(unittest.TestCase):
    setUp=Fixture.setUp
    row=staticmethod(Fixture.row)
    query=Fixture.query
    draft=Fixture.draft
    confirm=Fixture.confirm
    confirmed=Fixture.confirmed
    execute=Fixture.execute

    def tools(self):return AnalysisTools(self.gateway,self.gateway.thread_id)
    def derive(self,source):return self.gateway.analyze(source['resultId'],'SELECT total AS value FROM result')
    def disable(self,rule):return self.rules.manage({'operation':'disable','id':rule['id'],'version':rule['version'],'expectedHash':rule['hash']})
    def publish(self,result):
        tools=self.tools();tools.remember(result)
        return tools.publish('Value {{value}}',{'value':{'result_id':result['resultId'],'row':0,'column':'value'}})
    def python(self,inputs):
        tools=self.tools()
        for value in inputs:tools.remember(value)  # Actual MCP manifests register delivered datasets.
        return tools.calculate("result=[{'value':sum(row.get('value',row.get('total')) for name in parameters['ids'] for row in datasets[name])}]",result_ids=[r['resultId'] for r in inputs],parameters={'ids':[r['resultId'] for r in inputs]})

    def test_multiple_rules_and_generations_deduplicate_without_copying_certification(self):
        first=self.confirmed();a=self.execute(first);second=self.confirmed();b=self.execute(second)
        derived=self.python([a,a,b]);nested=self.gateway.analyze(derived['resultId'],'SELECT value FROM result')
        self.assertEqual({first['id'],second['id']},{item['ruleId'] for item in nested['metricDependencies']})
        self.assertEqual(2,len(nested['metricDependencies']))
        self.assertNotIn('metricProof',nested);self.assertIsNone(self.rules.verify(nested))
        answer=self.publish(nested)
        self.assertEqual(2,len(answer['publicationChecks']['metrics']))
        record_path=self.tools().evidence.path('answers',self.gateway.thread_id,answer['answerId']).parent/self.gateway.turn_id/(answer['answerId']+'.json')
        self.assertTrue(all('metric' not in field for field in json.loads(record_path.read_text())['evidence']))

    def test_revocation_blocks_each_consumer_of_preexisting_derived_results(self):
        rule=self.confirmed();source=self.execute(rule);sql=self.derive(source);python=self.python([sql]);self.disable(rule)
        for result in (source,sql,python):
            for name,operation in (
                ('read',lambda:self.gateway.result(result['resultId'],model=True)),
                ('sql',lambda:self.gateway.analyze(result['resultId'],'SELECT * FROM result')),
                ('python',lambda:self.python([result])),
                ('chart',lambda:self.gateway.chart(result['resultId'],'bar',result['columns'][0]['name'],[result['columns'][0]['name']])),
                ('publish',lambda:self.publish(sql if result is source else result)),
            ):
                with self.subTest(kind=result.get('engine'),operation=name),self.assertRaisesRegex(ValueError,'口径.*(停用|修改)'):
                    operation()
        self.assertEqual('0.30',self.gateway.result(sql['resultId'])['rows'][0]['value'],'Historical download/page remains available')

    def test_derived_report_tracks_rule_and_keeps_original_after_revocation(self):
        rule=self.confirmed();source=self.execute(rule);derived=self.derive(source);answer=self.publish(derived)
        request={'operation':'report_status','threadId':self.gateway.thread_id,'turnId':self.gateway.turn_id,'answerId':answer['answerId']}
        self.assertEqual('current',self.gateway.learning.manage(request)['status'])
        self.disable(rule);status=self.gateway.learning.manage(request)
        self.assertEqual('affected',status['status']);self.assertTrue(any(item['reason']=='metric_changed_or_unavailable' for item in status['changes']))
        self.assertEqual('Value 0.30',answer['text'])

    def test_legacy_derivative_lineage_is_checked_without_rewriting_history(self):
        rule=self.confirmed();source=self.execute(rule);derived=self.derive(source)
        path=self.gateway.snapshots.path(derived['resultId']).with_suffix('.json')
        old=dict(derived);old.pop('metricDependencies',None);path.write_text(json.dumps(old));original=path.read_bytes()
        self.disable(rule)
        with self.assertRaisesRegex(ValueError,'口径.*(停用|修改)'):self.publish(old)
        self.assertEqual(original,path.read_bytes())

    def test_legacy_report_without_saved_metric_dependencies_is_rechecked(self):
        rule=self.confirmed();source=self.execute(rule);derived=self.derive(source);answer=self.publish(derived)
        path=self.gateway.snapshots.path(derived['resultId']).with_suffix('.json');old=dict(derived);old.pop('metricDependencies',None);path.write_text(json.dumps(old))
        answer_path=self.tools().evidence.path('answers',self.gateway.thread_id,answer['answerId']).parent/self.gateway.turn_id/(answer['answerId']+'.json')
        record=json.loads(answer_path.read_text());record['publicationChecks']['metrics']=[];record['publicationChecks'].pop('metricDependenciesComplete',None);answer_path.write_text(json.dumps(record));original=answer_path.read_bytes()
        self.disable(rule)
        request={'operation':'report_status','threadId':self.gateway.thread_id,'turnId':self.gateway.turn_id,'answerId':answer['answerId']}
        self.assertEqual('affected',self.gateway.learning.manage(request)['status'])
        self.assertEqual(original,answer_path.read_bytes())

    def test_missing_legacy_ancestor_blocks_new_use_but_preserves_historical_rows(self):
        rule=self.confirmed();source=self.execute(rule);derived=self.derive(source)
        path=self.gateway.snapshots.path(derived['resultId']).with_suffix('.json');old=dict(derived);old.pop('metricDependencies',None);path.write_text(json.dumps(old))
        self.gateway.snapshots.path(source['resultId']).with_suffix('.json').unlink()
        with self.assertRaisesRegex(ValueError,'旧派生.*依赖'):self.publish(old)
        self.assertEqual('0.30',self.gateway.result(derived['resultId'])['rows'][0]['value'])

    def test_revocation_during_final_derived_write_discards_only_new_result(self):
        rule=self.confirmed();source=self.execute(rule);before=set(self.gateway.snapshots.directory.iterdir());write=self.gateway.snapshots.write
        def write_then_disable(*args,**kwargs):
            result=write(*args,**kwargs);self.disable(rule);return result
        with patch.object(self.gateway.snapshots,'write',side_effect=write_then_disable):
            with self.assertRaisesRegex(ValueError,'口径.*(停用|修改)'):self.python([source])
        self.assertEqual(before,set(self.gateway.snapshots.directory.iterdir()))

# Only this suite is collected; Fixture supplies explicit adapter helpers.
del Fixture
