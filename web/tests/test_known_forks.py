"""Regression tests for Web-owned hints supplementing native empty-fork listings."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
import sqlite3
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Handler, KnownForks, KnownForksObserver, ThreadingHTTPServer


class KnownForkTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='codex-known-forks-')
        self.home = Path(self.directory.name)/'home'
        self.store = KnownForks(self.home)
        self.parent = str(uuid.uuid4())
        self.child = str(uuid.uuid4())

    def tearDown(self):
        self.directory.cleanup()

    def thread(self, **updates):
        return {'id': self.child, 'preview': '', 'forkedFromId': self.parent, 'ephemeral': False, **updates}

    def test_only_current_profile_web_state_is_written_and_reopen_persists(self):
        self.home.mkdir()
        original = self.home/'state_5.sqlite'
        original.write_bytes(b'native state must not be touched')
        digest = hashlib.sha256(original.read_bytes()).hexdigest()
        self.assertEqual(self.store.read(), [])
        self.store.update(self.child, True)
        self.assertEqual(KnownForks(self.home).read(), [self.child])
        self.assertEqual(KnownForks(self.home.parent/'other').read(), [])
        self.assertEqual(hashlib.sha256(original.read_bytes()).hexdigest(), digest)
        self.assertEqual(self.store.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(list(self.home.glob('sessions/**/*')), [])

    def test_deduplicated_atomic_index_rejects_bad_ids_and_corruption(self):
        self.store.update('not-a-uuid', True)
        self.assertFalse(self.store.path.exists())
        self.store.update(self.child, True)
        self.store.update(self.child, True)
        self.assertEqual(self.store.read(), [self.child])
        self.store.path.write_text(json.dumps({'version': 1, 'threadIds': ['../../elsewhere']}))
        with self.assertRaises(ValueError):
            self.store.read()
        self.store.path.write_text('broken json')
        with self.assertRaises(ValueError):
            self.store.read()

    def test_failed_atomic_replace_preserves_prior_index_and_cleans_temporary_file(self):
        self.store.update(self.child, True)
        before = self.store.path.read_bytes()
        with patch('server.os.replace', side_effect=OSError('simulated unavailable disk')):
            with self.assertRaises(OSError):
                self.store.update(self.parent, True)
        self.assertEqual(self.store.path.read_bytes(), before)
        self.assertEqual(list(self.store.path.parent.glob('.known-forks-*')), [])

    def test_multiple_connections_cannot_overwrite_each_others_discovery(self):
        children = [str(uuid.uuid4()) for _ in range(16)]
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda child: KnownForks(self.home).update(child, True), children))
        self.assertEqual(set(self.store.read()), set(children))

    def test_only_successful_observed_native_thread_requests_seed_the_index(self):
        observer = KnownForksObserver(self.store)
        observer.observe({'id': 1, 'result': {'thread': self.thread()}})
        observer.observe({'method': 'thread/started', 'params': {'thread': self.thread()}})
        self.assertEqual(self.store.read(), [])
        for index, method in enumerate(['thread/start', 'thread/read', 'thread/resume', 'thread/fork'], 1):
            observer.track({'id': index, 'method': method, 'params': {'threadId': self.parent}})
            observer.observe({'id': index, 'result': {'thread': self.thread()}})
            self.assertEqual(self.store.read(), [self.child])
            self.store.update(self.child, False)
        observer.track({'id': 8, 'method': 'thread/fork', 'params': {'threadId': self.parent}})
        observer.observe({'id': 8, 'error': {'message': 'native fork failed'}})
        self.assertEqual(self.store.read(), [])

    def test_nonfork_nonempty_ephemeral_and_invalid_threads_are_not_indexed(self):
        observer = KnownForksObserver(self.store)
        for index, updates in enumerate([{'forkedFromId': None}, {'preview': 'normal preview'}, {'ephemeral': True}, {'id': 'bad-id'}], 1):
            observer.track({'id': index, 'method': 'thread/fork'})
            observer.observe({'id': index, 'result': {'thread': self.thread(**updates)}})
        self.assertEqual(self.store.read(), [])

    def test_native_read_with_populated_preview_retires_the_discovery_hint(self):
        self.store.update(self.child, True)
        observer = KnownForksObserver(self.store)
        observer.track({'id': 1, 'method': 'thread/read', 'params': {'threadId': self.child}})
        observer.observe({'id': 1, 'result': {'thread': self.thread(preview='native preview now exists')}})
        self.assertEqual(self.store.read(), [])

    def test_delete_ack_and_native_notification_remove_hints_but_failure_does_not(self):
        observer = KnownForksObserver(self.store)
        self.store.update(self.child, True)
        observer.track({'id': 1, 'method': 'thread/delete', 'params': {'threadId': self.child}})
        observer.observe({'id': 1, 'error': {'message': 'busy'}})
        self.assertEqual(self.store.read(), [self.child])
        observer.track({'id': 2, 'method': 'thread/delete', 'params': {'threadId': self.child}})
        observer.observe({'id': 2, 'result': {}})
        self.assertEqual(self.store.read(), [])
        self.store.update(self.child, True)
        observer.observe({'method': 'thread/deleted', 'params': {'threadId': self.child}})
        self.assertEqual(self.store.read(), [])


class NativeForkDiscoveryTests(unittest.TestCase):
    """Real isolated SQLite/rollout fixtures; never write an application profile."""

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='codex-native-forks-')
        self.home = Path(self.directory.name)/'home'
        self.home.mkdir()
        self.store = KnownForks(self.home)
        self.native = self.home/'state_5.sqlite'
        self.database = sqlite3.connect(self.native)
        self.database.execute("""CREATE TABLE threads (
            id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL, preview TEXT NOT NULL,
            archived INTEGER NOT NULL, source TEXT NOT NULL,
            attached_thread_parent_id TEXT, updated_at INTEGER NOT NULL)""")
        self.database.commit()
        self.parent = str(uuid.uuid4())

    def tearDown(self):
        self.database.close()
        self.directory.cleanup()

    def add(self, *, parent=True, source='vscode', preview='', archived=0, attached=False):
        identifier = str(uuid.uuid4())
        path = self.home/'sessions'/'2026'/'10'/'26'/('rollout-'+identifier+'.jsonl')
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {'id': identifier, 'source': source}
        if parent:
            payload['forked_from_id'] = self.parent
        if attached:
            payload['attached_thread'] = True
        path.write_text(json.dumps({'type': 'session_meta', 'payload': payload})+'\n'
                        +'this later line is deliberately invalid: do not read conversations\n')
        self.database.execute('INSERT INTO threads VALUES (?,?,?,?,?,?,?)',
                              (identifier, str(path), preview, archived, source,
                               self.parent if attached else None, 1))
        self.database.commit()
        return identifier, path

    def test_preexisting_fork_without_web_index_is_discovered_readonly(self):
        child, path = self.add()
        before = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in (self.native, path)}
        self.assertEqual(self.store.read(), [])
        self.assertEqual(self.store.discover(), [child])
        self.assertEqual(KnownForks(self.home).discover(), [child])
        self.assertFalse(self.store.path.exists())
        self.assertEqual(KnownForks(self.home.parent/'other').discover(), [])
        self.assertEqual(before, {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in before})

    def test_only_real_interactive_empty_preview_nonattached_forks_are_candidates(self):
        child, _ = self.add()
        self.add(parent=False)
        self.add(source='{"subagent":"review"}')
        self.add(source='exec')
        self.add(attached=True)
        self.add(preview='normal listing already finds this')
        self.add(archived=1)
        self.assertEqual(self.store.discover(), [child])

    def test_wal_commits_and_replaced_headers_are_observed_without_native_writes(self):
        self.database.execute('PRAGMA journal_mode=WAL')
        child, path = self.add()
        wal = self.native.with_name(self.native.name+'-wal')
        original_wal = wal.read_bytes()
        self.assertEqual(self.store.discover(), [child])
        self.assertEqual(wal.read_bytes(), original_wal)
        value = json.loads(path.read_text().splitlines()[0])
        value['payload'].pop('forked_from_id')
        temporary = path.with_suffix('.new')
        temporary.write_text(json.dumps(value)+'\n')
        temporary.replace(path)
        self.assertEqual(self.store.discover(), [])
        child2, _ = self.add()
        self.assertEqual(self.store.discover(), [child2])
        self.database.execute('DELETE FROM threads WHERE id=?', (child2,))
        self.database.commit()
        self.assertEqual(self.store.discover(), [])

    def test_discovery_does_not_silently_truncate_large_candidate_sets(self):
        children = [self.add()[0] for _ in range(121)]
        self.assertEqual(set(self.store.discover()), set(children))
        self.assertEqual(set(self.store.discover()), set(children))

    def test_symlinked_native_database_outside_profile_is_not_read(self):
        self.database.close()
        target = self.home.parent/'other.sqlite'
        self.native.rename(target)
        self.native.symlink_to(target)
        with self.assertRaisesRegex(ValueError, '超出当前 CODEX_HOME'):
            self.store.discover()

    def test_outside_relative_and_symlinked_rollouts_are_not_read(self):
        child, path = self.add()
        outside = self.home.parent/'outside.jsonl'
        outside.write_text('private data should never appear in errors')
        for candidate in [outside, Path('../outside.jsonl')]:
            self.database.execute('UPDATE threads SET rollout_path=? WHERE id=?', (str(candidate), child))
            self.database.commit()
            with self.assertRaises(ValueError) as captured:
                self.store.discover()
            self.assertNotIn('private data', str(captured.exception))
        path.unlink()
        path.symlink_to(outside)
        self.database.execute('UPDATE threads SET rollout_path=? WHERE id=?', (str(path), child))
        self.database.commit()
        with self.assertRaisesRegex(ValueError, '超出当前会话目录'):
            self.store.discover()

    def test_malformed_mismatched_and_oversized_metadata_are_explicit_failures(self):
        child, path = self.add()
        for value in [b'not-json private-content', json.dumps({'type':'session_meta', 'payload':{'id':self.parent}}).encode(), b'x'*(self.store.MAX_HEADER+1)]:
            path.write_bytes(value)
            with self.assertRaises(ValueError) as captured:
                self.store.discover()
            self.assertIn(child, str(captured.exception))
            self.assertNotIn('private-content', str(captured.exception))

    def test_replaced_open_rollout_inode_is_rejected(self):
        child, path = self.add()
        real_fstat = os.fstat
        def replaced(descriptor):
            value = real_fstat(descriptor)
            changed = list(value)
            changed[1] += 1
            return os.stat_result(changed)
        with patch('server.os.fstat', side_effect=replaced):
            with self.assertRaisesRegex(ValueError, '读取期间变化'):
                self.store.discover()

    def test_missing_rollout_after_delete_does_not_create_fake_row(self):
        child, path = self.add()
        path.unlink()
        self.assertEqual(self.store.discover(), [])

    def test_compressed_candidates_are_deferred_to_native_read_without_decoding(self):
        child, path = self.add()
        path.unlink()
        compressed = Path(str(path)+'.zst')
        compressed.write_bytes(b'opaque native representation: Web must not decode')
        self.assertEqual(self.store.discover(), [child])
        self.assertEqual(self.store.read(), [])
        self.assertEqual(compressed.read_bytes(), b'opaque native representation: Web must not decode')
        target = self.home.parent/'other.jsonl.zst'
        compressed.rename(target)
        compressed.symlink_to(target)
        with self.assertRaisesRegex(ValueError, '超出当前会话目录'):
            self.store.discover()

    def test_native_archive_delete_racing_header_open_is_safe(self):
        self.add()
        with patch.object(self.store, 'is_native_fork', side_effect=FileNotFoundError('native file moved')):
            self.assertEqual(self.store.discover(), [])

    def test_corrupt_wrong_schema_and_busy_databases_are_diagnostic(self):
        self.database.execute('DROP TABLE threads')
        self.database.commit()
        with self.assertRaisesRegex(ValueError, '不兼容'):
            self.store.discover()
        self.database.close()
        self.native.write_bytes(b'invalid SQLite database')
        with self.assertRaisesRegex(ValueError, '损坏'):
            self.store.discover()
        with patch('server.sqlite3.connect', side_effect=sqlite3.OperationalError('database is locked')):
            with self.assertRaisesRegex(ValueError, '正忙'):
                self.store.discover()

    def test_deadline_is_an_explicit_failure_instead_of_partial_success(self):
        self.add()
        with patch('server.time.monotonic', side_effect=[0, 11]):
            with self.assertRaisesRegex(ValueError, '未截断结果'):
                self.store.discover()


class KnownForkHttpTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='codex-known-forks-http-')
        self.store = KnownForks(self.directory.name)
        self.child = str(uuid.uuid4())
        self.store.update(self.child, True)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.settings = types.SimpleNamespace(remote=False, token='known-forks-test', known_forks=self.store)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:'+str(self.server.server_port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.directory.cleanup()

    def request(self, headers):
        request = urllib.request.Request(self.base+'/api/known-forks', headers=headers)
        try:
            return urllib.request.urlopen(request)
        except urllib.error.HTTPError as response:
            return response

    def test_endpoint_uses_existing_session_and_origin_boundary(self):
        for headers, expected in [({}, 401), ({'Cookie': 'codex_web=known-forks-test', 'Origin': 'https://untrusted.invalid'}, 403)]:
            with self.request(headers) as response:
                self.assertEqual(response.status, expected)
        with self.request({'Cookie': 'codex_web=known-forks-test'}) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(json.load(response), {'threadIds': [self.child]})
            self.assertEqual(response.headers['Cache-Control'], 'no-store')

    def test_corrupt_index_fails_explicitly_instead_of_hiding_discovery_failure(self):
        self.store.path.write_text('invalid-json')
        with self.request({'Cookie': 'codex_web=known-forks-test'}) as response:
            self.assertEqual(response.status, 500)
            self.assertIn('error', json.load(response))


if __name__ == '__main__':
    unittest.main()
