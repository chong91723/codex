"""Inert package safety, transaction/CAS and authenticated HTTP regressions.

Observer fixtures follow pinned v2 SkillsListResponse/SkillsConfigWriteResponse;
these are not claims of a model/browser acceptance test.
"""
import base64
import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from skill_packages import SkillPackages, unpack_payload, UPLOAD_BYTES, HTTP_BYTES
from server import Handler, Settings, ThreadingHTTPServer, retained_skill


def document(name='uploaded-demo'):
    return ('---\nname: '+name+'\ndescription: Local test only\n---\nRead references/details.md.\n').encode()


def payload(files=None, *, raw=None, filename='package.zip'):
    if raw is None:
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, content in (files or {'demo/SKILL.md': document(), 'demo/references/details.md': b'local reference'}).items():
                archive.writestr(name, content)
        raw = stream.getvalue()
    return {'filename': filename, 'dataBase64': base64.b64encode(raw).decode()}


class NativeFixture:
    """Deliberately small fixture; native performs real YAML validation in live tests."""
    def __init__(self, home):
        self.home = home
        self.control = threading.RLock()
        self.observer = self
        self.calls = []
        self.disabled = set()
        self.execution_status = 'idle'
        self.refuse_disable = False
        self.fail_after_move = False
        self.started = False

    def start(self):
        self.started = True

    def status(self):
        return {'execution': {'status': self.execution_status}}

    def call(self, method, params):
        self.calls.append((method, params))
        if method == 'skills/config/write':
            if not params['enabled'] and not self.refuse_disable:
                self.disabled.add(params['path'])
            elif params['enabled']:
                self.disabled.discard(params['path'])
            return {'effectiveEnabled': params['path'] not in self.disabled}
        if method != 'skills/list':
            raise AssertionError('Unexpected native operation '+method)
        skills, errors = [], []
        for path in sorted((self.home/'skills').rglob('SKILL.md')):
            text = path.read_text()
            if self.fail_after_move and 'web-uploaded' in path.parts:
                raise RuntimeError('fixture transport failed')
            if not text.startswith('---\nname: ') or '\ndescription: ' not in text:
                errors.append({'path': str(path), 'message': 'fixture invalid frontmatter'})
                continue
            name = text.splitlines()[1].split(': ', 1)[1]
            skills.append({'name': name, 'description': 'Local test only', 'path': str(path),
                           'scope': 'user', 'enabled': str(path) not in self.disabled,
                           'pluginId': None})
        return {'data': [{'cwd': params['cwds'][0], 'skills': skills, 'errors': errors}]}


