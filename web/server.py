#!/usr/bin/env python3
"""Dependency-free local UI transport for the unmodified Codex executable.

The bridge does not implement agent behavior: in-scope JSON-RPC stays native.
Each browser connection owns one app-server process, including approvals.
"""
from __future__ import annotations

import argparse
from contextlib import closing
import fcntl
import base64
import hashlib
import http.cookies
import json
import mimetypes
import os
import re
from pathlib import Path
import secrets
import shutil
import signal
import socket
import sqlite3
import stat
import struct
import subprocess
import tempfile
import threading
import time
import tomllib
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
MAX_MESSAGE = 32 * 1024 * 1024


class WebSocket:
    """RFC 6455 framing, including fragmented browser messages and ping/pong."""

    def __init__(self, handler):
        self.reader, self.sock = handler.rfile, handler.connection
        self.lock = threading.Lock()
        self.closed = False

    def exact(self, size):
        result = self.reader.read(size)
        if len(result) != size:
            raise EOFError()
        return result

    def send(self, value, opcode=1):
        payload = json.dumps(value, ensure_ascii=False).encode() if not isinstance(value, bytes) else value
        length = len(payload)
        header = bytes([0x80 | opcode])
        if length < 126:
            header += bytes([length])
        elif length < 65536:
            header += bytes([126]) + struct.pack('!H', length)
        else:
            header += bytes([127]) + struct.pack('!Q', length)
        with self.lock:
            if not self.closed:
                self.sock.sendall(header + payload)

    def receive(self):
        fragments, initial_opcode = bytearray(), None
        while True:
            first, second = self.exact(2)
            opcode, final = first & 15, bool(first & 128)
            length, masked = second & 127, bool(second & 128)
            if first & 0x70 or not masked:
                raise ValueError('Invalid browser WebSocket frame')
            if length == 126:
                length = struct.unpack('!H', self.exact(2))[0]
            elif length == 127:
                length = struct.unpack('!Q', self.exact(8))[0]
            if length > MAX_MESSAGE or len(fragments) + length > MAX_MESSAGE:
                raise ValueError('Message exceeds 32 MiB')
            if opcode >= 8 and (not final or length > 125):
                raise ValueError('Invalid control frame')
            mask = self.exact(4)
            payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(self.exact(length)))
            if opcode == 8:
                self.send(payload, opcode=8)
                raise EOFError()
            if opcode == 9:
                self.send(payload, opcode=10)
                continue
            if opcode == 10:
                continue
            if opcode in (1, 2):
                if initial_opcode is not None:
                    raise ValueError('Nested fragmented message')
                initial_opcode = opcode
            elif opcode != 0 or initial_opcode is None:
                raise ValueError('Invalid continuation')
            fragments.extend(payload)
            if final:
                if initial_opcode != 1:
                    raise ValueError('Expected a JSON text message')
                return json.loads(fragments.decode('utf-8'))

    def close(self):
        self.closed = True
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass


def stop_process(process):
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=3)
        except (OSError, subprocess.TimeoutExpired):
            try:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
            except (OSError, subprocess.TimeoutExpired):
                pass


