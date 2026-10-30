"""Eligibility uses explicit small SQLite fixtures, never aged live history."""
from pathlib import Path
import sqlite3
import os
import threading
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
            db.execute('CREATE TABLE jobs (kind TEXT,job_key TEXT,status TEXT,last_error TEXT,lease_until INTEGER,retry_at INTEGER,last_success_watermark INTEGER,finished_at INTEGER)')
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)',('memory_consolidate_global','global','failed','test failure',0,0,0,None))
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
            def __init__(self,*_):
                from memory_scheduler import process_birth
                self.process=type('Process',(),{'stdin':Input(),'pid':os.getpid()})();self.birth=process_birth(os.getpid())
            def turn_status(self,*_):return 'completed'
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

class NativeEligibilityParity(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='native-memory-eligibility-');self.addCleanup(self.temp.cleanup);self.home=Path(self.temp.name)
        with sqlite3.connect(self.home/'state_5.sqlite') as db:
            db.execute('CREATE TABLE threads (id TEXT,updated_at INTEGER,updated_at_ms INTEGER,memory_mode TEXT,archived INTEGER,preview TEXT,source TEXT)')
            db.executemany('INSERT INTO threads VALUES (?,?,?,?,?,?,?)',[
                ('eligible',2996400,2996400000,'enabled',0,'a task','cli'),
                ('fraction-too-fresh',2996400,2996400001,'enabled',0,'a task','vscode'),
                ('archived',2990000,2990000000,'enabled',1,'a task','cli'),
                ('empty',2990000,2990000000,'enabled',0,'','cli'),
                ('guardian',2990000,2990000000,'enabled',0,'a task','guardian'),
                ('review',2990000,2990000000,'enabled',0,'a task','review'),
                ('native-source-enum',2990000,2990000000,'enabled',0,'a task','chatgpt')])
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:
            db.execute('CREATE TABLE stage1_outputs (thread_id TEXT,source_updated_at INTEGER)')
            db.execute('CREATE TABLE jobs (kind TEXT,job_key TEXT,status TEXT,last_error TEXT,lease_until INTEGER,retry_at INTEGER,last_success_watermark INTEGER,finished_at INTEGER,retry_remaining INTEGER,input_watermark INTEGER)')
    def test_pinned_source_archive_preview_and_millisecond_filters(self):
        self.assertEqual(['eligible','native-source-enum'],eligible(self.home,3000000))
    def test_native_success_with_no_output_is_not_repeated(self):
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?)',('memory_stage1','eligible','done',None,None,None,2996400,2996500,3,2996400))
        self.assertEqual(['native-source-enum'],eligible(self.home,3000000))
    def test_lease_backoff_exhaustion_are_wake_up_hints_only(self):
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?)',('memory_stage1','eligible','failed','fixture',None,3000100,None,2996500,0,2996400))
        self.assertEqual(['native-source-enum'],eligible(self.home,3000000))
        with sqlite3.connect(self.home/'state_5.sqlite') as db:db.execute("UPDATE threads SET updated_at=2996500,updated_at_ms=2996500000 WHERE id='eligible'")
        self.assertIn('eligible',eligible(self.home,3000200))
    def test_deleted_last_source_leaves_native_pending_work(self):
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?)',('memory_consolidate_global','global','pending',None,None,None,2990000,2970000,3,3000000))
        self.assertTrue(consolidation_due(self.home,3000000))
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:db.execute("UPDATE jobs SET finished_at=2999999")
        self.assertFalse(consolidation_due(self.home,3000000))


