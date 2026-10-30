"""Native memory policy adapter regression, with loaded-thread protocol semantics.

The fake only models native subscription/config lifetime, not a model response.
Real fixed-binary no-key receipts are written separately under /tmp.
"""
from copy import deepcopy
from threading import RLock
from types import SimpleNamespace
import unittest

from native_memory_policy import NativeMemoryPolicy, memory_config
from native_execution import ExecutionBusy
from native_runtime import NativeRPCError


class ProtocolFixture:
    def __init__(self):
        self.events = []
        self.thread = {'id':'root-a','status':{'type':'idle'}}
        self.loaded = memory_config(False)
        self.subscribers = {'observer','first','second'}
        self.mode = 'enabled'
        self.failures = {}
        self.reloads = 0

    def call(self, connection, method, params):
        self.events.append((connection, method, deepcopy(params)))
        failure = self.failures.get((connection, method))
        if failure:
            raise failure
        if method == 'thread/read':
            return {'thread':deepcopy(self.thread)}
        if method == 'thread/unsubscribe':
            self.subscribers.discard(connection)
            return {}
        if method == 'thread/resume':
            # Actual native behavior: warm subscribed/active entries ignore
            # arbitrary resume config. Idle unsubscribed entries can cold load.
            if not self.subscribers and self.thread['status']['type'] == 'idle':
                self.loaded = deepcopy(params['config'])
                self.reloads += 1
            self.subscribers.add(connection)
            return {'thread':deepcopy(self.thread),'model':'deepseek-flash','modelProvider':'deepseek'}
        if method == 'experimentalFeature/list':
            return {'data':[{'name':'memories','enabled':self.loaded['features.memories']}], 'nextCursor':None}
        if method == 'thread/memoryMode/set':
            self.mode = params['mode']
            return {}
        raise AssertionError('Unexpected native request '+method)


class Connection:
    def __init__(self, fixture, name, *, closed=False):
        self.fixture, self.name, self.closed = fixture, name, closed
    def call(self, method, params):
        return self.fixture.call(self.name, method, params)


