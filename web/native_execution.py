"""Single-root execution admission for one native runtime generation.

This class observes native state; it does not run, queue, interrupt, or resend work.
The caller must reserve BEFORE forwarding turn/start. A request key must include
the native connection/runtime generation, not just the browser's JSON-RPC ID.
Only a definitive native RPC error belongs in rpc_error(); a transport timeout
or disconnect leaves the outcome unknown and MUST keep its reservation.

Register trusted native parent/internal metadata before observing each thread.
An unversioned late Active status cannot be distinguished from a missing Started
event: it conservatively requires native reconciliation instead of admitting a
second root. Native probes below are revision guarded against late responses.
"""

from dataclasses import dataclass
from threading import RLock
from typing import Hashable, Iterable, Mapping, Optional


class ExecutionBusy(RuntimeError):
    def __init__(self, snapshot):
        self.snapshot = snapshot
        super().__init__("Execution eligibility is already held")


@dataclass(frozen=True)
class Reservation:
    request_key: Hashable
    thread_id: str
    root_thread_id: str
    is_steer: bool
    turn_id: Optional[str] = None


@dataclass(frozen=True)
class CleanupToken:
    hold_id: Hashable
    generation: int


@dataclass(frozen=True)
class NativeProbe:
    thread_id: str
    root_thread_id: str
    revision: int


@dataclass(frozen=True)
class CleanupProbe:
    token: CleanupToken
    root_thread_id: str
    revision: int


@dataclass
class _Cleanup:
    token: CleanupToken
    thread_id: str
    failed: bool = False
    error: Optional[str] = None
    remaining_terminals: Optional[int] = None


def _parse_status(status):
    if isinstance(status, Mapping):
        kind = status.get("type", status.get("status"))
        raw_flags = status.get("activeFlags") or ()
        if (not isinstance(raw_flags, (list, tuple, set, frozenset))
                or any(not isinstance(flag, str) for flag in raw_flags)):
            raise ValueError("Native activeFlags must be a list of strings")
        flags = frozenset(raw_flags)
    else:
        kind, flags = status, frozenset()
    kind = str(kind).lower()
    if kind not in ("active", "idle", "notloaded", "systemerror"):
        raise ValueError("Unknown native thread status")
    return kind, flags


