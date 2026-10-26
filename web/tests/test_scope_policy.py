"""Product-scope boundary tests; optional raw-WebSocket checks use a real native server.

CODEX_WEB_TEST_URL must point to an isolated DeepSeek test profile.
No test sends a model request or uses a credential.
"""
import base64
import http.cookiejar
import json
import os
from pathlib import Path
import socket
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.parse
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import ScopePolicy, WEB_NATIVE_OVERRIDES, config_key_parts, config_scope_reason
from start import deepseek_profile


class ScopePolicyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='codex-scope-unit-')
        self.home = Path(self.directory.name)
        self.env = patch.dict(os.environ, {'CODEX_HOME': str(self.home)})
        self.env.start()
        self.policy = ScopePolicy()

    def tearDown(self):
        self.env.stop()
        self.directory.cleanup()

    def reason(self, method, params=None):
        return self.policy.reason({'id': 'test', 'method': method, 'params': params or {}})

    def skill(self, name):
        return str(self.home/'skills'/'.system'/name/'SKILL.md')

    def test_removed_account_cloud_feedback_and_remote_operations_rejected(self):
        for method in ['account/read', 'account/login/start', 'account/gatewayOAuth/login', 'account/usage/read',
                       'app/list', 'app/read', 'feedback/save', 'feedback/upload', 'remoteControl/enable',
                       'remoteControl/pairing/start', 'userVerification/status', 'userVerification/enroll',
                       'userVerification/delete', 'userVerification/verify', 'userVerification/cancel',
                       'plugin/share/save', 'plugin/share/updateTargets', 'plugin/share/list',
                       'plugin/share/checkout', 'plugin/share/delete']:
            with self.subTest(method=method):
                self.assertTrue(self.reason(method))
        for method in ['remoteControl/disable', 'remoteControl/status/read', 'plugin/list', 'plugin/read', 'plugin/install', 'mcpServerStatus/list', 'skills/list']:
            self.assertIsNone(self.reason(method))

    def test_approval_response_not_mistaken_for_a_client_request(self):
        self.assertIsNone(self.policy.reason({'id': 'approval-1', 'result': {'decision': 'decline'}}))

    def test_explicit_models_provider_and_mode_cannot_select_openai(self):
        for method in ['thread/start', 'thread/resume', 'thread/fork', 'thread/settings/update', 'turn/start', 'turn/settings/update']:
            for params in [{'model': 'gpt-6-sol'}, {'modelProvider': 'openai'},
                           {'collaborationMode': {'mode': 'plan', 'settings': {'model': 'gpt-6-sol'}}}]:
                with self.subTest(method=method, params=params):
                    self.assertTrue(self.reason(method, params))
        self.assertIsNone(self.reason('thread/start', {'model': 'deepseek-flash', 'modelProvider': 'deepseek'}))

    def test_priority_tiers_blocked_without_blocking_reset_to_default(self):
        for field in ['serviceTier', 'serviceTierForTurn']:
            self.assertTrue(self.reason('turn/start', {field: 'priority'}))
            self.assertIsNone(self.reason('turn/start', {field: 'default'}))
            self.assertIsNone(self.reason('turn/start', {field: None}))

    def test_observed_native_identity_blocks_inherited_old_thread(self):
        self.policy.observe({'id': 1, 'result': {'thread': {'id': 'legacy'}, 'modelProvider': 'openai', 'model': 'gpt-6-sol'}})
        for method in ['turn/start', 'review/start', 'thread/compact/start', 'thread/queue/start', 'thread/sample', 'thread/prediction/request']:
            self.assertTrue(self.reason(method, {'threadId': 'legacy'}))
        self.assertIsNone(self.reason('thread/read', {'threadId': 'legacy'}))
        self.policy.observe({'method': 'thread/started', 'params': {'thread': {'id': 'good', 'modelProvider': 'deepseek', 'model': 'deepseek-flash'}}})
        self.assertIsNone(self.reason('turn/start', {'threadId': 'good'}))

    def test_goal_and_queue_cannot_trigger_an_inherited_openai_model(self):
        self.policy.observe({'id': 1, 'result': {'thread': {'id': 'legacy'}, 'modelProvider': 'openai', 'model': 'gpt-6-sol'}})
        for extra in [{'status': 'active'}, {'objective': 'start a new objective'}, {'objective': 'edit', 'status': 'paused'}]:
            self.assertTrue(self.reason('thread/goal/set', {'threadId': 'legacy', **extra}))
        for extra in [{'status': 'paused'}, {'status': 'complete'}]:
            self.assertIsNone(self.reason('thread/goal/set', {'threadId': 'legacy', **extra}))
        self.assertIsNone(self.reason('thread/goal/get', {'threadId': 'legacy'}))
        self.assertIsNone(self.reason('thread/goal/clear', {'threadId': 'legacy'}))
        self.assertTrue(self.reason('thread/queue/start', {'threadId': 'legacy'}))
        self.assertTrue(self.reason('thread/queue/add', {'threadId': 'legacy', 'input': [{'type': 'text', 'text': 'would auto-start'}]}))
        self.assertTrue(self.reason('thread/resume', {'threadId': 'legacy'}))
        self.policy.observe({'id': 2, 'result': {'thread': {'id': 'flash'}, 'modelProvider': 'deepseek', 'model': 'deepseek-flash'}})
        self.assertIsNone(self.reason('thread/goal/set', {'threadId': 'flash', 'status': 'active'}))
        self.assertIsNone(self.reason('thread/queue/start', {'threadId': 'flash'}))

    def test_resume_requires_a_native_identity_and_list_or_search_is_sufficient(self):
        self.assertTrue(self.reason('thread/resume', {'threadId': 'unknown'}))
        self.policy.observe({'id': 1, 'result': {'data': [{'id': 'listed', 'modelProvider': 'deepseek', 'model': 'deepseek-flash'}]}})
        self.assertIsNone(self.reason('thread/resume', {'threadId': 'listed'}))
        self.policy.observe({'id': 2, 'result': {'data': [{'thread': {'id': 'searched', 'modelProvider': 'deepseek', 'model': 'deepseek-flash'}}]}})
        self.assertIsNone(self.reason('thread/resume', {'threadId': 'searched'}))
        self.policy.observe({'id': 3, 'result': {'data': [{'id': 'old', 'modelProvider': 'openai', 'model': 'gpt-6-sol'}]}})
        self.assertTrue(self.reason('thread/resume', {'threadId': 'old'}))

    def test_unconfigured_realtime_cannot_fall_back_to_gpt_or_fake_flash_support(self):
        for params in [{'threadId': 'flash'}, {'threadId': 'flash', 'model': 'gpt-realtime-1.5'},
                       {'threadId': 'flash', 'model': 'deepseek-flash', 'outputModality': 'audio'}]:
            self.assertTrue(self.reason('thread/realtime/start', params))
        self.assertIsNone(self.reason('thread/realtime/stop', {'threadId': 'flash'}))

    def test_queued_skill_input_cannot_bypass_the_same_native_path_boundary(self):
        for method in ['thread/queue/add', 'thread/queue/update']:
            self.assertTrue(self.reason(method, {'input': [{'type': 'skill', 'name': 'imagegen', 'path': self.skill('imagegen')}]}))
            self.assertIsNone(self.reason(method, {'input': [{'type': 'skill', 'name': 'openai-docs', 'path': self.skill('openai-docs')}]}))
            self.assertIsNone(self.reason(method, {'input': [{'type': 'text', 'text': 'Explain imagegen and OpenAI documentation'}]}))

    def test_only_retained_bundled_skill_paths_can_be_enabled_or_sent(self):
        for name in ['openai-docs', 'review-agent', 'skill-creator', 'skill-installer']:
            path = self.skill(name)
            self.assertIsNone(self.reason('skills/config/write', {'path': path, 'enabled': True}))
            self.assertIsNone(self.reason('turn/start', {'input': [{'type': 'skill', 'name': name, 'path': path}]}))
        for name, path in [('imagegen', self.skill('imagegen')), ('openai-docs', '/tmp/openai-docs/SKILL.md'),
                           ('other', self.skill('openai-docs')), ('custom', self.skill('custom'))]:
            self.assertTrue(self.reason('turn/start', {'input': [{'type': 'skill', 'name': name, 'path': path}]}))
            if name != 'other':
                self.assertTrue(self.reason('skills/config/write', {'path': path, 'enabled': True}))
            self.assertIsNone(self.reason('skills/config/write', {'path': path, 'enabled': False}))

    def test_skill_path_symlink_cannot_enable_an_external_skill_as_builtin(self):
        outside = self.home/'external.md'
        outside.write_text('external')
        fake = Path(self.skill('openai-docs'))
        fake.parent.mkdir(parents=True)
        fake.symlink_to(outside)
        self.assertTrue(self.reason('turn/start', {'input': [{'type': 'skill', 'name': 'openai-docs', 'path': str(fake)}]}))

    def test_normal_text_and_mcp_configuration_do_not_trigger_string_filters(self):
        self.assertIsNone(self.reason('turn/start', {'input': [{'type': 'text', 'text': '请使用 openai-docs；解释 gpt-6-sol 文档与 imagegen 的区别'}]}))
        self.assertIsNone(self.reason('config/value/write', {'keyPath': 'mcp_servers."openai-docs"', 'value': {'command': 'node', 'args': ['openai-docs'], 'env': {'model': 'gpt-6-sol'}}}))

    def test_nested_and_quoted_native_config_paths_cannot_bypass_scope(self):
        self.assertEqual(config_key_parts('profiles."my.profile".model'), ('profiles', 'my.profile', 'model'))
        for key, value in [('model', 'gpt-6-sol'), ('"model"', 'gpt-6-sol'),
                           ('profiles."my.profile"', {'model_provider': 'openai'}),
                           ('agents', {'review': {'model': 'gpt-6-sol'}}),
                           ('features', {'image_generation': True}), ('features.fast_mode', True),
                           ('feedback.enabled', True), ('model_providers.alias', {'requires_openai_auth': True}),
                           ('model_providers.alias.base_url', 'https://api.openai.com/v1')]:
            with self.subTest(key=key):
                self.assertTrue(self.reason('config/batchWrite', {'edits': [{'keyPath': key, 'value': value}]}))
        self.assertTrue(self.reason('thread/start', {'config': {'features.image_generation': True}}))
        self.assertIsNone(self.reason('config/value/write', {'keyPath': 'model_providers.openai', 'value': None}))
        self.assertIsNone(self.reason('config/value/write', {'keyPath': 'model_providers.deepseek', 'value': {'base_url': 'https://api.deepseek.com', 'requires_openai_auth': False}}))

    def test_config_skill_rules_obey_the_same_path_policy(self):
        self.assertTrue(config_scope_reason([{'name': 'imagegen', 'enabled': True}], ('skills', 'config')))
        self.assertTrue(config_scope_reason([{'name': 'openai-docs', 'enabled': True}], ('skills', 'config')))
        self.assertIsNone(config_scope_reason([{'path': self.skill('openai-docs'), 'enabled': True}], ('skills', 'config')))
        self.assertIsNone(config_scope_reason([{'path': '/tmp/custom/SKILL.md', 'enabled': False}], ('skills', 'config')))

    def test_bad_unrelated_parameter_shapes_remain_native_errors(self):
        self.assertIsNone(self.reason('turn/start', {'input': 7}))
        self.assertIsNone(self.reason('config/batchWrite', {'edits': 7}))
        self.assertIsNone(self.policy.reason({'id': 1, 'method': 'turn/start', 'params': []}))

    def test_json_rpc_scope_error_is_explicit_without_echoing_sensitive_parameters(self):
        messages = []
        ws = type('Socket', (), {'send': lambda _, message: messages.append(message)})()
        denied = {'id': 24, 'method': 'account/login/start', 'params': {'apiKey': 'private-test-value'}}
        self.assertTrue(self.policy.reject(ws, denied))
        self.assertEqual(messages[0]['id'], 24)
        self.assertEqual(messages[0]['error']['code'], -32001)
        self.assertEqual(messages[0]['error']['data']['type'], 'scopeExcluded')
        self.assertNotIn('private-test-value', json.dumps(messages))
        self.assertFalse(self.policy.reject(ws, {'id': 25, 'method': 'thread/read', 'params': {'threadId': 'old'}}))

    def test_generated_catalog_has_no_openai_helper_and_existing_config_is_preserved(self):
        profile = self.home/'profile'
        deepseek_profile(profile)
        models = json.loads((profile/'models.json').read_text())['models']
        self.assertEqual([model['slug'] for model in models], ['deepseek-flash', 'deepseek-v4-pro'])
        config = (profile/'config.toml').read_text()
        self.assertIn('features.image_generation = false', config)
        self.assertIn('enabled = false', config)
        self.assertIn(str(profile/'skills'/'.system'/'imagegen'/'SKILL.md'), config)
        (profile/'config.toml').write_text('model = "custom"\n# Preserve this existing config\n')
        deepseek_profile(profile)
        self.assertEqual((profile/'config.toml').read_text(), 'model = "custom"\n# Preserve this existing config\n')
        self.assertIn('feedback.enabled=false', WEB_NATIVE_OVERRIDES)
        self.assertIn('memories.extract_model="deepseek-flash"', WEB_NATIVE_OVERRIDES)
        self.assertIn('memories.consolidation_model="deepseek-flash"', WEB_NATIVE_OVERRIDES)
        self.assertIn('memories.extract_model = "deepseek-flash"', config)
        self.assertIn('memories.consolidation_model = "deepseek-flash"', config)


