"""Knowledge lifecycle on actual SQLite; physical collector is explicitly mocked."""
from copy import deepcopy
from pathlib import Path
import json
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'web'), str(ROOT / 'web/database')]
from database_knowledge import DatabaseKnowledge, schema_hash
from service import Gateway


def physical(source):
    def column(name, comment=None):
        return {'name': name, 'dataType': 'text', 'nullable': False, 'default': None, 'comment': comment, 'position': 1}
    return {'engine': 'postgresql', 'database': source['database'], 'namespace': 'public', 'sourceId': source['id'], 'sourceVersion': source['version'],
            'observedAt': '2026-10-28T01:00:00+00:00', 'completedAt': '2026-10-28T01:00:01+00:00', 'complete': True,
            'capabilities': {'comments': True, 'foreignKeys': True}, 'warnings': [],
            'tables': [
                {'name': 'orders', 'namespace': 'public', 'kind': 'table', 'comment': 'Order header observed comment',
                 'columns': [column('id'), column('amount', 'Tax inclusive amount'), column('account_id')],
                 'primaryKey': ['id'], 'uniqueKeys': [], 'foreignKeys': [{'name': 'orders_account', 'columns': ['account_id'], 'targetNamespace': 'public', 'targetTable': 'accounts', 'targetColumns': ['id']}],
                 'indexes': [], 'properties': {}},
                {'name': 'accounts', 'namespace': 'public', 'kind': 'table', 'comment': 'Account observed comment',
                 'columns': [column('id')], 'primaryKey': ['id'], 'uniqueKeys': [], 'foreignKeys': [], 'indexes': [], 'properties': {}},
            ]}


class DatabaseKnowledgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='codex-knowledge-unit-')
        self.addCleanup(self.temp.cleanup)
        self.gateway = Gateway(self.temp.name, thread_id='fixture', turn_id='fixture-turn')
        self.source = self.gateway.store.save({'engine': 'postgresql', 'name': 'mock metadata source', 'host': '127.0.0.1', 'database': 'fixture', 'username': 'reader'})
        self.source = self.gateway.store.status(self.source, 'connected')
        self.knowledge = DatabaseKnowledge(self.gateway)
        self.catalog_value = physical(self.source)
        self.collect_patch = patch('metadata_catalog.collect_metadata', side_effect=lambda gateway, source_id: deepcopy(self.catalog_value))
        self.collect_patch.start(); self.addCleanup(self.collect_patch.stop)
        self.probe_patch = patch.object(self.gateway, 'probe', side_effect=lambda record: dict(record, status='connected'))
        self.probe_patch.start(); self.addCleanup(self.probe_patch.stop)

    def state(self):
        return self.knowledge.manage({'operation': 'state', 'sourceId': self.source['id']})

    def scan(self):
        return self.knowledge.manage({'operation': 'scan', 'sourceId': self.source['id'], 'expectedRevision': self.state()['revision']})

    def mutation(self, operation, **extra):
        state = self.state()
        return self.knowledge.manage({'operation': operation, 'sourceId': self.source['id'], 'expectedRevision': state['revision'], 'snapshotId': state['snapshot']['id'], **extra})

    def save(self, content, target=None, aspect='meaning', evidence=None):
        return self.mutation('save', target=target or {'table': 'orders', 'column': 'amount'}, aspect=aspect, content=content, evidence=evidence or [])

    def decide(self, identifier, reason='User reviewed this meaning'):
        return self.mutation('decide', id=identifier, reason=reason)

    def proposed(self, content, target=None, aspect='meaning', **extra):
        state = self.state()
        return self.knowledge.propose(self.source['id'], state['snapshot']['id'], [{'target': target or {'table': 'orders', 'column': 'amount'}, 'aspect': aspect, 'content': content, **extra}])

    def context(self, **kwargs):
        return self.knowledge.context(self.source['id'], **kwargs)

    def test_initial_scan_saves_complete_immutable_structure_and_observed_candidates(self):
        before = self.state()
        self.assertEqual((before['revision'], before['snapshot'], before['notes']), (0, None, []))
        state = self.scan()
        self.assertEqual((state['revision'], state['snapshot']['tableCount'], state['snapshot']['columnCount']), (1, 2, 4))
        self.assertEqual(len(state['notes']), 3)
        self.assertTrue(all(note['origin'] == 'observed' and note['status'] == 'pending' for note in state['notes']))
        self.assertEqual(self.context()['notes'], [])
        structure = self.knowledge.catalog(self.source['id'], 'orders')
        self.assertEqual(structure['tables'][0]['foreignKeys'][0]['columns'], ['account_id'])
        self.assertEqual(structure['tables'][0]['columns'][1]['comment'], 'Tax inclusive amount')
        self.assertIn('not instructions', structure['trust'])

    def test_user_note_never_overwrites_physical_comment_or_relationship(self):
        self.scan()
        state = self.save('User says amount excludes tax')
        note = next(note for note in state['notes'] if note['origin'] == 'user')
        self.assertEqual(note['status'], 'pending')
        self.assertEqual(len(state['conflicts']), 1)
        self.assertEqual(self.context()['notes'], [])
        accepted = self.decide(note['id'])
        self.assertEqual(accepted['conflicts'], [])
        self.assertEqual(self.context()['notes'][0]['content'], 'User says amount excludes tax')
        observed = next(note for note in accepted['notes'] if note['content'] == 'Tax inclusive amount')
        self.assertEqual(observed['status'], 'rejected')
        actual = self.knowledge.catalog(self.source['id'], 'orders')['tables'][0]
        self.assertEqual(actual['columns'][1]['comment'], 'Tax inclusive amount')
        self.assertEqual(len(actual['foreignKeys']), 1)

    def test_new_task_gateway_reuses_confirmed_source_knowledge_without_cross_source_mix(self):
        state = self.scan()
        first_note = next(note for note in state['notes'] if note['target'].get('column') == 'amount')
        self.decide(first_note['id'])
        first_before = self.state()
        other = self.gateway.store.save({'engine': 'postgresql', 'name': 'Other configured source', 'host': '127.0.0.1', 'database': 'other_fixture', 'username': 'reader'})
        other = self.gateway.store.status(other, 'connected')
        other_catalog = physical(other)
        other_catalog['tables'][0]['columns'][1]['comment'] = 'Other source has a different confirmed meaning'
        with patch('metadata_catalog.collect_metadata', return_value=other_catalog):
            other_state = self.knowledge.scan(other['id'], 0)
        other_note = next(note for note in other_state['notes'] if note['target'].get('column') == 'amount')
        self.knowledge.manage({'operation': 'decide', 'sourceId': other['id'], 'expectedRevision': other_state['revision'],
                               'snapshotId': other_state['snapshot']['id'], 'id': other_note['id'], 'reason': 'Explicit second-source acknowledgment'})

        new_task = Gateway(self.temp.name, thread_id='new-task-thread', turn_id='new-task-turn')
        shared = DatabaseKnowledge(new_task)
        with patch.object(new_task, 'probe', side_effect=lambda record: dict(record, status='connected')):
            first_context = shared.context(self.source['id'])
            other_context = shared.context(other['id'])
        self.assertNotEqual(self.gateway.thread_id, new_task.thread_id)
        self.assertEqual([first_note['id']], [note['id'] for note in first_context['notes']])
        self.assertEqual([other_note['id']], [note['id'] for note in other_context['notes']])
        self.assertTrue(all(note['sourceId'] == self.source['id'] for note in first_context['notes']))
        self.assertTrue(all(note['sourceId'] == other['id'] for note in other_context['notes']))
        self.assertEqual(first_before, shared.state(self.source['id']))
        self.assertEqual(first_before, self.state())
        self.assertEqual(first_before['snapshot']['id'], first_context['snapshot']['id'])

    def test_distinct_state_directories_do_not_expose_other_directory_knowledge(self):
        state = self.scan()
        self.decide(state['notes'][0]['id'])
        # This verifies private file-directory separation only, not tenant
        # authentication, process isolation, or authorization against the host.
        with tempfile.TemporaryDirectory(prefix='codex-separate-state-unit-') as directory:
            separate_gateway = Gateway(directory, thread_id=self.gateway.thread_id)
            separate = DatabaseKnowledge(separate_gateway)
            with self.assertRaisesRegex(ValueError, '数据源不存在'):
                separate.state(self.source['id'])
            with self.assertRaisesRegex(ValueError, '连接不存在'):
                separate.context(self.source['id'])
            same_config = separate_gateway.store.save({'engine': 'postgresql', 'name': 'Same configuration, separate state', 'host': '127.0.0.1', 'database': 'fixture', 'username': 'reader'})
            clean = separate.state(same_config['id'])
            self.assertEqual([], clean['notes'])
            self.assertIsNone(clean['snapshot'])
            self.assertEqual(0, clean['revision'])
            self.assertNotEqual(self.gateway.store.path, separate_gateway.store.path)
        self.assertEqual(1, len(self.context()['notes']))

    def test_metric_registry_and_freshness_are_shared_by_source_across_task_gateways(self):
        from metric_rules import MetricRules
        rule_definition = {
            'name': 'Shared source row-count fixture', 'table': {'name': 'fixture_records'},
            'fields': {'row_id': {'column': 'id', 'type': 'int', 'unit': '1'}}, 'recordKey': ['row_id'],
            'parameters': {}, 'ranges': [], 'filters': [], 'formulas': [],
            'measures': [{'id': 'records', 'name': 'Records', 'op': 'count', 'field': 'row_id', 'unit': '1',
                          'scale': 0, 'rounding': 'HALF_UP', 'nullPolicy': 'reject'}],
        }
        rules = MetricRules(self.gateway)
        draft = rules.manage({'operation': 'save', 'sourceId': self.source['id'], 'definition': rule_definition})['rule']
        confirmed = rules.manage({'operation': 'confirm', 'id': draft['id'], 'version': draft['version'], 'expectedHash': draft['hash'],
                                  'confirmation': {'businessOwner': 'Fixture owner', 'dataSteward': 'Fixture steward', 'note': 'Explicit management acknowledgment'}})['rule']
        original_version = self.source['version']
        self.gateway.manage('freshness', {'id': self.source['id'], 'maxAgeMinutes': 60, 'expectedRevision': 0})
        other = self.gateway.store.save({'engine': 'postgresql', 'name': 'Other independent source policy', 'host': '127.0.0.1', 'database': 'other_fixture', 'username': 'reader'})
        other = self.gateway.store.status(other, 'connected')
        new_task = Gateway(self.temp.name, thread_id='new-metric-task', turn_id='new-metric-turn')
        shared_rules = MetricRules(new_task)
        self.assertEqual([confirmed], shared_rules.available(self.source['id'])['rules'])
        self.assertEqual([], shared_rules.available(other['id'])['rules'])
        with patch.object(new_task, 'probe', side_effect=lambda record: dict(record, status='connected')):
            visible = {source['id']: source for source in new_task.available()}
        self.assertEqual(60, visible[self.source['id']]['maxAgeMinutes'])
        self.assertIsNone(visible[other['id']]['maxAgeMinutes'])
        new_task.manage('freshness', {'id': self.source['id'], 'maxAgeMinutes': 15, 'expectedRevision': 1})
        self.assertEqual(15, self.gateway.store.get(self.source['id'])['maxAgeMinutes'])
        self.assertEqual(original_version, new_task.store.get(self.source['id'])['version'])
        self.assertEqual([confirmed], rules.available(self.source['id'])['rules'])
        shared_rules.manage({'operation': 'disable', 'id': confirmed['id'], 'version': confirmed['version'], 'expectedHash': confirmed['hash']})
        self.assertEqual([], rules.available(self.source['id'])['rules'])
        with tempfile.TemporaryDirectory(prefix='codex-separate-rule-state-unit-') as directory:
            separate_gateway = Gateway(directory, thread_id=self.gateway.thread_id)
            self.assertEqual([], MetricRules(separate_gateway).manage({'operation': 'list'})['rules'])
            with self.assertRaisesRegex(ValueError, '连接不存在'):
                separate_gateway.store.get(self.source['id'])

    def test_quoted_physical_names_keep_spaces_and_distinct_scope(self):
        spaced = deepcopy(self.catalog_value['tables'][0])
        spaced['name'] = ' orders '
        spaced['columns'][1]['name'] = ' amount '
        self.catalog_value['tables'].append(spaced)
        state = self.scan()
        target = {'table': ' orders ', 'column': ' amount '}
        observed = next(note for note in state['notes'] if note['target'] == target)
        self.decide(observed['id'])
        selected = self.context(table=' orders ')['notes']
        self.assertEqual([target], [note['target'] for note in selected])
        self.assertEqual([], self.context(table='orders')['notes'])
        state = self.save('User interpretation of spaced identifier', target=target)
        self.assertEqual(1, len(state['conflicts']))
        self.assertEqual(target, state['conflicts'][0]['target'])
        structure = self.knowledge.catalog(self.source['id'], ' orders ')
        self.assertEqual(' amount ', structure['tables'][0]['columns'][1]['name'])

    def test_unrepresentable_comment_preserves_physical_snapshot_and_blocks_silent_override(self):
        unusual = 'Original comment with\x00embedded NUL'
        self.catalog_value['tables'][0]['columns'][1]['comment'] = unusual
        state = self.scan()
        self.assertTrue(state['snapshot']['complete'])
        self.assertEqual(2, len(state['notes']))
        self.assertTrue(any('格式限制' in warning for warning in state['snapshot']['warnings']))
        structure = self.knowledge.catalog(self.source['id'], 'orders')
        self.assertEqual(unusual, structure['tables'][0]['columns'][1]['comment'])
        with self.assertRaisesRegex(ValueError, '知识内容'):
            self.save('Different meaning cannot hide unregistered physical comment')
        self.assertEqual(state['revision'], self.state()['revision'])

    def test_cancel_during_manual_save_rolls_back_candidate(self):
        from cancellation import Cancelled
        self.scan()
        before = self.state()
        write_note = self.knowledge._write_note
        def cancelling_write(database, note):
            write_note(database, note)
            self.gateway.cancel.cancel()
        with patch.object(self.knowledge, '_write_note', side_effect=cancelling_write):
            with self.assertRaises(Cancelled):
                self.save('Cancelled candidate must not be committed')
        self.assertEqual(before['revision'], self.state()['revision'])
        self.assertEqual(before['notes'], self.state()['notes'])

    def test_new_agent_difference_blocks_accepted_until_user_rejects(self):
        state = self.scan()
        original = next(note for note in state['notes'] if note['content'] == 'Tax inclusive amount')
        self.decide(original['id'])
        response = self.proposed('Amount excludes tax')
        self.assertEqual(response['decision'], 'pendingUserReview')
        context = self.context()
        self.assertEqual(context['notes'], [])
        self.assertEqual(len(context['blockedConflicts']), 1)
        self.assertEqual({note['origin'] for note in context['blockedConflicts'][0]['candidates']}, {'observed', 'agent'})
        rejected = self.mutation('reject', id=response['proposedIds'][0], reason='Customer confirmed inclusive amounts')
        self.assertEqual(rejected['conflicts'], [])
        self.assertEqual(self.context()['notes'][0]['id'], original['id'])

    def test_selecting_agent_candidate_requires_user_action_and_preserves_prior(self):
        state = self.scan()
        original = next(note for note in state['notes'] if note['content'] == 'Tax inclusive amount')
        self.decide(original['id'])
        candidate = self.proposed('Amount excludes tax')['proposedIds'][0]
        chosen = self.decide(candidate)
        self.assertEqual(self.context()['notes'][0]['id'], candidate)
        old = next(note for note in chosen['notes'] if note['id'] == original['id'])
        self.assertEqual(old['status'], 'superseded')
        self.assertEqual(old['content'], 'Tax inclusive amount')
        self.assertEqual(old['history'][-1]['winnerId'], candidate)
        self.assertEqual(next(note for note in chosen['notes'] if note['id'] == candidate)['origin'], 'agent')

    def test_agent_cannot_supply_approval_status_origin_or_decision(self):
        self.scan()
        before = self.state()
        for injected in ({'status': 'accepted'}, {'origin': 'user'}, {'operation': 'decide'}, {'decision': 'accepted'}):
            with self.subTest(injected=injected), self.assertRaisesRegex(ValueError, '审批参数'):
                self.proposed('Model text', **injected)
        self.assertEqual(self.state()['revision'], before['revision'])
        self.assertEqual(self.state()['notes'], before['notes'])
        self.assertEqual(self.context()['notes'], [])

    def test_exact_dedup_does_not_reopen_rejected_agent_candidate(self):
        self.scan()
        first = self.proposed('Candidate meaning')
        second = self.proposed('Candidate meaning')
        self.assertEqual(first['revision'], second['revision'])
        self.assertEqual(first['proposedIds'], second['proposedIds'])
        self.mutation('reject', id=first['proposedIds'][0], reason='Incorrect meaning')
        before = self.state()
        third = self.proposed('Candidate meaning')
        self.assertEqual(third['proposedIds'], first['proposedIds'])
        self.assertEqual(third['decision'], 'noChange')
        self.assertEqual(third['outcomes'][0]['status'], 'rejected')
        self.assertEqual(self.state()['revision'], before['revision'])
        self.assertEqual(next(note for note in self.state()['notes'] if note['id'] == first['proposedIds'][0])['status'], 'rejected')

    def test_merge_creates_new_user_version_and_preserves_both_contents(self):
        state = self.scan()
        original = next(note for note in state['notes'] if note['content'] == 'Tax inclusive amount')
        self.decide(original['id'])
        candidate = self.proposed('Tax included only for domestic orders', evidence=[{'table': 'orders', 'column': 'id'}])['proposedIds'][0]
        merged = self.mutation('merge', ids=[original['id'], candidate], content='Amount includes tax for domestic orders; other cases require review', reason='Customer reconciled both statements')
        accepted = [note for note in merged['notes'] if note['status'] == 'accepted']
        self.assertEqual(len(accepted), 1)
        self.assertEqual(accepted[0]['origin'], 'user')
        self.assertEqual(accepted[0]['parentIds'], [original['id'], candidate])
        self.assertEqual(merged['conflicts'], [])
        self.assertTrue(all(note['status'] in ('superseded', 'rejected') for note in merged['notes'] if note['id'] in (original['id'], candidate)))
        with self.assertRaisesRegex(ValueError, '同一对象'):
            self.mutation('merge', ids=[accepted[0]['id'], next(note['id'] for note in merged['notes'] if note['target'] == {'table': 'accounts'})], content='Invalid cross-topic merge', reason='not allowed')

    def test_rejecting_accepted_note_disables_it_without_deleting_history(self):
        state = self.scan()
        identifier = state['notes'][0]['id']
        self.decide(identifier)
        rejected = self.mutation('reject', id=identifier, reason='No longer suitable')
        self.assertEqual(self.context()['notes'], [])
        self.assertEqual(len(rejected['notes']), 3)
        with self.assertRaisesRegex(ValueError, '已关闭'):
            self.decide(identifier)

    def test_identical_rescan_ignores_times_and_keeps_confirmed_current(self):
        state = self.scan()
        identifier = state['notes'][0]['id']
        self.decide(identifier)
        old = self.state()
        self.catalog_value['observedAt'] = '2026-10-28T02:00:00+00:00'
        self.catalog_value['completedAt'] = '2026-10-28T02:00:02+00:00'
        self.catalog_value['warnings'] = ['Runtime observation only']
        fresh = self.scan()
        self.assertNotEqual(fresh['snapshot']['id'], old['snapshot']['id'])
        self.assertEqual(fresh['snapshot']['schemaHash'], old['snapshot']['schemaHash'])
        self.assertEqual(len(fresh['notes']), len(old['notes']))
        self.assertFalse(next(note for note in fresh['notes'] if note['id'] == identifier)['stale'])
        self.assertEqual(self.context()['notes'][0]['id'], identifier)
        with self.store_connection() as database:
            self.assertEqual(database.execute('SELECT COUNT(*) FROM database_schema_snapshots').fetchone()[0], 2)

    def store_connection(self):
        return self.gateway.store.connect()

    def test_schema_change_stales_accepted_and_reconfirm_clones_new_binding(self):
        state = self.scan()
        original = state['notes'][0]
        self.decide(original['id'])
        self.catalog_value['tables'][0]['columns'].append({'name': 'new_field', 'dataType': 'int', 'nullable': True, 'default': None, 'comment': None, 'position': 4})
        fresh = self.scan()
        old = next(note for note in fresh['notes'] if note['id'] == original['id'])
        self.assertTrue(old['stale'])
        self.assertEqual(self.context()['notes'], [])
        chosen = self.decide(original['id'])
        accepted = [note for note in chosen['notes'] if note['status'] == 'accepted']
        self.assertEqual(len(accepted), 1)
        self.assertNotEqual(accepted[0]['id'], original['id'])
        self.assertEqual(accepted[0]['schemaHash'], fresh['snapshot']['schemaHash'])
        self.assertEqual(accepted[0]['parentIds'], [original['id']])
        self.assertEqual(next(note for note in chosen['notes'] if note['id'] == original['id'])['status'], 'superseded')
        self.assertEqual(self.context()['notes'][0]['id'], accepted[0]['id'])

    def test_removed_field_cannot_be_reconfirmed_as_a_current_fact(self):
        state = self.scan()
        original = next(note for note in state['notes'] if note['target'].get('column') == 'amount')
        self.decide(original['id'])
        self.catalog_value['tables'][0]['columns'] = [column for column in self.catalog_value['tables'][0]['columns'] if column['name'] != 'amount']
        self.scan()
        with self.assertRaisesRegex(ValueError, '目标字段'):
            self.decide(original['id'])
        self.assertEqual(self.context()['notes'], [])

    def test_connection_version_change_requires_new_scan_and_reconfirmation(self):
        state = self.scan()
        identifier = state['notes'][0]['id']
        self.decide(identifier)
        updated = self.gateway.store.save(self.source)
        self.source = self.gateway.store.status(updated, 'connected')
        self.assertTrue(self.state()['stale'])
        self.assertTrue(self.context()['requiresScan'])
        self.assertEqual(self.context()['notes'], [])
        with self.assertRaisesRegex(ValueError, '重新探索'):
            self.decide(identifier)
        old_hash = self.state()['snapshot']['schemaHash']
        self.catalog_value['sourceVersion'] = self.source['version']
        fresh = self.scan()
        self.assertEqual(fresh['snapshot']['schemaHash'], old_hash)
        self.assertTrue(next(note for note in fresh['notes'] if note['id'] == identifier)['stale'])
        self.decide(identifier)
        self.assertEqual(self.context()['notes'][0]['sourceVersion'], self.source['version'])

    def test_temporary_unavailability_keeps_ui_history_but_context_fails(self):
        state = self.scan()
        self.decide(state['notes'][0]['id'])
        self.gateway.store.status(self.source, 'failed', 'fixture offline')
        offline = self.state()
        self.assertFalse(offline['sourceAvailable'])
        self.assertFalse(offline['notes'][0]['stale'])
        self.assertEqual(self.knowledge.catalog(self.source['id'])['total'], 2)
        with self.assertRaises(ValueError):
            self.context()
        self.gateway.store.status(self.source, 'connected')
        self.assertEqual(len(self.context()['notes']), 1)
        self.gateway.store.remove(self.source['id'])
        self.assertTrue(self.state()['stale'])
        with self.assertRaises(ValueError):
            self.context()

    def test_context_checks_actual_probe_and_a_configuration_race(self):
        self.scan()
        with patch.object(self.gateway, 'probe', return_value=dict(self.source, status='failed')):
            with self.assertRaisesRegex(ValueError, '当前无法连接'):
                self.context()
        def race(record):
            self.gateway.store.toggle(record['id'], False)
            return dict(record, status='connected')
        with patch.object(self.gateway, 'probe', side_effect=race), self.assertRaisesRegex(ValueError, '读取知识期间'):
            self.context()

    def test_cas_prevents_old_snapshot_or_revision_decisions_and_cross_source_ids(self):
        state = self.scan()
        original = state['notes'][0]
        self.save('Customer-specific unit', aspect='unit')
        with self.assertRaisesRegex(ValueError, '其他操作'):
            self.knowledge.manage({'operation': 'decide', 'sourceId': self.source['id'], 'expectedRevision': state['revision'], 'snapshotId': state['snapshot']['id'], 'id': original['id'], 'reason': 'Old screen'})
        latest = self.state()
        self.scan()
        with self.assertRaisesRegex(ValueError, '快照已更新'):
            self.knowledge.propose(self.source['id'], latest['snapshot']['id'], [{'target': {}, 'aspect': 'meaning', 'content': 'Stale model context'}])
        other = self.gateway.store.save({'engine': 'postgresql', 'name': 'other', 'host': '127.0.0.1', 'database': 'other', 'username': 'reader'})
        other = self.gateway.store.status(other, 'connected')
        with self.assertRaisesRegex(ValueError, '快照已更新'):
            self.knowledge.propose(other['id'], self.state()['snapshot']['id'], [{'target': {}, 'aspect': 'meaning', 'content': 'Wrong source'}])
        self.assertEqual(self.knowledge.state(other['id'])['notes'], [])
        with self.assertRaisesRegex(ValueError, '快照编号'):
            self.knowledge.propose(self.source['id'], None, [{'target': {}, 'aspect': 'meaning', 'content': 'Missing snapshot'}])

    def test_scan_race_does_not_overwrite_new_knowledge_or_connection(self):
        self.scan()
        before = self.state()
        def collect_with_edit(gateway, source_id):
            self.save('Concurrent note', aspect='quality')
            return deepcopy(self.catalog_value)
        with patch('metadata_catalog.collect_metadata', side_effect=collect_with_edit), self.assertRaisesRegex(ValueError, '其他操作'):
            self.knowledge.scan(self.source['id'], before['revision'])
        self.assertEqual(self.state()['snapshot']['id'], before['snapshot']['id'])
        self.assertTrue(any(note['content'] == 'Concurrent note' for note in self.state()['notes']))
        def collect_with_config_change(gateway, source_id):
            current = self.gateway.store.save(self.source)
            self.gateway.store.status(current, 'connected')
            return deepcopy(self.catalog_value)
        with patch('metadata_catalog.collect_metadata', side_effect=collect_with_config_change), self.assertRaisesRegex(ValueError, '连接配置已变化'):
            self.scan()
        self.assertEqual(self.state()['snapshot']['id'], before['snapshot']['id'])

    def test_incomplete_or_duplicate_physical_metadata_never_replaces_snapshot(self):
        original = self.scan()
        self.catalog_value['complete'] = False
        with self.assertRaisesRegex(ValueError, '未完整'):
            self.scan()
        self.catalog_value['complete'] = True
        self.catalog_value['tables'].append(deepcopy(self.catalog_value['tables'][0]))
        with self.assertRaisesRegex(ValueError, '名称重复'):
            self.scan()
        self.assertEqual(self.state()['snapshot']['id'], original['snapshot']['id'])

    def test_note_capacity_preserves_full_schema_and_surfaces_omitted_comments(self):
        with patch('database_knowledge.MAX_NOTES', 2):
            state = self.scan()
            self.assertEqual(len(state['notes']), 2)
            self.assertTrue(any('1 条' in warning for warning in state['snapshot']['warnings']))
            self.assertEqual(state['snapshot']['columnCount'], 4)
            self.assertEqual(self.knowledge.catalog(self.source['id'], 'accounts')['tables'][0]['comment'], 'Account observed comment')
            # Automatic observations do not consume the editable topic budget.
            state=self.save('Different account meaning', target={'table':'accounts'})
            self.assertEqual(len(state['conflicts']),1)
            self.assertEqual(state['snapshot']['columnCount'],4)
            state=self.save('Separate rule',target={'table':'orders'},aspect='scope')
            with self.assertRaisesRegex(ValueError,'容量上限'):
                self.save('Third topic',target={'table':'orders'},aspect='units')
            # Closing a user topic frees active capacity without deleting history.
            note=next(note for note in state['notes'] if note['content']=='Separate rule')
            self.mutation('reject',id=note['id'],reason='No longer applicable')
            self.save('Third topic',target={'table':'orders'},aspect='units')

    def test_large_exploration_does_not_block_repeated_corrections(self):
        for index in range(510):
            self.catalog_value['tables'][0]['columns'].append({'name':'extra_'+str(index),'dataType':'text','nullable':True,'comment':'Physical comment '+str(index),'position':index+4})
        state=self.scan();self.assertEqual(len(state['notes']),500)
        note=next(note for note in state['notes'] if note['target']=={'table':'orders','column':'amount'})
        self.decide(note['id'])
        for content in ['Reviewed amount definition','Corrected amount definition']:
            state=self.state()
            state=self.knowledge.correct(self.source['id'],state['snapshot']['id'],{'kind':'note','id':note['id']},content,expected_revision=state['revision'])
            note=next(note for note in state['notes'] if note['content']==content)
            self.decide(note['id'])
        context=self.context(table='orders')
        self.assertTrue(any(note['content']=='Corrected amount definition' for note in context['notes']))
        self.assertTrue(any(note['content']=='Tax inclusive amount' for note in self.state()['notes']))

    def test_proposal_batch_is_atomic_and_bounded_and_targets_are_valid(self):
        self.scan()
        before = self.state()
        valid = {'target': {'table': 'orders'}, 'aspect': 'grain', 'content': 'One row per order'}
        invalid = {'target': {'table': 'private_unconfigured'}, 'aspect': 'meaning', 'content': 'Wrong source'}
        with self.assertRaisesRegex(ValueError, '目标表'):
            self.knowledge.propose(self.source['id'], before['snapshot']['id'], [valid, invalid])
        self.assertEqual(self.state()['notes'], before['notes'])
        with self.assertRaisesRegex(ValueError, '一至十'):
            self.knowledge.propose(self.source['id'], before['snapshot']['id'], [valid] * 11)
        with self.assertRaisesRegex(ValueError, '目标字段'):
            self.proposed('Bad evidence', evidence=[{'table': 'orders', 'column': 'missing'}])
        self.assertEqual(self.state()['revision'], before['revision'])

    def test_context_only_same_structured_topic_conflicts_no_natural_language_claim(self):
        state = self.scan()
        original = next(note for note in state['notes'] if note['target'].get('column') == 'amount')
        self.decide(original['id'])
        different = self.proposed('Tax excluded', aspect='business_rule')['proposedIds'][0]
        self.decide(different)
        self.assertEqual(self.state()['conflicts'], [])
        self.assertEqual(len(self.context()['notes']), 2)
        self.assertIn('no claim of complete natural-language', self.context()['trust'])
        self.proposed('Tax excluded', aspect='meaning')
        context = self.context(search='inclusive')
        self.assertEqual(context['notes'], [])
        self.assertEqual(len(context['blockedConflicts']), 1)

    def test_catalog_pages_tables_and_columns_without_silent_omission(self):
        for index in range(102):
            self.catalog_value['tables'][0]['columns'].append({'name': 'extra_'+str(index), 'dataType': 'text', 'nullable': True, 'default': None, 'comment': None, 'position': index+4})
        self.scan()
        page = self.knowledge.catalog(self.source['id'], limit=1)
        self.assertEqual((page['pageKind'], page['total'], page['hasMore']), ('tables', 2, True))
        self.assertNotIn('columns', page['tables'][0])
        first = self.knowledge.catalog(self.source['id'], 'orders', limit=100)
        tail = self.knowledge.catalog(self.source['id'], 'orders', offset=100, limit=100)
        self.assertEqual((first['total'], len(first['tables'][0]['columns']), first['hasMore']), (105, 100, True))
        self.assertEqual((len(tail['tables'][0]['columns']), tail['hasMore']), (5, False))
        search = self.knowledge.catalog(self.source['id'], 'orders', search='INCLUSIVE')
        self.assertEqual(search['total'], 1)
        self.assertEqual(search['tables'][0]['columns'][0]['name'], 'amount')
        for args in ({'limit': 0}, {'limit': 101}, {'offset': -1}, {'offset': True}):
            with self.assertRaises(ValueError):
                self.knowledge.catalog(self.source['id'], **args)

    def test_snapshot_tampering_and_cancel_fail_without_new_success(self):
        state = self.scan()
        with self.store_connection() as database:
            row = database.execute('SELECT record FROM database_schema_snapshots WHERE id=?', (state['snapshot']['id'],)).fetchone()
            changed = json.loads(row[0]); changed['catalog']['tables'][0]['comment'] = 'Forged actual structure'
            database.execute('UPDATE database_schema_snapshots SET record=? WHERE id=?', (json.dumps(changed), state['snapshot']['id']))
        with self.assertRaisesRegex(ValueError, '指纹'):
            self.state()
        # Cancellation is checked before acquiring the write transaction.
        self.gateway.cancel.cancel()
        with self.assertRaisesRegex(ValueError, '取消'):
            self.knowledge.propose(self.source['id'], state['snapshot']['id'], [{'target': {}, 'aspect': 'meaning', 'content': 'Cancelled'}])


if __name__ == '__main__':
    unittest.main()