def canonical_thread_id(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = str(uuid.UUID(value))
        return parsed if parsed == value.lower() else None
    except ValueError:
        return None


class KnownForks:
    """Discovery IDs only; native thread/read remains the source of truth.

    The pinned native list excludes empty previews, including ordinary forks.
    Read only this profile's fixed-version state metadata and rollout headers to
    find forks predating the Web index. Never repair or write native storage.
    """

    # upstream/codex-rs/{state/src/sqlite.rs,rollout/src/lib.rs}: pinned layout
    # and default interactive sources. Subagents and attached threads stay hidden.
    INTERACTIVE_SOURCES = ('cli', 'vscode', '{"custom":"atlas"}', '{"custom":"chatgpt"}')
    MAX_HEADER = 2 * 1024 * 1024

    def __init__(self, codex_home):
        self.home = Path(codex_home).resolve()
        self.path = self.home/'web-state'/'known-forks.json'
        self.lock = threading.Lock()
        self.discovery_lock = threading.Lock()
        self.header_cache = {}

    def discover(self):
        """Merge observed hints with preexisting forks without persisting metadata."""
        return sorted(set(self.read()).union(self.native_forks()))

    def native_forks(self):
        native = self.home/'state_5.sqlite'
        try:
            resolved = native.resolve(strict=True)
        except FileNotFoundError:
            return []
        if not resolved.is_relative_to(self.home):
            raise ValueError('原生会话索引路径超出当前 CODEX_HOME，未读取。')
        original = resolved.stat()
        if not stat.S_ISREG(original.st_mode):
            raise ValueError('原生会话索引不是普通文件，未读取。')
        with self.discovery_lock:
            deadline = time.monotonic() + 10
            try:
                # Do not use immutable=1: native metadata can still be in WAL.
                with closing(sqlite3.connect(resolved.as_uri()+'?mode=ro', uri=True, timeout=0.5)) as database:
                    database.execute('PRAGMA query_only=ON')
                    database.execute('PRAGMA trusted_schema=OFF')
                    database.set_progress_handler(lambda: time.monotonic() > deadline, 1000)
                    rows = database.execute("""
                        SELECT id, rollout_path FROM threads
                        WHERE preview = '' AND archived = 0
                          AND attached_thread_parent_id IS NULL
                          AND source IN (?, ?, ?, ?)
                        ORDER BY updated_at DESC, id
                    """, self.INTERACTIVE_SOURCES)
                    found, cache = set(), {}
                    for thread_id, rollout_path in rows:
                        if time.monotonic() > deadline:
                            raise ValueError('旧分叉会话发现超过 10 秒；未截断结果，请检查本机会话存储。')
                        thread_id = canonical_thread_id(thread_id)
                        if not thread_id:
                            raise ValueError('原生会话索引包含无效会话 ID，无法完成旧分叉发现。')
                        try:
                            if self.is_native_fork(thread_id, rollout_path, cache):
                                found.add(thread_id)
                        except FileNotFoundError:
                            # A native archive/delete may race any header stat/open.
                            # Omit the stale candidate; never invent an unread row.
                            continue
                    # Detect a replaced database/symlink before returning any IDs.
                    current = native.resolve(strict=True)
                    current_stat = current.stat()
                    if (current != resolved or (current_stat.st_dev, current_stat.st_ino)
                            != (original.st_dev, original.st_ino)):
                        raise ValueError('原生会话索引在读取期间变化，请刷新重试。')
                    self.header_cache = cache
                    return found
            except sqlite3.Error as error:
                if 'locked' in str(error).lower() or 'busy' in str(error).lower():
                    raise ValueError('原生会话索引正忙，旧分叉发现失败；请稍后刷新重试。') from error
                if 'interrupt' in str(error).lower():
                    raise ValueError('旧分叉会话查询超时，未截断结果；请检查本机会话存储。') from error
                raise ValueError('原生会话索引不可读、损坏或与锁定版本不兼容；旧分叉发现失败。') from error

    def is_native_fork(self, thread_id, rollout_path, cache):
        if not isinstance(rollout_path, str) or not Path(rollout_path).is_absolute():
            raise ValueError('原生会话 '+thread_id+' 的元数据路径无效，未读取。')
        requested = Path(rollout_path)
        try:
            path = requested.resolve(strict=True)
        except FileNotFoundError:
            try:
                # Native compression keeps the canonical .jsonl path in SQLite.
                path = Path(str(requested)+'.zst').resolve(strict=True)
            except FileNotFoundError:
                # Native archive/delete can move/remove after the DB snapshot.
                return False
        relative = path.relative_to(self.home) if path.is_relative_to(self.home) else None
        compressed = path.name.endswith('.jsonl.zst')
        if (relative is None or len(relative.parts) < 2
                or relative.parts[0] not in ('sessions', 'archived_sessions')
                or (path.suffix != '.jsonl' and not compressed)):
            raise ValueError('原生会话 '+thread_id+' 的元数据路径超出当前会话目录，未读取。')
        expected = path.stat()
        if not stat.S_ISREG(expected.st_mode):
            raise ValueError('原生会话 '+thread_id+' 的元数据不是普通文件，未读取。')
        if compressed:
            # Leave decompression and fork identity to native thread/read. The
            # frontend must validate forkedFromId/ephemeral for every candidate.
            # This is a candidate ID, never a fabricated thread or success.
            return True
        signature = (path, expected.st_dev, expected.st_ino, expected.st_mtime_ns, expected.st_size)
        previous = self.header_cache.get(thread_id)
        if previous and previous[0] == signature:
            cache[thread_id] = previous
            return previous[1]
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, 'rb') as source:
            opened = os.fstat(source.fileno())
            if ((opened.st_dev, opened.st_ino) != (expected.st_dev, expected.st_ino)
                    or not stat.S_ISREG(opened.st_mode)):
                raise ValueError('原生会话 '+thread_id+' 的元数据在读取期间变化，请刷新重试。')
            # Only SessionMeta is inspected: no history, messages or credentials
            # are exposed or copied into the Web index or the HTTP response.
            line = source.readline(self.MAX_HEADER + 1)
        if len(line) > self.MAX_HEADER:
            raise ValueError('原生会话 '+thread_id+' 的元数据首行超过 2 MiB，未截断解析。')
        try:
            value = json.loads(line)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError('原生会话 '+thread_id+' 的元数据首行无效，无法发现旧分叉。') from error
        metadata = value.get('payload') if isinstance(value, dict) else None
        if (not isinstance(metadata, dict) or value.get('type') != 'session_meta'
                or canonical_thread_id(metadata.get('id')) != thread_id):
            raise ValueError('原生会话 '+thread_id+' 的元数据标识不匹配，未读取。')
        result = bool(canonical_thread_id(metadata.get('forked_from_id')) and not metadata.get('attached_thread'))
        cache[thread_id] = (signature, result)
        return result

    def read(self):
        try:
            if self.path.stat().st_size > 2 * 1024 * 1024:
                raise ValueError('分叉发现索引超过 2 MiB，请检查本机索引文件。')
            value = json.loads(self.path.read_text())
        except FileNotFoundError:
            return []
        if (not isinstance(value, dict) or value.get('version') != 1
                or not isinstance(value.get('threadIds'), list)
                or any(not canonical_thread_id(item) for item in value['threadIds'])):
            raise ValueError('分叉发现索引格式无效，请检查本机索引文件。')
        return sorted(set(canonical_thread_id(item) for item in value['threadIds']))

    def update(self, thread_id, present):
        thread_id = canonical_thread_id(thread_id)
        if not thread_id:
            return
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            # Serialize read/modify/write across Web processes sharing one profile.
            with (self.path.parent/'known-forks.lock').open('a+') as lock_file:
                os.chmod(lock_file.name, 0o600)
                fcntl.flock(lock_file, fcntl.LOCK_EX)
                ids = set(self.read())
                before = ids.copy()
                ids.add(thread_id) if present else ids.discard(thread_id)
                if ids == before:
                    return
                temporary = None
                try:
                    with tempfile.NamedTemporaryFile('w', dir=self.path.parent, prefix='.known-forks-', delete=False) as target:
                        temporary = target.name
                        os.chmod(temporary, 0o600)
                        json.dump({'version': 1, 'threadIds': sorted(ids)}, target)
                        target.flush()
                        os.fsync(target.fileno())
                    os.replace(temporary, self.path)
                finally:
                    if temporary and os.path.exists(temporary):
                        os.unlink(temporary)