class PackageSafetyTests(unittest.TestCase):
    def test_full_directory_preserves_references_and_single_document_supported(self):
        self.assertEqual(unpack_payload(payload())['references/details.md'], b'local reference')
        self.assertEqual(unpack_payload(payload(raw=document(), filename='SKILL.md')), {'SKILL.md': document()})

    def test_unsupported_format_base64_and_invalid_utf8_rejected(self):
        for value in [payload(raw=b'hello', filename='data.csv'), {'filename': 'x.zip', 'dataBase64': '@@@'},
                      payload(raw=b'\xff', filename='SKILL.md'), payload(raw=b'', filename='SKILL.md'),
                      payload(raw=b'x', filename='../SKILL.md'), payload(raw=b'invalid ZIP')]:
            with self.subTest(filename=value['filename']), self.assertRaises(ValueError):
                unpack_payload(value)

    def test_archive_traversal_absolute_backslash_drives_and_outside_root_rejected(self):
        for path in ['../x', '/etc/x', 'C:/x', 'folder\\x', 'demo/../x', 'demo//x', 'demo/./x', 'demo/x:y', 'outside.txt']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                unpack_payload(payload({'demo/SKILL.md': document(), path: b'x'}))

    def test_only_stored_and_deflated_methods_accepted_before_member_decompression(self):
        import struct
        for method in [zipfile.ZIP_BZIP2, zipfile.ZIP_LZMA]:
            stream = io.BytesIO()
            with zipfile.ZipFile(stream, 'w', compression=method) as archive:
                archive.writestr('SKILL.md', b'a'*(128*1024))
            raw = bytearray(stream.getvalue())
            # Deliberately lie about expanded length in both headers. Methods
            # whose decompressor may ignore max_length must never be opened.
            struct.pack_into('<L', raw, raw.index(b'PK\x01\x02')+24, 1)
            struct.pack_into('<L', raw, raw.index(b'PK\x03\x04')+22, 1)
            with self.subTest(method=method), patch.object(zipfile.ZipFile, 'open', side_effect=AssertionError('must reject before decompression')):
                with self.assertRaisesRegex(ValueError, 'Stored 或 Deflate'):
                    unpack_payload(payload(raw=bytes(raw)))
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_STORED) as archive:
            archive.writestr('SKILL.md', document())
        self.assertEqual(unpack_payload(payload(raw=stream.getvalue()))['SKILL.md'], document())
        self.assertEqual(unpack_payload(payload(raw=document(), filename='skill.MD'))['SKILL.md'], document())

    def test_archive_path_depth_segment_and_total_length_are_bounded(self):
        for path in ['demo/'+'a'*256, 'demo/'+'/'.join(['a']*17), 'demo/'+'/'.join(['x'*200]*6)]:
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, '长度或层级'):
                unpack_payload(payload({'demo/SKILL.md': document(), path: b'x'}))

    def test_missing_or_multiple_skill_documents_rejected(self):
        for files in [{'readme.md': b'none'}, {'one/SKILL.md': document(), 'two/SKILL.md': document('second')}]:
            with self.assertRaises(ValueError):
                unpack_payload(payload(files))

    def test_symlink_devices_and_file_directory_collision_rejected(self):
        for mode in [stat.S_IFLNK | 0o777, stat.S_IFCHR | 0o600, stat.S_IFIFO | 0o600]:
            stream = io.BytesIO()
            with zipfile.ZipFile(stream, 'w') as archive:
                archive.writestr('demo/SKILL.md', document())
                info = zipfile.ZipInfo('demo/escape')
                info.create_system = 3
                info.external_attr = mode << 16
                archive.writestr(info, '../outside')
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                unpack_payload(payload(raw=stream.getvalue()))
        with self.assertRaises(ValueError):
            unpack_payload(payload({'demo/SKILL.md': document(), 'demo/references': b'file', 'demo/references/x': b'child'}))

    def test_duplicate_entry_rejected(self):
        stream = io.BytesIO()
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(stream, 'w') as archive:
                archive.writestr('SKILL.md', document())
                archive.writestr('SKILL.md', document())
        with self.assertRaises(ValueError):
            unpack_payload(payload(raw=stream.getvalue()))

    def test_count_compressed_expansion_and_document_limits_enforced(self):
        files = {'SKILL.md': document(), **{str(index): b'x' for index in range(256)}}
        with self.assertRaises(ValueError):
            unpack_payload(payload(files))
        # These compress to KiB, but exceed the actual expanded-byte budget.
        with self.assertRaises(ValueError):
            unpack_payload(payload({'SKILL.md': document(), **{str(index): b'a'*(7*1024*1024) for index in range(4)}}))
        with self.assertRaises(ValueError):
            unpack_payload(payload({'SKILL.md': document(), 'large': b'a'*(UPLOAD_BYTES+1)}))
        with self.assertRaises(ValueError):
            unpack_payload(payload(raw=b'a'*(256*1024+1), filename='SKILL.md'))
        with self.assertRaises(ValueError):
            unpack_payload({'filename': 'x.zip', 'dataBase64': 'a'*(4*((UPLOAD_BYTES+2)//3)+1)})


class PackageTransactionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='codex-skill-package-')
        self.home = Path(self.directory.name)
        self.env = patch.dict(os.environ, {'CODEX_HOME': str(self.home)})
        self.env.start()
        self.store = SkillPackages(self.home)
        self.runtime = NativeFixture(self.home)
        self.workspace = self.home/'workspace'
        self.workspace.mkdir()

    def tearDown(self):
        self.env.stop()
        self.directory.cleanup()

    def upload(self, value=None):
        return self.store.upload(value or payload(), self.runtime, self.workspace)['skill']

    def test_install_native_disabled_discovery_registry_and_restart_visibility(self):
        item = self.upload()
        self.assertFalse(self.runtime.call('skills/list', {'cwds': [str(self.workspace)]})['data'][0]['skills'][0]['enabled'])
        self.assertEqual((Path(item['path']).parent/'references/details.md').read_bytes(), b'local reference')
        self.assertTrue(SkillPackages(self.home).allows(item['name'], item['path']))
        self.assertTrue(retained_skill(item['name'], item['path']))
        self.assertFalse(self.store.allows('wrong-name', item['path']))
        self.assertEqual(self.store.list()['skills'][0]['version'], item['version'])
        self.assertEqual([method for method, _ in self.runtime.calls][:3], ['skills/list', 'skills/config/write', 'skills/list'])

    def test_native_invalid_frontmatter_rolls_back_files_and_registry(self):
        with self.assertRaisesRegex(ValueError, '原生技能解析失败'):
            self.upload(payload(raw=b'not valid skill frontmatter', filename='SKILL.md'))
        self.assertEqual(self.store.list()['skills'], [])
        self.assertEqual(list(self.store.root.iterdir()), [])
        self.assertFalse(any(self.store.state.glob('.upload-*')))

    def test_native_transport_failure_rolls_back_and_no_false_registration(self):
        self.runtime.fail_after_move = True
        with self.assertRaisesRegex(RuntimeError, 'transport failed'):
            self.upload()
        self.assertEqual(self.store.list()['skills'], [])
        self.assertEqual(list(self.store.root.iterdir()), [])

    def test_default_disable_refusal_is_not_success(self):
        self.runtime.refuse_disable = True
        with self.assertRaisesRegex(ValueError, '不允许默认停用'):
            self.upload()
        self.assertEqual(self.store.list()['skills'], [])
        self.assertEqual(list(self.store.root.iterdir()), [])

    def test_duplicate_builtin_and_existing_names_never_replace_old_files(self):
        first = self.upload()
        for name in ['uploaded-demo', 'openai-docs', 'review-agent', 'skill-creator', 'skill-installer']:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, '名称.*冲突'):
                self.upload(payload(raw=document(name), filename='SKILL.md'))
        self.assertEqual([item['id'] for item in self.store.list()['skills']], [first['id']])
        self.assertEqual(Path(first['path']).read_bytes(), document())

    def test_registry_write_failure_rolls_back_only_new_package(self):
        first = self.upload()
        with patch.object(self.store, '_write', side_effect=OSError('fixture write failed')):
            with self.assertRaises(OSError):
                self.upload(payload(raw=document('another'), filename='SKILL.md'))
        self.assertEqual([item['id'] for item in self.store.list()['skills']], [first['id']])
        self.assertTrue(self.store.allows(first['name'], first['path']))

    def test_running_approval_cleanup_and_unknown_ack_reject_all_mutations(self):
        item = self.upload()
        for status in ['running', 'waitingApproval', 'cleaningUp', 'unknown']:
            self.runtime.execution_status = status
            before = len(self.runtime.calls)
            with self.subTest(status=status):
                with self.assertRaisesRegex(ValueError, '请先结束'):
                    self.upload(payload(raw=document('another'), filename='SKILL.md'))
                with self.assertRaisesRegex(ValueError, '请先结束'):
                    self.store.remove({'id': item['id'], 'expectedVersion': item['version']}, self.runtime, self.workspace)
                self.assertEqual(len(self.runtime.calls), before)
                self.assertTrue(Path(item['path']).exists())
                self.assertEqual(len(self.store.list()['skills']), 1)

    def test_idle_label_alone_does_not_override_pending_native_ack_or_observer_failure(self):
        for extra in [{'pendingNativeAcks': [{'method': 'turn/start'}]}, {'cleanupHolds': [{'holdId': 'pending'}]},
                      {'activeTurns': [{'turnId': 'pending'}]}, {'pendingCount': 1}, {'ownerThreadId': 'pending'},
                      {'observerReady': False}]:
            with self.subTest(extra=extra), patch.object(self.runtime, 'status', return_value={'execution': {'status': 'idle', **extra}}):
                with self.assertRaisesRegex(ValueError, '请先结束'):
                    self.upload()
                self.assertFalse(self.store.registry.exists())

    def test_remove_requires_current_version_and_never_removes_builtin(self):
        item = self.upload()
        with self.assertRaisesRegex(ValueError, '文件已变化'):
            self.store.remove({'id': item['id'], 'expectedVersion': 'stale'}, self.runtime, self.workspace)
        with self.assertRaises(ValueError):
            self.store.remove({'id': 'openai-docs', 'expectedVersion': item['version']}, self.runtime, self.workspace)
        self.assertTrue(Path(item['path']).is_file())
        result = self.store.remove({'id': item['id'], 'expectedVersion': item['version']}, self.runtime, self.workspace)
        self.assertEqual(result, {'removed': item['id']})
        self.assertFalse(Path(item['path']).exists())
        self.assertFalse(retained_skill(item['name'], item['path']))
        self.assertEqual(self.store.list()['skills'], [])

    def test_modified_package_disabled_by_policy_and_stale_remove_denied(self):
        item = self.upload()
        reference = Path(item['path']).parent/'references/details.md'
        reference.write_text('changed')
        self.assertFalse(retained_skill(item['name'], item['path']))
        current = self.store.list()['skills'][0]
        self.assertFalse(current['integrity'])
        self.assertNotEqual(current['version'], item['version'])
        with self.assertRaisesRegex(ValueError, '文件已变化'):
            self.store.remove({'id': item['id'], 'expectedVersion': item['version']}, self.runtime, self.workspace)
        self.store.remove({'id': item['id'], 'expectedVersion': current['version']}, self.runtime, self.workspace)

    def test_remove_commit_failure_restores_only_existing_package_and_enablement(self):
        item = self.upload()
        self.runtime.disabled.discard(item['path'])
        with patch.object(self.store, '_write', side_effect=OSError('fixture commit failed')):
            with self.assertRaises(OSError):
                self.store.remove({'id': item['id'], 'expectedVersion': item['version']}, self.runtime, self.workspace)
        self.assertTrue(self.store.allows(item['name'], item['path']))
        self.assertNotIn(item['path'], self.runtime.disabled)
        self.assertEqual(len(self.store.list()['skills']), 1)

    def test_registry_root_and_package_symlinks_are_rejected(self):
        outside = self.home/'outside'
        outside.mkdir()
        self.store.state.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, '符号链接'):
            self.upload()
        self.store.state.unlink()
        item = self.upload()
        reference = Path(item['path']).parent/'references/details.md'
        reference.unlink()
        reference.symlink_to(outside/'private')
        self.assertFalse(retained_skill(item['name'], item['path']))
        self.assertFalse(self.store.list()['skills'][0]['integrity'])
        self.assertTrue(outside.is_dir())

    def test_missing_package_has_stable_string_version_and_can_be_unregistered(self):
        import shutil
        missing = self.upload()
        healthy = self.upload(payload(raw=document('healthy-local'), filename='SKILL.md'))
        shutil.rmtree(Path(missing['path']).parent)
        items = {item['id']: item for item in self.store.list()['skills']}
        broken = items[missing['id']]
        self.assertFalse(broken['integrity'])
        self.assertIsInstance(broken['version'], str)
        self.assertTrue(broken['version'].startswith('broken-'))
        self.assertTrue(broken['error'])
        self.assertTrue(items[healthy['id']]['integrity'])
        self.assertTrue(self.store.allows(healthy['name'], healthy['path']))
        self.assertFalse(self.store.allows(missing['name'], missing['path']))
        with self.assertRaisesRegex(ValueError, '文件已变化'):
            self.store.remove({'id': missing['id'], 'expectedVersion': missing['version']}, self.runtime, self.workspace)
        self.store.remove({'id': missing['id'], 'expectedVersion': broken['version']}, self.runtime, self.workspace)
        self.assertEqual([item['id'] for item in self.store.list()['skills']], [healthy['id']])

    def test_symlink_package_cleanup_never_follows_or_removes_target(self):
        import shutil
        item = self.upload()
        root = Path(item['path']).parent
        shutil.rmtree(root)
        outside = self.home/'outside-business'
        outside.mkdir()
        marker = outside/'keep.txt'
        marker.write_text('must survive')
        root.symlink_to(outside, target_is_directory=True)
        broken = self.store.list()['skills'][0]
        self.assertFalse(broken['integrity'])
        self.assertFalse(self.store.allows(item['name'], item['path']))
        self.store.remove({'id': item['id'], 'expectedVersion': broken['version']}, self.runtime, self.workspace)
        self.assertFalse(root.exists())
        self.assertEqual(marker.read_text(), 'must survive')
        self.assertEqual(self.store.list()['skills'], [])

    def test_nested_broken_link_cleanup_and_bad_state_cas(self):
        item = self.upload()
        outside = self.home/'outside-file'
        outside.write_text('do not delete')
        reference = Path(item['path']).parent/'references/details.md'
        reference.unlink()
        reference.symlink_to(outside)
        broken = self.store.list()['skills'][0]
        self.assertTrue(broken['version'].startswith('broken-'))
        reference.unlink()
        reference.symlink_to(self.home/'different-target')
        current = self.store.list()['skills'][0]
        self.assertNotEqual(current['version'], broken['version'])
        with self.assertRaisesRegex(ValueError, '文件已变化'):
            self.store.remove({'id': item['id'], 'expectedVersion': broken['version']}, self.runtime, self.workspace)
        self.store.remove({'id': item['id'], 'expectedVersion': current['version']}, self.runtime, self.workspace)
        self.assertEqual(outside.read_text(), 'do not delete')

    def test_unregistered_package_and_forged_path_never_allowed(self):
        path = self.store.root/('a'*32)/'SKILL.md'
        path.parent.mkdir(parents=True)
        path.write_bytes(document())
        self.assertFalse(retained_skill('uploaded-demo', str(path)))
        self.assertFalse(self.store.allows('uploaded-demo', str(path.parent/'..'/path.parent.name/'SKILL.md')))


class SkillHttpTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='codex-skill-http-')
        self.home = Path(self.directory.name)
        self.runtime = NativeFixture(self.home)
        self.settings = types.SimpleNamespace(remote=False, token='skill-local-test-token',
                                             skill_packages=SkillPackages(self.home), runtime=self.runtime, workspace=self.home)
        self.settings.manage_skills = types.MethodType(Settings.manage_skills, self.settings)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.settings = self.settings
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = 'http://127.0.0.1:'+str(self.server.server_port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.directory.cleanup()

    def request(self, path, value=None, headers=None):
        request_headers = {'Cookie': 'codex_web=skill-local-test-token', 'Content-Type': 'application/json'}
        if headers is not None:
            request_headers = headers
        body = json.dumps(value).encode() if value is not None else None
        request = urllib.request.Request(self.base+path, headers=request_headers, data=body)
        try:
            response = urllib.request.urlopen(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def test_authenticated_upload_list_remove_and_no_download_endpoint(self):
        code, body = self.request('/api/skills/upload', payload())
        self.assertEqual(code, 200)
        item = body['skill']
        self.assertFalse(body['enabled'])
        self.assertEqual(self.request('/api/skills')[1]['skills'][0]['id'], item['id'])
        self.assertEqual(self.request('/api/skills/remove', {'id': item['id'], 'expectedVersion': item['version']})[0], 200)
        self.assertEqual(self.request('/api/skills/download', {'url': 'https://github.com/any/repo'})[0], 404)

    def test_missing_session_cross_origin_and_rebinding_rejected_without_work(self):
        for path, value in [('/api/skills', None), ('/api/skills/upload', payload()), ('/api/skills/remove', {'id': 'a'*32})]:
            for headers, expected in [({}, 401), ({'Cookie': 'codex_web=skill-local-test-token', 'Origin': 'https://other.example'}, 403),
                                      ({'Cookie': 'codex_web=skill-local-test-token', 'Host': 'other.example'}, 403)]:
                with self.subTest(path=path, headers=headers):
                    self.assertEqual(self.request(path, value, headers)[0], expected)
        self.assertFalse(self.runtime.started)

    def test_body_size_media_type_and_shape_are_checked(self):
        self.assertEqual(self.request('/api/skills/upload', [], None)[0], 400)
        self.assertEqual(self.request('/api/skills/upload', payload(), {'Cookie': 'codex_web=skill-local-test-token'})[0], 415)
        self.assertEqual(self.request('/api/skills/remove', {'id': 'x'*5000})[0], 413)
        # Verify early rejection without sending an oversized body after the
        # server has correctly closed the connection.
        import http.client
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        connection.putrequest('POST', '/api/skills/upload')
        connection.putheader('Cookie', 'codex_web=skill-local-test-token')
        connection.putheader('Content-Type', 'application/json')
        connection.putheader('Content-Length', str(HTTP_BYTES+1))
        connection.endheaders()
        response = connection.getresponse()
        self.assertEqual(response.status, 413)
        response.read()
        connection.close()
        self.assertFalse(self.runtime.started)


if __name__ == '__main__':
    unittest.main()