class RawSocket:
    def __init__(self, url):
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost'):
            raise ValueError('Only an isolated localhost HTTP server is allowed')
        jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        with opener.open(url, timeout=20):
            pass
        host = parsed.netloc
        self.sock = socket.create_connection((parsed.hostname, parsed.port or 80), timeout=30)
        self.reader = self.sock.makefile('rb')
        key = base64.b64encode(os.urandom(16)).decode()
        cookie = '; '.join(c.name+'='+c.value for c in jar)
        self.sock.sendall(('GET /ws/rpc HTTP/1.1\r\nHost: '+host+'\r\nOrigin: http://'+host+'\r\nCookie: '+cookie+'\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: '+key+'\r\n\r\n').encode())
        status = self.reader.readline()
        if b' 101 ' not in status:
            raise RuntimeError('WebSocket upgrade failed')
        while self.reader.readline() != b'\r\n':
            pass
        self.next_id = 0
        result = self.rpc('initialize', {'clientInfo': {'name': 'scope_test', 'version': '1'}, 'capabilities': {'experimentalApi': True}})
        self.home = result['result']['codexHome']
        expected_home = os.environ.get('CODEX_TEST_HOME')
        if (not expected_home or not Path(expected_home).resolve().is_relative_to('/tmp')
                or Path(self.home).resolve() != Path(expected_home).resolve()):
            self.close()
            raise ValueError('CODEX_TEST_HOME must explicitly match the isolated /tmp profile')
        self.send({'method': 'initialized'})

    def exact(self, count):
        data = self.reader.read(count)
        if len(data) != count:
            raise EOFError('WebSocket closed')
        return data

    def send(self, value):
        data = json.dumps(value).encode()
        mask = os.urandom(4)
        length = len(data)
        header = bytes([0x81, 0x80|length]) if length < 126 else bytes([0x81, 0xfe])+struct.pack('!H', length)
        self.sock.sendall(header+mask+bytes(value^mask[index%4] for index, value in enumerate(data)))

    def receive(self):
        first, second = self.exact(2)
        length = second & 127
        if length == 126:
            length = struct.unpack('!H', self.exact(2))[0]
        elif length == 127:
            length = struct.unpack('!Q', self.exact(8))[0]
        return json.loads(self.exact(length))

    def rpc(self, method, params):
        self.next_id += 1
        identifier = self.next_id
        self.send({'id': identifier, 'method': method, 'params': params})
        while True:
            message = self.receive()
            if message.get('id') == identifier:
                return message

    def close(self):
        self.sock.close()
        self.reader.close()


