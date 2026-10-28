"""Metric contract behavior with actual Parquet/SQLite and a mocked database adapter.

These are deterministic backend tests, not actual model or network verification.
The separate metric-demo browser fixture uses an actual isolated PostgreSQL server.
"""
from copy import deepcopy
from datetime import date
from decimal import Decimal
from fractions import Fraction
import json
from pathlib import Path
import sys
import tempfile
import threading
from contextlib import contextmanager
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'web'), str(ROOT / 'web/database')]
from data_freshness import receipt
from service import Gateway
from metric_rules import MetricRules, validate_definition, rounded, digest, decimal_fraction


def definition():
    return {
        'name': 'Independent unit fixture', 'table': {'name': 'fixture_records'},
        'fields': {
            'row_key': {'column': 'id', 'type': 'text', 'unit': '1'},
            'amount': {'column': 'amount_value', 'type': 'decimal', 'unit': 'CNY'},
            'base': {'column': 'base_value', 'type': 'decimal', 'unit': 'CNY'},
            'day': {'column': 'business_day', 'type': 'date', 'unit': '1'},
            'tag': {'column': 'status', 'type': 'text', 'unit': '1'},
        },
        'recordKey': ['row_key'],
        'parameters': {'start': {'type': 'date'}, 'end': {'type': 'date'}},
        'ranges': [{'start': 'start', 'end': 'end'}],
        'filters': [
            {'field': 'day', 'op': 'gte', 'parameter': 'start'},
            {'field': 'day', 'op': 'lt', 'parameter': 'end'},
            {'field': 'tag', 'op': 'eq', 'value': 'eligible'},
        ],
        'measures': [
            {'id': 'total', 'name': 'Total amount', 'op': 'sum', 'field': 'amount', 'unit': 'CNY', 'scale': 2, 'rounding': 'HALF_UP', 'nullPolicy': 'reject'},
            {'id': 'base_total', 'name': 'Total denominator', 'op': 'sum', 'field': 'base', 'unit': 'CNY', 'scale': 2, 'rounding': 'HALF_UP', 'nullPolicy': 'reject'},
            {'id': 'records', 'name': 'Records', 'op': 'count', 'field': 'row_key', 'unit': '1', 'scale': 0, 'rounding': 'HALF_UP', 'nullPolicy': 'reject'},
        ],
        'formulas': [
            {'id': 'ratio', 'name': 'Ratio percent', 'expression': 'total / base_total * 100', 'unit': '%', 'scale': 2, 'rounding': 'HALF_UP', 'zeroDivision': 'null'},
        ],
    }


class MetricRulesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='codex-metric-unit-')
        self.addCleanup(self.temp.cleanup)
        self.gateway = Gateway(self.temp.name, thread_id='fixture-thread', turn_id='fixture-turn')
        self.source = self.gateway.store.save({'engine': 'postgresql', 'name': 'mock adapter only', 'host': '127.0.0.1', 'database': 'fixture', 'username': 'reader'})
        self.source = self.gateway.store.status(self.source, 'connected')
        self.rules = MetricRules(self.gateway)
        self.rows = [self.row('a', '0.10', '0.30'), self.row('b', '0.20', '0.70')]
        self.native_types = {}
        self.queries = []
        self.params = {'start': '2026-01-01', 'end': '2026-02-01'}
        self.current_definition = definition()
        self.query_patch = patch.object(self.gateway, 'query', side_effect=self.query)
        self.query_patch.start()
        self.addCleanup(self.query_patch.stop)
        self.probe_patch = patch.object(self.gateway, 'probe', side_effect=lambda record: dict(record, status='connected'))
        self.probe_patch.start()
        self.addCleanup(self.probe_patch.stop)

    @staticmethod
    def row(key, amount, base, day='2026-01-15', tag='eligible'):
        return {'row_key': key, 'amount': None if amount is None else Decimal(amount), 'base': None if base is None else Decimal(base), 'day': date.fromisoformat(day), 'tag': tag}

    def query(self, source_id, sql):
        self.queries.append(sql)
        columns = []
        for alias, field in sorted(self.current_definition['fields'].items()):
            native = self.native_types.get(alias, {'decimal': 'Decimal', 'int': 'int', 'text': 'str', 'date': 'date'}[field['type']])
            columns.append({'name': alias, 'type': 'number' if native in ('Decimal', 'int', 'float') else 'string', 'nativeType': native})
        source = self.gateway.require(source_id)
        metadata = {'connectionId': source_id, 'connectionName': source['name'], 'connectionVersion': source['version'], 'engine': source['engine'],
                    'connectionDependencies': [{'id': source_id, 'version': source['version']}], 'query': sql, 'executedQuery': sql,
                    'acquisition': [receipt('database', self.gateway.thread_id, self.gateway.turn_id, source_id)]}
        return self.gateway.snapshots.write(metadata, iter([(columns, self.rows)]))

    def draft(self, value=None, old=None):
        self.current_definition = deepcopy(value or definition())
        payload = {'operation': 'save', 'sourceId': self.source['id'], 'definition': self.current_definition}
        if old:
            payload.update(id=old['id'], expectedVersion=old['version'])
        return self.rules.manage(payload)['rule']

    def confirm(self, draft):
        return self.rules.manage({'operation': 'confirm', 'id': draft['id'], 'version': draft['version'], 'expectedHash': draft['hash'],
                                  'confirmation': {'businessOwner': 'Declared owner', 'dataSteward': 'Declared steward', 'note': 'Fixture acknowledgment only'}})['rule']

    def confirmed(self, value=None):
        return self.confirm(self.draft(value))

    def execute(self, record=None, parameters=None):
        record = record or self.confirmed()
        return self.rules.execute(record['id'], record['version'], self.params if parameters is None else parameters)

    def data(self, result):
        return self.gateway.snapshots.page(result['resultId'])['rows']

    def write_metadata(self, metadata):
        path = self.gateway.snapshots.path(metadata['resultId']).with_suffix('.json')
        path.write_text(json.dumps(metadata))

    def corrupt_cell(self, result_id, column, value):
        import pyarrow as pa
        import pyarrow.parquet as pq
        path = self.gateway.snapshots.path(result_id)
        table = pq.read_table(path)
        values = table[column].to_pylist()
        values[0] = value
        table = table.set_column(table.column_names.index(column), column, pa.array(values, type=pa.string()))
        pq.write_table(table, path)

    def test_definition_acknowledgment_is_explicit_and_versioned(self):
        draft = self.draft()
        self.assertEqual(draft['status'], 'draft')
        self.assertEqual(self.rules.available()['rules'], [])
        with self.assertRaisesRegex(ValueError, '未确认'):
            self.execute(draft)
        with self.assertRaises(ValueError):
            self.rules.manage({'operation': 'confirm', 'id': draft['id'], 'version': 1, 'expectedHash': draft['hash'], 'confirmation': {'businessOwner': 'owner'}})
        record = self.confirm(draft)
        self.assertIn('not verified identities', record['confirmationScope'])
        self.assertEqual(len(self.rules.available(self.source['id'])['rules']), 1)
        changed = self.draft(old=record)
        self.assertEqual(changed['version'], 2)
        self.assertEqual(self.rules.available()['rules'], [])
        with self.assertRaisesRegex(ValueError, '版本|指纹'):
            self.confirm(draft)
        with self.assertRaisesRegex(ValueError, '重新加载'):
            self.draft(old=record)
        with self.rules.store.connect() as database:
            self.assertEqual(database.execute('SELECT COUNT(*) FROM metric_rules').fetchone()[0], 2)

    def test_exact_actual_snapshot_pipeline_and_formula_trace(self):
        result = self.execute()
        self.assertEqual(self.data(result), [{'total': '0.30', 'base_total': '1.00', 'records': '2', 'ratio': '30.00'}])
        self.assertEqual(len(self.queries), 1)
        self.assertNotIn('WHERE', self.queries[0])
        self.assertNotIn('SUM', self.queries[0])
        self.assertIn('"amount_value" AS "amount"', self.queries[0])
        columns = self.rules.verify(result, set())
        self.assertEqual(columns['ratio']['unit'], '%')
        self.assertEqual(columns['ratio']['rows'][0]['node']['inputs']['total'], {'numerator': '3', 'denominator': '10'})
        self.assertEqual(columns['ratio']['rows'][0]['node']['exact'], {'numerator': '30', 'denominator': '1'})
        self.assertEqual(columns['total']['rows'][0]['sourceRows'], [0, 1])
        history = self.rules.manage({'operation': 'proof', 'resultId': result['resultId']})
        self.assertEqual(history['proofHash'], digest(history['proof']))
        self.assertEqual(history['proof']['executionContext']['turnId'], 'fixture-turn')

    def test_unrounded_intermediate_values_are_used_for_next_formula(self):
        value = definition()
        value['formulas'] = [
            {'id': 'third', 'name': 'One third', 'expression': 'total / base_total', 'unit': '1', 'scale': 2, 'rounding': 'HALF_UP', 'zeroDivision': 'error'},
            {'id': 'whole', 'name': 'Recombined', 'expression': 'third * 3', 'unit': '1', 'scale': 2, 'rounding': 'HALF_UP', 'zeroDivision': 'error'},
        ]
        self.rows = [self.row('a', '1', '3')]
        result = self.execute(self.confirmed(value))
        self.assertEqual(self.data(result)[0]['third'], '0.33')
        self.assertEqual(self.data(result)[0]['whole'], '1.00')
        proof = self.rules.verify(result)
        self.assertEqual(proof['whole']['rows'][0]['node']['inputs']['third'], {'numerator': '1', 'denominator': '3'})

    def test_filter_boundaries_and_null_filter_do_not_enter_aggregates(self):
        self.rows += [self.row('before', '99', '99', '2025-12-31'), self.row('start', '1', '1', '2026-01-01'),
                      self.row('end', '99', '99', '2026-02-01'), self.row('cancel', '99', '99', tag='cancelled')]
        null_filter = self.row('missing', '99', '99')
        null_filter['tag'] = None
        self.rows.append(null_filter)
        result = self.execute()
        self.assertEqual(self.data(result)[0]['total'], '1.30')
        self.assertEqual(self.data(result)[0]['records'], '3')
        self.assertEqual(self.rules.verify(result)['total']['rows'][0]['sourceRows'], [0, 1, 3])

    def test_zero_division_null_error_and_empty_input_are_distinct(self):
        record = self.confirmed()
        self.rows = [self.row('zero', '0', '0')]
        result = self.execute(record)
        self.assertIsNone(self.data(result)[0]['ratio'])
        value = definition()
        value['formulas'][0]['zeroDivision'] = 'error'
        with self.assertRaisesRegex(ValueError, '分母为零'):
            self.execute(self.confirmed(value))
        self.rows = []
        output = self.execute(record)
        self.assertEqual(self.data(output), [{'total': None, 'base_total': None, 'records': '0', 'ratio': None}])

    def test_duplicate_and_null_grain_rejected_even_outside_filter(self):
        record = self.confirmed()
        self.rows.append(self.row('a', '1', '1', day='2025-01-01'))
        with self.assertRaisesRegex(ValueError, '唯一粒度'):
            self.execute(record)
        self.rows = [self.row(None, '1', '1')]
        with self.assertRaisesRegex(ValueError, '唯一粒度'):
            self.execute(record)

    def test_null_policy_mean_min_max_and_count(self):
        value = definition()
        value['measures'][0]['nullPolicy'] = 'skip'
        for op in ('mean', 'min', 'max'):
            value['measures'].append({'id': op + '_amount', 'name': op, 'op': op, 'field': 'amount', 'unit': 'CNY', 'scale': 3, 'rounding': 'HALF_EVEN', 'nullPolicy': 'skip'})
        self.rows.append(self.row('null', None, '1'))
        result = self.execute(self.confirmed(value))
        row = self.data(result)[0]
        self.assertEqual((row['mean_amount'], row['min_amount'], row['max_amount'], row['records']), ('0.150', '0.100', '0.200', '3'))
        self.assertEqual(self.rules.verify(result)['total']['rows'][0]['node']['skippedNulls'], 1)
        with self.assertRaisesRegex(ValueError, '空值'):
            self.execute(self.confirmed())

    def test_decimal_group_keeps_all_original_digits(self):
        value = definition()
        value['groupBy'] = ['amount']
        self.rows = [self.row('a', '0.123456789012345678901', '1'), self.row('b', '0.123456789012345678902', '1')]
        result = self.execute(self.confirmed(value))
        data = self.data(result)
        self.assertEqual([row['amount'] for row in data], ['0.123456789012345678901', '0.123456789012345678902'])
        self.assertEqual(self.rules.verify(result)['total']['rows'][0]['group']['amount'], '0.123456789012345678901')

    def test_actual_float_source_and_datetime_source_fail_closed(self):
        record = self.confirmed()
        self.native_types['amount'] = 'float'
        self.rows[0]['amount'] = 0.1
        with self.assertRaisesRegex(ValueError, '浮点'):
            self.execute(record)
        self.native_types.clear()
        self.rows = [self.row('a', '1', '1')]
        self.rows[0]['day'] = '2026-01-15T00:00:00+08:00'
        with self.assertRaisesRegex(ValueError, 'DATE'):
            self.execute(record)
        self.native_types['day'] = 'datetime'
        with self.assertRaisesRegex(ValueError, '时间戳'):
            self.execute(record)

    def test_parameters_are_typed_complete_and_never_enter_sql(self):
        record = self.confirmed()
        for parameters in ({}, dict(self.params, extra='1'), dict(self.params, start=None), dict(self.params, start='2026-02-01'), dict(self.params, start='2026-01-01T00:00:00Z')):
            with self.subTest(parameters=parameters), self.assertRaises(ValueError):
                self.execute(record, parameters)
        value = definition()
        value['parameters']['tag'] = {'type': 'text'}
        value['filters'][-1] = {'field': 'tag', 'op': 'eq', 'parameter': 'tag'}
        output = self.execute(self.confirmed(value), dict(self.params, tag="'; DROP TABLE secret; --"))
        self.assertNotIn('DROP', self.queries[-1])
        self.assertEqual(self.data(output)[0]['records'], '0')

    def test_ordinary_result_and_copied_proof_cannot_be_governed(self):
        result = self.execute()
        source = self.gateway.snapshots.metadata(result['inputResultIds'][0])
        self.assertIsNone(self.rules.verify(source))
        forged = dict(source, metricProof=result['metricProof'])
        with self.assertRaisesRegex(ValueError, '没有由指标执行器'):
            self.rules.verify(forged)
        transformed = self.gateway.analyze(result['resultId'], 'SELECT 999 AS fake FROM result')
        self.assertNotIn('metricProof', transformed)
        self.assertIsNone(self.rules.verify(transformed))

    def test_modified_parquet_source_and_output_are_detected(self):
        for target in ('source', 'output'):
            with self.subTest(target=target):
                result = self.execute()
                identifier, column = (result['inputResultIds'][0], 'amount') if target == 'source' else (result['resultId'], 'total')
                self.corrupt_cell(identifier, column, '999')
                with self.assertRaisesRegex(ValueError, '实际内容指纹'):
                    self.rules.verify(result)

    def test_source_schema_binding_and_output_metadata_tampering_rejected(self):
        result = self.execute()
        modified = deepcopy(result)
        modified['columns'][0]['nativeType'] = 'float'
        with self.assertRaisesRegex(ValueError, '输出结果'):
            self.rules.verify(modified)
        source = self.gateway.snapshots.metadata(result['inputResultIds'][0])
        source['columns'][0]['name'] = 'forged'
        self.write_metadata(source)
        with self.assertRaisesRegex(ValueError, '输入快照'):
            self.rules.verify(result)

    def test_freshness_cannot_be_forged_in_saved_metadata(self):
        result = self.execute()
        modified = deepcopy(result)
        modified['acquisition'][0]['retrievedAt'] = '2099-01-01T00:00:00+00:00'
        with self.assertRaisesRegex(ValueError, '输出结果'):
            self.rules.verify(modified)

    def test_proof_record_tampering_and_replay_rejected(self):
        result = self.execute()
        with self.rules.store.connect() as database:
            stored = json.loads(database.execute('SELECT record FROM metric_executions WHERE result_id=?', (result['resultId'],)).fetchone()[0])
            stored['proof']['steps'][0]['nodes']['ratio']['display'] = '999'
            database.execute('UPDATE metric_executions SET record=? WHERE result_id=?', (json.dumps(stored), result['resultId']))
        with self.assertRaisesRegex(ValueError, '指纹'):
            self.rules.verify(result)
        with self.assertRaisesRegex(ValueError, '指纹'):
            self.rules.manage({'operation': 'proof', 'resultId': result['resultId']})

    def test_current_rule_and_source_changes_block_republication_but_history_survives(self):
        record = self.confirmed()
        result = self.execute(record)
        self.rules.manage({'operation': 'disable', 'id': record['id'], 'version': record['version'], 'expectedHash': record['hash']})
        with self.assertRaisesRegex(ValueError, '停用'):
            self.rules.verify(result)
        self.gateway.snapshots.path(result['inputResultIds'][0]).unlink()
        self.assertEqual(self.rules.manage({'operation': 'proof', 'resultId': result['resultId']})['proof']['resultId'], result['resultId'])
        record = self.confirmed()
        result = self.execute(record)
        self.gateway.store.save(self.source)
        with self.assertRaisesRegex(ValueError, '数据源配置'):
            self.rules.verify(result)

    def test_new_draft_revokes_old_execution_and_source_disabling_blocks(self):
        record = self.confirmed()
        result = self.execute(record)
        self.draft(old=record)
        with self.assertRaisesRegex(ValueError, '已修改'):
            self.rules.verify(result)
        record = self.confirmed()
        self.gateway.store.toggle(self.source['id'], False)
        with self.assertRaisesRegex(ValueError, '未启用'):
            self.execute(record)

    def test_rule_change_during_execution_returns_no_governed_result(self):
        record = self.confirmed()
        original = self.rules._compute
        def change(*args):
            value = original(*args)
            self.draft(old=record)
            return value
        with patch.object(self.rules, '_compute', side_effect=change), self.assertRaisesRegex(ValueError, '已修改'):
            self.execute(record)
        with self.rules.store.connect() as database:
            self.assertEqual(database.execute('SELECT COUNT(*) FROM metric_executions').fetchone()[0], 0)

    def test_rule_disabled_during_final_snapshot_write_discards_output(self):
        record = self.confirmed()
        original = self.gateway.snapshots.write
        output_ids = []
        def disable(metadata, batches):
            result = original(metadata, batches)
            if 'metricProof' in metadata:
                output_ids.append(result['resultId'])
                self.rules.manage({'operation': 'disable', 'id': record['id'], 'version': record['version'], 'expectedHash': record['hash']})
            return result
        with patch.object(self.gateway.snapshots, 'write', side_effect=disable), self.assertRaisesRegex(ValueError, '计算期间'):
            self.execute(record)
        self.assertEqual(len(output_ids), 1)
        self.assertFalse(self.gateway.snapshots.path(output_ids[0]).exists())
        self.assertFalse(self.gateway.snapshots.path(output_ids[0]).with_suffix('.json').exists())

    def test_budgets_and_cancellation_never_report_partial_success(self):
        record = self.confirmed()
        with patch('metric_rules.MAX_ROWS', 1), self.assertRaisesRegex(ValueError, '行数预算'):
            self.execute(record)
        self.gateway.cancel.cancel()
        with self.assertRaisesRegex(ValueError, '取消'):
            self.execute(record)

    def test_future_references_valid_cycles_unknowns_and_code_rejected(self):
        value = definition()
        value['formulas'].insert(0, {'id': 'twice', 'name': 'Twice', 'expression': 'ratio * 2', 'unit': '%', 'scale': 2, 'rounding': 'HALF_UP', 'zeroDivision': 'error'})
        self.assertEqual(self.data(self.execute(self.confirmed(value)))[0]['twice'], '60.00')
        for expression in ('999', 'missing + total', 'ratio + total', 'total ** 2', '__import__("os")', 'total.real', 'total[0]', '[total]', 'True', 'total // 2'):
            candidate = definition()
            candidate['formulas'][0]['expression'] = expression
            with self.subTest(expression=expression), self.assertRaises(ValueError):
                validate_definition(candidate)
        candidate = definition()
        candidate['formulas'][0]['expression'] = 'ratio + 1'
        with self.assertRaisesRegex(ValueError, '循环'):
            validate_definition(candidate)

    def test_units_null_rules_unsupported_fields_and_table_injection(self):
        candidates = []
        candidate = definition(); candidate['measures'][2]['unit'] = 'CNY'; candidates.append(candidate)
        candidate = definition(); candidate['formulas'][0]['unit'] = 'CNY'; candidates.append(candidate)
        candidate = definition(); candidate['formulas'][0]['expression'] = 'total + 1'; candidates.append(candidate)
        candidate = definition(); candidate['measures'][0].pop('nullPolicy'); candidates.append(candidate)
        candidate = definition(); candidate['sql'] = 'SELECT 999 FROM business'; candidates.append(candidate)
        candidate = definition(); candidate['table']['name'] = 't; DROP TABLE t'; candidates.append(candidate)
        candidate = definition(); candidate['fields']['amount']['column'] = '999 AS sales'; candidates.append(candidate)
        candidate = definition(); candidate['fields']['amount']['type'] = 'float'; candidates.append(candidate)
        for candidate in candidates:
            with self.subTest(candidate=candidate), self.assertRaises(ValueError):
                validate_definition(candidate)

    def test_metric_then_group_reference_preserves_shared_source_context(self):
        from analysis_tools import AnalysisTools
        value = definition()
        value['groupBy'] = ['tag']
        result = self.execute(self.confirmed(value))
        analysis = AnalysisTools(self.gateway, self.gateway.thread_id)
        analysis.remember(result)
        answer = analysis.publish('Amount {{amount}} for {{group}}', {
            'amount': {'result_id': result['resultId'], 'row': 0, 'column': 'total'},
            'group': {'result_id': result['resultId'], 'row': 0, 'column': 'tag'},
        })
        verified = analysis.evidence.verify(self.gateway.thread_id, self.gateway.turn_id, answer['text'], True)
        self.assertIn('metricContext', verified['sources'][result['resultId']])
        self.assertEqual(verified['sources'][result['resultId']]['metricContext']['parameters'], self.params)
        self.assertIn('metric', verified['evidence'][0])
        self.assertNotIn('metric', verified['evidence'][1])
        self.assertEqual(verified['evidence'][0]['metric']['step']['group'], {'tag': 'eligible'})

    def test_publication_commit_serializes_concurrent_rule_revocation(self):
        from analysis_tools import AnalysisTools
        from analysis_evidence import Evidence
        record = self.confirmed()
        result = self.execute(record)
        analysis = AnalysisTools(self.gateway, self.gateway.thread_id)
        analysis.remember(result)
        entered, release, attempted, revoked = (threading.Event() for _ in range(4))
        errors, answers = [], []
        original_write = Evidence.write
        original_connect = self.store_connect = self.gateway.store.connect
        @contextmanager
        def connections():
            with original_connect() as database:
                if threading.current_thread().name == 'metric-revoker':
                    database.set_trace_callback(lambda sql: attempted.set() if sql.startswith('BEGIN IMMEDIATE') else None)
                yield database
        def blocked_write(path, value):
            if 'answers' in path.parts:
                entered.set()
                if not release.wait(5):
                    raise AssertionError('Test did not release answer commit')
            original_write(path, value)
        def publish():
            try:
                answers.append(analysis.publish('Amount {{value}}', {'value': {'result_id': result['resultId'], 'row': 0, 'column': 'total'}}))
            except BaseException as error:
                errors.append(error)
        def revoke():
            try:
                self.rules.manage({'operation': 'disable', 'id': record['id'], 'version': record['version'], 'expectedHash': record['hash']})
                revoked.set()
            except BaseException as error:
                errors.append(error)
        publisher = threading.Thread(target=publish, name='metric-publisher')
        revoker = threading.Thread(target=revoke, name='metric-revoker')
        with patch.object(analysis.evidence, 'write', side_effect=blocked_write), patch.object(self.gateway.store, 'connect', side_effect=connections):
            publisher.start()
            try:
                self.assertTrue(entered.wait(5), errors)
                revoker.start()
                self.assertTrue(attempted.wait(5), errors)
                self.assertFalse(revoked.is_set(), 'Revocation must wait while final publication is locked')
            finally:
                release.set()
                publisher.join(5)
                if revoker.ident is not None:
                    revoker.join(5)
        self.assertFalse(publisher.is_alive())
        self.assertFalse(revoker.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(len(answers), 1)
        self.assertTrue(revoked.is_set())
        self.assertEqual(analysis.evidence.verify(self.gateway.thread_id, self.gateway.turn_id, answers[0]['text'], True)['status'], 'verified')
        self.gateway.turn_id = 'after-revocation'
        with self.assertRaisesRegex(ValueError, '停用'):
            analysis.publish('Amount {{value}}', {'value': {'result_id': result['resultId'], 'row': 0, 'column': 'total'}})
        self.assertFalse((analysis.evidence.root / 'answers' / self.gateway.thread_id / self.gateway.turn_id).exists())

    def test_manual_exact_rounding_negative_halves_and_large_integer(self):
        for number, mode, expected in [('1.005', 'HALF_UP', '1.01'), ('1.005', 'HALF_EVEN', '1.00'), ('1.015', 'HALF_EVEN', '1.02'), ('-1.005', 'HALF_UP', '-1.01'), ('-1.009', 'DOWN', '-1.00')]:
            self.assertEqual(str(rounded(Fraction(Decimal(number)), 2, mode)), expected)
        self.assertEqual(str(decimal_fraction(Fraction(Decimal('0.12345678901234567890123456789')))), '0.12345678901234567890123456789')
        self.rows = [self.row('large', '999999999999999999999999999999.99', '1')]
        result = self.execute()
        self.assertEqual(self.data(result)[0]['total'], '999999999999999999999999999999.99')


if __name__ == '__main__':
    unittest.main()
