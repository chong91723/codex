"""Collector failure boundaries with synthetic adapter responses; no model/network."""
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'web/database'))
import metadata_catalog as catalog
from cancellation import Cancellation, Cancelled


class MetadataCatalogTests(unittest.TestCase):
    def setUp(self):
        self.cancel = Cancellation()

    def test_paging_keeps_columns_beyond_old_501_limit(self):
        adapter = Mock(spec=['execute', 'cancel', 'close'])
        adapter.execute.side_effect = [(None, [{'i': i} for i in range(500)]), (None, [{'i': i} for i in range(500, 1000)]), (None, [{'i': 1000}])]
        values = list(catalog._pages(adapter, 'SELECT actual FROM metadata ORDER BY actual', ('scope',), self.cancel))
        self.assertEqual(list(range(1001)), [row['i'] for row in values])
        self.assertTrue(adapter.execute.call_args_list[2].args[0].endswith('LIMIT 500 OFFSET 1000'))
        self.assertEqual(('scope',), adapter.execute.call_args_list[2].args[1])

    def test_over_budget_and_adapter_truncation_fail_explicitly(self):
        adapter = Mock(spec=['execute', 'cancel', 'close'])
        adapter.execute.return_value = (None, [{}] * 501)
        with self.assertRaisesRegex(catalog.DatabaseError, '超出请求'):
            list(catalog._pages(adapter, 'SELECT', (), self.cancel))
        adapter.execute.side_effect = [(None, [{}] * 500), (None, [{}])]
        with self.assertRaisesRegex(catalog.DatabaseError, '超过探索预算'):
            list(catalog._pages(adapter, 'SELECT', (), self.cancel, maximum=500))

    def test_cancellation_and_time_budget_stop_before_next_page(self):
        adapter = Mock(spec=['execute', 'cancel', 'close'])
        self.cancel.cancel()
        with self.assertRaises(Cancelled):
            list(catalog._pages(adapter, 'SELECT', (), self.cancel))
        adapter.execute.assert_not_called()
        adapter._exploration_deadline = 0
        with self.assertRaisesRegex(catalog.DatabaseError, '时间预算'):
            list(catalog._pages(adapter, 'SELECT', (), Cancellation()))
        adapter.execute.assert_not_called()

    def test_elasticsearch_runtime_shadow_preserves_mapping_and_hash(self):
        mapping = {'only-index': {'mappings': {'properties': {'amount': {'type': 'long'}, 'items': {'type': 'nested', 'properties': {'name': {'type': 'text', 'fields': {'raw': {'type': 'keyword'}}}}}}, 'runtime': {'amount': {'type': 'double', 'script': {'source': 'emit(1)'}}, 'calculated': {'type': 'keyword'}}}}}
        adapter = SimpleNamespace(index='only-index', cancel=lambda: None, request=Mock(return_value=mapping))
        tables, capabilities, warnings = catalog._elasticsearch(adapter, {'database': 'only-index'}, self.cancel)
        cols = {column['name']: column for column in tables[0]['columns']}
        self.assertEqual(len(cols), len(tables[0]['columns']))
        self.assertEqual('long', cols['amount']['mappedField']['dataType'])
        self.assertEqual('double', cols['amount']['dataType'])
        self.assertEqual('runtime', cols['amount']['kind'])
        self.assertEqual('runtime', cols['calculated']['kind'])
        self.assertEqual('multi_field', cols['items.name.raw']['kind'])
        self.assertEqual('items.name', cols['items.name.raw']['parentField'])
        self.assertNotIn('emit(1)', repr(tables))
        self.assertTrue(capabilities['runtimeFields'])
        adapter.request.assert_called_once_with('/only-index/_mapping')
        before = cols['amount']['runtimeDefinitionHash']
        mapping['only-index']['mappings']['runtime']['amount']['script']['source'] = 'emit(2)'
        changed, _, _ = catalog._elasticsearch(adapter, {'database': 'only-index'}, self.cancel)
        self.assertNotEqual(before, next(col for col in changed[0]['columns'] if col['name'] == 'amount')['runtimeDefinitionHash'])

    def test_elasticsearch_budget_never_returns_partial_catalog(self):
        adapter = SimpleNamespace(index='scope', cancel=lambda: None, request=lambda path: {'scope': {'mappings': {'properties': {'a': {'type': 'long'}, 'b': {'type': 'long'}}}}})
        with patch.object(catalog, 'MAX_COLUMNS', 1):
            with self.assertRaisesRegex(catalog.DatabaseError, '预算'):
                catalog._elasticsearch(adapter, {'database': 'scope'}, self.cancel)

    def test_source_change_and_failure_always_close_connection(self):
        source = {'engine': 'postgresql', 'database': 'fixture', 'schema': 'public', 'version': 1}
        adapter = Mock(spec=['execute', 'cancel', 'close'])
        gateway = SimpleNamespace(require=Mock(side_effect=[source, dict(source, version=2)]), cancel=self.cancel)
        with patch.object(catalog, 'connect', return_value=adapter), patch.dict(catalog.COLLECTORS, postgresql=lambda *args: ([], {}, [])):
            with self.assertRaisesRegex(catalog.DatabaseError, '配置已变化'):
                catalog.collect_metadata(gateway, 'source-a')
        adapter.close.assert_called_once()
        adapter.reset_mock()
        gateway.require = Mock(return_value=source)
        with patch.object(catalog, 'connect', return_value=adapter), patch.dict(catalog.COLLECTORS, postgresql=Mock(side_effect=RuntimeError('read failed'))):
            with self.assertRaisesRegex(RuntimeError, 'read failed'):
                catalog.collect_metadata(gateway, 'source-a')
        adapter.close.assert_called_once()

    def test_success_binds_source_and_does_not_claim_inferred_relationships(self):
        source = {'engine': 'clickhouse', 'database': 'fixture', 'version': 7}
        gateway = SimpleNamespace(require=Mock(return_value=source), cancel=self.cancel)
        adapter = Mock(spec=['execute', 'cancel', 'close'])
        table = catalog._table('events', 'fixture', 'MergeTree')
        with patch.object(catalog, 'connect', return_value=adapter), patch.dict(catalog.COLLECTORS, clickhouse=lambda *args: ([table], {'foreignKeys': False}, ['No inferred foreign keys'])):
            result = catalog.collect_metadata(gateway, 'source-b')
        self.assertEqual('source-b', result['sourceId'])
        self.assertEqual(7, result['sourceVersion'])
        self.assertTrue(result['complete'])
        self.assertEqual([], result['tables'][0]['foreignKeys'])
        self.assertFalse(result['capabilities']['foreignKeys'])
        self.assertIn('observedAt', result)
        adapter.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
