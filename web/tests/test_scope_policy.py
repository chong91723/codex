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
import threading
import types
import unittest
from unittest.mock import patch
import urllib.parse
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import ScopePolicy, WEB_NATIVE_OVERRIDES, config_key_parts, config_scope_reason, rpc_bridge, skill_configuration_write, validate_native_skill_inputs
from skill_packages import SkillPackages
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

    def test_native_process_ignores_persistent_chatgpt_auth_without_touching_mcp_oauth(self):
        self.assertIn('cli_auth_credentials_store="ephemeral"', WEB_NATIVE_OVERRIDES)
        self.assertIsNone(config_scope_reason('ephemeral', ('cli_auth_credentials_store',)))
        self.assertIsNone(config_scope_reason(None, ('cli_auth_credentials_store',)))
        self.assertIsNone(config_scope_reason('file', ('mcp_oauth_credentials_store',)))
        self.assertIsNone(config_scope_reason({'mcp_servers': {'owned': {'cli_auth_credentials_store': 'file'}}}))

    def test_native_config_cannot_reenable_persistent_chatgpt_auth(self):
        for value in ('file', 'keyring', 'auto'):
            with self.subTest(value=value):
                self.assertTrue(self.reason('config/value/write', {'keyPath': 'cli_auth_credentials_store', 'value': value, 'mergeStrategy': 'replace'}))
                self.assertTrue(self.reason('thread/start', {'config': {'cli_auth_credentials_store': value}}))
        self.assertIsNone(self.reason('config/value/write', {'keyPath': 'mcp_oauth_credentials_store', 'value': 'file', 'mergeStrategy': 'replace'}))

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

    def uploaded_skill(self):
        store = SkillPackages(self.home)
        record = {'id': 'a'*32, 'name': 'registered-local', 'manifest': []}
        document = store.root/record['id']/'SKILL.md'
        document.parent.mkdir(parents=True)
        document.write_text('---\nname: registered-local\ndescription: Local fixture\n---\nUse local references.\n')
        record['manifest'], _ = store._tree(record)
        store._write([record])
        return store, record, str(document)

    def test_registered_local_skill_allowed_in_inputs_and_all_config_routes(self):
        store, record, path = self.uploaded_skill()
        for method in ['turn/start', 'turn/steer', 'thread/queue/add', 'thread/queue/update']:
            with self.subTest(method=method):
                self.assertIsNone(self.reason(method, {'input': [{'type': 'skill', 'name': record['name'], 'path': path}]}))
                self.assertTrue(self.reason(method, {'input': [{'type': 'skill', 'name': 'forged', 'path': path}]}))
        self.assertIsNone(self.reason('skills/config/write', {'path': path, 'enabled': True}))
        rules = [{'path': path, 'enabled': True}]
        self.assertIsNone(self.reason('config/value/write', {'keyPath': 'skills.config', 'value': rules}))
        self.assertIsNone(self.reason('config/batchWrite', {'edits': [{'keyPath': 'skills.config', 'value': rules}]}))
        self.assertIsNone(self.reason('thread/start', {'config': {'skills': {'config': rules}}}))
        store._write([])
        for method, params in [('skills/config/write', {'path': path, 'enabled': True}),
                               ('turn/start', {'input': [{'type': 'skill', 'name': record['name'], 'path': path}]}),
                               ('config/batchWrite', {'edits': [{'keyPath': 'skills.config', 'value': rules}]})]:
            with self.subTest(removed_method=method):
                self.assertTrue(self.reason(method, params))

    def test_skill_removed_during_admission_cannot_pass_a_stale_pre_lock_check(self):
        store, record, path = self.uploaded_skill()
        sent, native, closed = [], [], []
        message = {'id': 'selected', 'method': 'turn/start', 'params': {'threadId': 'fixture',
                   'input': [{'type': 'skill', 'name': record['name'], 'path': path}]}}
        class Socket:
            def receive(self):
                if getattr(self, 'received', False):
                    raise EOFError()
                self.received = True
                return message
            def send(self, value):
                sent.append(value)
            def close(self):
                pass
        class AdmissionLock:
            def __enter__(self):
                store._write([])
            def __exit__(self, *unused):
                pass
        class Runtime:
            control = AdmissionLock()
            def open_client(self, *unused):
                return type('Client', (), {'send': lambda _, value: native.append(value)})()
            def remove_client(self, client):
                closed.append(True)
        settings = type('Settings', (), {'runtime': Runtime(), 'known_forks': object()})()
        with self.assertRaises(EOFError):
            rpc_bridge(Socket(), settings)
        self.assertEqual(native, [])
        self.assertEqual(sent[0]['error']['data']['type'], 'scopeExcluded')
        self.assertEqual(closed, [True])

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



class NativeSkillAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='codex-skill-admission-')
        self.home = Path(self.directory.name)
        self.env = patch.dict(os.environ, {'CODEX_HOME': str(self.home)})
        self.env.start()
        self.store = SkillPackages(self.home)
        self.record = {'id': 'c'*32, 'name': 'registered-local', 'manifest': []}
        document = self.store.root/self.record['id']/'SKILL.md'
        document.parent.mkdir(parents=True)
        document.write_text('---\nname: registered-local\ndescription: Local fixture\n---\nLocal.\n')
        self.record['manifest'], _ = self.store._tree(self.record)
        self.store._write([self.record])
        self.path = str(document)
        self.enabled = True
        self.status = 'idle'
        self.native, self.observer_calls, self.prepared = [], [], []
        self.control = threading.RLock()
        self.write_entered, self.write_release = threading.Event(), threading.Event()
        self.delay_write = False
        self.observer = types.SimpleNamespace(call=self.call)
        self.runtime = types.SimpleNamespace(control=self.control, observer=self.observer,
            status=lambda: {'execution': {'status': self.status}},
            open_client=lambda output, *unused: types.SimpleNamespace(send=self.send_native),
            remove_client=lambda client: None)
        self.settings = types.SimpleNamespace(runtime=self.runtime, workspace=self.home,
            known_forks=object(), memory_policy=types.SimpleNamespace(prepare=lambda *args: self.prepared.append(args)))

    def tearDown(self):
        self.env.stop()
        self.directory.cleanup()

    def send_native(self, message):
        self.native.append(message)
        if message.get('method') == 'turn/start':
            self.status = 'running'

    def call(self, method, params):
        self.observer_calls.append((method, params))
        if method == 'skills/list':
            return {'data': [{'cwd': str(self.home), 'skills': [{'name': self.record['name'],
                'path': self.path, 'enabled': self.enabled, 'description': 'Local', 'scope': 'user'}], 'errors': []}]}
        if method == 'skills/config/write':
            if self.delay_write:
                self.write_entered.set()
                if not self.write_release.wait(5):
                    raise RuntimeError('fixture write acknowledgement timeout')
            self.enabled = params['enabled']
            return {'effectiveEnabled': self.enabled}
        if method in ('config/value/write', 'config/batchWrite'):
            return {'status': 'ok', 'version': 'fixture-config-version', 'filePath': str(self.home/'config.toml'), 'overriddenMetadata': None}
        raise AssertionError('Unexpected observer call '+method)

    def message(self, method='turn/start'):
        return {'id': method, 'method': method, 'params': {'threadId': 'analysis',
            'input': [{'type': 'skill', 'name': self.record['name'], 'path': self.path}]}}

    def bridge(self, message, output):
        class Socket:
            def receive(self):
                if getattr(self, 'read_once', False):
                    raise EOFError()
                self.read_once = True
                return message
            def send(self, value):
                output.append(value)
            def close(self):
                pass
        try:
            rpc_bridge(Socket(), self.settings)
        except EOFError:
            pass

    def test_disabled_explicit_skill_rejected_on_all_input_routes_before_native_send(self):
        self.enabled = False
        for method in ['turn/start', 'turn/steer', 'thread/queue/add', 'thread/queue/update']:
            output = []
            self.bridge(self.message(method), output)
            self.assertEqual(output[0]['error']['data']['type'], 'skillUnavailable')
        self.assertEqual(self.native, [])
        self.assertEqual(self.prepared, [])
        self.assertTrue(all(params['forceReload'] is True for method, params in self.observer_calls if method == 'skills/list'))

    def test_enabled_skill_admitted_but_later_disable_is_busy_and_not_written(self):
        output = []
        self.bridge(self.message(), output)
        self.assertEqual(self.native[0]['method'], 'turn/start')
        self.assertTrue(self.prepared)
        output = []
        self.bridge({'id': 'disable', 'method': 'skills/config/write', 'params': {'path': self.path, 'enabled': False}}, output)
        self.assertEqual(output[0]['error']['data']['type'], 'userExecutionBusy')
        self.assertTrue(self.enabled)
        self.assertFalse(any(method == 'skills/config/write' for method, _ in self.observer_calls))

    def test_skill_config_write_waits_native_ack_under_shared_admission_lock(self):
        self.delay_write = True
        write_output, turn_output = [], []
        write = threading.Thread(target=self.bridge, args=({'id': 'disable', 'method': 'skills/config/write',
            'params': {'path': self.path, 'enabled': False}}, write_output))
        write.start()
        self.assertTrue(self.write_entered.wait(3))
        # Another tab cannot validate/send a turn while the disable ACK is unknown.
        self.assertFalse(self.control.acquire(blocking=False))
        turn = threading.Thread(target=self.bridge, args=(self.message(), turn_output))
        turn.start()
        self.write_release.set()
        write.join(3)
        turn.join(3)
        self.assertFalse(write.is_alive())
        self.assertFalse(turn.is_alive())
        self.assertEqual(write_output[0], {'id': 'disable', 'result': {'effectiveEnabled': False}})
        self.assertEqual(turn_output[0]['error']['data']['type'], 'skillUnavailable')
        self.assertEqual(self.native, [])

    def test_native_config_skill_mutations_are_idle_guarded_and_acknowledged(self):
        rules = [{'path': self.path, 'enabled': True}]
        operations = [('config/value/write', {'keyPath': 'skills.config', 'value': rules, 'expectedVersion': 'user-cas'}),
                      ('config/batchWrite', {'edits': [{'keyPath': 'profiles."analysis".skills', 'value': {'config': rules}}],
                                             'expectedVersion': 'user-cas', 'reloadUserConfig': True})]
        for method, params in operations:
            output = []
            self.status = 'waitingForApproval'
            self.bridge({'id': 'blocked', 'method': method, 'params': params}, output)
            self.assertEqual(output[0]['error']['data']['type'], 'userExecutionBusy')
            self.assertFalse(self.observer_calls)
            self.status = 'idle'
            output = []
            self.bridge({'id': 'write', 'method': method, 'params': params}, output)
            self.assertEqual(output[0]['id'], 'write')
            self.assertIn('result', output[0])
            self.assertEqual(self.observer_calls[-1], (method, params))
            self.observer_calls.clear()
        self.assertEqual(self.native, [])

    def test_unrelated_mcp_payload_and_bad_parameter_shapes_remain_native(self):
        self.assertFalse(skill_configuration_write('config/batchWrite', {'edits': 7}))
        self.assertFalse(skill_configuration_write('config/batchWrite', []))
        self.assertFalse(skill_configuration_write('config/value/write', {'keyPath': 'mcp_servers.owned', 'value': {'skills': {'config': []}}}))
        self.assertTrue(skill_configuration_write('config/value/write', {'keyPath': 'skills', 'value': None}))
        for method, params in [('config/batchWrite', {'edits': 7}), ('config/value/write',
            {'keyPath': 'mcp_servers.owned', 'value': {'skills': {'config': []}}})]:
            self.status = 'running'
            output = []
            self.bridge({'id': method, 'method': method, 'params': params}, output)
            self.assertEqual(self.native[-1]['params'], params)
            self.assertEqual(output, [])
        self.assertFalse(self.observer_calls)

    def test_native_validation_failure_and_exact_identity_rejected_without_turn(self):
        with patch.object(self.observer, 'call', side_effect=RuntimeError('fixture disconnected')):
            output = []
            self.bridge(self.message(), output)
            self.assertEqual(output[0]['error']['data']['type'], 'skillValidationFailed')
        mismatch = {'data': [{'skills': [{'name': self.record['name'], 'path': self.path+'-different', 'enabled': True}], 'errors': []}]}
        with patch.object(self.observer, 'call', return_value=mismatch):
            output = []
            self.bridge(self.message(), output)
            self.assertEqual(output[0]['error']['data']['type'], 'skillUnavailable')
        self.assertEqual(self.native, [])



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