class NativeMemoryPolicyTests(unittest.TestCase):
    def setUp(self):
        self.fixture = ProtocolFixture()
        self.memory = SimpleNamespace(paused=False)
        self.memory.user_record = lambda: {'paused':self.memory.paused}
        self.execution_state = {'ownerThreadId':None,'status':'idle'}
        self.runtime = SimpleNamespace(control=RLock(),lock=RLock(),thread_memory={},subscriptions={'root-a'},starts=0)
        self.runtime.start = lambda: setattr(self.runtime,'starts',self.runtime.starts+1)
        self.runtime.execution = SimpleNamespace(snapshot=lambda: deepcopy(self.execution_state))
        self.runtime.status = lambda: {'execution':deepcopy(self.execution_state)}
        self.runtime.observer = Connection(self.fixture,'observer')
        self.first, self.second = Connection(self.fixture,'first'),Connection(self.fixture,'second')
        self.runtime.clients = {self.first,self.second}
        self.policy = NativeMemoryPolicy(self.runtime,self.memory)

    def methods(self):
        return [method for _,method,_ in self.fixture.events]

    def test_native_flag_config_is_explicit_without_automatic_raw_history_promotion(self):
        enabled = memory_config(False)
        self.assertTrue(enabled['features.memories'])
        self.assertTrue(enabled['memories.use_memories'])
        self.assertTrue(enabled['memories.dedicated_tools'])
        self.assertFalse(enabled['memories.generate_memories'])
        self.assertTrue(enabled['memories.disable_on_external_context'])
        disabled = memory_config(True)
        for name in ('features.memories','memories.use_memories','memories.dedicated_tools','memories.generate_memories'):
            self.assertFalse(disabled[name],name)
        self.assertEqual(disabled['memories.extract_model'],'deepseek-flash')
        self.assertEqual(disabled['memories.consolidation_model'],'deepseek-flash')

    def test_nested_and_flat_conflicting_policy_is_normalized_without_mutating_caller(self):
        self.memory.paused = True
        original = {'threadId':'root-a','config':{'features':{'memories':True,'multi_agent':True},'memories':{'use_memories':True,'generate_memories':True,'version':'v1','dedicated_tools':True,'max_unused_days':7},'memories.generate_memories':True,'features.memories':True,'custom.policy':'keep'}}
        before = deepcopy(original)
        result = self.policy.configured(original)
        self.assertEqual(original,before)
        self.assertNotIn('features',result['config'])
        self.assertNotIn('memories',result['config'])
        self.assertTrue(result['config']['features.multi_agent'])
        self.assertEqual(result['config']['memories.max_unused_days'],7)
        self.assertFalse(result['config']['features.memories'])
        self.assertFalse(result['config']['memories.generate_memories'])
        self.assertEqual(result['config']['custom.policy'],'keep')
        self.assertEqual(result['config']['memories.version'],'v2')

    def test_native_cold_resume_unsubscribes_every_live_browser_and_observer_before_same_id_resume(self):
        self.memory.paused = True
        result = self.policy.prepare('root-a',{'cwd':'/tmp/independent-test','excludeTurns':False})
        resume_index = self.methods().index('thread/resume')
        earlier = self.fixture.events[:resume_index]
        self.assertEqual({connection for connection,method,_ in earlier if method=='thread/unsubscribe'},{'first','second','observer'})
        resume = self.fixture.events[resume_index][2]
        self.assertEqual(resume['threadId'],'root-a')
        self.assertTrue(resume['excludeTurns'])
        self.assertEqual(resume['cwd'],'/tmp/independent-test')
        self.assertEqual(result['thread']['id'],'root-a')
        self.assertEqual(self.fixture.reloads,1)
        self.assertFalse(self.fixture.loaded['features.memories'])
        self.assertEqual(self.fixture.mode,'disabled')
        self.assertEqual(self.runtime.thread_memory,{'root-a':True})
        self.assertIn('root-a',self.runtime.subscriptions)

    def test_pause_then_reenable_rebuilds_same_thread_twice_and_preserves_id(self):
        for paused in (True,False):
            self.memory.paused = paused
            self.policy.prepare('root-a')
            self.assertEqual(self.fixture.loaded['features.memories'],not paused)
            self.assertEqual(self.runtime.thread_memory['root-a'],paused)
            self.assertEqual(self.fixture.mode,'disabled')
        self.assertEqual(self.fixture.reloads,2)
        self.assertEqual({params['threadId'] for _,method,params in self.fixture.events if method=='thread/resume'},{'root-a'})

    def test_matching_signature_does_not_unsubscribe_or_reload_again(self):
        self.policy.prepare('root-a')
        previous = len(self.fixture.events)
        self.assertIsNone(self.policy.prepare('root-a'))
        self.assertEqual(len(self.fixture.events),previous)
        self.assertEqual(self.fixture.reloads,1)

    def test_active_native_thread_refuses_cold_config_change_even_if_web_gate_is_idle(self):
        self.fixture.thread['status'] = {'type':'active','activeFlags':[]}
        with self.assertRaises(ExecutionBusy):self.policy.prepare('root-a')
        self.assertEqual(self.methods(),['thread/read'])
        self.assertEqual(self.runtime.thread_memory,{})
        self.assertEqual(self.fixture.reloads,0)

    def test_all_nonidle_execution_phases_reject_changes_before_unsubscribe(self):
        for status in ('starting','running','waitingForApproval','waitingForInput','reconciling','cleaningUp','cleanupFailed','backgroundRunning','conflicted'):
            with self.subTest(status=status):
                self.fixture.events.clear()
                self.execution_state.update(ownerThreadId='other-root',status=status)
                with self.assertRaises(ExecutionBusy):self.policy.prepare('root-a')
                self.assertEqual(self.methods(),['thread/read'])
                self.assertEqual(self.runtime.thread_memory,{})

    def test_closed_clients_are_not_controlled(self):
        self.second.closed = True
        self.fixture.subscribers.discard('second')
        self.policy.prepare('root-a')
        self.assertFalse(any(connection=='second' for connection,_,_ in self.fixture.events))
        self.assertEqual(self.fixture.reloads,1)

    def test_uninitialized_client_cannot_have_subscription_and_does_not_block_policy(self):
        self.fixture.subscribers.discard('second')
        self.fixture.failures[('second','thread/unsubscribe')] = NativeRPCError({'code':-32600,'message':'Not initialized'})
        self.policy.prepare('root-a')
        self.assertEqual(self.fixture.reloads,1)

    def test_unsubscribe_failure_is_diagnostic_and_does_not_cache_applied_policy(self):
        self.fixture.failures[('first','thread/unsubscribe')] = NativeRPCError({'code':-32000,'message':'Native unsubscribe failed'})
        with self.assertRaisesRegex(NativeRPCError,'unsubscribe failed'):self.policy.prepare('root-a')
        self.assertNotIn('thread/resume',self.methods())
        self.assertEqual(self.runtime.thread_memory,{})

    def test_resume_failure_is_not_marked_applied_and_can_retry(self):
        self.fixture.failures[('observer','thread/resume')] = NativeRPCError({'code':-32000,'message':'Native cold resume failed'})
        with self.assertRaisesRegex(NativeRPCError,'cold resume failed'):self.policy.prepare('root-a')
        self.assertEqual(self.runtime.thread_memory,{})
        self.assertNotIn('root-a',self.runtime.subscriptions)
        del self.fixture.failures[('observer','thread/resume')]
        self.policy.prepare('root-a')
        self.assertEqual(self.fixture.reloads,1)

    def test_native_parent_owned_child_is_not_rebuilt_as_user_root(self):
        self.fixture.thread['parentThreadId'] = 'parent-root'
        self.assertIsNone(self.policy.prepare('root-a'))
        self.assertEqual(self.methods(),['thread/read'])
        self.assertEqual(self.fixture.reloads,0)

    def test_created_signature_avoids_unnecessary_first_turn_reload(self):
        self.policy.created({'thread':{'id':'new-root'}})
        self.assertEqual(self.runtime.thread_memory['new-root'],False)
        self.assertIsNone(self.policy.prepare('new-root'))
        self.assertEqual(self.fixture.events,[])

    def test_prepare_cannot_resume_a_different_id_from_params(self):
        self.policy.prepare('root-a',{'threadId':'other-root'})
        request = next(params for _,method,params in self.fixture.events if method=='thread/resume')
        self.assertEqual(request['threadId'],'root-a')

    def test_memory_mode_failure_does_not_make_next_prepare_skip_unconfirmed_policy(self):
        self.fixture.failures[('observer','thread/memoryMode/set')] = NativeRPCError({'code':-32000,'message':'Native memory mode failed'})
        with self.assertRaisesRegex(NativeRPCError,'memory mode failed'):self.policy.prepare('root-a')
        self.assertNotIn('root-a',self.runtime.thread_memory)
        del self.fixture.failures[('observer','thread/memoryMode/set')]
        self.policy.prepare('root-a')
        self.assertEqual(self.fixture.mode,'disabled')

    def test_unknown_native_subscriber_prevents_silent_success_when_cold_resume_is_ignored(self):
        self.memory.paused = True
        self.fixture.subscribers.add('unregistered-native-connection')
        with self.assertRaisesRegex(RuntimeError,'memory|记忆|配置|subscriber|订阅'):
            self.policy.prepare('root-a')
        self.assertNotIn('root-a',self.runtime.thread_memory)
        self.assertEqual(self.fixture.reloads,0)
        self.assertTrue(self.fixture.loaded['features.memories'])

    def test_existing_dotted_nonpolicy_value_wins_nested_duplicate_without_overlapping_tables(self):
        result = self.policy.configured({'config':{'features':{'multi_agent':True},'features.multi_agent':False,'memories':{'max_unused_days':7},'memories.max_unused_days':3}})
        self.assertNotIn('features',result['config'])
        self.assertNotIn('memories',result['config'])
        self.assertFalse(result['config']['features.multi_agent'])
        self.assertEqual(result['config']['memories.max_unused_days'],3)

    def test_memory_tables_must_be_objects_instead_of_silently_discarding_invalid_configuration(self):
        for name,value in (('features',False),('memories','disabled')):
            with self.subTest(name=name):
                with self.assertRaises(ValueError):self.policy.configured({'config':{name:value}})

    def test_feature_verification_follows_native_pagination_for_same_loaded_thread(self):
        original = self.runtime.observer.call
        def paginated(method,params):
            if method == 'experimentalFeature/list' and not params.get('cursor'):
                self.fixture.events.append(('observer',method,deepcopy(params)))
                return {'data':[{'name':'another_feature','enabled':True}],'nextCursor':'native-page-two'}
            return original(method,params)
        self.runtime.observer.call = paginated
        self.policy.prepare('root-a')
        pages = [params for _,method,params in self.fixture.events if method=='experimentalFeature/list']
        self.assertEqual(len(pages),2)
        self.assertEqual(pages[1]['cursor'],'native-page-two')
        self.assertEqual({params['threadId'] for params in pages},{'root-a'})
        self.assertEqual(self.runtime.thread_memory['root-a'],False)

    def test_missing_native_feature_cannot_be_cached_as_success(self):
        original = self.runtime.observer.call
        def missing(method,params):
            if method == 'experimentalFeature/list':return {'data':[],'nextCursor':None}
            return original(method,params)
        self.runtime.observer.call = missing
        with self.assertRaisesRegex(NativeRPCError,'尚未实际生效'):self.policy.prepare('root-a')
        self.assertNotIn('root-a',self.runtime.thread_memory)


if __name__ == '__main__':unittest.main()
