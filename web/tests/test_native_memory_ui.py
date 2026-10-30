"""Isolated profile files; clearing calls the real pinned native CLI, no model."""
from pathlib import Path
import os
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from native_memory import NativeMemory
CODEX=Path(__file__).resolve().parents[2]/'native/bin/codex'


class NativeMemoryUI(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='codex-memory-ui-');self.addCleanup(self.temp.cleanup)
        self.home=Path(self.temp.name);self.memory=NativeMemory(CODEX,self.home)
    def save(self,text):
        return self.memory.manage({'operation':'save','expectedVersion':self.memory.snapshot()['version'],'content':text})
    def test_edit_crosses_instances_and_preserves_native_summary(self):
        root=self.home/'memories_v2';root.mkdir();(root/'memory_summary.md').write_text('Original native summary')
        a=self.save('Prefer concise Chinese reports');self.assertEqual(1,a['revision'])
        b=NativeMemory(CODEX,self.home).manage({'operation':'context'})
        self.assertEqual('Prefer concise Chinese reports',b['content']);self.assertEqual(0,len(b['recent']['notes']))
        self.assertEqual('Original native summary',(root/'memory_summary.md').read_text())
        c=self.save('Prefer detailed Chinese reports');self.assertEqual(2,c['revision']);self.assertEqual('Prefer concise Chinese reports',c['history'][0]['before'])
        self.assertEqual(0o600,self.memory.file.stat().st_mode&0o777)
    def test_compare_and_swap_and_empty_edit(self):
        state=self.memory.snapshot();self.save('First')
        with self.assertRaisesRegex(ValueError,'更新'):self.memory.manage({'operation':'save','expectedVersion':state['version'],'content':'Lost edit'})
        with self.assertRaisesRegex(ValueError,'非空'):self.save('')
        self.assertEqual('First',self.memory.user_record()['content'])
    def test_read_cannot_escape_profile_or_follow_symlink(self):
        with self.assertRaises(ValueError):self.memory.manage({'operation':'read','path':'../../config.toml'})
        root=self.home/'memories';root.mkdir();(root/'escape.md').symlink_to(self.home/'unrelated')
        (self.home/'unrelated').write_text('not memory')
        with self.assertRaisesRegex(ValueError,'符号链接'):self.memory.snapshot()
    def test_native_clear_removes_only_memory_and_pauses(self):
        self.save('Testing memory')
        (self.home/'sessions').mkdir();(self.home/'sessions'/'keep.jsonl').write_text('keep conversation')
        (self.home/'web-databases').mkdir();(self.home/'web-databases'/'keep').write_text('keep business knowledge')
        state=self.memory.snapshot()
        with self.assertRaisesRegex(ValueError,'暂停'):self.memory.manage({'operation':'clear','expectedVersion':state['version'],'confirmation':'CLEAR_MEMORY'})
        state=self.memory.manage({'operation':'pause','expectedVersion':state['version'],'paused':True})
        value=self.memory.manage({'operation':'clear','expectedVersion':state['version'],'confirmation':'CLEAR_MEMORY'})
        self.assertTrue(value['cleared']);self.assertTrue(value['paused']);self.assertEqual('',value['content']);self.assertEqual(0,value['total'])
        self.assertEqual('keep conversation',(self.home/'sessions'/'keep.jsonl').read_text())
        self.assertEqual('keep business knowledge',(self.home/'web-databases'/'keep').read_text())
    def test_profiles_are_independent(self):
        self.save('Owned profile only')
        other=NativeMemory(CODEX,self.home/'another-profile');self.assertEqual('',other.user_record()['content'])

    def test_native_background_changes_do_not_conflict_with_manual_edit(self):
        state=self.memory.snapshot()
        self.memory.record_note('Prefer Chinese','Explicit test-user preference')
        value=self.memory.manage({'operation':'save','expectedVersion':state['editVersion'],'content':'Prefer concise Chinese'})
        self.assertEqual('Prefer concise Chinese',value['content'])
        self.assertNotEqual(state['version'],value['version'])

    def test_immediate_note_is_searchable_cross_instance_without_global_merge(self):
        value=self.memory.record_note('Prefer limitations before conclusions','The user explicitly requested this order')
        other=NativeMemory(CODEX,self.home)
        found=other.search('limitations');self.assertEqual(1,found['total']);self.assertEqual(value['path'],found['records'][0]['path'])
        first=other.read_entry({'path':value['path'],'limit':10})
        rest=other.read_entry({'path':value['path'],'offset':10,'expected_hash':first['sha256']})
        self.assertIn('limitations',first['text']+rest['text'])
        (self.home/value['path']).write_text('Changed historical note')
        with self.assertRaisesRegex(ValueError,'更新'):other.read_entry({'path':value['path'],'expected_hash':first['sha256']})
        self.assertFalse((self.home/'memories_v2/memory_summary.md').exists())

    def test_current_user_edit_is_searchable_without_reintroducing_superseded_edits(self):
        self.save('过期偏好：优先英文')
        latest=self.save('当前偏好：中文输出，保留数据读取时间')
        other=NativeMemory(CODEX,self.home)
        found=other.search('中文输出');self.assertEqual(1,found['total'])
        self.assertEqual('user',found['records'][0]['kind']);self.assertEqual('user-memory:current',found['records'][0]['path'])
        self.assertEqual([],other.search('过期偏好')['records'])
        part=other.read_entry({'path':found['records'][0]['path'],'limit':5})
        rest=other.read_entry({'path':part['path'],'offset':5,'expected_hash':part['sha256']})
        self.assertEqual(latest['content'],part['text']+rest['text'])
        self.save('新的当前偏好')
        with self.assertRaisesRegex(ValueError,'更新'):other.read_entry({'path':part['path'],'expected_hash':part['sha256']})
        self.assertEqual(1,len([row for row in other.search()['records'] if row['kind']=='user']))
        state=self.memory.snapshot();self.memory.manage({'operation':'pause','expectedVersion':state['editVersion'],'paused':True})
        with self.assertRaisesRegex(ValueError,'暂停'):other.search('')
        with self.assertRaisesRegex(ValueError,'暂停'):other.read_entry({'path':'user-memory:current'})

    def test_phase_one_is_readable_before_global_summary_and_has_version_guard(self):
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:
            db.execute('CREATE TABLE stage1_outputs (thread_id TEXT,source_updated_at INTEGER,rollout_summary TEXT)')
            db.executemany('INSERT INTO stage1_outputs VALUES (?,?,?)',[('task-a',20,'Chinese reports from an earlier task'),('task-b',30,'Current task lesson')])
        value=self.memory.summary_search('reports');self.assertEqual(1,value['total'])
        part=self.memory.summary_read('task-a',limit=10);self.assertTrue(part['hasMore'])
        self.assertEqual('ports from',self.memory.summary_read('task-a',offset=10,limit=10,expected_hash=part['sha256'])['text'])
        self.memory.record_note('Immediate task preference','User requested a lasting preference')
        self.assertEqual(['file','thread','thread'],[r['kind'] for r in self.memory.search('',0,3)['records']])
        self.assertEqual('task-b',self.memory.search('',1,1)['records'][0]['threadId'])
        self.assertEqual('task-a',self.memory.search('',2,1)['records'][0]['threadId'])
        self.assertEqual([],self.memory.search('',3,1)['records'])
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:db.execute("UPDATE stage1_outputs SET rollout_summary='Correction' WHERE thread_id='task-a'")
        with self.assertRaisesRegex(ValueError,'更新'):self.memory.summary_read('task-a',expected_hash=part['sha256'])
        other=NativeMemory(CODEX,self.home/'other')
        with self.assertRaisesRegex(ValueError,'没有对应'):other.summary_read('task-a')

    def test_paused_memory_refuses_agent_reads_and_writes(self):
        self.memory.record_note('A preference','A user source')
        state=self.memory.snapshot();self.memory.manage({'operation':'pause','expectedVersion':state['editVersion'],'paused':True})
        with self.assertRaisesRegex(ValueError,'暂停'):self.memory.record_note('Another','A user source')
        with self.assertRaisesRegex(ValueError,'暂停'):self.memory.search('')
        with self.assertRaisesRegex(ValueError,'暂停'):self.memory.read_entry({'path':'anything'})
        self.assertEqual([],self.memory.manage({'operation':'context'})['recent']['notes'])

    def test_clear_cannot_race_maintenance_before_native_lease_is_created(self):
        self.save('Keep this until cleanup is allowed')
        state=self.memory.snapshot();state=self.memory.manage({'operation':'pause','expectedVersion':state['editVersion'],'paused':True})
        with self.memory.maintenance_lock():
            with self.assertRaisesRegex(ValueError,'后台记忆正在'):self.memory.manage({'operation':'clear','expectedVersion':state['version'],'confirmation':'CLEAR_MEMORY'})
        self.assertEqual('Keep this until cleanup is allowed',self.memory.user_record()['content'])

    def test_actual_native_browser_root_has_no_background_jobs(self):
        from start import deepseek_profile
        from memory_scheduler import NativeSession
        deepseek_profile(self.home)
        session=NativeSession(str(CODEX),self.home,os.getpid(),threading.Event())
        try:
            session.call('initialize',{'clientInfo':{'name':'isolated_memory_lifecycle_test','version':'1'},'capabilities':{'experimentalApi':True}})
            session.process.stdin.write('{"method":"initialized"}\n');session.process.stdin.flush()
            result=session.call('thread/start',{'cwd':str(self.home),'model':'deepseek-flash','config':{'features':{'memories':False},'memories':{'version':'v2','generate_memories':True,'use_memories':False,'dedicated_tools':False}}})
            self.assertEqual('deepseek',result['modelProvider'])
            # Explicit protocol fixture, no model reply or aged timestamp. Native
            # metadata persists lazily only after actual history is appended.
            session.call('thread/inject_items',{'threadId':result['thread']['id'],'items':[{'type':'message','role':'user','content':[{'type':'input_text','text':'Isolated lifecycle fixture, not a model task.'}]}]})
            deadline=time.monotonic()+10;found=None
            while time.monotonic()<deadline:
                for path in self.home.glob('state_*.sqlite'):
                    with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as db:
                        found=db.execute('SELECT memory_mode FROM threads WHERE id=?',(result['thread']['id'],)).fetchone()
                if found:break
                time.sleep(.1)
            # Injection is an explicit protocol fixture, not a real model turn.
            # Eligibility of ordinary history is checked in the live audit.
            self.assertIsNotNone(found)
            self.assertEqual(0,self.memory.pipeline()['jobs'])
        finally:session.close()

    def test_preference_save_and_consolidation_are_separate_proven_states(self):
        state=self.save('Prefer Chinese reports')
        self.assertEqual('saved',state['preferenceState']['state']);self.assertTrue(state['preferenceState']['availableToNewTasks'])
        self.assertEqual('pending',state['consolidationState']['state']);self.assertFalse(state['consolidationState']['currentReceiptMatches'])
        root=self.home/'memories_v2';(root/'memory_summary.md').write_text('An older generated summary')
        state=self.memory.snapshot();self.assertEqual('pending',state['consolidationState']['state'])
        self.assertNotEqual('completed',state['consolidationState']['state'])
    def test_only_current_content_bound_native_receipt_reports_completed(self):
        import json
        from memory_scheduler import notes_token,generated_token
        self.save('Prefer concise reports')
        (self.home/'memories_v2'/'memory_summary.md').write_text('Native generated output fixture')
        receipt={'notesToken':notes_token(self.home),'generatedToken':generated_token(self.home),'completedAt':'2026-10-30T00:00:00+00:00','nativeWorker':'a-native-worker'}
        (self.memory.directory/'scheduler-progress.json').write_text(json.dumps(receipt))
        state=self.memory.snapshot();self.assertEqual('completed',state['consolidationState']['state']);self.assertTrue(state['consolidationState']['currentReceiptMatches'])
        self.save('Prefer detailed reports')
        state=self.memory.snapshot();self.assertEqual('pending',state['consolidationState']['state']);self.assertFalse(state['consolidationState']['currentReceiptMatches'])
        self.assertTrue(state['preferenceState']['availableToNewTasks'])

    def test_pending_source_deletion_overrides_old_completed_receipt(self):
        import json
        from memory_scheduler import notes_token,generated_token
        self.save('A saved preference')
        (self.home/'memories_v2'/'memory_summary.md').write_text('Older generated summary')
        receipt={'notesToken':notes_token(self.home),'generatedToken':generated_token(self.home),'completedAt':'2026-10-30T00:00:00+00:00','nativeWorker':'old-worker'}
        (self.memory.directory/'scheduler-progress.json').write_text(json.dumps(receipt))
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:
            db.execute('CREATE TABLE jobs (kind TEXT,job_key TEXT,status TEXT,last_error TEXT,lease_until INTEGER,retry_at INTEGER,finished_at INTEGER)')
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?)',('memory_consolidate_global','global','pending',None,None,None,None))
        value=self.memory.snapshot()['consolidationState'];self.assertEqual('pending',value['state']);self.assertTrue(value['pendingGlobal']);self.assertFalse(value['currentReceiptMatches'])
    def test_native_retry_backoff_is_distinct_from_normal_cooldown(self):
        user=self.memory.user_record()
        _,value=self.memory.memory_states(user,{'state':'waiting_native_retry','until':time.time()+60},{},{})
        self.assertEqual('retrying',value['state'])
        _,value=self.memory.memory_states(user,{'state':'waiting_native_cooldown','until':time.time()+60},{},{})
        self.assertEqual('cooling_down',value['state'])

    def test_summary_source_update_and_removal_are_historical_only(self):
        with sqlite3.connect(self.home/'memories_v2_1.sqlite') as db:
            db.execute('CREATE TABLE stage1_outputs (thread_id TEXT,source_updated_at INTEGER,rollout_summary TEXT)')
            db.executemany('INSERT INTO stage1_outputs VALUES (?,?,?)',[('current',10,'Historical current'),('stale',10,'Historical old wording'),('gone',10,'Historical removed source')])
        with sqlite3.connect(self.home/'state_5.sqlite') as db:
            db.execute('CREATE TABLE threads (id TEXT,updated_at INTEGER)');db.executemany('INSERT INTO threads VALUES (?,?)',[('current',10),('stale',20)])
        records={v['threadId']:v for v in self.memory.summary_search()['records']}
        self.assertEqual('current',records['current']['sourceState']);self.assertEqual('stale',records['stale']['sourceState']);self.assertEqual('missing',records['gone']['sourceState'])
        self.assertTrue(all(r['historical'] for r in records.values()))
        read=self.memory.summary_read('stale');self.assertEqual('stale',read['sourceState']);self.assertEqual(20,read['sourceThreadUpdatedAt'])
    def test_maintenance_identity_is_profile_owned_and_survives_removed_state(self):
        from memory_maintenance import MaintenanceSessions,process_birth
        registry=MaintenanceSessions(self.home);registry.register('internal-id',pid=os.getpid(),birth=process_birth(os.getpid()),owner_pid=os.getpid(),scheduler_pid=os.getpid(),workspace=self.memory.directory/'maintenance')
        registry.update('internal-id',status='completed',removed=True)
        state=NativeMemory(CODEX,self.home).snapshot();self.assertEqual(['internal-id'],state['maintenanceSessionIds']);self.assertTrue(state['maintenanceSessions'][0]['removed'])
        other=NativeMemory(CODEX,self.home/'other');self.assertEqual(set(),other.maintenance_thread_ids())
        self.assertNotIn('a-user-title-that-looks-like-maintenance',self.memory.maintenance_thread_ids())
    def test_symlink_maintenance_registry_is_rejected(self):
        (self.memory.directory/'maintenance-sessions.sqlite').symlink_to(self.home/'unrelated')
        with self.assertRaisesRegex(ValueError,'符号链接'):self.memory.maintenance_thread_ids()

if __name__=='__main__':unittest.main()
