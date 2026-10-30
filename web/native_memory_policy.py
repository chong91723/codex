"""Apply profile memory choices using native thread configuration and cold resume.

Loaded native threads ignore arbitrary resume overrides while subscribed. An
idle root is therefore unsubscribed through the native protocol before resume.
No history is rewritten, and the service-owned runtime is kept alive.
"""
from native_execution import ExecutionBusy
from native_runtime import NativeRPCError


def memory_config(paused):
    enabled = not paused
    return {'features.memories': enabled, 'memories.use_memories': enabled,
            'memories.dedicated_tools': enabled, 'memories.generate_memories': False,
            'memories.disable_on_external_context': True, 'memories.version': 'v2',
            'memories.extract_model': 'deepseek-flash', 'memories.consolidation_model': 'deepseek-flash'}


class NativeMemoryPolicy:
    def __init__(self, runtime, memory):
        self.runtime, self.memory = runtime, memory

    def signature(self):
        return self.memory.user_record().get('paused') is True

    def configured(self, params):
        # Normalize the small policy-owned subset so conflicting nested/flat
        # overrides cannot silently re-enable raw cross-thread extraction.
        value = dict(params or {})
        config = dict(value.get('config') or {})
        # Native config is a map of dot-path overrides. A nested table and
        # its dotted children overlap, and native HashMap ordering is not a
        # precedence contract. Flatten both policy tables completely.
        for name in ('features','memories'):
            nested = config.pop(name, None)
            if isinstance(nested,dict):
                for key, nested_value in nested.items():config.setdefault(name+'.'+key,nested_value)
            elif nested is not None:
                raise ValueError('原生记忆配置表必须为对象。')
        config.update(memory_config(self.signature()))
        value['config'] = config
        return value

    def created(self, result):
        identity = result['thread']['id']
        self.runtime.thread_memory[identity] = self.signature()

    def prepare(self, identity, params=None):
        runtime = self.runtime
        with runtime.control:
            paused = self.signature()
            if runtime.thread_memory.get(identity, object()) == paused:
                return
            runtime.start()
            # Native read is a snapshot, not a subscription and not an execution.
            current = runtime.observer.call('thread/read', {'threadId':identity, 'includeTurns':False})
            thread = current['thread']
            state = runtime.status()['execution']
            status = thread.get('status') or {}
            if status.get('type') == 'active' or state.get('status') != 'idle':
                raise ExecutionBusy(state)
            # Parent-owned native children must retain their parent's config.
            if thread.get('parentThreadId'):
                return
            with runtime.lock:
                clients = list(runtime.clients)
            for client in clients:
                if client.closed:continue
                try:
                    client.call('thread/unsubscribe', {'threadId':identity})
                except NativeRPCError as error:
                    # A newly connected browser which has not initialized cannot
                    # have subscribed. Other errors must remain diagnosable.
                    if 'not initialized' not in str(error).lower():raise
            runtime.observer.call('thread/unsubscribe', {'threadId':identity})
            runtime.subscriptions.discard(identity)
            request = self.configured({**(params or {}), 'threadId':identity, 'excludeTurns':True})
            result = runtime.observer.call('thread/resume', request)
            runtime.subscriptions.add(identity)
            # Raw temporary dialogue must not enter shared memory even for old
            # persisted sessions whose original memory_mode was enabled.
            runtime.observer.call('thread/memoryMode/set', {'threadId':identity, 'mode':'disabled'})
            cursor, observed = None, None
            while True:
                page = runtime.observer.call('experimentalFeature/list', {'threadId':identity,'limit':100,**({'cursor':cursor} if cursor else {})})
                feature = next((entry for entry in page.get('data',[]) if entry.get('name')=='memories'),None)
                if feature is not None:
                    observed = feature.get('enabled')
                    break
                cursor = page.get('nextCursor')
                if not cursor:break
            if observed is not (not paused):
                raise NativeRPCError({'code':-32003,'message':'原生会话的记忆设置尚未实际生效，请确认任务结束后重新打开会话；本次未启动分析。'})
            runtime.thread_memory[identity] = paused
            return result