class KnownForksObserver:
    METHODS = {'thread/start', 'thread/read', 'thread/resume', 'thread/fork', 'thread/delete'}

    def __init__(self, store):
        self.store = store
        self.requests = {}
        self.lock = threading.Lock()

    def track(self, message):
        identifier, method = message.get('id'), message.get('method')
        if isinstance(identifier, (str, int)) and method in self.METHODS:
            params = message.get('params')
            with self.lock:
                self.requests[identifier] = (method, params.get('threadId') if isinstance(params, dict) else None)

    def observe(self, message):
        if message.get('method') == 'thread/deleted':
            params = message.get('params') or {}
            self.store.update(params.get('threadId'), False)
            return
        if 'id' not in message or message.get('method'):
            return
        with self.lock:
            request = self.requests.pop(message['id'], None)
        if not request or 'result' not in message or 'error' in message:
            return
        method, requested_id = request
        if method == 'thread/delete':
            self.store.update(requested_id, False)
            return
        result = message['result']
        thread = result.get('thread') if isinstance(result, dict) else None
        if isinstance(thread, dict):
            if (thread.get('preview') == '' and not thread.get('ephemeral')
                    and canonical_thread_id(thread.get('forkedFromId'))):
                self.store.update(thread.get('id'), True)
            elif thread.get('preview') and self.store.path.exists():
                # Once native metadata has a preview its normal listing is authoritative.
                self.store.update(thread.get('id'), False)


# Supported native configuration, applied only to this Web-launched process.
# Never mutate the binary, the user's login files, or existing profile contents.
WEB_NATIVE_OVERRIDES = (
    'features.image_generation=false',
    'features.fast_mode=false',
    'features.ultrafast_mode=false',
    'feedback.enabled=false',
    # These are auxiliary memory models, not overrides of the conversation model.
    'memories.extract_model="deepseek-flash"',
    'memories.consolidation_model="deepseek-flash"',
)
RETAINED_BUNDLED_SKILLS = frozenset(('openai-docs', 'review-agent', 'skill-creator', 'skill-installer'))
OPENAI_MODEL = re.compile(r'^(?:openai/|gpt-|chatgpt-|codex-|o[134](?:-|$))', re.I)
MODEL_METHODS = {
    'thread/start', 'thread/resume', 'thread/fork', 'thread/settings/update',
    'turn/start', 'turn/settings/update', 'thread/realtime/start',
}