@unittest.skipUnless(os.environ.get('CODEX_WEB_TEST_URL'), 'Set CODEX_WEB_TEST_URL to a real isolated audit server')
class RawWebSocketScopeTests(unittest.TestCase):
    def test_raw_socket_cannot_bypass_scope_and_allowed_native_rpc_still_works(self):
        client = RawSocket(os.environ['CODEX_WEB_TEST_URL'])
        try:
            for method, params in [('account/login/start', {'type': 'chatgpt'}), ('app/list', {}),
                                   ('userVerification/enroll', {}), ('plugin/share/list', {}),
                                   ('thread/resume', {'threadId': '00000000-0000-0000-0000-000000000001'}),
                                   ('thread/realtime/start', {'threadId': 'not-running', 'outputModality': 'audio'}),
                                   ('feedback/save', {'reason': 'must reject'}), ('remoteControl/enable', {}),
                                   ('thread/start', {'model': 'gpt-6-sol'}),
                                   ('thread/start', {'model': 'deepseek-flash', 'serviceTier': 'priority'}),
                                   ('config/value/write', {'keyPath': 'features.image_generation', 'value': True, 'mergeStrategy': 'replace'}),
                                   ('skills/config/write', {'path': '/tmp/custom/SKILL.md', 'enabled': True}),
                                   ('turn/start', {'threadId': 'not-running', 'input': [{'type': 'skill', 'name': 'imagegen', 'path': str(Path(client.home)/'skills/.system/imagegen/SKILL.md')} ]})]:
                with self.subTest(method=method):
                    response = client.rpc(method, params)
                    self.assertEqual(response['error']['code'], -32001)
                    self.assertEqual(response['error']['data']['type'], 'scopeExcluded')
            allowed = client.rpc('fs/readDirectory', {'path': '/tmp'})
            self.assertIn('entries', allowed['result'])
            models = client.rpc('model/list', {})
            self.assertIn('deepseek-flash', [model['model'] for model in models['result']['data']])
        finally:
            client.close()


if __name__ == '__main__':
    unittest.main()
