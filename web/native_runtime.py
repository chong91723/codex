"""A service-owned native runtime; transport and execution admission only.

Public integration: open_client() installs before_request/after_response exactly
once. Browser code must not call these hooks again around client.send().
create_thread() creates/resumes on the observer connection so an empty thread
without a rollout is already observed. Execution admission separately subscribes
its browser; for a locally created empty root, native naming with the first real
user question saves its history before native resume. Admission also reattaches
after any cold configuration replacement.
status() and bridge:execution use the
same decorated snapshot, including cleanup turnId and backgroundRunning.
Browser EOF detaches browser delivery while the original native connection
drains its tracked RPC outcomes. pendingNativeAcks and drainingConnections make
this visible; actual native EOF before a tracked response remains fail-closed
as acknowledgementUnknown. No user input is retried or inferred from events.
Native resume reserves its root before restoring persisted goals/queues; its ACK
ends only the temporary restore hold, never the imported autonomous-work state.
This admission boundary assumes all profile mutations use this service. Separate
CLI clients writing to the same profile are outside its single-user gate.

The observer deliberately keeps native thread subscriptions. Loaded idle
threads can retain their MCP clients/processes; unlimited durable history does
not imply zero memory or process cost for every loaded conversation. Eviction
of service-observed idle threads is a separate lifecycle policy.

No model loop, task queue, retry of user requests, or substitute native scheduler
lives here. Workers only persist native events and query/terminate native
background terminals. Ordinary completion NEVER authorizes termination.
"""
from collections import deque
from dataclasses import dataclass, field
import os
from pathlib import Path
import queue
import secrets
import subprocess
import tempfile
import threading
import time

from native_transport import connect_unix
from native_process import spawn_owned_native
from native_execution import ExecutionCandidate, ExecutionBusy


class NativeRPCError(RuntimeError):
    def __init__(self, error):
        super().__init__(error.get('message', '原生请求失败'))
        self.error = error


class NativeDisconnected(RuntimeError):
    pass


@dataclass
class _Barrier:
    done: threading.Event = field(default_factory=threading.Event)


class NativeClient:
    """One native connection. Slow consumers cannot block its RPC reader.

    Every connection has its own bounded delivery queue. Browser delivery
    failure closes browser IO, while native RPC replies continue to drain.
    Observer overflow closes its connection visibly; events are not dropped.
    Private control responses bypass browser delivery after the state callback.
    """
    def __init__(self, wire, receive, closed=lambda: None, *, before_send=None,
                 after_receive=None, status_receive=None, capacity=512,
                 delivery_closed=None, native_closed=None, idle=None):
        self.wire, self.receive, self.on_closed = wire, receive, closed
        self.before_send, self.after_receive = before_send, after_receive
        self.status_receive = status_receive or receive
        self.delivery_closed, self.native_closed, self.on_idle = delivery_closed, native_closed, idle
        self.pending, self.lock = {}, threading.RLock()
        self.prefix = 'web-control-'+secrets.token_hex(16)+'-'
        self.serial, self.closed = 0, False
        self.detached, self.sending = False, 0
        self.failure = None
        self.delivery = queue.Queue(maxsize=capacity)
        self.delivery_thread = threading.Thread(target=self._deliver, daemon=True)
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.delivery_thread.start()
        self.reader.start()

    def _finish(self, error=None, *, only_if_idle=False):
        with self.lock:
            if self.closed:
                return True
            if only_if_idle and (self.sending or self.pending):
                return False
            self.closed, self.failure = True, error
            pending, self.pending = list(self.pending.values()), {}
        try:
            self.wire.close()
        except OSError:
            pass
        for result in pending:
            result.put_nowait({'_transport_error': True})
        try:
            if self.native_closed:
                self.native_closed(self)
            if not self.detached:
                self.on_closed()
        except Exception:
            pass
        return True

    def detach_delivery(self):
        """The page has gone; native request outcomes must still be drained."""
        with self.lock:
            was_detached = self.detached
            self.detached = True
        if not was_detached:
            try:
                self.on_closed()  # close browser IO, never native IO
            except Exception:
                pass

    def _idle(self):
        if self.on_idle:
            self.on_idle(self)

    def _delivery_failed(self, error):
        if self.delivery_closed:
            self.delivery_closed(self, error)
        else:
            self._finish(error)

    def _post(self, kind, message):
        if self.closed:
            return False
        if self.detached and kind != 'barrier':
            return True
        try:
            self.delivery.put_nowait((kind, message))
            return True
        except queue.Full:
            self._delivery_failed(NativeDisconnected('网页接收积压超出预算，已停止页面投递；未自动重发。'))
            return not self.closed

    def post_status(self, message):
        return self._post('status', message)

    def _respond_locally(self, message):
        # Internal native management calls use the same admission hook as
        # browser RPCs. Deliver a local rejection to their private waiter too.
        with self.lock:
            pending = self.pending.pop(message.get('id'), None)
        if pending is not None:
            pending.put_nowait(message)
        else:
            self._post('receive', message)

    # Existing Runtime clients expose a callable status member.
    status = post_status

    def _deliver(self):
        while not self.closed or not self.delivery.empty():
            try:
                kind, message = self.delivery.get(timeout=.1)
            except queue.Empty:
                continue
            try:
                if kind == 'barrier':
                    message.done.set()
                elif not self.closed and not self.detached:
                    (self.status_receive if kind == 'status' else self.receive)(message)
            except Exception as error:
                self._delivery_failed(error)
            finally:
                self.delivery.task_done()

    def _read(self):
        failure = None
        try:
            while not self.closed:
                message = self.wire.receive()
                if not isinstance(message, dict):
                    raise ValueError('原生消息不是JSON对象。')
                with self.lock:
                    pending = self.pending.pop(message.get('id'), None) if not message.get('method') else None
                # Private management replies must settle the same tracked native
                # lifecycle once, before waking their caller. This callback only
                # changes state; it never waits on control or issues native RPCs.
                if self.after_receive:
                    self.after_receive(self, message)
                if pending is not None:
                    pending.put_nowait(message)
                else:
                    if not self._post('receive', message):
                        break
        except Exception as error:
            failure = error
        finally:
            self._finish(failure)

    def send(self, message):
        with self.lock:
            if self.closed or (self.detached and message.get('id') not in self.pending):
                raise NativeDisconnected('原生或网页连接已断开；未自动重发。')
            self.sending += 1
        try:
            return self._send(message)
        finally:
            with self.lock:
                self.sending -= 1
            self._idle()

    def _send(self, message):
        if self.before_send:
            try:
                self.before_send(self, message)
            except ExecutionBusy as error:
                self._respond_locally({'id': message.get('id'), 'error': {
                    'code': -32002, 'message': '其他分析或后台任务尚未结束，请先停止并确认清理。草稿已保留。',
                    'data': {'type': 'executionBusy', 'execution': error.snapshot}}})
                return False
            except (NativeRPCError, NativeDisconnected, ValueError) as error:
                detail = error.error if isinstance(error, NativeRPCError) else {
                    'code': -32003 if isinstance(error, NativeDisconnected) else -32602, 'message': str(error)}
                self._respond_locally({'id': message.get('id'), 'error': detail})
                return False
        # An uncertain send/transport failure MUST NOT revoke a reservation.
        self.wire.send(message)
        return True

    def call(self, method, params=None, timeout=30):
        result = queue.Queue(maxsize=1)
        with self.lock:
            if self.closed:
                raise NativeDisconnected('原生连接已断开；未自动重发。')
            self.serial += 1
            identifier = self.prefix+str(self.serial)
            self.pending[identifier] = result
        try:
            self.send({'id': identifier, 'method': method, 'params': params})
            try:
                reply = result.get(timeout=timeout)
            except queue.Empty:
                raise NativeDisconnected('原生控制请求结果未知：'+method+'；未自动重发。') from None
            if reply.get('_transport_error'):
                raise NativeDisconnected('原生连接已断开；未自动重发。')
            if 'error' in reply:
                raise NativeRPCError(reply['error'])
            return reply.get('result')
        finally:
            with self.lock:
                self.pending.pop(identifier, None)
            self._idle()

    def flush(self, timeout=10):
        barrier = _Barrier()
        if not self._post('barrier', barrier) or not barrier.done.wait(timeout):
            raise NativeDisconnected('原生事件观察未跟上，暂不接收新执行。')

    def close(self, *, only_if_idle=False):
        if not self._finish(only_if_idle=only_if_idle):
            return False
        if threading.current_thread() is not self.reader:
            self.reader.join(timeout=1)
        # Never wait on a slow browser delivery worker here. Socket ownership
        # closes its IO; worker callbacks are daemon threads isolated per client.
        try:
            if hasattr(self.wire, 'reader') and not self.reader.is_alive():
                self.wire.reader.close()
            if hasattr(self.wire, 'sock'):
                self.wire.sock.close()
        except OSError:
            pass
        return True


