"""Native protocol fixtures only: no native process, model or business database."""
import queue
from pathlib import Path
import sys
import threading
import time
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from native_runtime import NativeClient, NativeRuntime, NativeRPCError, NativeDisconnected
from native_execution import ExecutionBusy


def event(method, thread='a', turn='t1', **params):
    value = {'threadId': thread, **params}
    if method in ('turn/started', 'turn/completed'):
        value['turn'] = {'id': turn, 'status': params.pop('turn_status', 'completed' if method.endswith('completed') else 'inProgress')}
    elif turn is not None:
        value['turnId'] = turn
    return {'method': method, 'params': value}


class FakeEvidence:
    def __init__(self): self.messages = []
    def observe(self, message): self.messages.append(message)


class FakeObserver:
    closed = False
    def __init__(self):
        self.calls, self.threads, self.terminals, self.queues = [], {}, {}, {}
        self.goals, self.goal_error, self.on_goal, self.on_queue = {}, None, None, None
        self.fail_termination = False
        self.terminate_removes = True
        self.on_list = None
        self.closed_native, self.full_history = set(), {}
        self.history_error, self.on_history = None, None
    def call(self, method, params=None, timeout=30):
        params = params or {}
        self.calls.append((method, dict(params)))
        identity = params.get('threadId')
        if method in ('thread/start', 'thread/fork'):
            thread = {'id': 'empty', 'source': 'vscode', 'path': None, 'status': {'type': 'idle'}}
            self.threads['empty'] = thread
            return {'thread': thread}
        if method in ('thread/resume', 'thread/read'):
            if method == 'thread/read' and params.get('includeTurns'):
                if self.history_error:
                    raise self.history_error
                if self.on_history:
                    hook, self.on_history = self.on_history, None
                    hook()
                return {'thread': self.full_history[identity]}
            return {'thread': dict(self.threads.get(identity, {'id': identity, 'source': 'vscode', 'status': {'type': 'idle'}}))}
        if method == 'thread/name/set':
            self.threads.setdefault(identity, {'id': identity})['name'] = params['name']
            return {}
        if method == 'thread/backgroundTerminals/list':
            if identity in self.closed_native:
                raise NativeRPCError({'code': -32600, 'message': 'thread not found: '+identity})
            values = [dict(value) for value in self.terminals.get(identity, [])]
            if self.on_list:
                hook, self.on_list = self.on_list, None
                hook()
            return {'data': values, 'nextCursor': None}
        if method == 'thread/backgroundTerminals/terminate':
            if self.fail_termination:
                raise NativeRPCError({'code': -32000, 'message': 'fixture termination failed'})
            if self.terminate_removes:
                self.terminals[identity] = [value for value in self.terminals.get(identity, []) if value['processId'] != params['processId']]
            return {'terminated': self.terminate_removes}
        if method == 'thread/queue/list':
            if self.on_queue:
                hook, self.on_queue = self.on_queue, None
                hook()
            return {'data': list(self.queues.get(identity, [])), 'nextCursor': None}
        if method == 'thread/goal/get':
            if self.goal_error:
                raise self.goal_error
            if self.on_goal:
                hook, self.on_goal = self.on_goal, None
                hook()
            return {'goal': self.goals.get(identity)}
        raise AssertionError('Unexpected native call '+method)
    def close(self): self.closed = True


