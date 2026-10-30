"""Real SQLite concurrent edits and downstream stale-result rejection."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
sys.path[:0]=[str(Path(__file__).resolve().parents[1]/'database'),str(Path(__file__).resolve().parents[1])]
from service import Gateway

class SourceEditConcurrency(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.gateway=Gateway(self.temp.name,thread_id='fixture',turn_id='edit')
        self.payload={'engine':'mysql','name':'Fixture','host':'original.invalid','database':'sales','username':'readonly','password':'fixture-only'}
        self.source=self.gateway.store.save(self.payload)

    def competing(self,with_version):
        barrier=threading.Barrier(2)
        def edit(host):
            payload=dict(self.payload,id=self.source['id'],host=host)
            if with_version:payload['expectedVersion']=self.source['version']
            barrier.wait(timeout=5)
            try:return self.gateway.store.save(payload)
            except ValueError as error:return str(error)
        with ThreadPoolExecutor(max_workers=2) as pool:return list(pool.map(edit,['a.invalid','b.invalid']))

    def test_two_stale_forms_cannot_both_save(self):
        values=self.competing(True)
        self.assertEqual(sum(isinstance(value,dict) for value in values),1)
        self.assertIn('其他页面',next(value for value in values if isinstance(value,str)))
        self.assertEqual(self.gateway.store.get(self.source['id'])['version'],2)

    def test_legacy_atomic_saves_get_distinct_versions_and_old_result_fails(self):
        values=self.competing(False)
        self.assertEqual(sorted(value['version'] for value in values),[2,3])
        self.gateway.store.status(self.gateway.store.get(self.source['id']),'connected')
        metadata={'connectionId':self.source['id'],'connectionVersion':2,'connectionDependencies':[{'id':self.source['id'],'version':2}]}
        with patch.object(self.gateway,'probe',side_effect=lambda record:dict(record,status='connected')):
            with self.assertRaisesRegex(ValueError,'变更'):self.gateway.result_owner(metadata)

    def test_stale_toggle_remove_and_probe_cannot_undo_new_configuration(self):
        store=self.gateway.store
        changed=store.save(dict(self.payload,id=self.source['id'],expectedVersion=1,host='changed.invalid'))
        for operation in [lambda:store.toggle(self.source['id'],False,1),lambda:store.remove(self.source['id'],1),lambda:store.status(self.source,'connected')]:
            with self.assertRaisesRegex(ValueError,'变更'):operation()
        self.assertEqual(store.get(self.source['id'])['host'],changed['host'])

    def test_save_preserves_concurrent_policy_and_password(self):
        store=self.gateway.store;store.set_freshness(self.source['id'],30,expected_revision=0)
        changed=store.save(dict(self.payload,id=self.source['id'],expectedVersion=1,password=''))
        self.assertEqual(changed['maxAgeMinutes'],30);self.assertEqual(changed['password'],'fixture-only')

    def test_freshness_cas_rejects_stale_editor_without_changing_connection_version(self):
        store=self.gateway.store;initial=store.get(self.source['id']);revision=initial.get('freshnessRevision',0)
        first=store.set_freshness(self.source['id'],10,revision)
        self.assertEqual(first['version'],initial['version']);self.assertEqual(first['status'],initial['status'])
        with self.assertRaisesRegex(ValueError,'其他页面更新'):store.set_freshness(self.source['id'],20,revision)
        self.assertEqual(store.get(self.source['id'])['maxAgeMinutes'],10)
        second=store.set_freshness(self.source['id'],20,first['freshnessRevision'])
        self.assertEqual(second['maxAgeMinutes'],20);self.assertEqual(second['freshnessRevision'],revision+2)
        for missing in [None,True,-1,'1']:
            with self.subTest(missing=missing),self.assertRaisesRegex(ValueError,'版本'):store.set_freshness(self.source['id'],30,missing)

    def test_freshness_revisions_detect_aba_and_survive_connection_edit_and_late_probe(self):
        store=self.gateway.store;original=store.get(self.source['id']);revision=original.get('freshnessRevision',0)
        first=store.set_freshness(self.source['id'],10,revision)
        restored=store.set_freshness(self.source['id'],original.get('maxAgeMinutes'),first['freshnessRevision'])
        with self.assertRaisesRegex(ValueError,'其他页面更新'):store.set_freshness(self.source['id'],20,revision)
        store.status(original,'connected');self.assertEqual(store.get(self.source['id'])['freshnessRevision'],restored['freshnessRevision'])
        current=store.get(self.source['id']);changed=store.save(dict(current,name='renamed',expectedVersion=current['version']))
        self.assertEqual(changed['freshnessRevision'],restored['freshnessRevision'])