class ExecutionCandidate:
    def __init__(self):
        self._lock = RLock()
        self._metadata = {}  # thread -> (trusted native parent, internal)
        self._pending = {}  # request key -> Reservation
        self._settled_requests = set()
        self._live = set()  # (thread, turn), including ACK-before-started
        self._terminal = set()  # terminal is sticky: late ACK/Started cannot revive it
        self._busy = {}  # thread -> (native active flags, turn id, uncertain)
        self._unconfirmed_children = set()  # Created child, awaiting Started or a native snapshot
        self._status_sequences = {}
        self._cleanup = {}
        self._cleanup_generation = 0
        self._root_revisions = {}
        self._owner = None

    def _root(self, thread_id):
        seen = set()
        current = thread_id
        while True:
            if current in seen:
                raise ValueError("Native thread lineage contains a cycle")
            seen.add(current)
            parent, internal = self._metadata.get(current, (None, False))
            if internal:
                return None
            if parent is None:
                return current
            current = parent

    def _bump(self, thread_id):
        root = self._root(thread_id)
        if root is not None:
            self._root_revisions[root] = self._root_revisions.get(root, 0) + 1

    def _claimed_roots(self):
        threads = {reservation.thread_id for reservation in self._pending.values()}
        threads.update(thread for thread, _ in self._live)
        threads.update(self._busy)
        threads.update(self._unconfirmed_children)
        threads.update(hold.thread_id for hold in self._cleanup.values())
        return {root for thread in threads if (root := self._root(thread)) is not None}

    def _refresh_owner(self):
        roots = self._claimed_roots()
        if self._owner not in roots:
            self._owner = min(roots) if roots else None

    def register_thread(self, thread_id, parent_id=None, internal=False, *, startup_pending=True):
        """Metadata comes from native session source, never a browser label.

        Initial metadata may arrive after an event. Once explicitly registered,
        lineage/internal classification is immutable for this runtime generation.
        New native children conservatively hold their root until Started/completed
        or a fresh native snapshot. Historical-only metadata may explicitly pass
        startup_pending=False; a late child Started must never have an admission gap.
        """
        with self._lock:
            if not thread_id or thread_id == parent_id:
                raise ValueError("Invalid native thread identity or parent")
            metadata = (parent_id, bool(internal))
            if thread_id in self._metadata:
                if self._metadata[thread_id] != metadata:
                    raise ValueError("Cannot change registered native thread lineage")
                return
            previous_roots = self._claimed_roots()
            self._metadata[thread_id] = metadata
            try:
                self._root(thread_id)
            except ValueError:
                del self._metadata[thread_id]
                raise
            if (parent_id is not None and startup_pending and self._root(thread_id) is not None
                    and not any(thread == thread_id for thread, _ in self._live | self._terminal)):
                self._unconfirmed_children.add(thread_id)
            for root in previous_roots | self._claimed_roots():
                self._root_revisions[root] = self._root_revisions.get(root, 0) + 1
            self._refresh_owner()

    def reserve(self, request_key: Hashable, thread_id: str, *, expected_turn_id=None) -> Reservation:
        """Atomically admit one submission, before sending native turn/start.

        An existing owner is admitted only for its known live target thread/turn.
        Forward such a Reservation using native turn/steer(expectedTurnId), not
        turn/start: the native turn can finish between this check and forwarding.
        A duplicate key or a key reused after settlement is a caller error; this
        method never implements idempotent resending of a native mutation.
        """
        with self._lock:
            if request_key in self._pending or request_key in self._settled_requests:
                raise ValueError("Request identity has already been reserved")
            root = self._root(thread_id)
            if root is None:
                raise ValueError("Internal threads do not use user execution admission")
            self._refresh_owner()
            cleaning = any(self._root(hold.thread_id) == root for hold in self._cleanup.values())
            if cleaning or len(self._claimed_roots()) > 1 or self._owner not in (None, root):
                raise ExecutionBusy(self.snapshot())
            steering = self._owner is not None
            if steering:
                candidates = {turn for thread, turn in self._live if thread == thread_id}
                if expected_turn_id is None and len(candidates) == 1:
                    expected_turn_id = next(iter(candidates))
                if expected_turn_id not in candidates:
                    raise ExecutionBusy(self.snapshot())
            elif expected_turn_id is not None:
                raise ValueError("An idle root cannot steer a turn")
            reservation = Reservation(request_key, thread_id, root, steering, expected_turn_id)
            self._pending[request_key] = reservation
            self._bump(thread_id)
            self._refresh_owner()
            return reservation

    def ack(self, request_key, turn_id):
        """Consume a successful native ACK; return False for an already settled key."""
        if not turn_id:
            raise ValueError("A successful native ACK must identify its turn")
        with self._lock:
            reservation = self._pending.pop(request_key, None)
            if reservation is None:
                return False
            self._settled_requests.add(request_key)
            key = (reservation.thread_id, turn_id)
            if key not in self._terminal:
                self._live.add(key)
            self._bump(reservation.thread_id)
            self._refresh_owner()
            return True

    def rpc_error(self, request_key):
        """Only a definitive native rejection removes its own pending request."""
        with self._lock:
            reservation = self._pending.pop(request_key, None)
            if reservation is None:
                return False
            self._settled_requests.add(request_key)
            self._bump(reservation.thread_id)
            self._refresh_owner()
            return True

    def connection_closed(self, _connection_id=None):
        """Browser/native transport disconnect is not evidence of task completion."""
        return None

    def turn_started(self, thread_id, turn_id):
        with self._lock:
            if self._root(thread_id) is None or (thread_id, turn_id) in self._terminal:
                return False
            self._unconfirmed_children.discard(thread_id)
            if (thread_id, turn_id) in self._live:
                return True
            self._live.add((thread_id, turn_id))
            busy = self._busy.get(thread_id)
            if busy and busy[1] != turn_id:
                self._busy.pop(thread_id)
            self._bump(thread_id)
            self._refresh_owner()
            return True

    def turn_completed(self, thread_id, turn_id, status="completed", *, cleanup_hold_id=None):
        """Terminal event affects only this turn, not a newer turn or a child.

        Supply cleanup_hold_id to atomically establish a stop-cleanup hold before
        removing the live turn. Alternatively install a hold BEFORE requesting
        native interruption; installing it after completion has an admission gap.
        The returned CleanupToken is None when no hold was requested.
        """
        if status not in ("completed", "interrupted", "failed"):
            raise ValueError("turn_completed requires a native terminal status")
        with self._lock:
            if self._root(thread_id) is None:
                return None
            key = (thread_id, turn_id)
            if key in self._terminal:
                existing = self._cleanup.get(cleanup_hold_id)
                return existing.token if existing and existing.thread_id == thread_id else None
            token = None
            if cleanup_hold_id is not None:
                existing = self._cleanup.get(cleanup_hold_id)
                if key in self._terminal and existing and existing.thread_id == thread_id:
                    token = existing.token
                else:
                    token = self.hold_cleanup(thread_id, cleanup_hold_id)
            changed = key not in self._terminal or key in self._live
            if thread_id in self._unconfirmed_children:
                self._unconfirmed_children.remove(thread_id)
                changed = True
            self._terminal.add(key)
            self._live.discard(key)
            busy = self._busy.get(thread_id)
            if busy and busy[1] == turn_id:
                self._busy.pop(thread_id)
                changed = True
            if changed:
                self._bump(thread_id)
            self._refresh_owner()
            return token

    def thread_status(self, thread_id, status, *, turn_id=None, sequence=None):
        """Supplement turn events with native Active/waiting flags.

        Optional sequence must be a trustworthy native/observer-order revision.
        Idle does not erase a known live turn or pending ACK. A correlated late
        Active for an already completed turn is ignored. Bare Active without a
        known turn is conservatively 'reconciling' until an authoritative probe.
        """
        kind, flags = _parse_status(status)
        with self._lock:
            if self._root(thread_id) is None:
                return False
            if sequence is not None:
                if sequence <= self._status_sequences.get(thread_id, -1):
                    return False
                self._status_sequences[thread_id] = sequence
            if turn_id is not None and (thread_id, turn_id) in self._terminal:
                return False
            if kind == "active":
                live = [turn for thread, turn in self._live if thread == thread_id]
                if turn_id is None and len(live) == 1:
                    turn_id = live[0]
                busy = (flags, turn_id, turn_id is None)
                if self._busy.get(thread_id) == busy:
                    return True
                self._busy[thread_id] = busy
            elif kind in ("idle", "notloaded", "systemerror"):
                if any(thread == thread_id for thread, _ in self._live):
                    return False
                if any(r.thread_id == thread_id for r in self._pending.values()):
                    return False
                busy = self._busy.get(thread_id)
                if busy is None or (turn_id is not None and busy[1] not in (None, turn_id)):
                    return False
                # A naked Idle can be a delayed event from an older turn. Only
                # a fresh native probe may retire a previously observed busy.
                return False
            self._bump(thread_id)
            self._refresh_owner()
            return True

    def begin_native_check(self, thread_id) -> NativeProbe:
        """Capture BEFORE requesting an authoritative native thread snapshot."""
        with self._lock:
            root = self._root(thread_id)
            if root is None:
                raise ValueError("Internal threads do not hold user eligibility")
            return NativeProbe(thread_id, root, self._root_revisions.get(root, 0))

    def reconcile_native(self, probe: NativeProbe, *, active_turn_ids: Iterable[str], status="idle"):
        """Apply a fresh snapshot; never infer rejection of an unacknowledged RPC.

        A probe invalidated by any intervening root/child activity is rejected.
        active_turn_ids must reflect native execution state, not historical turns.
        """
        kind, flags = _parse_status(status)
        if isinstance(active_turn_ids, (str, bytes)):
            raise ValueError("active_turn_ids must be a native collection of turn IDs")
        active = set(active_turn_ids)
        if any(not isinstance(turn, str) or not turn for turn in active):
            raise ValueError("active_turn_ids contains an invalid native identity")
        if active and kind != "active":
            raise ValueError("An idle native snapshot cannot contain active turns")
        with self._lock:
            if (self._root(probe.thread_id) != probe.root_thread_id
                    or self._root_revisions.get(probe.root_thread_id, 0) != probe.revision):
                return False
            if any((probe.thread_id, turn) in self._terminal for turn in active):
                return False
            previous = {turn for thread, turn in self._live if thread == probe.thread_id}
            for turn in previous - active:
                self._live.remove((probe.thread_id, turn))
                self._terminal.add((probe.thread_id, turn))
            self._live.update((probe.thread_id, turn) for turn in active)
            self._unconfirmed_children.discard(probe.thread_id)
            self._busy.pop(probe.thread_id, None)
            self._bump(probe.thread_id)
            self._refresh_owner()
            if kind == "active":
                self.thread_status(probe.thread_id, {"type": kind, "activeFlags": sorted(flags)})
            return True

    def hold_cleanup(self, thread_id, hold_id) -> CleanupToken:
        with self._lock:
            if self._root(thread_id) is None:
                raise ValueError("Internal cleanup does not hold user eligibility")
            existing = self._cleanup.get(hold_id)
            if existing and existing.thread_id != thread_id:
                raise ValueError("A cleanup identity cannot overwrite another thread's hold")
            self._cleanup_generation += 1
            token = CleanupToken(hold_id, self._cleanup_generation)
            self._cleanup[hold_id] = _Cleanup(token, thread_id)
            self._bump(thread_id)
            self._refresh_owner()
            return token

    def cleanup_failed(self, token: CleanupToken, error="Native cleanup failed"):
        with self._lock:
            hold = self._cleanup.get(token.hold_id)
            if hold is None or hold.token != token:
                return False
            hold.failed, hold.error = True, str(error)
            self._bump(hold.thread_id)
            return True

    def begin_cleanup_check(self, token: CleanupToken) -> CleanupProbe:
        """Call before reading actual native backgroundTerminals, after the hold."""
        with self._lock:
            hold = self._cleanup.get(token.hold_id)
            if hold is None or hold.token != token:
                raise ValueError("Cleanup generation is no longer current")
            root = self._root(hold.thread_id)
            return CleanupProbe(token, root, self._root_revisions.get(root, 0))

    def confirm_cleanup(self, probe: CleanupProbe, *, background_terminals):
        """Only a current, unchanged native empty result may release this hold."""
        if not isinstance(background_terminals, (list, tuple)):
            raise TypeError("An actual native backgroundTerminals list is required")
        return self._confirm_cleanup(probe, remaining_count=len(background_terminals))

    def confirm_closed_cleanup(self, probe: CleanupProbe, *, native_thread,
                               turn_id, observed_command_ids):
        """Independent proof for a natively closed runtime, never a fake terminal list.

        Caller must have observed native close-agent attempt completion or a
        closed event, then captured this complete persisted thread/read under
        the probe. Attempt completion alone does not imply close API success.
        Unknown, interrupted and synthesized -1 command outcomes are insufficient.
        This proves managed commands exited, not arbitrary detached OS processes.
        """
        if (not isinstance(native_thread, dict)
                or (native_thread.get('status') or {}).get('type') != 'notLoaded'):
            raise ValueError('关闭确认需要原生线程当前为notLoaded')
        turns = native_thread.get('turns')
        if not isinstance(turns, list):
            raise ValueError('关闭确认缺少完整原生持久化历史')
        if turn_id is not None and not any(turn.get('id') == turn_id for turn in turns):
            raise ValueError('关闭确认的原生历史缺少待清理回合')
        commands = set()
        for turn in turns:
            if turn.get('status') not in ('completed', 'failed') or turn.get('itemsView') != 'full':
                raise ValueError('关闭确认的原生回合未明确结束或不是完整历史')
            if not isinstance(turn.get('items'), list):
                raise ValueError('关闭确认的原生回合缺少完整条目')
            for item in turn['items']:
                if item.get('type') == 'commandExecution':
                    code = item.get('exitCode')
                    if (item.get('status') not in ('completed', 'failed')
                            or type(code) is not int or code < 0):
                        raise ValueError('关闭线程仍有未明确退出的命令：'+str(item.get('id')))
                    commands.add(item['id'])
        if not set(observed_command_ids).issubset(commands):
            raise ValueError('关闭确认的完整原生历史遗漏已观测命令')
        with self._lock:
            hold = self._cleanup.get(probe.token.hold_id)
            if hold is None or hold.thread_id != native_thread.get('id'):
                return False
            return self._confirm_cleanup(probe, remaining_count=0)

    def _confirm_cleanup(self, probe, *, remaining_count):
        with self._lock:
            hold = self._cleanup.get(probe.token.hold_id)
            if (hold is None or hold.token != probe.token
                    or self._root(hold.thread_id) != probe.root_thread_id
                    or self._root_revisions.get(probe.root_thread_id, 0) != probe.revision):
                return False
            if remaining_count:
                hold.remaining_terminals = remaining_count
                self._bump(hold.thread_id)
                return False
            root = probe.root_thread_id
            busy_threads = {thread for thread, _ in self._live} | set(self._busy) | self._unconfirmed_children
            if any(self._root(thread) == root for thread in busy_threads):
                return False
            if any(self._root(r.thread_id) == root for r in self._pending.values()):
                return False
            del self._cleanup[probe.token.hold_id]
            self._bump(hold.thread_id)
            self._refresh_owner()
            return True

    def snapshot(self):
        with self._lock:
            self._refresh_owner()
            root = self._owner
            roots = self._claimed_roots()
            pending = [r for r in self._pending.values() if root is not None and self._root(r.thread_id) == root]
            turns = sorted((thread, turn) for thread, turn in self._live if root is not None and self._root(thread) == root)
            busy = {thread: value for thread, value in self._busy.items() if root is not None and self._root(thread) == root}
            holds = [hold for hold in self._cleanup.values() if root is not None and self._root(hold.thread_id) == root]
            children = sorted(thread for thread in self._unconfirmed_children if root is not None and self._root(thread) == root)
            flags = set().union(*(value[0] for value in busy.values())) if busy else set()
            normalized_flags = {str(flag).replace("_", "").lower() for flag in flags}
            if root is None:
                status = "idle"
            elif len(roots) > 1:
                status = "conflicted"
            elif any(hold.failed for hold in holds):
                status = "cleanupFailed"
            elif holds:
                status = "cleaningUp"
            elif "waitingonapproval" in normalized_flags or "waitingforapproval" in normalized_flags:
                status = "waitingForApproval"
            elif "waitingonuserinput" in normalized_flags or "waitingforinput" in normalized_flags:
                status = "waitingForInput"
            elif children or any(value[2] for value in busy.values()):
                status = "reconciling"
            elif turns or busy:
                status = "running"
            else:
                status = "starting"
            current = next(((thread, turn) for thread, turn in turns if thread == root), None)
            if current is None and turns:
                current = turns[0]
            thread = current[0] if current else (pending[0].thread_id if pending else root)
            return {
                "ownerThreadId": root,
                "threadId": thread,
                "turnId": current[1] if current else None,
                "status": status,
                "pendingCount": len(pending),
                "pendingChildThreadIds": children,
                "activeThreadIds": sorted({thread for thread, _ in turns} | set(busy)),
                "activeTurns": [{"threadId": thread, "turnId": turn} for thread, turn in turns],
                "cleanupHolds": [{"holdId": str(hold.token.hold_id), "generation": hold.token.generation,
                                  "threadId": hold.thread_id, "failed": hold.failed,
                                  "error": hold.error, "remainingTerminals": hold.remaining_terminals}
                                 for hold in holds],
                "blockedRootThreadIds": sorted(roots),
                "revision": self._root_revisions.get(root, 0),
            }