class FakeBrowser:
    def __init__(self, prefix='client-1'):
        self.prefix, self.calls, self.on_resume = prefix, [], None
    def call(self, method, params=None, timeout=30):
        self.calls.append((method, dict(params or {})))
        if method != 'thread/resume':
            raise AssertionError('Unexpected browser native call '+method)
        if self.on_resume:
            self.on_resume()
        return {'thread': {'id': params['threadId']}}


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.runtime = NativeRuntime('unused-codex', '/tmp', (), lambda _: None, lambda _: None, lambda _: None,
                                     evidence=FakeEvidence(), start_workers=False)
        self.runtime.observer = FakeObserver()
        self.runtime.remember_thread({'id': 'a', 'source': 'vscode'}, historical=True)
        self.runtime.remember_thread({'id': 'b', 'source': 'vscode'}, historical=True)
        self.runtime.subscriptions.update(('a', 'b'))
        self.client = FakeBrowser()
    def tearDown(self): self.runtime.close()
    def request(self, method, identity='a', identifier=1, **params):
        return {'id': identifier, 'method': method, 'params': {'threadId': identity, **params}}
    def start(self, identity='a', turn='t1'):
        self.runtime.observe(event('turn/started', identity, turn))
    def complete(self, identity='a', turn='t1', status='completed'):
        self.runtime.observe(event('turn/completed', identity, turn, turn_status=status))
    def command(self, identity='a', turn='t1', item='cmd'):
        self.runtime.observe(event('item/started', identity, turn, item={'type': 'commandExecution', 'id': item}))
    def snapshot(self): return self.runtime.status()['execution']

    def draining_client(self, wire=None, receive=None, closed=lambda: None):
        wire = wire or AckHeldWire()
        with patch.object(self.runtime, 'start'), patch('native_runtime.connect_unix', return_value=wire):
            client = self.runtime.open_client(receive or (lambda _: None), closed, lambda _: None)
        return client, wire

    def test_raw_page_close_before_ack_drains_native_reply_after_observer_completed(self):
        client, wire = self.draining_client()
        self.assertTrue(client.send(self.request('turn/start')))
        self.assertTrue(wire.turn_sent.is_set())
        self.runtime.remove_client(client)  # page EOF after actual native send
        self.assertTrue(client.detached)
        self.assertFalse(wire.native_closed.is_set())
        self.assertEqual(self.snapshot()['drainingConnections'], 1)
        self.start(); self.complete(); self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['pendingCount'], 1)
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        wire.incoming.put({'id': 1, 'result': {'turn': {'id': 't1'}}})
        self.assertTrue(wire.native_closed.wait(1))
        client.reader.join(timeout=1)
        self.assertFalse(client.reader.is_alive())
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['pendingCount'], 0)
        self.assertEqual(self.snapshot()['drainingConnections'], 0)
        self.assertIsNone(self.snapshot()['ownerThreadId'])
        self.assertEqual(sum(message['method'] == 'turn/start' for message in wire.messages), 1)

    def test_detached_native_rpc_error_settles_reservation_without_observer_inference(self):
        client, wire = self.draining_client()
        client.send(self.request('turn/start'))
        self.runtime.remove_client(client)
        wire.incoming.put({'id': 1, 'error': {'code': -32600, 'message': 'native rejected'}})
        self.assertTrue(wire.native_closed.wait(1))
        client.reader.join(timeout=1)
        self.assertIsNone(self.snapshot()['ownerThreadId'])
        self.assertEqual(self.runtime.requests, {})

    def test_detached_connection_waits_for_all_tracked_responses(self):
        client, wire = self.draining_client()
        client.send(self.request('turn/start'))
        client.send(self.request('thread/queue/delete', identifier=2, queuedSubmissionId='q1'))
        self.runtime.remove_client(client)
        first_ack_processed = threading.Event()
        original = client.after_receive
        def after_receive(connection, message):
            original(connection, message)
            if message.get('id') == 1:
                first_ack_processed.set()
        client.after_receive = after_receive
        wire.incoming.put({'id': 1, 'result': {'turn': {'id': 't1'}}})
        self.assertTrue(first_ack_processed.wait(1))
        self.assertFalse(wire.native_closed.is_set())
        self.assertEqual(len(self.snapshot()['pendingNativeAcks']), 1)
        wire.incoming.put({'id': 2, 'result': {'deleted': False}})
        self.assertTrue(wire.native_closed.wait(1))
        client.reader.join(timeout=1)
        self.assertEqual(self.runtime.requests, {})

    def test_browser_delivery_overflow_detaches_without_losing_execution_ack(self):
        entered, release, page_closed = threading.Event(), threading.Event(), threading.Event()
        def slow(message):
            if message.get('method') == 'fixture/slow-page':
                entered.set()
                release.wait(2)
        client, wire = self.draining_client(receive=slow, closed=page_closed.set)
        try:
            client.send(self.request('turn/start'))
            wire.incoming.put({'method': 'fixture/slow-page'})
            self.assertTrue(entered.wait(1))
            # The consumer is held by an Event. Overflow its now-small queue
            # deterministically without depending on a browser/model delay.
            with client.delivery.mutex:
                client.delivery.maxsize = 1
            client._post('receive', {'method': 'fixture/queued'})
            client._post('receive', {'method': 'fixture/overflow'})
            self.assertTrue(page_closed.wait(1))
            self.assertTrue(client.detached)
            self.assertFalse(wire.native_closed.is_set())
            wire.incoming.put({'id': 1, 'result': {'turn': {'id': 't1'}}})
            self.assertTrue(wire.native_closed.wait(1))
            client.reader.join(timeout=1)
            self.assertEqual(self.snapshot()['pendingCount'], 0)
        finally:
            release.set()

    def test_actual_native_eof_before_ack_stays_diagnosable_fail_closed(self):
        client, wire = self.draining_client()
        client.send(self.request('turn/start'))
        self.runtime.remove_client(client)
        wire.close()  # native EOF is materially different from page EOF
        client.reader.join(timeout=1)
        self.start(); self.complete(); self.runtime._check_background_once()
        snapshot = self.snapshot()
        self.assertEqual(snapshot['status'], 'acknowledgementUnknown')
        self.assertEqual(snapshot['pendingCount'], 1)
        self.assertIn('请求结果未知', snapshot['pendingNativeAcks'][0]['error'])
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start', 'b', 2))

    def test_browser_writer_failure_detaches_delivery_but_preserves_native_reader(self):
        page_closed = threading.Event()
        def receive(message):
            if message.get('method') == 'fixture/browser-write':
                raise BrokenPipeError('browser was raw-closed')
        client, wire = self.draining_client(receive=receive, closed=page_closed.set)
        client.send(self.request('turn/start'))
        wire.incoming.put({'method': 'fixture/browser-write'})
        self.assertTrue(page_closed.wait(1))
        self.assertTrue(client.detached)
        self.assertFalse(wire.native_closed.is_set())
        wire.incoming.put({'id': 1, 'result': {'turn': {'id': 't1'}}})
        self.assertTrue(wire.native_closed.wait(1))
        client.reader.join(timeout=1)
        self.assertEqual(self.snapshot()['pendingCount'], 0)
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.complete(); self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_detach_during_before_request_keeps_private_subscription_and_execution_ack(self):
        wire = AckHeldWire(resume_immediate=False)
        client, wire = self.draining_client(wire)
        sent = threading.Event()
        sender = threading.Thread(target=lambda: (client.send(self.request('turn/start')), sent.set()))
        sender.start()
        try:
            subscribe = wire.sent.get(timeout=1)
            self.assertEqual(subscribe['method'], 'thread/resume')
            self.runtime.remove_client(client)
            self.assertFalse(wire.native_closed.is_set())
            wire.incoming.put({'id': subscribe['id'], 'result': {'thread': {'id': 'a'}}})
            self.assertTrue(sent.wait(1))
            self.assertTrue(wire.turn_sent.is_set())
            self.assertFalse(wire.native_closed.is_set())
            wire.incoming.put({'id': 1, 'result': {'turn': {'id': 't1'}}})
            self.assertTrue(wire.native_closed.wait(1))
            client.reader.join(timeout=1)
            self.assertEqual(self.snapshot()['pendingCount'], 0)
        finally:
            client.close()
            sender.join(timeout=1)

    def test_browser_gate_reserves_before_ack_and_disconnect_does_not_release(self):
        self.runtime.before_request(self.client, self.request('turn/start'))
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(types.SimpleNamespace(prefix='other'), self.request('turn/start', 'b'))
        self.runtime.execution.connection_closed('client-1')
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.runtime.after_response(self.client, {'id': 1, 'error': {'code': -1, 'message': 'native rejected'}})
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_completion_before_late_ack_never_releases_or_resurrects_incorrectly(self):
        self.runtime.before_request(self.client, self.request('turn/start'))
        self.start()
        self.complete()
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.runtime.after_response(self.client, {'id': 1, 'result': {'turn': {'id': 't1'}}})
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_normal_completion_with_live_terminal_is_observed_never_terminated(self):
        self.runtime.observer.terminals['a'] = [{'itemId': 'cmd', 'processId': '1', 'command': 'fixture worker'}]
        self.start()
        self.complete()
        self.runtime._check_background_once()
        snapshot = self.snapshot()
        self.assertEqual(snapshot['status'], 'backgroundRunning')
        self.assertEqual(snapshot['ownerThreadId'], 'a')
        self.assertEqual(snapshot['cleanupHolds'][0]['turnId'], 't1')
        self.assertFalse(any(method.endswith('/terminate') for method, _ in self.runtime.observer.calls))
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start', 'b', 2))
        self.runtime.observer.terminals['a'] = []
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_normal_completion_without_background_releases_after_native_check(self):
        self.start(); self.complete()
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])
        self.assertFalse(any(method.endswith('/terminate') for method, _ in self.runtime.observer.calls))

    def test_native_idle_before_completed_cannot_release_then_reclaim_old_root(self):
        self.start()
        # Native's global idle is emitted before the subscribed terminal event.
        self.runtime.observe(event('thread/status/changed', turn=None, status={'type': 'idle'}))
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['activeTurns'], [{'threadId': 'a', 'turnId': 't1'}])
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start', 'b', 2))
        self.complete()
        self.assertEqual(self.snapshot()['cleanupHolds'][0]['turnId'], 't1')
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])
        self.runtime.before_request(self.client, self.request('turn/start', 'b', 2))
        self.complete()  # duplicate old terminal event must not reclaim A.
        self.assertEqual(self.snapshot()['ownerThreadId'], 'b')
        self.assertEqual(self.snapshot()['blockedRootThreadIds'], ['b'])

    def test_failed_turn_terminates_real_native_process_ids_and_rechecks(self):
        self.runtime.observer.terminals['a'] = [{'itemId': 'observed-command', 'processId': '912'}]
        self.start(); self.command(item='observed-command'); self.complete(status='failed')
        self.runtime._check_background_once()
        calls = self.runtime.observer.calls
        termination = next(params for method, params in calls if method.endswith('/terminate'))
        self.assertEqual(termination, {'threadId': 'a', 'processId': '912'})
        self.assertGreaterEqual(sum(method.endswith('/list') for method, _ in calls), 2)
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_interrupt_after_completed_promotes_observation_to_real_cleanup(self):
        self.runtime.observer.terminals['a'] = [{'itemId': 'cmd', 'processId': '12'}]
        self.start(); self.command(); self.complete(); self.runtime._check_background_once()
        self.runtime.before_request(self.client, self.request('turn/interrupt', turnId='t1'))
        self.runtime._check_background_once()
        self.assertTrue(any(method.endswith('/terminate') for method, _ in self.runtime.observer.calls))
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_unknown_foreign_interrupt_is_native_only_and_cannot_create_conflict(self):
        self.start()
        replies = queue.Queue()
        client, wire = self.draining_client(receive=replies.put)
        for number, identity in ((71, 'b'), (72, 'never-native-thread')):
            request = self.request('turn/interrupt', identity, number, turnId='unknown-turn')
            self.assertTrue(client.send(request))
            self.assertIn(request, wire.messages)
            error = {'id': number, 'error': {'code': -32600, 'message': 'native thread/turn not found'}}
            wire.incoming.put(error)
            self.assertEqual(replies.get(timeout=1), error)
            self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
            self.assertEqual(self.snapshot()['blockedRootThreadIds'], ['a'])
            self.assertEqual(self.snapshot()['cleanupHolds'], [])
            self.assertNotIn(identity, self.runtime.dirty_threads)
        self.assertFalse(client.closed)

    def test_wrong_turn_interrupt_does_not_claim_cleanup_for_current_thread(self):
        self.start()
        self.runtime.before_request(self.client, self.request('turn/interrupt', turnId='old-or-wrong-turn'))
        self.runtime.after_response(self.client, {'id': 1, 'error': {
            'code': -32600, 'message': 'expected active turn id old-or-wrong-turn but found t1'}})
        self.assertEqual(self.snapshot()['activeTurns'], [{'threadId': 'a', 'turnId': 't1'}])
        self.assertEqual(self.snapshot()['cleanupHolds'], [])

    def test_settled_historical_interrupt_cannot_reclaim_old_root_while_b_runs(self):
        self.start(); self.complete(); self.runtime._check_background_once()
        self.start('b', 'b1')
        self.runtime.before_request(self.client, self.request('turn/interrupt', 'a', 2, turnId='t1'))
        self.runtime.after_response(self.client, {'id': 2, 'error': {'code': -32600, 'message': 'no active turn to interrupt'}})
        self.assertEqual(self.snapshot()['blockedRootThreadIds'], ['b'])
        self.assertEqual(self.snapshot()['cleanupHolds'], [])

    def test_current_interrupt_native_error_keeps_hold_until_actual_completion_and_cleanup(self):
        self.start(); self.command()
        self.runtime.observer.terminals['a'] = [{'itemId': 'cmd', 'processId': '12'}]
        self.runtime.before_request(self.client, self.request('turn/interrupt', turnId='t1'))
        self.runtime.after_response(self.client, {'id': 1, 'error': {'code': -32600, 'message': 'native interrupt outcome error'}})
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.assertTrue(self.snapshot()['cleanupHolds'])
        self.assertEqual(self.snapshot()['activeTurns'], [{'threadId': 'a', 'turnId': 't1'}])
        self.assertFalse(any(method.endswith('/terminate') for method, _ in self.runtime.observer.calls))
        self.complete(status='interrupted')
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])
        self.assertIn(('thread/backgroundTerminals/terminate', {'threadId': 'a', 'processId': '12'}), self.runtime.observer.calls)

    def test_failed_cleanup_holds_until_retry_and_fresh_native_empty(self):
        self.runtime.observer.terminals['a'] = [{'itemId': 'cmd', 'processId': '12'}]
        self.runtime.observer.fail_termination = True
        self.start(); self.command(); self.complete(status='interrupted')
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['status'], 'cleanupFailed')
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.runtime.observer.fail_termination = False
        self.runtime.before_request(self.client, self.request('turn/interrupt', turnId='t1'))
        # Even if the already-completed native interrupt RPC returns an error,
        # the independent cleanup job is retained and retried.
        self.runtime.after_response(self.client, {'id': 1, 'error': {'code': -1, 'message': 'turn not running'}})
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_false_terminate_ack_does_not_mean_background_is_gone(self):
        self.runtime.observer.terminals['a'] = [{'itemId': 'cmd', 'processId': '12'}]
        self.runtime.observer.terminate_removes = False
        self.start(); self.command(); self.complete(status='failed')
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.assertEqual(len(self.snapshot()['backgroundCommands']), 1)

    def test_interrupt_does_not_kill_older_turn_or_unknown_native_commands(self):
        self.command(turn='older-turn', item='old-command')
        self.start(); self.command(item='current-command')
        self.runtime.observer.terminals['a'] = [
            {'itemId': 'old-command', 'processId': '10'},
            {'itemId': 'current-command', 'processId': '20'},
            {'itemId': 'not-observed', 'processId': '30'},
        ]
        self.complete(status='interrupted')
        self.runtime._check_background_once()
        terminated = [params['processId'] for method, params in self.runtime.observer.calls if method.endswith('/terminate')]
        self.assertEqual(terminated, ['20'])
        snapshot = self.snapshot()
        self.assertEqual(snapshot['status'], 'cleanupFailed')
        self.assertEqual(snapshot['ownerThreadId'], 'a')
        self.assertEqual({terminal['processId'] for terminal in snapshot['backgroundCommands']}, {'10', '30'})
        self.assertIn('未确认属于本轮', snapshot['cleanupHolds'][0]['error'])
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start', 'b', 2))
        # A fresh native list, after explicit external cleanup or natural exit,
        # is the evidence that allows the slot to release.
        self.runtime.observer.terminals['a'] = []
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_native_nested_source_and_late_child_hold_root(self):
        self.start()
        self.runtime.observe({'method': 'thread/started', 'params': {'thread': {
            'id': 'child', 'source': {'subagent': {'thread_spawn': {'parent_thread_id': 'a', 'depth': 1}}},
            'status': {'type': 'idle'}}}})
        self.runtime.observer.threads['child'] = {'id': 'child', 'parentThreadId': 'a', 'source': {'subagent': {'thread_spawn': {'parent_thread_id': 'a'}}}, 'status': {'type': 'active'}}
        self.complete()
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.runtime.observe(event('turn/started', 'child', 'c1'))
        self.runtime.observe(event('turn/completed', 'child', 'c1'))
        self.runtime.observer.threads['child']['status'] = {'type': 'idle'}
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def closed_child(self, *, exit_code=0, close_event=True, command=True):
        self.runtime.remember_thread({'id': 'child', 'parentThreadId': 'a', 'source': 'vscode'}, historical=True)
        self.runtime.subscriptions.add('child')
        self.start('child', 'c1')
        items = []
        if command:
            self.command('child', 'c1', 'child-command')
            items = [{'id': 'child-command', 'type': 'commandExecution', 'status': 'completed', 'exitCode': exit_code}]
        self.complete('child', 'c1')
        if close_event:
            self.runtime.observe(event('item/completed', item={'type': 'collabAgentToolCall', 'id': 'close-call',
                'tool': 'closeAgent', 'status': 'completed', 'senderThreadId': 'a', 'receiverThreadIds': ['child'],
                'agentsStates': {'child': {'status': 'completed'}}}))
        self.runtime.observer.closed_native.add('child')
        self.runtime.observer.threads['child'] = {'id': 'child', 'status': {'type': 'notLoaded'}}
        self.runtime.observer.full_history['child'] = {'id': 'child', 'status': {'type': 'notLoaded'},
            'turns': [{'id': 'c1', 'status': 'completed', 'itemsView': 'full', 'items': items}]}

    def test_completed_and_closed_child_uses_native_history_proof_without_resume(self):
        self.closed_child()
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])
        proof = self.snapshot()['closedCleanupProofs'][0]
        self.assertEqual(proof['kind'], 'closedThreadHistory')
        self.assertEqual(proof['closure']['kind'], 'closeAgentAttemptCompleted')
        self.assertEqual(proof['observedCommandIds'], ['child-command'])
        self.assertFalse(any(method == 'thread/resume' and params.get('threadId') == 'child'
                             for method, params in self.runtime.observer.calls))

    def test_closed_child_without_shell_still_requires_complete_native_history(self):
        self.closed_child(command=False)
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])
        self.assertIn(('thread/read', {'threadId': 'child', 'includeTurns': True}), self.runtime.observer.calls)

    def test_notloaded_without_native_close_attempt_or_closed_event_is_not_cleanup_proof(self):
        self.closed_child(close_event=False)
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['status'], 'cleanupFailed')
        self.assertIn('缺少本轮原生完成与关闭尝试/closed事件证据', self.snapshot()['cleanupHolds'][0]['error'])

    def test_closed_child_history_failure_is_visible_and_never_fake_empty(self):
        self.closed_child()
        self.runtime.observer.history_error = NativeRPCError({'code': -32601, 'message': 'history unavailable fixture'})
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['status'], 'cleanupFailed')
        self.assertIn('history unavailable fixture', self.snapshot()['cleanupHolds'][0]['error'])

    def test_closed_child_requires_fresh_notloaded_and_unchanged_closure_epoch(self):
        self.closed_child()
        self.runtime.observer.full_history['child']['status'] = {'type': 'idle'}
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['status'], 'cleanupFailed')
        self.assertIn('当前为notLoaded', self.snapshot()['cleanupHolds'][0]['error'])
        self.runtime.observer.full_history['child']['status'] = {'type': 'notLoaded'}
        self.runtime.observer.on_history = lambda: self.runtime.observe({'method': 'thread/started', 'params': {
            'thread': {'id': 'child', 'parentThreadId': 'a', 'source': 'vscode', 'status': {'type': 'idle'}}}})
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['closedCleanupProofs'], [])
        self.assertTrue(self.snapshot()['cleanupHolds'])

    def test_closed_child_unknown_or_synthetic_command_exit_cannot_release(self):
        for exit_code in (None, -1):
            with self.subTest(exit_code=exit_code):
                self.closed_child(exit_code=exit_code)
                self.runtime._check_background_once()
                self.assertEqual(self.snapshot()['status'], 'cleanupFailed')
                self.assertIn('未明确退出', self.snapshot()['cleanupHolds'][0]['error'])

    def test_root_activity_while_closed_history_is_read_invalidates_proof(self):
        self.closed_child()
        self.runtime.observer.on_history = lambda: self.start('a', 'late-root-turn')
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.assertEqual(self.snapshot()['closedCleanupProofs'], [])
        self.assertTrue(self.snapshot()['cleanupHolds'])

    def test_closed_thread_notification_is_independent_successful_close_evidence(self):
        self.closed_child(close_event=False)
        self.runtime.observe(event('thread/closed', 'child', turn=None))
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])
        self.assertEqual(self.snapshot()['closedCleanupProofs'][0]['closure']['kind'], 'thread/closed')

    def test_native_memory_internal_does_not_take_user_slot(self):
        self.runtime.observe({'method': 'thread/started', 'params': {'thread': {'id': 'memory', 'source': {'internal': 'memory_consolidation'}, 'status': {'type': 'active'}}}})
        self.runtime.observe(event('turn/started', 'memory', 'm1'))
        self.runtime.before_request(self.client, self.request('turn/start', 'b'))
        self.assertEqual(self.snapshot()['ownerThreadId'], 'b')

    def test_empty_thread_is_created_by_observer_and_never_resumed_from_disk(self):
        result = self.runtime.create_thread('thread/start', {'cwd': '/tmp'})
        self.assertIsNone(result['thread']['path'])
        self.runtime.ensure_observed('empty')
        self.assertIn('empty', self.runtime.subscriptions)
        self.assertIn('empty', self.runtime.created_roots)
        self.assertFalse(any(method == 'thread/resume' and params.get('threadId') == 'empty' for method, params in self.runtime.observer.calls))
        self.assertFalse(any(method == 'thread/name/set' for method, _ in self.runtime.observer.calls))

    def test_admitted_first_user_question_saves_only_locally_created_empty_root(self):
        self.runtime.create_thread('thread/start', {'cwd': '/tmp'})
        def needs_materialization():
            if len(self.client.calls) == 1:
                raise NativeRPCError({'code': -32600, 'message': 'no rollout found for thread id empty'})
        self.client.on_resume = needs_materialization
        question = '  分析\n 实际业务问题  '
        self.runtime.before_request(self.client, self.request('turn/start', 'empty', input=[{'type': 'text', 'text': question}]))
        self.assertEqual(len(self.client.calls), 2)
        self.assertIn(('thread/read', {'threadId': 'empty', 'includeTurns': False}), self.runtime.observer.calls)
        self.assertIn(('thread/name/set', {'threadId': 'empty', 'name': '分析 实际业务问题'}), self.runtime.observer.calls)
        self.assertEqual(self.snapshot()['ownerThreadId'], 'empty')

    def test_first_goal_objective_is_real_native_name_without_placeholder(self):
        self.assertEqual(self.runtime._initial_name({'objective': '  完成\n季度对账  '}), '完成 季度对账')
        self.assertIsNone(self.runtime._initial_name({'input': [{'type': 'image'}]}))

    def test_existing_user_name_and_unknown_history_are_never_repaired(self):
        def no_rollout():
            raise NativeRPCError({'code': -32600, 'message': 'no rollout found for thread id a'})
        self.client.on_resume = no_rollout
        for locally_created, name in ((False, None), (True, '用户原名')):
            with self.subTest(locally_created=locally_created):
                self.runtime.observer.calls.clear()
                if locally_created:
                    self.runtime.created_roots.add('a')
                self.runtime.observer.threads['a'] = {'id': 'a', 'name': name}
                with self.assertRaises(NativeRPCError):
                    self.runtime.attach_client_thread(self.client, 'a', initial_name='实际首问')
                self.assertFalse(any(method == 'thread/name/set' for method, _ in self.runtime.observer.calls))

    def test_nonmatching_resume_error_is_not_hidden_by_naming(self):
        self.runtime.created_roots.add('a')
        def fail():
            raise NativeRPCError({'code': -32601, 'message': 'list_turns is not supported yet'})
        self.client.on_resume = fail
        with self.assertRaises(NativeRPCError):
            self.runtime.attach_client_thread(self.client, 'a', initial_name='真实问题')
        self.assertEqual(self.runtime.observer.calls, [])

    def test_competing_root_cannot_name_or_subscribe_empty_draft(self):
        self.start()
        self.runtime.create_thread('thread/start', {'cwd': '/tmp'})
        self.runtime.observer.calls.clear()
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start', 'empty', 2, input=[{'type': 'text', 'text': '真实问题'}]))
        self.assertEqual(self.client.calls, [])
        self.assertEqual(self.runtime.observer.calls, [])

    def test_browser_subscription_is_native_and_reestablished_after_cold_resume(self):
        self.runtime.before_request(self.client, self.request('thread/compact/start'))
        self.assertEqual(self.client.calls, [('thread/resume', {'threadId': 'a', 'excludeTurns': True})])
        self.runtime.after_response(self.client, {'id': 1, 'error': {'code': -1, 'message': 'fixture rejected'}})
        # A memory-policy cold replacement revokes all native subscriptions.
        self.runtime.subscriptions.discard('a')
        self.runtime.before_request(self.client, self.request('turn/start', identifier=2))
        self.assertEqual(len(self.client.calls), 2)
        self.assertIn(('thread/resume', {'threadId': 'a', 'excludeTurns': True}), self.runtime.observer.calls)
        self.assertEqual(self.snapshot()['pendingCount'], 1)

    def test_browser_subscription_error_does_not_submit_or_reserve_execution(self):
        def fail():
            raise NativeRPCError({'code': -32600, 'message': 'no rollout found for thread id a'})
        self.client.on_resume = fail
        with self.assertRaises(NativeRPCError):
            self.runtime.before_request(self.client, self.request('turn/start'))
        self.assertEqual(self.runtime.requests, {})
        self.assertEqual(self.snapshot()['pendingCount'], 0)
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_browser_subscription_rechecks_owner_before_reserving(self):
        self.client.on_resume = lambda: self.start('b', 'b1')
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start'))
        self.assertEqual(self.runtime.requests, {})
        self.assertEqual(self.snapshot()['ownerThreadId'], 'b')

    def test_active_hook_keeps_root_after_turn_complete(self):
        self.start()
        self.runtime.observe(event('hook/started', run={'id': 'hook-1'}))
        self.complete()
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.runtime.observe(event('hook/completed', run={'id': 'hook-1'}))
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_goal_owns_root_between_autonomous_native_turns(self):
        self.runtime.observe(event('thread/goal/updated', goal={'status': 'active'}))
        self.start(); self.complete(); self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['status'], 'runningGoal')
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start', 'b'))
        self.start(turn='t2')
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.complete(turn='t2')
        self.runtime.observe(event('thread/goal/updated', goal={'status': 'complete'}))
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_secondary_execution_entrypoints_cannot_bypass_owner(self):
        self.start()
        methods = ['review/start', 'thread/compact/start', 'thread/queue/start', 'thread/queue/add', 'thread/sample', 'thread/goal/set']
        for number, method in enumerate(methods):
            with self.subTest(method=method), self.assertRaises(ExecutionBusy):
                self.runtime.before_request(self.client, self.request(method, 'b', number+2, status='active'))

    def test_rejected_competing_root_is_not_cold_resumed_before_admission(self):
        self.start()
        self.runtime.subscriptions.discard('b')
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start', 'b', 2))
        with self.assertRaises(ExecutionBusy):
            self.runtime.ensure_observed('b')
        self.assertFalse(any(method == 'thread/resume' and params.get('threadId') == 'b'
                             for method, params in self.runtime.observer.calls))

    def test_foreign_browser_resume_is_blocked_but_native_history_reads_remain_allowed(self):
        self.start()
        with self.assertRaises(ExecutionBusy) as caught:
            self.runtime.before_request(self.client, self.request('thread/resume', 'b', 2))
        self.assertEqual(caught.exception.snapshot, self.snapshot())
        self.runtime.before_request(self.client, self.request('thread/read', 'b', 3, includeTurns=False))
        self.runtime.before_request(self.client, self.request('thread/turns/list', 'b', 4, limit=10))
        self.runtime.before_request(self.client, self.request('thread/resume', 'a', 5))

    def test_public_resume_reserves_root_before_real_ack(self):
        received = queue.Queue()
        client, wire = self.draining_client(AckHeldWire(resume_immediate=False), receive=received.put)
        self.assertTrue(client.send(self.request('thread/resume', identifier=71)))
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.assertEqual(self.snapshot()['pendingNativeAcks'][0]['method'], 'thread/resume')
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start', 'b', 72))
        wire.incoming.put({'id': 71, 'result': {'thread': {'id': 'a'}}})
        self.assertEqual(received.get(timeout=1)['id'], 71)
        self.assertEqual(self.snapshot()['status'], 'idle')

    def test_concurrent_root_waits_for_preflight_then_is_rejected_before_resume_ack(self):
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        self.runtime.observer.on_goal = lambda: (entered.set(), release.wait(2))
        failures = []
        def resume():
            try: self.runtime.before_request(self.client, self.request('thread/resume', identifier=71))
            except Exception as error: failures.append(error)
        def competing():
            try: self.runtime.before_request(FakeBrowser('second'), self.request('turn/start', 'b', 72))
            except Exception as error: failures.append(error)
            finally: finished.set()
        first, second = threading.Thread(target=resume), threading.Thread(target=competing)
        try:
            first.start()
            self.assertTrue(entered.wait(1))
            # Occupancy is already visible while native read-only preflight is
            # blocked, before requests is published and before actual resume.
            self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
            second.start()
            release.set()
            first.join(timeout=1)
            self.assertTrue(finished.wait(1))
            self.assertEqual(len(failures), 1)
            self.assertIsInstance(failures[0], ExecutionBusy)
            self.assertEqual(self.snapshot()['pendingNativeAcks'][0]['requestId'], 71)
        finally:
            release.set()
            first.join(timeout=1)
            if second.ident is not None: second.join(timeout=1)

    def test_resume_goal_stays_owned_after_ack_before_native_idle_hook_started(self):
        self.runtime.observer.goals['a'] = {'status': 'active', 'objective': 'persisted native goal'}
        received = queue.Queue()
        client, wire = self.draining_client(AckHeldWire(resume_immediate=False), receive=received.put)
        client.send(self.request('thread/resume', identifier=71))
        wire.incoming.put({'id': 71, 'result': {'thread': {'id': 'a'}}})
        received.get(timeout=1)  # real ACK, no native Started yet
        self.assertEqual(self.snapshot()['pendingNativeAcks'], [])
        self.assertEqual(self.snapshot()['status'], 'runningGoal')
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start', 'b', 72))
        self.start(); self.complete()
        self.runtime.observe(event('thread/goal/updated', goal={'status': 'complete'}))
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['status'], 'idle')

    def test_resume_queue_dispatch_gap_survives_ack_and_empty_native_list(self):
        self.runtime.observer.queues['a'] = [{'id': 'persisted-submission'}]
        self.runtime.before_request(self.client, self.request('thread/resume', identifier=71))
        self.runtime.after_response(self.client, {'id': 71, 'result': {'thread': {'id': 'a'}}})
        self.assertEqual(self.snapshot()['queuedSubmissions'], 1)
        self.runtime.observer.queues['a'] = []  # native dequeue precedes observer Started
        self.runtime.observe(event('thread/queue/changed'))
        self.runtime._check_background_once()
        self.assertTrue(self.snapshot()['nativeQueueDispatchPending'])
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start', 'b', 72))
        self.start(); self.complete(); self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['status'], 'idle')

    def test_resume_preflight_error_is_visible_before_send_without_false_empty_state(self):
        self.runtime.observer.goal_error = NativeRPCError({'code': -32600, 'message': 'goals feature is disabled'})
        received = queue.Queue()
        client, wire = self.draining_client(AckHeldWire(resume_immediate=False), receive=received.put)
        self.assertFalse(client.send(self.request('thread/resume', identifier=71)))
        self.assertIn('goals feature is disabled', received.get(timeout=1)['error']['message'])
        self.assertTrue(wire.sent.empty())
        self.assertEqual(self.snapshot()['pendingNativeAcks'], [])
        self.assertEqual(self.snapshot()['status'], 'idle')
        self.assertNotIn('a', self.runtime.queues)

    def test_resume_native_error_releases_only_temporary_hold(self):
        self.runtime.observer.goals['a'] = {'status': 'active'}
        self.runtime.before_request(self.client, self.request('thread/resume', identifier=71))
        self.runtime.after_response(self.client, {'id': 71, 'error': {'code': -32600, 'message': 'native resume rejected'}})
        self.assertEqual(self.snapshot()['pendingNativeAcks'], [])
        self.assertEqual(self.snapshot()['status'], 'runningGoal')
        self.assertEqual(self.runtime.auxiliary, {})

    def test_resume_transport_eof_before_ack_remains_diagnostic_and_owned(self):
        client, wire = self.draining_client(AckHeldWire(resume_immediate=False))
        client.send(self.request('thread/resume', identifier=71))
        wire.incoming.put(EOFError('fixture native EOF'))
        client.reader.join(timeout=1)
        self.assertFalse(client.reader.is_alive())
        self.assertEqual(self.snapshot()['status'], 'acknowledgementUnknown')
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.assertEqual(self.snapshot()['pendingNativeAcks'][0]['requestId'], 71)

    def test_resume_preflight_does_not_overwrite_newer_native_goal_event(self):
        self.runtime.observer.on_goal = lambda: self.runtime.observe(event('thread/goal/updated', goal={'status': 'active'}))
        self.runtime.before_request(self.client, self.request('thread/resume', identifier=71))
        self.runtime.after_response(self.client, {'id': 71, 'result': {'thread': {'id': 'a'}}})
        self.assertTrue(self.snapshot()['goalActive'])
        self.assertIn('a', self.runtime.goal_checks)

    def test_resume_queue_change_during_snapshot_keeps_checking_hold(self):
        self.runtime.observer.on_queue = lambda: self.runtime.observe(event('thread/queue/changed'))
        self.runtime.before_request(self.client, self.request('thread/resume', identifier=71))
        self.runtime.after_response(self.client, {'id': 71, 'result': {'thread': {'id': 'a'}}})
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.assertTrue(self.runtime.queues['a']['checking'])

    def test_only_locally_created_pathless_root_can_skip_unsupported_goal_snapshot(self):
        self.runtime.observer.threads['a'] = {'id': 'a', 'path': None, 'status': {'type': 'idle'}}
        self.runtime.observer.goal_error = NativeRPCError({'code': -32600, 'message': 'ephemeral thread does not support goals: a'})
        with self.assertRaisesRegex(NativeRPCError, 'does not support goals'):
            self.runtime.before_request(self.client, self.request('thread/resume', identifier=71))
        self.runtime.created_roots.add('a')
        self.runtime.before_request(self.client, self.request('thread/resume', identifier=72))
        self.runtime.after_response(self.client, {'id': 72, 'result': {'thread': {'id': 'a'}}})
        self.assertEqual(self.snapshot()['status'], 'idle')
        self.assertIn(('thread/queue/list', {'threadId': 'a', 'limit': 100, 'cursor': None}), self.runtime.observer.calls)

    def test_foreign_resume_rejected_before_preflight_side_effects(self):
        self.start()
        previous = list(self.runtime.observer.calls)
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('thread/resume', 'b', 71))
        self.assertEqual(self.runtime.observer.calls, previous)
        self.assertEqual(self.runtime.auxiliary, {})

    def test_compaction_keeps_slot_between_empty_ack_and_actual_started(self):
        self.runtime.before_request(self.client, self.request('thread/compact/start'))
        self.runtime.after_response(self.client, {'id': 1, 'result': {}})
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.start(turn='compact')
        self.complete(turn='compact')
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_queue_add_is_native_only_and_held_until_native_list_confirms(self):
        self.runtime.before_request(self.client, self.request('thread/queue/add'))
        self.runtime.after_response(self.client, {'id': 1, 'result': {'queuedSubmission': {'id': 'q1'}}})
        self.runtime.observer.queues['a'] = [{'id': 'q1'}]
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['queuedSubmissions'], 1)
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.assertFalse(any(method in ('turn/start', 'thread/queue/start') for method, _ in self.runtime.observer.calls))

    def test_native_queue_dequeue_before_started_keeps_root_owned(self):
        self.runtime.before_request(self.client, self.request('thread/queue/add'))
        self.runtime.after_response(self.client, {'id': 1, 'result': {'queuedSubmission': {'id': 'q1'}}})
        self.runtime.observer.queues['a'] = [{'id': 'q1'}]
        self.runtime._check_background_once()
        self.runtime.observer.queues['a'] = []
        self.runtime.observe(event('thread/queue/changed'))
        self.runtime._check_background_once()
        self.assertTrue(self.snapshot()['nativeQueueDispatchPending'])
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start', 'b', 2))
        self.start(); self.complete(); self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_explicit_native_queue_delete_can_release_unstarted_queue(self):
        self.runtime.queues['a'] = {'data': [{'id': 'q1'}], 'checking': False, 'startVersion': 0}
        self.runtime.before_request(self.client, self.request('thread/queue/delete', queuedSubmissionId='q1'))
        self.runtime.after_response(self.client, {'id': 1, 'result': {'deleted': True}})
        self.runtime._check_background_once()
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_synchronous_sample_holds_until_native_response(self):
        self.runtime.before_request(self.client, self.request('thread/sample', expectedTurnId='old', prompt='fixture'))
        with self.assertRaises(ExecutionBusy):
            self.runtime.before_request(self.client, self.request('turn/start', 'b', 2))
        self.runtime.after_response(self.client, {'id': 1, 'result': {'responseId': 'sample-1', 'sourceTurnId': 'old'}})
        self.assertIsNone(self.snapshot()['ownerThreadId'])

    def test_unobservable_standalone_execution_is_explicitly_rejected(self):
        for method in ('thread/prediction/request', 'command/exec', 'process/exec', 'process/spawn', 'thread/realtime/start'):
            with self.subTest(method=method), self.assertRaises(NativeRPCError):
                self.runtime.before_request(self.client, self.request(method))

    def test_steer_requires_and_preserves_native_expected_turn_identity(self):
        self.start()
        with self.assertRaises(ValueError):
            self.runtime.before_request(self.client, self.request('turn/steer'))
        message = self.request('turn/steer', expectedTurnId='t1')
        self.runtime.before_request(self.client, message)
        self.runtime.after_response(self.client, {'id': 1, 'result': {'turnId': 't1'}})
        self.assertEqual(self.snapshot()['activeTurns'], [{'threadId': 'a', 'turnId': 't1'}])

    def test_open_client_installs_hooks_and_sends_initial_global_snapshot(self):
        wire, received, statuses = FakeWire(), queue.Queue(), queue.Queue()
        with patch.object(self.runtime, 'start'), patch('native_runtime.connect_unix', return_value=wire):
            client = self.runtime.open_client(received.put, lambda: None, statuses.put)
        try:
            initial = statuses.get(timeout=1)
            self.assertEqual(initial['bridge'], 'execution')
            self.assertEqual(initial['execution']['status'], 'idle')
            sender = threading.Thread(target=lambda: client.send(self.request('turn/start')))
            sender.start()
            subscribe = wire.sent.get(timeout=1)
            self.assertEqual(subscribe['method'], 'thread/resume')
            self.assertEqual(subscribe['params'], {'threadId': 'a', 'excludeTurns': True})
            # Private management replies unblock the nested call directly;
            # its resume admission must not recurse into another subscription.
            wire.incoming.put({'id': subscribe['id'], 'result': {'thread': {'id': 'a'}}})
            sender.join(timeout=1)
            self.assertFalse(sender.is_alive())
            sent = wire.sent.get(timeout=1)
            self.assertEqual(sent['id'], 1)
            self.assertEqual(self.snapshot()['pendingCount'], 1)
            wire.incoming.put({'id': 1, 'result': {'turn': {'id': 't1'}}})
            received.get(timeout=1)
            self.assertEqual(self.snapshot()['turnId'], 't1')
        finally:
            self.runtime.remove_client(client)

    def test_observer_event_overflow_is_visible_and_never_blocks_reader(self):
        runtime = NativeRuntime('unused', '/tmp', (), lambda _: None, lambda _: None, lambda _: None,
                                evidence=FakeEvidence(), start_workers=False, event_capacity=1)
        runtime.observer = FakeObserver()
        try:
            runtime._enqueue(event('turn/started'))
            with self.assertRaises(RuntimeError):
                runtime._enqueue(event('turn/completed'))
            self.assertTrue(runtime.observer.closed)
            self.assertEqual(runtime.status()['execution']['status'], 'observationFailed')
        finally:
            runtime.close()

    def test_observer_failure_blocks_new_execution_without_clearing_owner(self):
        self.start()
        self.runtime.observer_error = 'fixture observer disconnected'
        with self.assertRaises(NativeRPCError):
            self.runtime.before_request(self.client, self.request('turn/start', 'a', 2))
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.assertEqual(self.snapshot()['status'], 'observationFailed')

    def test_new_native_activity_during_terminal_query_invalidates_empty_result(self):
        self.start(); self.complete()
        self.runtime.observer.on_list = lambda: self.runtime.observe(event('turn/started', 'a', 't2'))
        self.runtime._check_background_once()
        self.assertEqual(self.snapshot()['ownerThreadId'], 'a')
        self.assertIn({'threadId': 'a', 'turnId': 't2'}, self.snapshot()['activeTurns'])


