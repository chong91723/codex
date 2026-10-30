"""Durable preparation state on real SQLite; external collectors explicitly mocked."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'web'), str(ROOT / 'web/database'), str(ROOT / 'web/tests')]
from database_knowledge import DatabaseKnowledge
from exploration_jobs import ExplorationJobs
from service import Gateway
from test_database_knowledge import physical


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='codex-preparation-test-')
        self.addCleanup(self.temp.cleanup)
        self.gateway = Gateway(self.temp.name)
        source = self.gateway.store.save(dict(engine='postgresql', name='Explicit fixture', host='127.0.0.1', database='fixture', username='reader'))
        self.source = self.gateway.store.status(source, 'connected')
        self.knowledge = DatabaseKnowledge(self.gateway)
        self.jobs = ExplorationJobs(self.gateway)
        self.catalog = physical(self.source)
        self.collect = patch('metadata_catalog.collect_metadata', return_value=self.catalog)
        self.collect.start(); self.addCleanup(self.collect.stop)
        self.enhance = patch('schema_explorer.enhance_catalog', return_value={'tool': 'explicit test fixture', 'findings': [], 'findingCount': 0})
        self.enhance.start(); self.addCleanup(self.enhance.stop)
        self.probe = patch.object(self.gateway, 'probe', side_effect=lambda record: dict(record, status='connected'))
        self.probe.start(); self.addCleanup(self.probe.stop)

    def start(self):
        with patch('exploration_jobs.subprocess.Popen', return_value=Mock(pid=os.getpid())):
            return self.jobs.start(self.source['id'], self.knowledge.state(self.source['id'])['revision'])

    def test_one_click_persists_complete_result_without_conversation(self):
        job = self.start()
        self.jobs.run(self.source['id'], job['id'])
        result = self.jobs.status(self.source['id'])
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(result['tableCount'], 2)
        self.assertEqual(result['snapshotId'], self.knowledge.state(self.source['id'])['snapshot']['id'])
        self.assertNotIn('pid', result)
        self.assertTrue(all(n['status'] == 'pending' for n in self.knowledge.state(self.source['id'])['notes']))

    def test_repeated_click_reuses_active_job_and_other_source_cannot_cancel(self):
        first, second = self.start(), self.start()
        self.assertEqual(first['id'], second['id'])
        other = self.gateway.store.save(dict(engine='mysql', name='Other', host='127.0.0.1', database='other', username='reader'))
        with self.assertRaisesRegex(ValueError, '不属于'):
            self.jobs.cancel(other['id'], first['id'])
        self.assertEqual(self.jobs.status(self.source['id'])['status'], 'queued')

    def test_cancel_before_run_never_scans_or_changes_snapshot(self):
        job = self.start()
        self.jobs.cancel(self.source['id'], job['id'])
        self.jobs.run(self.source['id'], job['id'])
        self.assertEqual(self.jobs.status(self.source['id'])['status'], 'cancelled')
        self.assertIsNone(self.knowledge.state(self.source['id'])['snapshot'])

    def test_failed_enhancement_preserves_last_complete_snapshot(self):
        before = self.knowledge.scan(self.source['id'], 0)['snapshot']
        job = self.start()
        with patch('schema_explorer.enhance_catalog', side_effect=ValueError('real tool unavailable')):
            self.jobs.run(self.source['id'], job['id'])
        self.assertEqual(self.jobs.status(self.source['id'])['status'], 'failed')
        self.assertEqual(before, self.knowledge.state(self.source['id'])['snapshot'])

    def test_cancel_at_commit_boundary_rolls_back_snapshot(self):
        job = self.start()
        def cancelled(*args):
            self.jobs.cancel(self.source['id'], job['id'])
            return {'tool': 'explicit fixture', 'findings': []}
        with patch('schema_explorer.enhance_catalog', side_effect=cancelled):
            self.jobs.run(self.source['id'], job['id'])
        self.assertEqual(self.jobs.status(self.source['id'])['status'], 'cancelled')
        self.assertIsNone(self.knowledge.state(self.source['id'])['snapshot'])

    def test_profile_concurrency_limit_rejects_extra_processes(self):
        self.start()
        sources = []
        for name in ('second', 'third'):
            source = self.gateway.store.save(dict(engine='mysql',name=name,host='127.0.0.1',database=name,username='reader'))
            sources.append(self.gateway.store.status(source,'connected'))
        with patch('exploration_jobs.subprocess.Popen', return_value=Mock(pid=os.getpid())):
            self.jobs.start(sources[0]['id'],0)
            with self.assertRaisesRegex(ValueError,'已有探索任务'):
                self.jobs.start(sources[1]['id'],0)
        self.assertIsNone(self.jobs.status(sources[1]['id']))

    def test_dead_other_source_job_does_not_permanently_consume_quota(self):
        job = self.start()
        self.jobs.update(job['id'],pid=999999999,processIdentity='dead')
        other = self.gateway.store.save(dict(engine='mysql',name='other',host='127.0.0.1',database='other',username='reader'))
        self.gateway.store.status(other,'connected')
        with patch('exploration_jobs.subprocess.Popen', return_value=Mock(pid=os.getpid())):
            value = self.jobs.start(other['id'],0)
        self.assertEqual(value['status'],'queued')
        self.assertEqual(self.jobs.status(self.source['id'])['status'],'failed')

    def test_business_history_is_separate_from_active_note_capacity(self):
        self.knowledge.save_business(self.source['id'],0,'original')
        self.knowledge.save_business(self.source['id'],1,'original')
        self.assertEqual(self.knowledge.state(self.source['id'])['businessContext']['revision'],1)
        with patch('database_knowledge.MAX_NOTES',1):
            self.knowledge.save_business(self.source['id'],1,'changed')
        self.assertEqual(self.knowledge.state(self.source['id'])['businessContext']['content'],'changed')
        with self.gateway.store.connect() as database:
            rows=database.execute('SELECT record FROM database_business_context_history WHERE source_id=? ORDER BY revision',(self.source['id'],)).fetchall()
        self.assertEqual([json.loads(row[0])['content'] for row in rows],['original','changed'])

    def test_process_death_is_explicit_and_does_not_report_success(self):
        job = self.start()
        self.jobs.update(job['id'], pid=999999999, processIdentity='nonexistent')
        self.assertEqual(self.jobs.status(self.source['id'])['status'], 'failed')
        self.assertIsNone(self.knowledge.state(self.source['id'])['snapshot'])

    def test_save_business_before_exploration_is_explicit_and_shared_by_new_task(self):
        text = '只统计已完成订单，金额为含税金额；币种按原始币种分组。'
        value = self.knowledge.save_business(self.source['id'], 0, text)
        self.assertEqual(value['businessContext']['revision'], 1)
        self.assertIsNone(value['snapshot'])
        job = self.start(); self.jobs.run(self.source['id'], job['id'])
        other = Gateway(self.temp.name, thread_id='new-native-analysis')
        with patch.object(other, 'probe', side_effect=lambda record: dict(record, status='connected')):
            notes = DatabaseKnowledge(other).context(self.source['id'])['notes']
        self.assertEqual([text], [n['content'] for n in notes])
        self.assertEqual(notes[0]['decision'], 'savedByUser')

    def test_business_cas_clear_and_changed_connection_are_enforced(self):
        self.knowledge.save_business(self.source['id'], 0, '用户明确保存的业务背景')
        with self.assertRaisesRegex(ValueError, '其他页面'):
            self.knowledge.save_business(self.source['id'], 0, '旧页面覆盖')
        self.assertEqual(self.knowledge.context(self.source['id'])['notes'][0]['content'], '用户明确保存的业务背景')
        self.gateway.store.toggle(self.source['id'], True)
        self.gateway.store.status(self.gateway.store.get(self.source['id']), 'connected')
        self.assertTrue(self.knowledge.state(self.source['id'])['businessContext']['stale'])
        self.assertEqual(self.knowledge.context(self.source['id'])['notes'], [])
        self.knowledge.save_business(self.source['id'], 1, '')
        self.assertEqual(self.knowledge.context(self.source['id'])['notes'], [])
        history = self.knowledge.manage({'operation':'business_history','sourceId':self.source['id']})
        self.assertEqual([r['revision'] for r in history['records']], [2, 1])
        self.assertEqual(history['records'][1]['content'], '用户明确保存的业务背景')


if __name__ == '__main__':
    unittest.main()