class NativeMaintenanceLifecycle(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='native-maintenance-protocol-');self.addCleanup(self.temp.cleanup);self.home=Path(self.temp.name)
        from native_memory import NativeMemory
        self.memory=NativeMemory('fixture',self.home);self.memory.record_note('Use concise wording','An explicit lasting user preference')
        self.calls=[];self.clock=0
    def session(self,terminal='completed'):
        test=self
        class Input:
            def write(self,_):pass
            def flush(self):pass
        class Session:
            def __init__(self,*_):
                from memory_scheduler import process_birth
                self.process=type('Process',(),{'stdin':Input(),'pid':os.getpid()})();self.birth=process_birth(os.getpid())
            def turn_status(self,*_):return terminal
            def call(self,method,params):
                test.calls.append((method,params))
                if method=='config/read':return {'config':{'features':{'memories':True},'model_provider':'deepseek'}}
                if method=='thread/start':return {'thread':{'id':'owned-trigger'}}
                if method=='turn/start':return {'turn':{'id':'trigger-turn'}}
                return {}
            def close(self):test.calls.append(('close',{}))
        return Session
    def stop(self):
        test=self
        class Stop:
            def is_set(self):return False
            def wait(self,seconds):test.clock+=seconds;return False
        return Stop()
    def test_no_claim_is_not_success_and_does_not_wait_ten_minutes(self):
        from memory_scheduler import maintain
        from native_memory import NativeMemory
        empty={'running':False,'failed':False,'jobs':0,'extracted':0,'consolidated':False}
        with patch('memory_scheduler.NativeSession',self.session()),patch('memory_scheduler.alive',return_value=True),patch('memory_scheduler.time.monotonic',side_effect=lambda:self.clock),patch.object(NativeMemory,'pipeline',return_value=empty):
            value=maintain('fixture',self.home,os.getpid(),self.stop(),lambda *a,**k:None)
        self.assertEqual('native_no_job',value);self.assertLess(self.clock,60);self.assertTrue(notes_due(self.home))
        methods=[m for m,_ in self.calls];self.assertLess(methods.index('thread/delete'),methods.index('close'))
        record=self.memory.maintenance_sessions()[0];self.assertEqual('owned-trigger',record['threadId']);self.assertEqual('trigger-turn',record['turnId']);self.assertTrue(record['removed'])
        self.assertEqual({'owned-trigger'},self.memory.maintenance_thread_ids())
    def test_trigger_failure_does_not_mark_notes_consolidated(self):
        from memory_scheduler import maintain
        from native_memory import NativeMemory
        empty={'running':False,'failed':False,'jobs':0,'extracted':0,'consolidated':False}
        with patch('memory_scheduler.NativeSession',self.session('failed')),patch('memory_scheduler.alive',return_value=True),patch.object(NativeMemory,'pipeline',return_value=empty):
            self.assertEqual('failed',maintain('fixture',self.home,os.getpid(),self.stop(),lambda *a,**k:None))
        self.assertTrue(notes_due(self.home));self.assertFalse((self.memory.directory/'scheduler-progress.json').exists())
    def test_unfinished_trigger_is_not_deleted_as_if_terminal(self):
        from memory_scheduler import maintain
        from native_memory import NativeMemory
        empty={'running':False,'failed':False,'jobs':0,'extracted':0,'consolidated':False}
        with patch('memory_scheduler.NativeSession',self.session('inProgress')),patch('memory_scheduler.alive',return_value=True),patch('memory_scheduler.time.monotonic',side_effect=lambda:self.clock),patch.object(NativeMemory,'pipeline',return_value=empty):
            self.assertEqual('timeout',maintain('fixture',self.home,os.getpid(),self.stop(),lambda *a,**k:None))
        self.assertNotIn('thread/delete',[m for m,_ in self.calls]);self.assertTrue(notes_due(self.home))
    def test_cleanup_retries_only_exact_registered_id_after_owned_process_release(self):
        from memory_scheduler import maintain
        from native_memory import NativeMemory
        empty={'running':False,'failed':False,'jobs':0,'extracted':0,'consolidated':False}
        base=self.session();instances=[]
        class Session(base):
            def __init__(current,*args):
                super().__init__(*args);current.process.pid=987654321;current.birth='fixture-owned-birth';instances.append(current)
            def call(current,method,params):
                if method=='thread/delete' and instances.index(current)==0:
                    self.calls.append((method,params));raise RuntimeError('原生记忆协议请求失败：thread/delete (active_writer)')
                return super().call(method,params)
        with patch('memory_scheduler.NativeSession',Session),patch('memory_scheduler.alive',return_value=True),patch('memory_scheduler.time.monotonic',side_effect=lambda:self.clock),patch.object(NativeMemory,'pipeline',return_value=empty):
            self.assertEqual('native_no_job',maintain('fixture',self.home,os.getpid(),self.stop(),lambda *a,**k:None))
        self.assertEqual(2,len(instances));deletes=[params for method,params in self.calls if method=='thread/delete']
        self.assertEqual([{'threadId':'owned-trigger'}]*2,deletes);self.assertEqual(1,sum(method=='turn/start' for method,_ in self.calls))
        row=self.memory.maintenance_sessions()[0];self.assertTrue(row['removed']);self.assertEqual('removed_after_release',row['cleanupStatus']);self.assertTrue(notes_due(self.home))
    def test_late_native_claim_is_drained_before_owned_process_closes(self):
        from memory_scheduler import maintain
        from native_memory import NativeMemory
        empty={'running':False,'failed':False,'jobs':0,'extracted':0,'consolidated':False}
        busy={**empty,'running':True,'jobs':1};queries=0;seen_late=False
        def pipeline(*_):
            nonlocal queries,seen_late
            queries+=1
            # 17 loop observations cause the explicit observation deadline, then
            # native can still acquire its lease during the cleanup RPC boundary.
            if queries in (18,19):seen_late=True;return busy
            return empty
        class Session(self.session()):
            def close(current):
                self.assertGreaterEqual(queries,20);super().close()
        with patch('memory_scheduler.NativeSession',Session),patch('memory_scheduler.alive',return_value=True),patch('memory_scheduler.time.monotonic',side_effect=lambda:self.clock),patch.object(NativeMemory,'pipeline',side_effect=pipeline):
            self.assertEqual('native_no_job',maintain('fixture',self.home,os.getpid(),self.stop(),lambda *a,**k:None))
        self.assertTrue(seen_late);self.assertTrue(notes_due(self.home))

    def test_expired_lease_with_running_job_is_not_terminal_or_closed_early(self):
        from memory_scheduler import maintain
        from native_memory import NativeMemory
        empty={'running':False,'failed':False,'jobs':0,'extracted':0,'consolidated':False,'unfinished':False}
        expired={**empty,'jobs':1,'unfinished':True};queries=0
        def pipeline(*_):
            nonlocal queries
            queries+=1
            return expired if queries<3 else empty
        class Session(self.session()):
            def close(current):
                self.assertGreaterEqual(queries,3);super().close()
            def call(current,method,params):
                if method=='thread/delete':self.assertGreaterEqual(queries,3)
                return super().call(method,params)
        with patch('memory_scheduler.NativeSession',Session),patch('memory_scheduler.alive',return_value=True),patch('memory_scheduler.time.monotonic',side_effect=lambda:self.clock),patch.object(NativeMemory,'pipeline',side_effect=pipeline):
            self.assertEqual('native_no_job',maintain('fixture',self.home,os.getpid(),self.stop(),lambda *a,**k:None))
        self.assertTrue(notes_due(self.home))

    def test_real_native_job_completion_without_notes_keeps_completion_receipt(self):
        import json
        from memory_scheduler import maintain
        from native_memory import NativeMemory
        for path in (self.home/'memories_v2'/'extensions'/'ad_hoc'/'notes').glob('*.md'):path.unlink()
        base=self.session()
        class Session(base):
            def call(current,method,params):
                result=super().call(method,params)
                if method=='turn/start':(self.home/'memories_v2'/'memory_summary.md').write_text('Actual fixture output on native turn trigger')
                if method=='memory/status':return {'v2Ready':True}
                if method=='thread/memory/read':return {'summary':'Actual fixture generated global memory'}
                return result
        completed={'running':False,'unfinished':False,'failed':False,'jobs':1,'extracted':1,'consolidated':True}
        with patch('memory_scheduler.NativeSession',Session),patch('memory_scheduler.alive',return_value=True),patch('memory_scheduler.eligible',return_value=['older-native-history']),patch.object(NativeMemory,'pipeline',return_value=completed):
            self.assertEqual('completed',maintain('fixture',self.home,os.getpid(),self.stop(),lambda *a,**k:None))
        receipt=json.loads((self.memory.directory/'scheduler-progress.json').read_text())
        self.assertIsNone(receipt['notesToken']);self.assertEqual('owned-trigger',receipt['nativeWorker']);self.assertEqual('trigger-turn',receipt['nativeTurnId'])
        self.assertEqual('completed',self.memory.snapshot()['consolidationState']['state'])

    def test_native_notifications_remain_correlated_when_rpc_discards_delivery(self):
        from memory_scheduler import NativeSession
        value=NativeSession.__new__(NativeSession);value.turns={};value.events_lock=threading.Lock()
        value.observe({'method':'turn/completed','params':{'threadId':'one','turn':{'id':'t1','status':'completed'}}})
        value.observe({'method':'turn/started','params':{'threadId':'two','turn':{'id':'t2','status':'inProgress'}}})
        self.assertEqual('completed',value.turn_status('one','t1'));self.assertEqual('inProgress',value.turn_status('two','t2'));self.assertIsNone(value.turn_status('two','t1'))


if __name__=='__main__':unittest.main()