class FakeWire:
    def __init__(self):
        self.incoming, self.sent = queue.Queue(), queue.Queue()
    def receive(self):
        item = self.incoming.get()
        if item is None: raise EOFError()
        return item
    def send(self, message): self.sent.put(message)
    def close(self): self.incoming.put(None)


class AckHeldWire(FakeWire):
    """Native requests are recorded; execution ACK is released only by test."""
    def __init__(self, *, resume_immediate=True):
        super().__init__()
        self.resume_immediate, self.messages = resume_immediate, []
        self.turn_sent, self.native_closed = threading.Event(), threading.Event()
    def send(self, message):
        self.messages.append(message)
        super().send(message)
        if message.get('method') == 'thread/resume' and self.resume_immediate:
            self.incoming.put({'id': message['id'], 'result': {'thread': {'id': message['params']['threadId']}}})
        if message.get('method') == 'turn/start':
            self.turn_sent.set()
    def close(self):
        self.native_closed.set()
        super().close()


class RuntimeStartupTests(unittest.TestCase):
    def runtime(self):
        return NativeRuntime('unused', '/tmp', (), lambda _: None, lambda _: None, lambda _: None,
                             evidence=FakeEvidence(), start_workers=False)

    def test_second_start_waits_for_initialize_and_initialized_barrier(self):
        class ObservedLock:
            def __init__(self):
                self.lock, self.counter_lock = threading.Lock(), threading.Lock()
                self.entries, self.second_waiting = 0, threading.Event()
            def __enter__(self):
                with self.counter_lock:
                    self.entries += 1
                    if self.entries == 2:
                        self.second_waiting.set()
                self.lock.acquire()
            def __exit__(self, *_): self.lock.release()

        class BlockingInitializedWire(FakeWire):
            def __init__(self):
                super().__init__()
                self.initialized_entered, self.release_initialized = threading.Event(), threading.Event()
            def send(self, message):
                if message.get('method') == 'initialized':
                    self.initialized_entered.set()
                    if not self.release_initialized.wait(2):
                        raise RuntimeError('fixture did not release initialized')
                super().send(message)

        runtime, wire = self.runtime(), BlockingInitializedWire()
        runtime.start_lock = ObservedLock()
        process = types.SimpleNamespace(stderr=iter(()), poll=lambda: None, pid=991, returncode=None)
        finished, failures = [threading.Event(), threading.Event()], []
        def start(index):
            try:
                runtime.start()
            except Exception as error:
                failures.append(error)
            finally:
                finished[index].set()
        callers = [threading.Thread(target=start, args=(index,)) for index in range(2)]
        try:
            with patch('native_runtime.spawn_owned_native', return_value=process) as popen, patch('native_runtime.connect_unix', return_value=wire):
                callers[0].start()
                initialize = wire.sent.get(timeout=1)
                self.assertEqual(initialize['method'], 'initialize')
                callers[1].start()
                self.assertTrue(runtime.start_lock.second_waiting.wait(1))
                self.assertFalse(finished[1].is_set())
                self.assertFalse(runtime.status()['execution']['observerReady'])
                wire.incoming.put({'id': initialize['id'], 'result': {}})
                self.assertTrue(wire.initialized_entered.wait(1))
                # Receiving initialize is insufficient: initialized is still
                # held at the actual wire send, and the second caller must wait.
                self.assertFalse(finished[0].is_set())
                self.assertFalse(finished[1].is_set())
                wire.release_initialized.set()
                for caller in callers: caller.join(timeout=1)
                self.assertTrue(all(done.is_set() for done in finished))
                self.assertEqual(failures, [])
                self.assertEqual(popen.call_count, 1)
                self.assertEqual(wire.sent.get(timeout=1), {'method': 'initialized'})
                self.assertTrue(wire.sent.empty())
                self.assertTrue(runtime.status()['execution']['observerReady'])
        finally:
            wire.release_initialized.set()
            for caller in callers:
                if caller.ident is not None: caller.join(timeout=1)
            runtime.close()

    def test_failed_initialize_never_returns_published_process_as_ready(self):
        runtime, wire = self.runtime(), FakeWire()
        process = types.SimpleNamespace(stderr=iter(()), poll=lambda: None, pid=992, returncode=None)
        failures = []
        def start():
            try: runtime.start()
            except Exception as error: failures.append(error)
        caller = threading.Thread(target=start)
        try:
            with patch('native_runtime.spawn_owned_native', return_value=process) as popen, patch('native_runtime.connect_unix', return_value=wire):
                caller.start()
                initialize = wire.sent.get(timeout=1)
                wire.incoming.put({'id': initialize['id'], 'error': {'code': -32000, 'message': 'fixture handshake rejected'}})
                caller.join(timeout=1)
                self.assertFalse(caller.is_alive())
                self.assertIsInstance(failures[0], NativeRPCError)
                with self.assertRaisesRegex(RuntimeError, '初始化失败'):
                    runtime.start()
                self.assertEqual(popen.call_count, 1)
                self.assertTrue(wire.sent.empty())
                self.assertFalse(runtime.status()['execution']['observerReady'])
        finally:
            runtime.close()
            caller.join(timeout=1)