def excluded_model(model):
    return isinstance(model, str) and bool(OPENAI_MODEL.match(model))


def retained_skill(name=None, path=None):
    if not isinstance(path, str) or not Path(path).is_absolute():
        return False
    root = (Path(os.environ.get('CODEX_HOME', Path.home()/'.codex'))/'skills'/'.system').resolve()
    document = Path(path)
    skill_name = document.parent.name
    try:
        return (skill_name in RETAINED_BUNDLED_SKILLS and (name is None or name == skill_name)
                and document.resolve() == root/skill_name/'SKILL.md')
    except (OSError, RuntimeError, ValueError):
        return False


def config_scope_reason(value, path=()):
    """Inspect native config keys, preserving MCP/plugin payloads and openai-docs."""
    if value is None:
        return None  # Deleting excluded configuration is allowed.
    key = path[-1] if path else ''
    if 'mcp_servers' in path or 'plugins' in path:
        return None
    if (key == 'model' or key.endswith('_model')) and excluded_model(value):
        return 'OpenAI/ChatGPT 模型已移除；请显式选择已配置的第三方模型。'
    if key == 'model_provider' and value in ('openai', 'chatgpt'):
        return 'OpenAI/ChatGPT provider 已移除；请使用 --deepseek 或显式配置第三方 provider。'
    if key == 'service_tier' and value not in ('default', ''):
        return '快速模式已移除，不能设置优先服务档位。'
    if key in ('chatgpt_base_url', 'forced_chatgpt_workspace_id') or key == 'forced_login_method' and value == 'chatgpt':
        return 'ChatGPT 账号与云端工作区配置已移除。'
    if path[-2:] in [('features', 'image_generation'), ('features', 'fast_mode'), ('features', 'ultrafast_mode'), ('feedback', 'enabled')] and value is not False:
        return '反馈、快速模式和生图已从当前产品移除，不能重新启用。'
    if len(path) >= 2 and path[-2] == 'model_providers' and path[-1] in ('openai', 'chatgpt'):
        return 'OpenAI/ChatGPT provider 配置已移除。'
    if 'model_providers' in path:
        if key == 'requires_openai_auth' and value is True:
            return '需要 OpenAI/ChatGPT 登录的 provider 已移除。'
        if key == 'base_url' and isinstance(value, str):
            host = (urlparse(value).hostname or '').lower()
            if host in ('openai.com', 'chatgpt.com') or host.endswith(('.openai.com', '.chatgpt.com')):
                return 'OpenAI/ChatGPT 模型服务不在当前范围。'
    if key == 'config' and 'skills' in path and isinstance(value, list):
        if any(isinstance(rule, dict) and rule.get('enabled') is not False and not retained_skill(rule.get('name'), rule.get('path')) for rule in value):
            return '只保留 Codex 源码自带的 openai-docs、review-agent、skill-creator、skill-installer；其他技能不能启用。'
    if isinstance(value, dict):
        for child, item in value.items():
            # Native thread config permits dotted keys as well as nested tables.
            reason = config_scope_reason(item, path + config_key_parts(child))
            if reason:
                return reason
    return None


def config_key_parts(key):
    """Parse native TOML dotted/quoted key paths, including quoted provider IDs."""
    if not isinstance(key, str):
        return ()
    try:
        table = tomllib.loads(key + ' = 0')
        parts = []
        while isinstance(table, dict) and len(table) == 1:
            part, table = next(iter(table.items()))
            parts.append(part)
        return tuple(parts)
    except tomllib.TOMLDecodeError:
        return (key,)  # Native validation still reports invalid unrelated keys.