@dataclass
class _CleanupJob:
    thread_id: str
    turn_id: str | None
    token: object
    terminate: bool = False
    reason: str = 'completed'
    terminals: list = field(default_factory=list)
    error: str | None = None
    state: str = 'checkingBackground'
    proof_kind: str = 'backgroundTerminals'


class NativeRuntime:
    TURN_METHODS = {'turn/start', 'turn/steer', 'review/start', 'thread/queue/start'}
    AUX_METHODS = {'thread/compact/start', 'thread/sample', 'thread/queue/add'}
    UNSUPPORTED_EXECUTION = {'thread/prediction/request', 'command/exec', 'process/exec', 'process/spawn',
                             'thread/realtime/start', 'thread/realtime/appendAudio', 'thread/realtime/appendText'}
    OBSERVED = {'thread/started', 'thread/deleted', 'thread/closed', 'thread/status/changed',
                'turn/started', 'turn/completed', 'item/started', 'item/completed',
                'hook/started', 'hook/completed', 'thread/goal/updated', 'thread/goal/cleared',
                'thread/queue/changed'}

    def __init__(self, codex, workspace, overrides, stop_process, register, unregister,
                 *, evidence=None, start_workers=True, poll_interval=.5, event_capacity=4096):
        self.codex, self.workspace, self.overrides = codex, workspace, overrides
        self.stop_process, self.register, self.unregister = stop_process, register, unregister
        self.lock, self.control = threading.RLock(), threading.RLock()
        self.start_lock = threading.Lock()
        self.startup_ready, self.startup_error = False, None
        self.directory = tempfile.TemporaryDirectory(prefix='codex-web-native-')
        self.path = Path(self.directory.name)/'runtime.sock'
        self.process, self.observer, self.closed = None, None, False
        self.clients, self.subscriptions, self.thread_memory = set(), set(), {}
        self.draining_clients, self.ack_errors = set(), {}
        self.created_roots = set()
        self.execution = ExecutionCandidate()
        self.metadata, self.commands, self.cleanup_tokens = {}, {}, {}
        self.requests, self.request_lock = {}, threading.RLock()
        self.cleanup_jobs, self.hooks, self.goals, self.queues = {}, {}, {}, {}
        self.auxiliary, self.dirty_threads, self.subscribe_pending = {}, set(), set()
        self.completed_turns, self.completed_hooks = set(), set()
        self.closed_threads, self.closed_cleanup_proofs = {}, deque(maxlen=20)
        self.closure_epoch = 0
        self.native_starts, self.queue_delete_confirmed = {}, set()
        self.goal_checks, self.goal_versions, self.queue_versions = set(), {}, {}
        self.observer_error = None
        self.cleanup_signal = threading.Event()
        self.poll_interval, self.workers_started = poll_interval, start_workers
        self.stderr, self.events = deque(maxlen=40), queue.Queue(maxsize=event_capacity)
        self.evidence = evidence
        self.cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self.event_thread = threading.Thread(target=self._observe, daemon=True)
        if start_workers:
            self.event_thread.start()
            self.cleanup_thread.start()

    def start(self):
        # Publishing a Popen handle does not mean the native observer is ready.
        # Every caller waits for the same initialize/initialized barrier. Keep
        # the RPC reader independent of this lock so it can deliver the reply.
        with self.start_lock:
            if self.startup_error:
                raise RuntimeError(self.startup_error)
            try:
                self._start_native()
            except Exception as error:
                self.startup_error = '原生运行时初始化失败，请重启服务并核对状态：'+str(error)
                self.observer_error = self.startup_error
                raise

    def _start_native(self):
        with self.lock:
            if self.closed:
                raise RuntimeError('原生运行时已关闭。')
            if self.process:
                if self.process.poll() is not None:
                    raise RuntimeError('后台原生运行时已退出，请重启服务并核对任务状态；不会自动重发。')
                return
            self.process = spawn_owned_native([self.codex, *[arg for item in self.overrides for arg in ('-c', item)],
                'app-server', '--listen', 'unix://'+str(self.path)], cwd=self.workspace,
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, start_new_session=True)
            self.register(self.process)
            process = self.process
            def stderr():
                for line in process.stderr:
                    self.stderr.append(line.decode(errors='replace'))
            threading.Thread(target=stderr, daemon=True).start()
            deadline = time.monotonic()+20
            while True:
                if process.poll() is not None:
                    raise RuntimeError('原生运行时启动失败，退出码 '+str(process.returncode)+'。')
                try:
                    wire = connect_unix(self.path, timeout=2)
                    break
                except (FileNotFoundError, ConnectionRefusedError):
                    if time.monotonic() >= deadline:
                        raise RuntimeError('等待原生本地socket就绪超时。') from None
                    threading.Event().wait(.02)
            self.observer = NativeClient(wire, self._enqueue, self._observer_closed,
                                         before_send=self.before_request, after_receive=self.after_response)
        self.observer.call('initialize', {'clientInfo': {'name': 'codex_web_observer', 'version': '1'}, 'capabilities': {'experimentalApi': True}})
        self.observer.send({'method': 'initialized'})
        self.startup_ready = True

    def _observer_closed(self):
        if not self.closed:
            if self.observer:
                with self.request_lock:
                    if any(key[0] == self.observer.prefix for key in self.requests):
                        self.ack_errors[self.observer.prefix] = '原生观察连接在恢复确认前断开；保留执行占用，未自动重发。'
            self.observer_error = '原生持续观察连接已断开；执行结果需核实，未自动重发。'
            self.emit_execution()

    def _enqueue(self, message):
        if message.get('method') not in self.OBSERVED:
            return
        try:
            self.events.put_nowait(message)
        except queue.Full:
            self.observer_error = '原生事件积压超出预算；证据完整性尚未确认，暂停新的执行。'
            self.emit_execution()
            if self.observer:
                self.observer.close()
            raise NativeDisconnected(self.observer_error)

    def _observe(self):
        if self.evidence is None:
            from analysis_evidence import Evidence
            self.evidence = Evidence()
        while not self.closed:
            try:
                message = self.events.get(timeout=.1)
            except queue.Empty:
                continue
            try:
                if isinstance(message, _Barrier):
                    message.done.set()
                elif message is not None:
                    self.observe(message)
                    self.evidence.observe(message)
            except Exception as error:
                self.observer_error = '后台原生事件处理未完成：'+str(error)
                self.broadcast({'bridge': 'warning', 'message': self.observer_error})
                self.emit_execution()
            finally:
                self.events.task_done()

    def _flush_observer(self):
        if (self.observer_error or not self.observer or getattr(self.observer, 'closed', False)
                or (self.process and not self.startup_ready)):
            raise NativeDisconnected(self.observer_error or '原生持续观察尚未就绪。')
        if hasattr(self.observer, 'flush'):
            self.observer.flush()
        if self.workers_started:
            barrier = _Barrier()
            try:
                self.events.put_nowait(barrier)
            except queue.Full:
                raise NativeDisconnected('原生事件正在积压，暂不接收新的执行。') from None
            if not barrier.done.wait(10):
                raise NativeDisconnected('原生事件核对超时，暂不接收新的执行。')

    @staticmethod
    def _source(thread):
        source, parent = thread.get('source'), thread.get('parentThreadId')
        internal = False
        if isinstance(source, dict):
            # Source is trusted native SessionSource, not client threadSource.
            internal = 'internal' in source
            sub = source.get('subagent')
            if sub == 'memory_consolidation':
                internal = True
            if isinstance(sub, dict):
                spawned = sub.get('thread_spawn') or {}
                parent = parent or spawned.get('parent_thread_id')
        return parent, internal

    def _root(self, identity):
        seen = set()
        while identity and identity not in seen:
            seen.add(identity)
            value = self.metadata.get(identity) or {}
            if value.get('internal'):
                return None
            if not value.get('parent'):
                return identity
            identity = value['parent']
        return None

    def remember_thread(self, thread, *, historical=False):
        identity = thread['id']
        parent, internal = self._source(thread)
        with self.lock:
            previous = self.metadata.get(identity)
            if previous:
                # A collab event may have supplied lineage before thread/started.
                if parent is not None and previous.get('parent') not in (None, parent):
                    raise ValueError('原生子代理归属不一致，暂不接收新的执行。')
                return
            self.execution.register_thread(identity, parent, internal, startup_pending=not historical)
            self.metadata[identity] = {'parent': parent, 'internal': internal}
            if parent and not internal:
                self.dirty_threads.add(identity)
            self.cleanup_signal.set()

    def _new_job(self, identity, turn_id, *, terminate=False, reason='completed'):
        if self._root(identity) is None:
            return None
        key = (identity, turn_id)
        existing = self.cleanup_jobs.get(key)
        if existing and (existing.terminate or not terminate):
            return existing
        token = self.execution.hold_cleanup(identity, ('background', identity, turn_id))
        job = _CleanupJob(identity, turn_id, token, terminate, reason)
        self.cleanup_jobs[key] = job
        self.cleanup_tokens[key] = token
        return job

    def observe(self, message):
        method, params = message.get('method'), message.get('params') or {}
        identity = params.get('threadId')
        turn = params.get('turn') or {}
        turn_id = params.get('turnId') or turn.get('id')
        with self.lock:
            if method == 'thread/started':
                thread = params['thread']
                identity = thread['id']
                self.closed_threads.pop(identity, None)
                self.remember_thread(thread)
                if self._root(identity) is not None:
                    self.subscribe_pending.add(identity)
                if (thread.get('status') or {}).get('type') == 'active':
                    self.execution.thread_status(identity, thread['status'])
            elif identity and method == 'thread/status/changed':
                if params['status'].get('type') == 'active':
                    self.closed_threads.pop(identity, None)
                self.execution.thread_status(identity, params['status'])
                if params['status'].get('type') != 'active':
                    self.dirty_threads.add(identity)
            elif method == 'turn/started':
                self.closed_threads.pop(identity, None)
                if (identity, turn_id) not in self.completed_turns:
                    self.native_starts[identity] = self.native_starts.get(identity, 0) + 1
                self.execution.turn_started(identity, turn_id)
                if identity in self.queues:
                    self.queues[identity]['dispatchPending'] = False
                self.dirty_threads.discard(identity)
                # Compaction is queued by native Op; its actual Started closes
                # the gap between the empty RPC ACK and observed execution.
                for operation in self.auxiliary.values():
                    if operation['thread'] == identity and operation['method'] == 'thread/compact/start':
                        operation['observed'] = True
                self._settle_auxiliary()
            elif method == 'turn/completed':
                key = (identity, turn_id)
                if key not in self.completed_turns:
                    self._new_job(identity, turn_id, terminate=turn.get('status') in ('failed', 'interrupted'),
                                  reason='failed' if turn.get('status') == 'failed' else 'completed')
                    self.execution.turn_completed(identity, turn_id, turn.get('status', 'completed'))
                    self.completed_turns.add(key)
                self.dirty_threads.add(identity)
            elif method in ('hook/started', 'hook/completed'):
                run = params.get('run') or {}
                hook_key = (identity, run.get('id'))
                if method == 'hook/started' and hook_key not in self.completed_hooks and self._root(identity):
                    # Runtime admission includes hooks independently of turn IDs.
                    self.hooks[hook_key] = {'threadId': identity, 'turnId': turn_id, 'runId': run.get('id')}
                elif method == 'hook/completed':
                    self.completed_hooks.add(hook_key)
                    if hook_key in self.hooks:
                        self._new_job(identity, turn_id, reason='hook')
                        self.hooks.pop(hook_key, None)
                    self.dirty_threads.add(identity)
            elif method == 'thread/goal/updated':
                self.goals[identity] = params['goal']
                self.goal_versions[identity] = self.goal_versions.get(identity, 0) + 1
            elif method == 'thread/goal/cleared':
                self.goals.pop(identity, None)
                self.goal_versions[identity] = self.goal_versions.get(identity, 0) + 1
                self.dirty_threads.add(identity)
            elif method == 'thread/queue/changed':
                self.queue_versions[identity] = self.queue_versions.get(identity, 0) + 1
                self.queues.setdefault(identity, {'data': [], 'checking': True})['checking'] = True
                self.dirty_threads.add(identity)
            elif method == 'thread/closed' and identity:
                self._record_closed(identity, 'thread/closed')
            item = params.get('item') or {}
            if identity and turn_id and item.get('type') == 'commandExecution':
                self.commands.setdefault((identity, turn_id), set()).add(item['id'])
            if item.get('type') == 'collabAgentToolCall':
                parent = item.get('senderThreadId') or identity
                for child in item.get('receiverThreadIds') or []:
                    if child not in self.metadata:
                        self.remember_thread({'id': child, 'parentThreadId': parent, 'source': {'subagent': {'thread_spawn': {'parent_thread_id': parent}}}})
                for child, state in (item.get('agentsStates') or {}).items():
                    if (method == 'item/completed' and item.get('tool') == 'closeAgent'
                            and item.get('status') == 'completed'
                            and child in (item.get('receiverThreadIds') or [])):
                        # Native emits this item even when close_agent later
                        # returns an error. It proves attempt completion only;
                        # fresh notLoaded/full exited history is still required.
                        self._record_closed(child, 'closeAgentAttemptCompleted', item.get('id'))
                    # A collab item is a reason to query current native state,
                    # never an authoritative substitute for a fresh snapshot.
                    if state.get('status') in ('completed', 'shutdown', 'errored', 'notFound'):
                        self.dirty_threads.add(child)
            self.cleanup_signal.set()
        self.emit_execution()

    def _record_closed(self, identity, kind, event_id=None):
        self.closure_epoch += 1
        self.closed_threads[identity] = {'kind': kind, 'eventId': event_id, 'epoch': self.closure_epoch}
        self.subscribe_pending.discard(identity)
        self.subscriptions.discard(identity)
        self.dirty_threads.add(identity)

    def _execution_snapshot(self):
        with self.lock:
            value = self.execution.snapshot()
            roots = set(value['blockedRootThreadIds'])
            roots.update(self._root(operation['thread']) for operation in self.auxiliary.values())
            roots.update(self._root(hook['threadId']) for hook in self.hooks.values())
            roots.update(self._root(thread) for thread, goal in self.goals.items() if goal.get('status') == 'active')
            roots.update(self._root(thread) for thread, state in self.queues.items()
                         if state.get('data') or state.get('checking') or state.get('dispatchPending'))
            roots.discard(None)
            if value['ownerThreadId'] is None and roots:
                value.update(ownerThreadId=sorted(roots)[0], threadId=sorted(roots)[0], status='running')
            if len(roots) > 1:
                value['status'] = 'conflicted'
            value['blockedRootThreadIds'] = sorted(roots)
            root = value['ownerThreadId']
            jobs = [job for job in self.cleanup_jobs.values() if self._root(job.thread_id) == root]
            for hold in value['cleanupHolds']:
                job = next((job for job in jobs if job.token.generation == hold['generation']), None)
                if job:
                    hold.update(turnId=job.turn_id, reason=job.reason, status=job.state,
                                backgroundTerminals=list(job.terminals), error=job.error or hold['error'],
                                proofKind=job.proof_kind)
            value['closedCleanupProofs'] = list(self.closed_cleanup_proofs)
            value['backgroundCommands'] = [dict(terminal, threadId=job.thread_id, turnId=job.turn_id)
                                           for job in jobs for terminal in job.terminals]
            value['activeHooks'] = [dict(hook) for hook in self.hooks.values() if self._root(hook['threadId']) == root]
            value['goalActive'] = any(self._root(thread) == root and goal.get('status') == 'active' for thread, goal in self.goals.items())
            value['queuedSubmissions'] = sum(len(state.get('data') or []) for thread, state in self.queues.items() if self._root(thread) == root)
            value['nativeQueueDispatchPending'] = any(self._root(thread) == root and state.get('dispatchPending')
                                                      for thread, state in self.queues.items())
            if len(roots) <= 1 and not value['activeTurns'] and not value['pendingCount']:
                if any(job.state == 'cleanupFailed' for job in jobs):
                    value['status'] = 'cleanupFailed'
                elif any(job.state == 'backgroundRunning' for job in jobs):
                    value['status'] = 'backgroundRunning'
                elif value['activeHooks']:
                    value['status'] = 'runningHook'
                elif value['goalActive']:
                    value['status'] = 'runningGoal'
                elif value['queuedSubmissions'] or value['nativeQueueDispatchPending']:
                    value['status'] = 'nativeQueued'
            value['observerReady'] = bool(self.observer and not getattr(self.observer, 'closed', False)
                                          and not self.observer_error and (not self.process or self.startup_ready))
            with self.request_lock:
                value['pendingNativeAcks'] = [dict(threadId=request['thread'], method=request['method'],
                                                  requestId=key[1], error=self.ack_errors.get(key[0]))
                                             for key, request in self.requests.items()]
            value['drainingConnections'] = len(self.draining_clients)
            if any(pending['error'] for pending in value['pendingNativeAcks']):
                value['status'] = 'acknowledgementUnknown'
            if self.observer_error:
                value['observerError'] = self.observer_error
                value['status'] = 'observationFailed'
            return value

    def emit_execution(self):
        self.broadcast({'bridge': 'execution', 'execution': self._execution_snapshot()})

    def _admit_root(self, identity):
        root = self._root(identity)
        if root is None:
            raise NativeRPCError({'code': -32002, 'message': '内部原生线程不接受网页分析输入。'})
        snapshot = self._execution_snapshot()
        if len(snapshot['blockedRootThreadIds']) > 1 or snapshot['ownerThreadId'] not in (None, root):
            raise ExecutionBusy(snapshot)
        if snapshot['observerReady'] is False:
            raise NativeRPCError({'code': -32003, 'message': snapshot.get('observerError', '持续原生观察未就绪，暂不接收新的执行。')})
        return root

    def before_request(self, client, message):
        method, params = message.get('method'), message.get('params') or {}
        identity, identifier = params.get('threadId'), message.get('id')
        if method in self.UNSUPPORTED_EXECUTION or (method == 'review/start' and params.get('delivery') == 'detached'):
            raise NativeRPCError({'code': -32002, 'message': '该原生执行方式尚不能完整关联单会话状态，请使用当前会话的原生回合或内联审查。'})
        if method == 'turn/steer' and not params.get('expectedTurnId'):
            raise ValueError('原生继续输入必须明确expectedTurnId。')
        active_goal = method == 'thread/goal/set' and params.get('status') not in ('paused', 'blocked', 'complete', 'usageLimited', 'budgetLimited')
        executing = method in self.TURN_METHODS or method in self.AUX_METHODS or active_goal
        if executing:
            if identifier is None or not identity:
                raise ValueError('执行请求必须包含原生会话和请求标识。')
            with self.control:
                # Cold resume itself can wake native goals/queues. Reject a
                # competing root BEFORE causing any native lifecycle work.
                self._admit_root(identity)
                try:
                    self.ensure_observed(identity)
                    self.attach_client_thread(client, identity, initial_name=self._initial_name(params))
                    self._flush_observer()
                except NativeDisconnected as error:
                    raise NativeRPCError({'code': -32003, 'message': str(error)}) from None
                self._admit_root(identity)
                key = (client.prefix, identifier)
                with self.request_lock:
                    if key in self.requests:
                        raise ValueError('同一连接的执行请求标识已使用；未重复发送。')
                if method in self.TURN_METHODS:
                    try:
                        reservation = self.execution.reserve(key, identity, expected_turn_id=params.get('expectedTurnId'))
                    except ExecutionBusy:
                        raise ExecutionBusy(self._execution_snapshot()) from None
                    if reservation.is_steer and method != 'turn/steer':
                        self.execution.rpc_error(key)
                        raise NativeRPCError({'code': -32002, 'message': '该会话已有原生回合，请使用带expectedTurnId的原生继续输入。'})
                else:
                    if self._execution_snapshot()['cleanupHolds']:
                        raise ExecutionBusy(self._execution_snapshot())
                    with self.lock:
                        self.auxiliary[key] = {'thread': identity, 'method': method, 'acked': False, 'observed': False}
                with self.request_lock:
                    self.requests[key] = {'method': method, 'thread': identity, 'goal': active_goal}
            self.emit_execution()
        elif method == 'turn/interrupt':
            with self.control, self.lock:
                key = (identity, params.get('turnId'))
                known_current = identity in self.metadata and any(
                    (turn['threadId'], turn['turnId']) == key
                    for turn in self.execution.snapshot()['activeTurns'])
                if key not in self.cleanup_jobs and not known_current:
                    # Forward unknown/stale/startup interrupts to native for its
                    # own response, without inventing a cleanup obligation/root.
                    # A pending startup request already retains its reservation.
                    return
                self._new_job(identity, params.get('turnId'), terminate=True, reason='interruptRequested')
                # Repeating interrupt retries failed native cleanup even when the
                # native turn has already ended and interrupt itself returns error.
                job = self.cleanup_jobs.get(key)
                if job:
                    job.error, job.state = None, 'cleaningUp'
                self.dirty_threads.add(identity)
                self.cleanup_signal.set()
            self.emit_execution()
        elif method == 'thread/queue/delete' and identifier is not None:
            with self.request_lock:
                self.requests[(client.prefix, identifier)] = {'method': method, 'thread': identity, 'goal': False}
        elif method == 'thread/resume':
            # Native resume can restore persisted autonomous work after its ACK.
            # This applies to browser attach, observer attach and memory cold
            # resume because every NativeClient uses this same admission hook.
            if identifier is None or not identity:
                raise ValueError('恢复请求必须包含原生会话和请求标识。')
            with self.control:
                self._begin_resume((client.prefix, identifier), identity)
            self.emit_execution()

    def _native_queue(self, identity):
        data, cursor, seen = [], None, set()
        while True:
            page = self.observer.call('thread/queue/list', {'threadId': identity, 'limit': 100, 'cursor': cursor})
            data.extend(page['data'])
            cursor = page.get('nextCursor')
            if not cursor:
                return data
            if cursor in seen:
                raise ValueError('原生待执行输入分页游标未前进。')
            seen.add(cursor)

    def _import_queue(self, identity, data, *, checking=False):
        # Native removes a queued submission after starting its turn, before the
        # observer necessarily receives Started. Preserve that dispatch gap.
        previous = self.queues.get(identity) or {}
        dispatched = (previous.get('data') and not data
                      and self.native_starts.get(identity, 0) == previous.get('startVersion', 0))
        pending = previous.get('dispatchPending', False) or bool(dispatched)
        if identity in self.queue_delete_confirmed:
            pending = False
            self.queue_delete_confirmed.discard(identity)
        self.queues[identity] = {'data': data, 'checking': checking,
                                'dispatchPending': pending,
                                'startVersion': self.native_starts.get(identity, 0)}

    def _begin_resume(self, key, identity):
        """Reserve before native resume, importing real durable autowork first.

        Native goal/get and queue/list read notLoaded threads without resuming
        them. Resume's ACK precedes its idle hooks, so an ACK alone cannot prove
        an idle root. No native work is dispatched or retried by this adapter.
        The caller holds control, but never runtime.lock during native RPCs.
        """
        self._admit_root(identity)
        with self.request_lock:
            if key in self.requests:
                raise ValueError('同一连接的恢复请求标识已使用；未重复发送。')
        with self.lock:
            self.auxiliary[key] = {'thread': identity, 'method': 'thread/resume', 'acked': False, 'observed': False}
            goal_version = self.goal_versions.get(identity, 0)
            queue_version = self.queue_versions.get(identity, 0)
        try:
            thread = self.observer.call('thread/read', {'threadId': identity, 'includeTurns': False})['thread']
            self.remember_thread(thread, historical=True)
            # A locally created, still pathless root cannot have a native goal:
            # the native goal/get AND goal/set reject nonmaterialized threads.
            # Keep queue/list real; that endpoint permits a persistent new root.
            fresh = identity in self.created_roots and 'path' in thread and thread['path'] is None
            goal = None if fresh else self.observer.call('thread/goal/get', {'threadId': identity})['goal']
            data = self._native_queue(identity)
            self._flush_observer()
            with self.lock:
                if (thread.get('status') or {}).get('type') == 'active':
                    self.execution.thread_status(identity, thread['status'])
                if self.goal_versions.get(identity, 0) == goal_version:
                    if goal:
                        self.goals[identity] = goal
                    else:
                        self.goals.pop(identity, None)
                else:
                    self.goal_checks.add(identity)
                changed = self.queue_versions.get(identity, 0) != queue_version
                self._import_queue(identity, data, checking=changed)
                if changed:
                    self.dirty_threads.add(identity)
                with self.request_lock:
                    self.requests[key] = {'method': 'thread/resume', 'thread': identity, 'goal': False}
                self.cleanup_signal.set()
        except Exception:
            # No resume has been sent yet. A failed read cannot be treated as
            # empty autowork, but the temporary pre-send hold can safely end.
            with self.lock:
                self.auxiliary.pop(key, None)
            raise

    def after_response(self, client, message):
        if message.get('method') or message.get('id') is None:
            return
        key = (client.prefix, message['id'])
        with self.request_lock:
            request = self.requests.pop(key, None)
        if not request:
            return
        method, identity = request['method'], request['thread']
        with self.lock:
            if 'error' in message:
                self.execution.rpc_error(key)
                self.auxiliary.pop(key, None)
            else:
                result = message.get('result') or {}
                if method in self.TURN_METHODS:
                    turn_id = (result.get('turn') or {}).get('id') or result.get('turnId')
                    if turn_id:
                        self.execution.ack(key, turn_id)
                    else:
                        self.observer_error = '原生执行ACK缺少回合标识，执行结果待核实。'
                elif method == 'thread/goal/set':
                    self.goals[identity] = result['goal']
                    self.goal_checks.add(identity)
                    self.auxiliary.pop(key, None)
                elif method == 'thread/queue/delete':
                    if result.get('deleted'):
                        self.queue_delete_confirmed.add(identity)
                    self.queues.setdefault(identity, {'data': [], 'checking': True})['checking'] = True
                    self.dirty_threads.add(identity)
                elif method == 'thread/resume':
                    # ACK is not a native idle-hook barrier. Only the temporary
                    # restore hold ends here; real goal/queue state stays owned.
                    self.auxiliary.pop(key, None)
                elif method == 'thread/sample':
                    self.auxiliary.pop(key, None)  # synchronous native sample result
                else:
                    self.auxiliary[key]['acked'] = True
                    if method == 'thread/queue/add':
                        self.queues.setdefault(identity, {'data': [], 'checking': True})['checking'] = True
                        self.dirty_threads.add(identity)
                    self._settle_auxiliary()
            self.cleanup_signal.set()
        self.emit_execution()
        self._settle_detached(client)

    def _settle_auxiliary(self):
        for key, operation in list(self.auxiliary.items()):
            if operation['acked'] and operation['observed']:
                self.auxiliary.pop(key, None)

    def _terminals(self, identity):
        values, cursor, seen = [], None, set()
        while True:
            result = self.observer.call('thread/backgroundTerminals/list', {'threadId': identity, 'limit': 100, 'cursor': cursor})
            values.extend(result['data'])
            cursor = result.get('nextCursor')
            if not cursor:
                return values
            if cursor in seen:
                raise RuntimeError('原生后台终端分页游标未前进。')
            seen.add(cursor)

    def _confirm_closed_job(self, key, job, check):
        with self.lock:
            closure = self.closed_threads.get(job.thread_id)
            if not closure or (job.thread_id, job.turn_id) not in self.completed_turns:
                raise ValueError('后台线程已卸载，但缺少本轮原生完成与关闭尝试/closed事件证据')
            observed = set().union(*(items for (thread, _), items in self.commands.items() if thread == job.thread_id))
            job.proof_kind = 'closedThreadHistory'
        # Native expands all persisted pages with full items here. Never resume
        # a closed child or substitute a new runtime's empty process registry.
        native = self.observer.call('thread/read', {'threadId': job.thread_id, 'includeTurns': True})['thread']
        self._flush_observer()
        with self.lock:
            if self.closed_threads.get(job.thread_id) != closure or self.cleanup_jobs.get(key) is not job:
                return False
            if not self.execution.confirm_closed_cleanup(check, native_thread=native,
                                                          turn_id=job.turn_id, observed_command_ids=observed):
                return False
            self.closed_cleanup_proofs.append({'kind': 'closedThreadHistory', 'threadId': job.thread_id,
                                               'turnId': job.turn_id, 'closure': dict(closure),
                                               'observedCommandIds': sorted(observed), 'revision': check.revision})
            self.cleanup_jobs.pop(key, None)
            self.cleanup_tokens.pop(key, None)
            self.commands.pop(key, None)
            return True

    def _reconcile_thread(self, identity):
        if self._root(identity) is None:
            return {'type': 'idle'}
        probe = self.execution.begin_native_check(identity)
        native = self.observer.call('thread/read', {'threadId': identity, 'includeTurns': False})['thread']
        self.remember_thread(native, historical=True)
        status = native.get('status') or {'type': 'idle'}
        self._flush_observer()
        if status['type'] != 'active':
            with self.lock:
                # Native emits global idle before its per-thread Completed.
                # Keep an observed live turn until that terminal event atomically
                # installs its background check hold. Clearing it from this read
                # would briefly admit a second root, then late Completed would
                # incorrectly claim the old root again.
                known_live = any(turn['threadId'] == identity
                                 for turn in self.execution.snapshot()['activeTurns'])
                if not known_live:
                    self.execution.reconcile_native(probe, active_turn_ids=[], status=status)
        else:
            self.execution.thread_status(identity, status)
        return status

    def _check_background_once(self):
        if self.closed or not self.observer or self.observer_error:
            return
        with self.control:
            with self.lock:
                subscribe, self.subscribe_pending = self.subscribe_pending, set()
                dirty, self.dirty_threads = self.dirty_threads, set()
                jobs = list(self.cleanup_jobs.items())
                goal_checks, self.goal_checks = self.goal_checks, set()
            for identity in goal_checks:
                try:
                    version = self.goal_versions.get(identity, 0)
                    goal = self.observer.call('thread/goal/get', {'threadId': identity}).get('goal')
                    self._flush_observer()
                    with self.lock:
                        if self.goal_versions.get(identity, 0) == version:
                            if goal:
                                self.goals[identity] = goal
                            else:
                                self.goals.pop(identity, None)
                        else:
                            self.goal_checks.add(identity)
                except (RuntimeError, OSError, ValueError):
                    with self.lock:
                        self.goal_checks.add(identity)
            for identity in subscribe:
                if identity in self.closed_threads:
                    continue
                try:
                    self.ensure_observed(identity)
                except (RuntimeError, OSError, ValueError):
                    # Creation on the observer already supplies a subscription.
                    # Non-materialized native children may not yet resume; their
                    # native auto-subscription remains in force, and retry is read-only.
                    with self.lock:
                        if identity not in self.closed_threads:
                            self.subscribe_pending.add(identity)
            for identity in dirty:
                if self._root(identity) is None:
                    continue
                try:
                    self._reconcile_thread(identity)
                    if identity in self.queues:
                        with self.lock:
                            queue_version = self.queue_versions.get(identity, 0)
                        data = self._native_queue(identity)
                        self._flush_observer()
                        with self.lock:
                            changed = self.queue_versions.get(identity, 0) != queue_version
                            self._import_queue(identity, data, checking=changed)
                            if changed:
                                self.dirty_threads.add(identity)
                            for operation in self.auxiliary.values():
                                if operation['thread'] == identity and operation['method'] == 'thread/queue/add':
                                    operation['observed'] = True
                            self._settle_auxiliary()
                except (RuntimeError, OSError, ValueError):
                    with self.lock:
                        self.dirty_threads.add(identity)
            for key, job in jobs:
                try:
                    root = self._root(job.thread_id)
                    with self.lock:
                        members = [thread for thread in self.metadata if self._root(thread) == root]
                    for member in members:
                        self._reconcile_thread(member)
                    with self.lock:
                        live_hooks = any(self._root(hook['threadId']) == root for hook in self.hooks.values())
                        autonomous = any(self._root(thread) == root and goal.get('status') == 'active' for thread, goal in self.goals.items())
                        queued = any(self._root(thread) == root and (state.get('data') or state.get('checking')
                                     or state.get('dispatchPending')) for thread, state in self.queues.items())
                        active = any(self._root(thread) == root for thread in self.execution.snapshot()['activeThreadIds'])
                    if live_hooks or active or autonomous or queued:
                        continue
                    check = self.execution.begin_cleanup_check(job.token)
                    try:
                        values = self._terminals(job.thread_id)
                    except NativeRPCError as error:
                        if (error.error.get('code') == -32600
                                and error.error.get('message') == 'thread not found: '+job.thread_id):
                            self._confirm_closed_job(key, job, check)
                            continue
                        raise
                    with self.lock:
                        owned_items = set(self.commands.get(key, ()))
                    if job.terminate:
                        for terminal in values:
                            if terminal.get('itemId') in owned_items:
                                self.observer.call('thread/backgroundTerminals/terminate', {
                                    'threadId': job.thread_id, 'processId': terminal['processId']})
                            # terminated=false is not proof of cleanup; the fresh list is.
                        check = self.execution.begin_cleanup_check(job.token)
                    remaining = self._terminals(job.thread_id) if job.terminate else values
                    unowned = [terminal for terminal in remaining if terminal.get('itemId') not in owned_items]
                    with self.lock:
                        if self.cleanup_jobs.get(key) is not job:
                            continue
                        job.terminals, job.error = list(remaining), None
                        job.state = 'cleaningUp' if job.terminate else ('backgroundRunning' if remaining else 'checkingBackground')
                        if job.terminate and unowned:
                            job.error = ('仍有'+str(len(unowned))+'项未确认属于本轮的原生后台命令；'
                                         '未停止其他回合或未知命令，请显式核对或停止后再确认。')
                            job.state = 'cleanupFailed'
                            self.execution.cleanup_failed(job.token, job.error)
                    if self.execution.confirm_cleanup(check, background_terminals=remaining):
                        with self.lock:
                            if self.cleanup_jobs.get(key) is job:
                                self.cleanup_jobs.pop(key, None)
                                self.cleanup_tokens.pop(key, None)
                                self.commands.pop(key, None)
                except (OSError, ValueError, RuntimeError) as error:
                    with self.lock:
                        if self.cleanup_jobs.get(key) is job:
                            job.error, job.state = '本轮后台命令状态尚未确认：'+str(error), 'cleanupFailed'
                            self.execution.cleanup_failed(job.token, job.error)
            self.emit_execution()

    def _cleanup_loop(self):
        while not self.closed:
            self.cleanup_signal.wait(self.poll_interval)
            self.cleanup_signal.clear()
            if self.closed:
                return
            try:
                self._check_background_once()
            except Exception as error:
                self.observer_error = '原生后台状态核对失败：'+str(error)
                self.emit_execution()

    def broadcast(self, message):
        with self.lock:
            clients = list(self.clients)
        for client in clients:
            if not client.closed:
                client.post_status(message)  # never browser socket IO on an observer/worker

    def open_client(self, receive, closed, status):
        self.start()
        return_client = NativeClient(connect_unix(self.path), receive, closed,
                                     before_send=self.before_request, after_receive=self.after_response,
                                     status_receive=status, delivery_closed=self._browser_delivery_closed,
                                     native_closed=self._native_client_closed, idle=self._settle_detached)
        with self.lock:
            if not return_client.closed:
                self.clients.add(return_client)
        return_client.post_status({'bridge': 'execution', 'execution': self._execution_snapshot()})
        return return_client

    def remove_client(self, client):
        client.detach_delivery()
        with self.lock:
            self.clients.discard(client)
            self.draining_clients.add(client)
        self.execution.connection_closed(client.prefix)
        self._settle_detached(client)
        self.emit_execution()

    def _browser_delivery_closed(self, client, error):
        # A closed/broken browser writer is not native transport EOF. Preserve
        # the independent reader until its actual execution responses arrive.
        self.remove_client(client)

    def _native_client_closed(self, client):
        with self.request_lock:
            pending = any(key[0] == client.prefix for key in self.requests)
            if pending:
                self.ack_errors[client.prefix] = '原生连接在执行确认前断开；请求结果未知，保留执行占用，未自动重发。'
        with self.lock:
            self.clients.discard(client)
            self.draining_clients.discard(client)
        if pending:
            self.emit_execution()

    def _settle_detached(self, client):
        with self.lock:
            draining = client in self.draining_clients
        if not draining:
            return
        with self.request_lock:
            if any(key[0] == client.prefix for key in self.requests):
                return
        # NativeClient atomically checks private RPC waiters and in-flight
        # sends too, so a detach during before_request cannot cut off its ACK.
        # This can run on the reader itself; close() never joins its own thread.
        if client.close(only_if_idle=True):
            with self.lock:
                self.draining_clients.discard(client)
            self.emit_execution()

    def create_thread(self, method, params):
        with self.control:
            self._flush_observer()
            result = self.observer.call(method, params)
            with self.lock:
                identity = result['thread']['id']
                self.remember_thread(result['thread'], historical=method == 'thread/resume')
                if method == 'thread/start':
                    self.created_roots.add(identity)
                self.subscriptions.add(identity)
                self.subscribe_pending.discard(identity)
            return result

    def ensure_observed(self, thread_id):
        if not thread_id:
            raise ValueError('缺少原生会话标识。')
        with self.control:
            if thread_id not in self.subscriptions:
                if thread_id in self.closed_threads:
                    raise NativeRPCError({'code': -32003, 'message': '原生线程已关闭；不会为后台核对重新启动子代理。'})
                self._admit_root(thread_id)
                result = self.observer.call('thread/resume', {'threadId': thread_id, 'excludeTurns': True})
                with self.lock:
                    self.remember_thread(result['thread'], historical=True)
                    self.subscriptions.add(thread_id)
                    self.subscribe_pending.discard(thread_id)

    @staticmethod
    def _initial_name(params):
        for item in params.get('input') or []:
            if isinstance(item, dict) and item.get('type') == 'text' and isinstance(item.get('text'), str):
                text = ' '.join(item['text'].split())
                if text:
                    return text[:80]
        objective = params.get('objective')
        if isinstance(objective, str):
            return ' '.join(objective.split())[:80] or None
        return None

    def attach_client_thread(self, client, thread_id, *, initial_name=None):
        """Subscribe this native connection using native resume; return its reply.

        Root thread/start only subscribes its requesting connection. Its global
        thread/started notification is not a subscription for other clients.
        A locally created empty root can be saved by native thread/name/set using
        its first actual user question, once admitted. Other missing histories
        and existing user names are never repaired or overwritten here. This
        method never injects history or treats an unsuccessful resume as success.
        Calling it for every executing request also repairs subscriptions after
        the memory policy has deliberately unsubscribed and cold-resumed idle
        threads. The native event stream continues to route each connection.
        """
        if not thread_id:
            raise ValueError('缺少原生会话标识。')
        with self.control:
            self._admit_root(thread_id)
            params = {'threadId': thread_id, 'excludeTurns': True}
            try:
                return client.call('thread/resume', params)
            except NativeRPCError as error:
                if (error.error.get('code') != -32600
                        or error.error.get('message') != 'no rollout found for thread id '+thread_id
                        or thread_id not in self.created_roots or not initial_name):
                    raise
                native = self.observer.call('thread/read', {'threadId': thread_id, 'includeTurns': False})['thread']
                if native.get('name'):
                    raise
                self.observer.call('thread/name/set', {'threadId': thread_id, 'name': initial_name})
                return client.call('thread/resume', params)

    def status(self):
        return {'pid': self.process.pid if self.process and self.process.poll() is None else None,
                'lifetime': 'web-service', 'transport': 'native-unix-websocket', 'execution': self._execution_snapshot()}

    def close(self):
        with self.lock:
            if self.closed:
                return
            self.closed = True
            clients = list(self.clients | self.draining_clients)
            self.clients.clear()
            self.draining_clients.clear()
        self.cleanup_signal.set()
        for client in clients:
            client.close()
        if self.observer:
            self.observer.close()
        if self.process:
            self.stop_process(self.process)
            self.unregister(self.process)
        if self.workers_started:
            self.cleanup_thread.join(timeout=1)
            self.event_thread.join(timeout=1)
        self.directory.cleanup()