class ClientConcurrencyTests(unittest.TestCase):
    def test_private_management_admission_error_reaches_caller_without_timeout(self):
        wire, replies = FakeWire(), queue.Queue()
        def reject(client, message): raise NativeRPCError({'code': -32002, 'message': 'busy fixture'})
        client = NativeClient(wire, replies.put, before_send=reject)
        try:
            with self.assertRaises(NativeRPCError) as caught:
                client.call('thread/resume', {'threadId': 'b'}, timeout=.2)
            self.assertEqual(caught.exception.error['code'], -32002)
            self.assertTrue(wire.sent.empty())
            self.assertTrue(replies.empty())
        finally: client.close()

    def test_private_observer_resume_uses_gate_and_settles_exactly_once(self):
        runtime = NativeRuntime('unused', '/tmp', (), lambda _: None, lambda _: None, lambda _: None,
                                evidence=FakeEvidence(), start_workers=False)
        wire, after = FakeWire(), []
        original = wire.send
        def native_send(message):
            original(message)
            method, identity = message.get('method'), (message.get('params') or {}).get('threadId')
            result = ({'thread': {'id': identity, 'path': '/tmp/native-rollout', 'status': {'type': 'notLoaded'}}}
                      if method == 'thread/read' else {'goal': {'status': 'active'}}
                      if method == 'thread/goal/get' else {'data': [], 'nextCursor': None}
                      if method == 'thread/queue/list' else None)
            if result is not None:
                wire.incoming.put({'id': message['id'], 'result': result})
        wire.send = native_send
        def after_response(client, message):
            after.append(message)
            runtime.after_response(client, message)
        observer = NativeClient(wire, lambda _: None, before_send=runtime.before_request, after_receive=after_response)
        runtime.observer = observer
        outcome, finished = [], threading.Event()
        def resume():
            try: outcome.append(observer.call('thread/resume', {'threadId': 'a'}, timeout=2))
            finally: finished.set()
        caller = threading.Thread(target=resume)
        try:
            caller.start()
            while True:
                request = wire.sent.get(timeout=1)
                if request['method'] == 'thread/resume': break
            self.assertEqual(runtime.status()['execution']['ownerThreadId'], 'a')
            self.assertFalse(finished.is_set())
            with self.assertRaises(ExecutionBusy):
                runtime.before_request(FakeBrowser(), {'id': 72, 'method': 'thread/resume', 'params': {'threadId': 'b'}})
            reply = {'id': request['id'], 'result': {'thread': {'id': 'a'}}}
            wire.incoming.put(reply)
            self.assertTrue(finished.wait(1))
            self.assertEqual(outcome, [reply['result']])
            self.assertEqual(after.count(reply), 1)
            self.assertEqual(runtime.status()['execution']['pendingNativeAcks'], [])
            self.assertEqual(runtime.status()['execution']['status'], 'runningGoal')
            self.assertEqual(runtime.auxiliary, {})
            # The earlier read/get/list private replies ran the callback too,
            # but only the tracked resume altered its temporary slot.
            self.assertEqual(len(after), 4)
        finally:
            runtime.close(); caller.join(timeout=1)

    def test_slow_notification_consumer_does_not_block_private_rpc_response(self):
        wire, entered, release = FakeWire(), threading.Event(), threading.Event()
        def slow(_):
            entered.set(); release.wait(2)
        client = NativeClient(wire, slow)
        try:
            wire.incoming.put({'method': 'fixture/notification'})
            self.assertTrue(entered.wait(1))
            result = []
            caller = threading.Thread(target=lambda: result.append(client.call('config/read', {}, timeout=1)))
            caller.start()
            request = wire.sent.get(timeout=1)
            wire.incoming.put({'id': request['id'], 'result': {'ok': True}})
            caller.join(timeout=1)
            self.assertFalse(caller.is_alive())
            self.assertEqual(result, [{'ok': True}])
        finally:
            release.set(); client.close()

    def test_broadcast_returns_without_waiting_for_slow_browser(self):
        wire, entered, release = FakeWire(), threading.Event(), threading.Event()
        def slow(_): entered.set(); release.wait(2)
        client = NativeClient(wire, lambda _: None, status_receive=slow)
        runtime = NativeRuntime('unused', '/tmp', (), lambda _: None, lambda _: None, lambda _: None,
                                evidence=FakeEvidence(), start_workers=False)
        runtime.clients.add(client)
        try:
            runtime.broadcast({'bridge': 'first'})
            self.assertTrue(entered.wait(1))
            finished = threading.Event()
            broadcaster = threading.Thread(target=lambda: (runtime.broadcast({'bridge': 'second'}), finished.set()))
            broadcaster.start()
            self.assertTrue(finished.wait(.5))
        finally:
            release.set(); runtime.close()

    def test_browser_hook_rejection_is_visible_without_native_send_or_disconnect(self):
        wire, replies = FakeWire(), queue.Queue()
        def reject(client, message): raise NativeRPCError({'code': -32002, 'message': 'busy fixture'})
        client = NativeClient(wire, replies.put, before_send=reject)
        try:
            self.assertFalse(client.send({'id': 7, 'method': 'turn/start', 'params': {}}))
            self.assertEqual(replies.get(timeout=1)['error']['code'], -32002)
            self.assertTrue(wire.sent.empty())
            self.assertFalse(client.closed)
        finally: client.close()


if __name__ == '__main__':
    unittest.main()