class ScopePolicy:
    """A product-scope boundary, not a replacement for an OS/network sandbox."""

    def __init__(self):
        self.thread_models = {}
        self.lock = threading.Lock()

    def observe(self, message):
        # Only native replies/notifications supply identity, including listings used
        # by normal navigation before a thread is loaded in this connection.
        payload = message.get('result', message.get('params', {}))
        if not isinstance(payload, dict):
            return
        threads = [payload['thread']] if isinstance(payload.get('thread'), dict) else []
        for item in payload.get('data', []) if isinstance(payload.get('data'), list) else []:
            if isinstance(item, dict):
                candidate = item.get('thread', item)
                if isinstance(candidate, dict) and 'modelProvider' in candidate:
                    threads.append(candidate)
        with self.lock:
            for thread in threads:
                if isinstance(thread.get('id'), str):
                    self.thread_models[thread['id']] = (
                        payload.get('modelProvider', thread.get('modelProvider')),
                        payload.get('model', thread.get('model')),
                    )

    def reason(self, message):
        method = message.get('method')
        if not isinstance(method, str):
            return None  # Approval/user-input responses must reach their native owner.
        if method.startswith('account/'):
            return 'ChatGPT/OpenAI 账号、登录与订阅功能已移除；第三方密钥请通过 provider 的 env_key 配置。'
        if method.startswith('app/'):
            return 'ChatGPT 云端 Apps 已移除；本地插件和自定义 MCP 仍可使用。'
        if method.startswith('feedback/'):
            return '反馈功能已从当前产品移除。'
        if method.startswith('userVerification/'):
            return '原生用户验证绑定 ChatGPT 账号身份，当前第三方模型范围不提供此入口。'
        if method.startswith('plugin/share/'):
            return '云端插件分享需要 ChatGPT 工作区授权；本地插件读取和安装仍可使用。'
        if method == 'thread/realtime/start':
            return '当前范围未配置可用的第三方 Realtime 服务；原生默认 GPT Realtime 已移除，不能启动。'
        if method.startswith('remoteControl/') and method not in ('remoteControl/disable', 'remoteControl/status/read'):
            return '依赖 ChatGPT 后端的远程控制功能已移除。'
        params = message.get('params') or {}
        if not isinstance(params, dict):
            return None  # Keep native parameter errors for unrelated requests.
        if method in MODEL_METHODS:
            if excluded_model(params.get('model')) or params.get('modelProvider') in ('openai', 'chatgpt'):
                return 'OpenAI/ChatGPT 模型已移除；请使用 --deepseek 启动或显式创建第三方模型会话。'
            if any(params.get(key) not in (None, '', 'default') for key in ('serviceTier', 'serviceTierForTurn')):
                return '快速模式已移除，不能设置优先服务档位。'
            mode = params.get('collaborationMode') or {}
            if isinstance(mode, dict) and isinstance(mode.get('settings'), dict) and excluded_model(mode['settings'].get('model')):
                return '协作模式不能指定已移除的 OpenAI/ChatGPT 模型。'
            reason = config_scope_reason(params.get('config'))
            if reason:
                return reason
        if method == 'thread/resume':
            with self.lock:
                thread_id = params.get('threadId')
                known = isinstance(thread_id, str) and thread_id in self.thread_models
            if not known:
                return '恢复前请先通过 thread/read（includeTurns:false）读取会话身份；不会自动执行身份未知的历史队列。'
        starts_goal = method == 'thread/goal/set' and (params.get('status') == 'active' or params.get('objective') is not None)
        if starts_goal or method in ('turn/start', 'turn/settings/update', 'thread/compact/start', 'review/start', 'thread/queue/start', 'thread/queue/add', 'thread/resume', 'thread/sample', 'thread/prediction/request'):
            with self.lock:
                thread_id = params.get('threadId')
                provider, model = self.thread_models.get(thread_id, (None, None)) if isinstance(thread_id, str) else (None, None)
            if provider in ('openai', 'chatgpt') or excluded_model(model):
                return '该历史会话使用已移除的 OpenAI/ChatGPT 模型；请保留历史并显式创建第三方模型会话。'
        if method in ('turn/start', 'turn/steer', 'thread/queue/add', 'thread/queue/update'):
            inputs = params.get('input')
            for item in inputs if isinstance(inputs, list) else []:
                if isinstance(item, dict) and item.get('type') == 'skill' and not retained_skill(item.get('name'), item.get('path')):
                    return '只能调用当前实例中保留的四个 Codex 原生技能；生图和自定义技能已移除。'
        if method == 'skills/config/write' and params.get('enabled') is not False and not retained_skill(params.get('name'), params.get('path')):
            return '只能启用当前实例中保留的四个 Codex 原生技能。'
        edits = [params] if method == 'config/value/write' else params.get('edits', []) if method == 'config/batchWrite' else []
        for edit in edits if isinstance(edits, list) else []:
            if not isinstance(edit, dict):
                continue
            reason = config_scope_reason(edit.get('value'), config_key_parts(edit.get('keyPath')))
            if reason:
                return reason
        return None

    def reject(self, ws, message):
        reason = self.reason(message)
        if not reason:
            return False
        if 'id' in message:
            ws.send({'id': message['id'], 'error': {'code': -32001, 'message': reason,
                     'data': {'type': 'scopeExcluded', 'method': message.get('method')}}})
        else:
            ws.send({'bridge': 'scopeError', 'method': message.get('method'), 'text': reason})
        return True


