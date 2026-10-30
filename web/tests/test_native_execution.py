from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor

from native_execution import ExecutionBusy, ExecutionCandidate


class ExecutionCandidateTests(unittest.TestCase):
    def setUp(self):
        self.state = ExecutionCandidate()
        self.state.register_thread("a")
        self.state.register_thread("b")

    def assert_busy_for_b(self):
        with self.assertRaises(ExecutionBusy) as error:
            self.state.reserve(("b-connection", 1), "b")
        self.assertEqual(error.exception.snapshot["ownerThreadId"], "a")

    def closed_proof(self, exit_code=0):
        return {'id': 'a', 'status': {'type': 'notLoaded'}, 'turns': [
            {'id': 't1', 'status': 'completed', 'itemsView': 'full', 'items': [
                {'id': 'command', 'type': 'commandExecution', 'status': 'completed', 'exitCode': exit_code}]}]}

    def test_closed_cleanup_has_separate_complete_native_history_contract(self):
        token = self.state.hold_cleanup('a', 'closed')
        check = self.state.begin_cleanup_check(token)
        self.assertTrue(self.state.confirm_closed_cleanup(check, native_thread=self.closed_proof(),
                                                         turn_id='t1', observed_command_ids={'command'}))
        self.assertIsNone(self.state.snapshot()['ownerThreadId'])

    def test_closed_cleanup_rejects_null_negative_interrupted_and_partial_history(self):
        token = self.state.hold_cleanup('a', 'closed')
        for code in (None, -1, True):
            with self.subTest(code=code), self.assertRaises(ValueError):
                self.state.confirm_closed_cleanup(self.state.begin_cleanup_check(token), native_thread=self.closed_proof(code),
                                                  turn_id='t1', observed_command_ids={'command'})
        for field, value in (('status', 'interrupted'), ('itemsView', 'summary')):
            native = self.closed_proof();native['turns'][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.state.confirm_closed_cleanup(self.state.begin_cleanup_check(token), native_thread=native,
                                                  turn_id='t1', observed_command_ids={'command'})
        self.assert_busy_for_b()

    def test_closed_cleanup_rejects_stale_hold_and_new_native_activity(self):
        token = self.state.hold_cleanup('a', 'closed')
        check = self.state.begin_cleanup_check(token)
        self.state.turn_started('a', 'new-turn')
        self.assertFalse(self.state.confirm_closed_cleanup(check, native_thread=self.closed_proof(),
                                                          turn_id='t1', observed_command_ids={'command'}))
        self.state.hold_cleanup('a', 'closed')
        self.assertFalse(self.state.confirm_closed_cleanup(check, native_thread=self.closed_proof(),
                                                          turn_id='t1', observed_command_ids={'command'}))
        self.assert_busy_for_b()

    def test_closed_cleanup_requires_all_observed_commands_in_native_history(self):
        token = self.state.hold_cleanup('a', 'closed')
        with self.assertRaisesRegex(ValueError, '遗漏已观测命令'):
            self.state.confirm_closed_cleanup(self.state.begin_cleanup_check(token), native_thread=self.closed_proof(),
                                              turn_id='t1', observed_command_ids={'command', 'missing'})

    def test_two_connections_reserve_atomically_before_native_ack(self):
        barrier = threading.Barrier(2)

        def reserve(thread):
            barrier.wait()
            try:
                return self.state.reserve((thread, 1), thread)
            except ExecutionBusy:
                return None

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(reserve, ("a", "b")))
        winners = [result for result in results if result is not None]
        self.assertEqual(len(winners), 1)
        self.assertEqual(self.state.snapshot()["ownerThreadId"], winners[0].thread_id)
        self.assertEqual(self.state.snapshot()["status"], "starting")

    def test_disconnect_keeps_unacknowledged_reservation(self):
        self.state.reserve(("one", 1), "a")
        self.state.connection_closed("one")
        self.assert_busy_for_b()
        self.assertTrue(self.state.rpc_error(("one", 1)))
        self.assertIsNone(self.state.snapshot()["ownerThreadId"])

    def test_completed_before_ack_does_not_resurrect_turn(self):
        self.state.reserve(("one", 1), "a")
        self.state.turn_completed("a", "t1")
        self.assert_busy_for_b()  # Accepted turn is still unknown until ACK.
        self.state.ack(("one", 1), "t1")
        self.assertEqual(self.state.snapshot()["status"], "idle")
        self.assertFalse(self.state.turn_started("a", "t1"))
        self.assertFalse(self.state.ack(("one", 1), "t1"))
        self.state.reserve(("two", 1), "b")

    def test_same_owner_steer_and_one_rpc_error_do_not_release_other_requests(self):
        self.state.reserve(("one", 1), "a")
        self.state.ack(("one", 1), "t1")
        steer = self.state.reserve(("two", 1), "a")
        self.assertTrue(steer.is_steer)
        self.state.reserve(("three", 1), "a")
        self.state.rpc_error(("two", 1))
        self.state.turn_completed("a", "t1")
        self.assert_busy_for_b()
        self.state.ack(("three", 1), "t1")
        self.assertEqual(self.state.snapshot()["status"], "idle")

    def test_rpc_error_after_started_does_not_erase_observed_native_work(self):
        self.state.reserve(("one", 1), "a")
        self.state.turn_started("a", "t1")
        self.state.rpc_error(("one", 1))
        self.assert_busy_for_b()
        self.state.turn_completed("a", "t1", status="failed")
        self.assertEqual(self.state.snapshot()["status"], "idle")

    def test_old_completed_ack_and_idle_do_not_release_new_turn(self):
        self.state.reserve(("one", 1), "a")
        self.state.ack(("one", 1), "old")
        self.state.turn_completed("a", "old")
        self.state.reserve(("one", 2), "a")
        self.state.ack(("one", 2), "new")
        self.state.turn_completed("a", "old")
        self.state.ack(("one", 1), "old")
        self.state.thread_status("a", "idle")
        self.assertEqual(self.state.snapshot()["turnId"], "new")
        self.assert_busy_for_b()

    def test_approval_and_user_input_waits_keep_eligibility(self):
        self.state.turn_started("a", "t1")
        self.state.thread_status("a", {"type": "active", "activeFlags": ["waitingOnApproval"]}, turn_id="t1")
        self.assertEqual(self.state.snapshot()["status"], "waitingForApproval")
        self.state.thread_status("a", "idle")
        self.assertEqual(self.state.snapshot()["status"], "waitingForApproval")
        self.assert_busy_for_b()
        self.state.thread_status("a", {"type": "active", "activeFlags": ["waitingOnUserInput"]}, turn_id="t1")
        self.assertEqual(self.state.snapshot()["status"], "waitingForInput")
        self.state.turn_completed("a", "t1")
        self.assertEqual(self.state.snapshot()["status"], "idle")

    def test_child_and_grandchild_keep_root_until_last_completion(self):
        self.state.register_thread("child", parent_id="a")
        self.state.register_thread("grandchild", parent_id="child")
        self.state.turn_started("a", "root-turn")
        self.state.turn_started("child", "child-turn")
        self.state.turn_started("grandchild", "grandchild-turn")
        self.state.turn_completed("a", "root-turn")
        self.state.turn_completed("child", "child-turn")
        snapshot = self.state.snapshot()
        self.assertEqual(snapshot["ownerThreadId"], "a")
        self.assertEqual(snapshot["threadId"], "grandchild")
        self.assertEqual(snapshot["turnId"], "grandchild-turn")
        self.assert_busy_for_b()
        self.state.turn_completed("grandchild", "grandchild-turn")
        self.assertEqual(self.state.snapshot()["status"], "idle")

    def test_internal_memory_and_descendants_are_excluded(self):
        self.state.register_thread("memory", internal=True)
        self.state.register_thread("memory-child", parent_id="memory")
        self.state.turn_started("memory", "m1")
        self.state.thread_status("memory", {"type": "active"})
        self.state.turn_started("memory-child", "m2")
        self.state.reserve(("one", 1), "b")
        self.assertEqual(self.state.snapshot()["ownerThreadId"], "b")
        with self.assertRaises(ValueError):
            self.state.reserve(("internal", 1), "memory")

    def test_cleanup_failure_nonempty_and_old_probe_cannot_release_hold(self):
        self.state.turn_started("a", "t1")
        token = self.state.hold_cleanup("a", "stop-1")
        self.state.turn_completed("a", "t1", status="interrupted")
        self.state.cleanup_failed(token, "terminal stop was not confirmed")
        self.assertEqual(self.state.snapshot()["status"], "cleanupFailed")
        self.assert_busy_for_b()
        probe = self.state.begin_cleanup_check(token)
        self.assertFalse(self.state.confirm_cleanup(probe, background_terminals=[{"id": "pty-1"}]))
        self.assertFalse(self.state.confirm_cleanup(probe, background_terminals=[]))
        self.assert_busy_for_b()
        current = self.state.begin_cleanup_check(token)
        self.assertTrue(self.state.confirm_cleanup(current, background_terminals=[]))
        self.assertEqual(self.state.snapshot()["status"], "idle")

    def test_completed_with_cleanup_has_no_unreserved_gap(self):
        self.state.turn_started("a", "t1")
        token = self.state.turn_completed("a", "t1", status="interrupted", cleanup_hold_id="stop")
        self.assertEqual(self.state.snapshot()["status"], "cleaningUp")
        self.assert_busy_for_b()
        self.assertTrue(self.state.confirm_cleanup(self.state.begin_cleanup_check(token), background_terminals=[]))

    def test_old_cleanup_generation_does_not_clear_new_hold(self):
        old = self.state.hold_cleanup("a", "stop")
        old_probe = self.state.begin_cleanup_check(old)
        new = self.state.hold_cleanup("a", "stop")
        self.assertFalse(self.state.confirm_cleanup(old_probe, background_terminals=[]))
        self.assertFalse(self.state.cleanup_failed(old))
        self.assert_busy_for_b()
        self.assertTrue(self.state.confirm_cleanup(self.state.begin_cleanup_check(new), background_terminals=[]))

    def test_cleanup_query_invalidated_by_child_or_pending_steer(self):
        self.state.turn_started("a", "root-turn")
        self.state.reserve(("steer", 1), "a")
        self.state.register_thread("child", parent_id="a")
        token = self.state.hold_cleanup("a", "stop")
        probe = self.state.begin_cleanup_check(token)
        self.state.turn_started("child", "child-turn")
        self.assertFalse(self.state.confirm_cleanup(probe, background_terminals=[]))
        self.assertFalse(self.state.confirm_cleanup(self.state.begin_cleanup_check(token), background_terminals=[]))
        self.state.turn_completed("a", "root-turn")
        self.state.turn_completed("child", "child-turn")
        self.assertFalse(self.state.confirm_cleanup(self.state.begin_cleanup_check(token), background_terminals=[]))
        self.state.rpc_error(("steer", 1))
        self.assertTrue(self.state.confirm_cleanup(self.state.begin_cleanup_check(token), background_terminals=[]))

    def test_late_correlated_active_does_not_revive_completed_turn(self):
        self.state.turn_started("a", "t1")
        self.state.turn_completed("a", "t1")
        self.assertFalse(self.state.thread_status("a", {"type": "active"}, turn_id="t1"))
        self.assertEqual(self.state.snapshot()["status"], "idle")

    def test_unattributed_active_requires_fresh_native_check(self):
        self.state.thread_status("a", {"type": "active"})
        self.assertEqual(self.state.snapshot()["status"], "reconciling")
        self.assert_busy_for_b()
        probe = self.state.begin_native_check("a")
        self.assertTrue(self.state.reconcile_native(probe, active_turn_ids=[], status="idle"))
        self.assertEqual(self.state.snapshot()["status"], "idle")

    def test_stale_native_snapshot_and_status_sequence_are_rejected(self):
        self.state.turn_started("a", "t1")
        probe = self.state.begin_native_check("a")
        self.state.turn_started("a", "t2")
        self.assertFalse(self.state.reconcile_native(probe, active_turn_ids=[], status="idle"))
        self.state.thread_status("a", {"type": "active", "activeFlags": ["waitingOnApproval"]}, turn_id="t2", sequence=2)
        self.assertFalse(self.state.thread_status("a", "idle", sequence=1))
        self.assertEqual(len(self.state.snapshot()["activeTurns"]), 2)
        self.assertEqual(self.state.snapshot()["status"], "waitingForApproval")

    def test_fresh_idle_snapshot_does_not_settle_unknown_submission(self):
        self.state.reserve(("one", 1), "a")
        self.state.reconcile_native(self.state.begin_native_check("a"), active_turn_ids=[], status="idle")
        self.assert_busy_for_b()

    def test_discovered_external_native_conflict_blocks_new_submissions(self):
        self.state.turn_started("a", "t1")
        self.state.turn_started("b", "external-turn")
        self.assertEqual(self.state.snapshot()["status"], "conflicted")
        self.assertEqual(self.state.snapshot()["blockedRootThreadIds"], ["a", "b"])
        with self.assertRaises(ExecutionBusy):
            self.state.reserve(("one", 1), "a")
        self.state.turn_completed("b", "external-turn")
        self.assertEqual(self.state.snapshot()["ownerThreadId"], "a")

    def test_lineage_is_idempotent_acyclic_and_cannot_reparent_registered_thread(self):
        self.state.register_thread("child", parent_id="a")
        self.state.register_thread("child", parent_id="a")
        with self.assertRaises(ValueError):
            self.state.register_thread("child", parent_id="b")
        self.state.register_thread("x", parent_id="y")
        with self.assertRaises(ValueError):
            self.state.register_thread("y", parent_id="x")
        self.state.turn_started("child", "t1")
        self.assertEqual(self.state.snapshot()["ownerThreadId"], "a")

    def test_request_identity_cannot_be_reused_or_implicitly_resent(self):
        key = ("native-generation-1", "connection-1", 1)
        self.state.reserve(key, "a")
        with self.assertRaises(ValueError):
            self.state.reserve(key, "a")
        self.state.rpc_error(key)
        with self.assertRaises(ValueError):
            self.state.reserve(key, "b")

    def test_cleanup_blocks_even_owner_submission_until_confirmation(self):
        token = self.state.hold_cleanup("a", "stop")
        with self.assertRaises(ExecutionBusy):
            self.state.reserve(("one", 1), "a")
        self.state.cleanup_failed(token)
        with self.assertRaises(ExecutionBusy):
            self.state.reserve(("one", 2), "a")
        self.assertTrue(self.state.confirm_cleanup(self.state.begin_cleanup_check(token), background_terminals=[]))
        self.assertFalse(self.state.reserve(("one", 3), "a").is_steer)

    def test_invalid_snapshot_does_not_mutate_execution_state(self):
        self.state.turn_started("a", "t1")
        probe = self.state.begin_native_check("a")
        before = self.state.snapshot()
        with self.assertRaises(ValueError):
            self.state.reconcile_native(probe, active_turn_ids=[], status="typo")
        self.assertEqual(self.state.snapshot(), before)
        with self.assertRaises(ValueError):
            self.state.reconcile_native(probe, active_turn_ids=["t1"], status="idle")
        self.assertEqual(self.state.snapshot(), before)

    def test_duplicate_terminal_does_not_reset_failed_cleanup_generation(self):
        self.state.turn_started("a", "t1")
        first = self.state.turn_completed("a", "t1", cleanup_hold_id="stop")
        self.state.cleanup_failed(first)
        duplicate = self.state.turn_completed("a", "t1", cleanup_hold_id="stop")
        self.assertEqual(duplicate, first)
        self.assertEqual(self.state.snapshot()["status"], "cleanupFailed")

    def test_initial_late_internal_metadata_removes_user_claim_and_public_activity(self):
        self.state.turn_started("unknown-memory", "m1")
        self.state.register_thread("unknown-memory", internal=True)
        snapshot = self.state.snapshot()
        self.assertEqual(snapshot["status"], "idle")
        self.assertEqual(snapshot["activeTurns"], [])
        self.state.reserve(("one", 1), "b")

    def test_bare_idle_cannot_clear_unattributed_busy(self):
        self.state.thread_status("a", {"type": "active"})
        self.state.thread_status("a", "idle")
        self.assertEqual(self.state.snapshot()["status"], "reconciling")
        self.assert_busy_for_b()

    def test_duplicate_old_completion_cannot_clear_new_unattributed_busy(self):
        self.state.turn_completed("a", "old")
        self.state.thread_status("a", {"type": "active"})
        self.state.turn_completed("a", "old")
        self.assertEqual(self.state.snapshot()["status"], "reconciling")
        self.assert_busy_for_b()

    def test_duplicate_terminal_after_confirmed_cleanup_does_not_recreate_hold(self):
        token = self.state.turn_completed("a", "t1", cleanup_hold_id="stop")
        self.assertTrue(self.state.confirm_cleanup(self.state.begin_cleanup_check(token), background_terminals=[]))
        self.state.reserve(("two", 1), "b")
        self.assertIsNone(self.state.turn_completed("a", "t1", cleanup_hold_id="stop"))
        self.assertEqual(self.state.snapshot()["ownerThreadId"], "b")
        self.assertEqual(self.state.snapshot()["blockedRootThreadIds"], ["b"])

    def test_cleanup_identity_cannot_overwrite_another_threads_hold(self):
        original = self.state.hold_cleanup("a", "stop")
        with self.assertRaises(ValueError):
            self.state.hold_cleanup("b", "stop")
        self.assertEqual(self.state.snapshot()["ownerThreadId"], "a")
        self.assertTrue(self.state.confirm_cleanup(self.state.begin_cleanup_check(original), background_terminals=[]))

    def test_created_child_holds_root_before_delayed_started_event(self):
        self.state.turn_started("a", "t1")
        self.state.register_thread("child", parent_id="a")
        self.state.turn_completed("a", "t1")
        self.assertEqual(self.state.snapshot()["pendingChildThreadIds"], ["child"])
        self.assert_busy_for_b()
        self.state.turn_started("child", "child-turn")
        self.assertEqual(self.state.snapshot()["pendingChildThreadIds"], [])
        self.assert_busy_for_b()
        self.state.turn_completed("child", "child-turn")
        self.assertEqual(self.state.snapshot()["status"], "idle")

    def test_idle_child_snapshot_resolves_startup_but_old_snapshot_cannot(self):
        self.state.register_thread("child", parent_id="a")
        probe = self.state.begin_native_check("child")
        self.state.turn_started("child", "t1")
        self.assertFalse(self.state.reconcile_native(probe, active_turn_ids=[], status="idle"))
        self.state.turn_completed("child", "t1")
        self.state.register_thread("never-started-child", parent_id="a")
        current = self.state.begin_native_check("never-started-child")
        self.assertTrue(self.state.reconcile_native(current, active_turn_ids=[], status="idle"))
        self.assertEqual(self.state.snapshot()["status"], "idle")

    def test_historical_child_metadata_does_not_claim_execution(self):
        self.state.register_thread("old-child", parent_id="a", startup_pending=False)
        self.assertEqual(self.state.snapshot()["status"], "idle")
        self.state.reserve(("two", 1), "b")

    def test_owner_requires_a_known_live_target_turn_for_steering(self):
        self.state.reserve(("one", 1), "a")
        with self.assertRaises(ExecutionBusy):
            self.state.reserve(("one", 2), "a")
        self.state.ack(("one", 1), "t1")
        steer = self.state.reserve(("one", 3), "a", expected_turn_id="t1")
        self.assertTrue(steer.is_steer)
        self.assertEqual(steer.turn_id, "t1")
        with self.assertRaises(ExecutionBusy):
            self.state.reserve(("one", 4), "a", expected_turn_id="old")

    def test_child_only_activity_does_not_allow_new_parent_turn_as_fake_steer(self):
        self.state.register_thread("child", parent_id="a")
        self.state.turn_started("child", "t1")
        with self.assertRaises(ExecutionBusy):
            self.state.reserve(("one", 1), "a")

    def test_invalid_snapshot_flags_do_not_partially_clear_live_turns(self):
        self.state.turn_started("a", "t1")
        before = self.state.snapshot()
        probe = self.state.begin_native_check("a")
        with self.assertRaises(ValueError):
            self.state.reconcile_native(probe, active_turn_ids=[], status={"type": "active", "activeFlags": [{}]})
        self.assertEqual(self.state.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
