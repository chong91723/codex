"""Eligibility uses explicit small SQLite fixtures, never aged live history."""
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from memory_scheduler import eligible, consolidation_due, native_control, notes_due, notes_token


class MemorySchedulerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='memory-scheduler-fixture-');self.addCleanup(self.temp.cleanup);self.home=Path(self.temp.name)
        with sqlite3.connect(self.home/'state_5.sqlite') as db:
            db.execute('CREATE TABLE threads (id TEXT, updated_at INTEGER, memory_mode TEXT)')
            db.executemany('INSERT INTO threads VALUES (?,?,?)',[('idle',2996400,'enabled'),('busy',2996401,'enabled'),('disabled',2990000,'disabled'),('too-old',1,'enabled')])
    def test_one_hour_boundary_and_disabled_history(self):
        self.assertEqual(['idle'],eligible(self.home,3000000))
    def test_processed_history_not_rescheduled_until_updated(self):
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:
            db.execute('CREATE TABLE stage1_outputs (thread_id TEXT,source_updated_at INTEGER)')
            db.execute('INSERT INTO stage1_outputs VALUES (?,?)',('idle',2996400))
        self.assertEqual([],eligible(self.home,3000000))
        with sqlite3.connect(self.home/'state_5.sqlite') as db:db.execute("UPDATE threads SET updated_at=2996500 WHERE id='idle'")
        self.assertEqual(['idle','busy'],eligible(self.home,3000100))
    def test_no_state_is_not_fake_completed_memory(self):
        self.assertEqual([],eligible(self.home/'empty',3000000))
    def test_failed_consolidation_is_retried_without_new_history(self):
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:
            db.execute('CREATE TABLE stage1_outputs (thread_id TEXT,source_updated_at INTEGER)')
            db.execute('INSERT INTO stage1_outputs VALUES (?,?)',('idle',2996400))
            db.execute('CREATE TABLE jobs (kind TEXT,job_key TEXT,status TEXT,last_error TEXT,lease_until INTEGER,retry_at INTEGER,last_success_watermark INTEGER)')
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?)',('memory_consolidate_global','global','failed','test failure',0,0,0))
        self.assertEqual([],eligible(self.home,3000000))
        self.assertTrue(consolidation_due(self.home,3000000))
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:db.execute("UPDATE jobs SET retry_at=3000100")
        self.assertFalse(consolidation_due(self.home,3000000))
        root=self.home/'memories_v2';root.mkdir();(root/'memory_summary.md').write_text('Actual completed summary fixture')
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:db.execute("UPDATE jobs SET status='done',last_error=NULL,retry_at=NULL,last_success_watermark=2996400")
        self.assertFalse(consolidation_due(self.home,3000000))

    def test_symlinked_native_index_is_rejected(self):
        (self.home/'state_other.sqlite').symlink_to(self.home/'state_5.sqlite')
        with self.assertRaisesRegex(ValueError,'路径无效'):eligible(self.home,3000000)

    def test_native_cooldown_is_reported_without_changing_jobs(self):
        path=self.home/'memories_v2_1.sqlite'
        with sqlite3.connect(path) as db:
            db.execute('CREATE TABLE jobs (kind TEXT,job_key TEXT,status TEXT,lease_until INTEGER,retry_at INTEGER,finished_at INTEGER,last_error TEXT)')
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?)',('memory_consolidate_global','global','done',None,None,3000000,None))
        self.assertEqual({'state':'waiting_native_cooldown','until':3021600},native_control(self.home,3000001))
        self.assertEqual({'state':'ready'},native_control(self.home,3021600))
        with sqlite3.connect(path) as db:
            self.assertEqual(3000000,db.execute('SELECT finished_at FROM jobs').fetchone()[0])
            db.execute("UPDATE jobs SET status='running',lease_until=3000100")
        self.assertEqual('waiting_native_busy',native_control(self.home,3000001)['state'])

    def test_notes_remain_due_until_real_completion_receipt_matches(self):
        from native_memory import NativeMemory
        import json
        memory=NativeMemory('unused',self.home)
        self.assertFalse(notes_due(self.home))
        memory.record_note('Prefer careful reports','A durable test preference')
        self.assertTrue(notes_due(self.home))
        token=notes_token(self.home)
        (memory.directory/'scheduler-progress.json').write_text(json.dumps({'notesToken':token}))
        self.assertFalse(notes_due(self.home))
        memory.record_note('Prefer Chinese reports','Another durable test preference')
        self.assertTrue(notes_due(self.home))

    def test_maintenance_submits_real_native_trigger_before_claiming_success(self):
        from native_memory import NativeMemory
        from memory_scheduler import maintain
        memory=NativeMemory('fixture-executable',self.home)
        memory.record_note('Prefer concise reports','Explicit durable user preference')
        calls=[];statuses=[];home=self.home
        class Stop:
            def __init__(self):self.waits=0
            def is_set(self):return False
            def wait(self,_):
                self.waits+=1
                if self.waits>1:raise AssertionError('Expected actual trigger and a completed native job before next iteration')
                return False
        class Input:
            def write(self,_):pass
            def flush(self):pass
        class Session:
            def __init__(self,*_):self.process=type('Process',(),{'stdin':Input()})()
            def close(self):calls.append(('close',{}))
            def call(self,method,params):
                calls.append((method,params))
                if method=='config/read':return {'config':{'features':{'memories':True},'model_provider':'deepseek','mcp_servers':{'fixture_data':{}}}}
                if method=='thread/start':return {'thread':{'id':'owned-maintenance'}}
                if method=='turn/start':
                    (home/'memories_v2/memory_summary.md').write_text('Explicit native output fixture generated only on turn/start')
                    return {'turn':{'id':'trigger'}}
                if method=='memory/status':return {'v2Ready':False}
                if method=='thread/memory/read':return {'summary':'Native fixture summary'}
                return {}
        pipeline={'running':False,'failed':False,'jobs':1,'extracted':0,'consolidated':True}
        with patch('memory_scheduler.NativeSession',Session),patch('memory_scheduler.alive',return_value=True),patch.object(NativeMemory,'pipeline',return_value=pipeline):
            self.assertEqual('completed',maintain('fixture-executable',home,123,Stop(),lambda status,**kw:statuses.append((status,kw))))
        methods=[m for m,_ in calls]
        self.assertLess(methods.index('turn/start'),methods.index('memory/status'))
        start=next(p for m,p in calls if m=='thread/start');self.assertFalse(start['config']['memories']['generate_memories']);self.assertTrue(start['config']['memories']['use_memories']);self.assertEqual('read-only',start['sandbox']);self.assertFalse(start['config']['mcp_servers.fixture_data.enabled'])
        trigger=next(p for m,p in calls if m=='turn/start');self.assertEqual('deepseek-flash',trigger['model']);self.assertTrue(trigger['input'][0]['text'])
        self.assertIn('thread/delete',methods)
        self.assertFalse(notes_due(home))

if __name__=='__main__':unittest.main()