def rpc_bridge(ws, settings):
    process = subprocess.Popen(
        [settings.codex, *[arg for setting in WEB_NATIVE_OVERRIDES for arg in ('-c', setting)],
         'app-server', '--listen', 'stdio://'],
        cwd=settings.workspace, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, start_new_session=True,
    )
    settings.register(process)
    policy = ScopePolicy()
    forks = KnownForksObserver(settings.known_forks)

    def forward_output():
        try:
            for line in process.stdout:
                if line.strip():
                    # Preserve native payloads; observe identity to guard inherited sessions.
                    message = json.loads(line)
                    policy.observe(message)
                    warning = None
                    try:
                        forks.observe(message)
                    except (OSError, ValueError) as error:
                        warning = '分叉发现索引保存失败：' + str(error)
                    ws.send(message)
                    if warning:
                        ws.send({'bridge': 'warning', 'message': warning})
            ws.send({'bridge': 'exit', 'code': process.wait()})
        except (OSError, ValueError):
            pass
        finally:
            ws.close()

    def forward_stderr():
        try:
            for line in process.stderr:
                ws.send({'bridge': 'stderr', 'text': line.decode(errors='replace')})
        except OSError:
            pass

    threading.Thread(target=forward_output, daemon=True).start()
    threading.Thread(target=forward_stderr, daemon=True).start()
    try:
        while True:
            message = ws.receive()
            if not isinstance(message, dict):
                raise ValueError('JSON-RPC message must be an object')
            if policy.reject(ws, message):
                continue
            forks.track(message)
            process.stdin.write(json.dumps(message, ensure_ascii=False).encode() + b'\n')
            process.stdin.flush()
    finally:
        stop_process(process)
        settings.unregister(process)


def terminal_bridge(ws, settings, query):
    # A real PTY runs the original CLI; no reimplementation of its commands/TUI.
    import fcntl
    import pty
    import termios

    cwd = Path(query.get('cwd', [str(settings.workspace)])[0]).expanduser().resolve()
    if not cwd.is_dir():
        raise ValueError('Working directory does not exist')
    args = json.loads(query.get('args', ['[]'])[0])
    if not isinstance(args, list) or not all(isinstance(arg, str) for arg in args):
        raise ValueError('CLI arguments must be a JSON array of strings')
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 32, 120, 0, 0))

    def terminal_session():
        os.setsid()
        fcntl.ioctl(0, termios.TIOCSCTTY, 0)

    process = subprocess.Popen(
        [settings.codex, *args], cwd=cwd, stdin=slave, stdout=slave, stderr=slave,
        env={**os.environ, 'TERM': 'xterm-256color', 'COLORTERM': 'truecolor'},
        preexec_fn=terminal_session,
    )
    os.close(slave)
    settings.register(process)

    def read_output():
        try:
            while data := os.read(master, 32768):
                ws.send({'data': base64.b64encode(data).decode()})
        except OSError:
            pass
        finally:
            try:
                ws.send({'exit': process.wait()})
            except OSError:
                pass
            ws.close()

    threading.Thread(target=read_output, daemon=True).start()
    try:
        while True:
            message = ws.receive()
            if 'data' in message:
                os.write(master, base64.b64decode(message['data'], validate=True))
            if 'cols' in message and 'rows' in message:
                cols = max(1, min(1000, int(message['cols'])))
                rows = max(1, min(1000, int(message['rows'])))
                fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
    finally:
        stop_process(process)
        settings.unregister(process)
        os.close(master)


class Settings:
    def __init__(self, args):
        self.codex = shutil.which(args.codex) or args.codex
        if not Path(self.codex).is_file():
            raise ValueError('Build the latest source first: python3 web/scripts/build_native.py')
        native = ROOT.parent / 'native' / 'bin' / 'codex'
        self.provenance = None
        if Path(self.codex).resolve() == native.resolve():
            from scripts.verify_upstream import verify
            verify(native)
            self.provenance = json.loads((ROOT.parent / 'native' / 'provenance.json').read_text())
        self.public_dir = Path(os.environ.get('CODEX_WEB_PUBLIC_DIR',ROOT / 'public')).resolve()
        self.workspace = Path(args.workspace).expanduser().resolve()
        self.workspace.mkdir(parents=True, exist_ok=True)
        self.bind, self.port = args.bind, args.port
        self.remote = args.bind not in ('127.0.0.1', 'localhost', '::1')
        self.token = os.environ.get('CODEX_WEB_TOKEN') or secrets.token_urlsafe(32)
        if self.remote and not os.environ.get('CODEX_WEB_TOKEN'):
            raise ValueError('Remote binding requires CODEX_WEB_TOKEN')
        self.children, self.lock = set(), threading.Lock()
        self.known_forks = KnownForks(os.environ.get('CODEX_HOME', Path.home()/'.codex'))
        self.schema_dir = tempfile.TemporaryDirectory(prefix='codex-web-schema-')
        self.version = subprocess.check_output([self.codex, '--version'], text=True).strip()
        subprocess.run([self.codex, 'app-server', 'generate-json-schema', '--experimental', '--out', self.schema_dir.name], check=True)

    def register(self, process):
        with self.lock:
            self.children.add(process)

    def unregister(self, process):
        with self.lock:
            self.children.discard(process)

    def close(self):
        with self.lock:
            processes = list(self.children)
        for process in processes:
            stop_process(process)
        self.schema_dir.cleanup()

    def status(self):
        manifest = ROOT.parent / 'upstream-lock.json'
        baseline = json.loads(manifest.read_text()) if manifest.exists() else None
        return {'version': self.version, 'runtimePath': self.codex, 'workspace': str(self.workspace), 'baseline': baseline, 'build': self.provenance,
                'transport': 'stdio', 'pid': os.getpid(), 'modelWindows': self.model_windows(), 'knownForksSupported': True}

    def model_windows(self):
        # Expose only public model metadata; never return config credentials.
        try:
            home = Path(os.environ.get('CODEX_HOME', Path.home()/'.codex'))
            config = tomllib.loads((home/'config.toml').read_text())
            catalog = Path(config.get('model_catalog_json', ROOT.parent/'upstream/codex-rs/models-manager/models.json'))
            return {m['slug']: {'contextWindow': config.get('model_context_window') or m.get('context_window'),
                    'effectivePercent': m.get('effective_context_window_percent', 95),
                    'autoCompactLimit': m.get('auto_compact_token_limit')}
                    for m in json.loads(catalog.read_text()).get('models', []) if not excluded_model(m.get('slug'))}
        except (OSError, ValueError, KeyError):
            return {}


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        # No request URLs: login query parameters must not be written to access logs.
        pass

    def send_bytes(self, status, payload, mime='application/json; charset=utf-8', cookie=None):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        if cookie:
            self.send_header('Set-Cookie', f'codex_web={cookie}; HttpOnly; SameSite=Strict; Path=/')
        self.end_headers()
        self.wfile.write(payload)

    def reject(self, code, message):
        self.send_bytes(code, json.dumps({'error': message}).encode())

    def auth_reject(self,code,message):
        self.reject(code,message)
        return None

    def authorize(self,bootstrap=False):
        settings = self.server.settings
        parsed = urlparse(self.path)
        host = self.headers.get('Host', '')
        hostname = urlparse('http://' + host).hostname
        if not settings.remote and hostname not in ('localhost', '127.0.0.1', '::1'):
            return self.auth_reject(403, 'Invalid Host')
        origin = self.headers.get('Origin')
        if origin and urlparse(origin).netloc != host:
            return self.auth_reject(403, 'Cross-origin request rejected')
        cookies = http.cookies.SimpleCookie()
        try:
            cookies.load(self.headers.get('Cookie', ''))
        except http.cookies.CookieError:
            return self.auth_reject(403, 'Invalid session')
        token = cookies.get('codex_web')
        authorized = bool(token and secrets.compare_digest(token.value, settings.token))
        query = parse_qs(parsed.query)
        supplied = query.get('token', [''])[0]
        if not authorized and bootstrap and parsed.path == '/':
            if settings.remote and not secrets.compare_digest(supplied, settings.token):
                return self.auth_reject(401, 'Open /?token=YOUR_CODEX_WEB_TOKEN once to sign in')
            authorized = True
            cookie = settings.token
        else:
            cookie = None
        if not authorized:
            return self.auth_reject(401, 'Open the home page to establish a local session')
        return parsed,query,cookie

    def do_POST(self):
        authorized=self.authorize()
        if authorized is None:return
        parsed,query,cookie=authorized
        if not parsed.path.startswith('/api/databases/'):
            return self.reject(404,'Not found')
        action=parsed.path.removeprefix('/api/databases/')
        if action not in ('save','test','toggle','remove','schema','query','chart','result','analyze','read_chart','results','clear_result'):
            return self.reject(404,'Unknown database operation')
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':
            return self.reject(415,'JSON required')
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=128*1024:return self.reject(413,'Invalid request size')
            payload=json.loads(self.rfile.read(size))
            if not isinstance(payload,dict):raise ValueError('JSON object required')
            from database_bridge import manage_database
            value=manage_database(action,payload)
            return self.send_bytes(200,json.dumps(value,ensure_ascii=False).encode())
        except (ValueError,KeyError) as error:self.reject(400,str(error))
        except subprocess.TimeoutExpired:self.reject(504,'数据库请求超时，请缩小查询范围。')
        except (BrokenPipeError,ConnectionResetError):pass
        except Exception:self.reject(500,'数据库请求失败，请检查本机服务。')

    def do_GET(self):
        authorized=self.authorize(bootstrap=True)
        if authorized is None:return
        parsed,query,cookie=authorized
        settings=self.server.settings
        try:
            if parsed.path.startswith('/api/databases/results/'):
                import re
                match=re.fullmatch(r'/api/databases/results/([0-9a-f]{32})\.(csv|parquet|json)',parsed.path)
                if not match:return self.reject(404,'Result not found')
                from database_bridge import manage_database
                value=manage_database('export',{'resultId':match[1],'format':match[2]})
                path=Path(value['path'])
                self.send_response(200);self.send_header('Content-Type',value['mime']);self.send_header('Content-Length',str(path.stat().st_size));self.send_header('Content-Disposition','attachment; filename="'+value['filename']+'"');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers()
                with path.open('rb') as source:
                    while chunk:=source.read(65536):self.wfile.write(chunk)
                return
            if parsed.path == '/api/databases':
                from database_bridge import database_status,manage_database
                status=database_status()
                value=manage_database('list',{}) if status['ready'] else {'connections':[]}
                return self.send_bytes(200,json.dumps({**status,**value},ensure_ascii=False).encode())
            if parsed.path == '/api/init-prompt':
                path = ROOT.parent/'upstream/codex-rs/tui/assets/prompt_for_init_command.md'
                return self.send_bytes(200, json.dumps({'prompt': path.read_text()}).encode())
            if parsed.path == '/api/known-forks':
                return self.send_bytes(200, json.dumps({'threadIds': settings.known_forks.discover()}).encode())
            if parsed.path == '/api/status':
                return self.send_bytes(200, json.dumps(settings.status()).encode())
            if parsed.path.startswith('/api/schema/'):
                name = parsed.path.removeprefix('/api/schema/')
                if not name.endswith('.json') or '/' in name or '\\' in name:
                    return self.reject(404, 'Schema not found')
                path = Path(settings.schema_dir.name) / name
                if not path.is_file():
                    return self.reject(404, 'Schema not found')
                return self.send_bytes(200, path.read_bytes())
            if parsed.path in ('/ws/rpc', '/ws/terminal'):
                if self.headers.get('Upgrade', '').lower() != 'websocket':
                    return self.reject(426, 'WebSocket required')
                key = self.headers.get('Sec-WebSocket-Key', '')
                try:
                    valid_key = len(base64.b64decode(key, validate=True)) == 16
                except ValueError:
                    valid_key = False
                if not valid_key or self.headers.get('Sec-WebSocket-Version') != '13':
                    return self.reject(400, 'Invalid WebSocket handshake')
                accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
                self.send_response(101)
                self.send_header('Upgrade', 'websocket')
                self.send_header('Connection', 'Upgrade')
                self.send_header('Sec-WebSocket-Accept', accept)
                self.end_headers()
                self.close_connection = True
                ws = WebSocket(self)
                try:
                    (rpc_bridge(ws, settings) if parsed.path == '/ws/rpc'
                     else terminal_bridge(ws, settings, query))
                except (EOFError, BrokenPipeError, ConnectionResetError):
                    pass
                except Exception as error:
                    try:
                        ws.send({'bridge': 'error', 'message': str(error)})
                    except OSError:
                        pass
                finally:
                    ws.close()
                return
            relative = 'index.html' if parsed.path == '/' else parsed.path.lstrip('/')
            path = (getattr(settings,'public_dir',ROOT / 'public') / relative).resolve()
            if not path.is_relative_to(getattr(settings,'public_dir',ROOT / 'public')) or not path.is_file():
                return self.reject(404, 'Not found')
            mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
            return self.send_bytes(200, path.read_bytes(), mime, cookie)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:
            self.reject(500, str(error))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--codex', default=os.environ.get('CODEX_BIN', str(ROOT.parent / 'native' / 'bin' / 'codex')))
    parser.add_argument('--workspace', default=str(ROOT.parent / 'workspaces' / 'default'))
    args = parser.parse_args()
    settings = Settings(args)
    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    server.daemon_threads = True
    server.settings = settings
    print(f'Codex Web: http://{args.bind}:{server.server_port}', flush=True)
    print(f'Native runtime: {settings.version} | workspace: {settings.workspace}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        settings.close()


if __name__ == '__main__':
    main()
