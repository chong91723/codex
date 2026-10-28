"""User-confirmed metric contracts and deterministic, source-backed execution.

This is an execution proof against an acknowledged definition, not a proof of
business truth or host-administrator integrity. No arbitrary SQL/Python is trusted.
"""
import ast
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import secrets

VERSION = 'metric-contract-v1'
MAX_ROWS = 100000
MAX_GROUPS = 2000
IDENTIFIER = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,99}$')
ROUNDINGS = {'HALF_UP', 'HALF_EVEN', 'DOWN'}
TYPES = {'decimal', 'int', 'text', 'date'}
OPS = {'eq', 'ne', 'lt', 'lte', 'gt', 'gte'}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def identifier(value):
    require(isinstance(value, str) and IDENTIFIER.fullmatch(value), '名称须为有效的字母、数字或下划线标识。')
    return value


def shape(value, required, optional=()):
    require(isinstance(value, dict) and set(required) <= set(value) <= set(required) | set(optional), '指标规则字段缺失或包含不支持的配置。')


def text(value, limit=200):
    require(isinstance(value, str) and value.strip() and len(value) <= limit and '\x00' not in value, '请提供有效的名称或说明。')
    return value.strip()


def unit(value):
    require(isinstance(value, str) and len(value) <= 100, '单位格式无效。')
    if value in ('1', '%'):
        return {}
    pieces = re.split(r'([*/])', value)
    require(len(pieces) % 2 == 1 and all(re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*', item) for item in pieces[::2]), '单位使用符号乘除，如 CNY/order；无量纲使用 1 或 %。')
    powers = {}
    sign = 1
    for index, piece in enumerate(pieces):
        if index % 2:
            sign = 1 if piece == '*' else -1
        else:
            powers[piece] = powers.get(piece, 0) + sign
    return {key: value for key, value in powers.items() if value}


def multiply_units(left, right, direction=1):
    result = dict(left)
    for key, power in right.items():
        result[key] = result.get(key, 0) + direction * power
    return {key: value for key, value in result.items() if value}


def exact(value):
    require(not isinstance(value, (bool, float)) and isinstance(value, (str, int, Decimal)), '精确数值须使用十进制字符串或整数，不能使用浮点数。')
    raw = str(value)
    require(len(raw) <= 150, '数值超过精确计算预算。')
    try:
        number = Decimal(raw)
    except InvalidOperation:
        raise ValueError('无法解析十进制数值。') from None
    require(number.is_finite() and len(number.as_tuple().digits) <= 100 and abs(number.as_tuple().exponent) <= 100, '数值不是有限值或超过精度预算。')
    return Fraction(number)


def typed(value, kind):
    if value is None:
        return None
    if kind == 'decimal':
        return exact(value)
    if kind == 'int':
        require(not isinstance(value, bool) and (isinstance(value, int) or isinstance(value, str) and re.fullmatch(r'-?[0-9]+', value)), '整数字段包含非整数值。')
        number = int(value)
        require(abs(number).bit_length() <= 512, '整数超过计算预算。')
        return number
    if kind == 'date':
        require(isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', value), '日期须为 YYYY-MM-DD 的 DATE 值；不会截取时间戳或猜测时区。')
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise ValueError('日期无效。') from None
    require(isinstance(value, str) and len(value) <= 10000 and '\x00' not in value, '文本字段格式无效或过长。')
    return value


def raw_value(value):
    if isinstance(value, Fraction):
        require(max(abs(value.numerator).bit_length(), value.denominator.bit_length()) <= 4096, '公式超过精确计算预算。')
        return {'numerator': str(value.numerator), 'denominator': str(value.denominator)}
    if isinstance(value, date):
        return value.isoformat()
    return value


def decimal_fraction(value):
    """A finite decimal source group keeps every digit, without display rounding."""
    numerator, denominator = value.numerator, value.denominator
    twos = fives = 0
    while denominator % 2 == 0:
        denominator //= 2
        twos += 1
    while denominator % 5 == 0:
        denominator //= 5
        fives += 1
    require(denominator == 1, '分组值不是有限十进制数。')
    scale = max(twos, fives)
    numerator *= 2 ** (scale - twos) * 5 ** (scale - fives)
    digits = str(abs(numerator)).rjust(scale + 1, '0')
    return Decimal(('-' if numerator < 0 else '') + (digits[:-scale] + '.' + digits[-scale:] if scale else digits))


def rounded(value, scale, rounding):
    if value is None:
        return None
    value = Fraction(value)
    sign = -1 if value < 0 else 1
    quotient, remainder = divmod(abs(value.numerator) * 10 ** scale, value.denominator)
    if rounding == 'HALF_UP' and remainder * 2 >= value.denominator or rounding == 'HALF_EVEN' and (remainder * 2 > value.denominator or remainder * 2 == value.denominator and quotient % 2):
        quotient += 1
    quotient *= sign
    digits = str(abs(quotient)).rjust(scale + 1, '0')
    result = ('-' if quotient < 0 else '') + (digits[:-scale] + '.' + digits[-scale:] if scale else digits)
    return Decimal(result)


def expression(value):
    value = text(value, 2000)
    try:
        tree = ast.parse(value, mode='eval')
    except SyntaxError:
        raise ValueError('公式无法解析。') from None
    nodes = list(ast.walk(tree))
    require(len(nodes) <= 200 and all(isinstance(node, (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.UAdd, ast.USub, ast.Name, ast.Load, ast.Constant)) for node in nodes), '公式只支持指标引用、数字、括号与加减乘除。')
    for node in nodes:
        if isinstance(node, ast.Constant):
            require(type(node.value) in (int, float), '公式只能包含十进制数值常量。')
            exact(ast.get_source_segment(value, node))
        if isinstance(node, ast.Name):
            identifier(node.id)
    names = sorted({node.id for node in nodes if isinstance(node, ast.Name)})
    require(names, '公式必须引用已有指标，不能仅发布常量。')
    return tree.body, names


def formula_units(node, source, units):
    if isinstance(node, ast.Name):
        return units[node.id]
    if isinstance(node, ast.Constant):
        return {}
    if isinstance(node, ast.UnaryOp):
        return formula_units(node.operand, source, units)
    left, right = formula_units(node.left, source, units), formula_units(node.right, source, units)
    if isinstance(node.op, (ast.Add, ast.Sub)):
        require(left == right, '公式加减两侧的单位不一致。')
        return left
    return multiply_units(left, right, 1 if isinstance(node.op, ast.Mult) else -1)


def evaluate(node, source, values, zero_division):
    if isinstance(node, ast.Name):
        return values[node.id]
    if isinstance(node, ast.Constant):
        return exact(ast.get_source_segment(source, node))
    if isinstance(node, ast.UnaryOp):
        value = evaluate(node.operand, source, values, zero_division)
        return None if value is None else -value if isinstance(node.op, ast.USub) else value
    left = evaluate(node.left, source, values, zero_division)
    right = evaluate(node.right, source, values, zero_division)
    if left is None or right is None:
        return None
    if isinstance(node.op, ast.Div) and not right:
        require(zero_division == 'null', '公式分母为零，口径要求中止计算。')
        return None
    if isinstance(node.op, ast.Add):
        result = left + right
    elif isinstance(node.op, ast.Sub):
        result = left - right
    elif isinstance(node.op, ast.Mult):
        result = left * right
    else:
        result = Fraction(left) / right
    raw_value(Fraction(result))
    return Fraction(result)


def validate_definition(value):
    shape(value, ('name', 'table', 'fields', 'recordKey', 'measures'), ('description', 'parameters', 'ranges', 'filters', 'groupBy', 'formulas'))
    result = json.loads(canonical(value))
    result['name'] = text(result['name'])
    result.setdefault('description', '')
    require(isinstance(result['description'], str) and len(result['description']) <= 4000, '指标说明过长。')
    shape(result['table'], ('name',), ('schema',))
    for key in result['table']:
        identifier(result['table'][key])
    fields = result['fields']
    require(isinstance(fields, dict) and 1 <= len(fields) <= 32, '规则须声明适量的原始字段。')
    for alias, field in fields.items():
        identifier(alias)
        shape(field, ('column', 'type', 'unit'))
        identifier(field['column'])
        require(field['type'] in TYPES, '字段类型不受支持。')
        unit(field['unit'])
        require(field['type'] in ('decimal', 'int') or field['unit'] == '1', '文本和日期字段单位须为 1。')
    require(len({field['column'] for field in fields.values()}) == len(fields), '同一个原始字段不能重复映射为多个别名。')
    for key, default in (('parameters', {}), ('ranges', []), ('filters', []), ('groupBy', []), ('formulas', [])):
        result.setdefault(key, default)
    for key in ('recordKey', 'groupBy'):
        require(isinstance(result[key], list) and len(result[key]) <= 8 and len(set(result[key])) == len(result[key]) and all(item in fields for item in result[key]), '记录粒度或分组字段无效。')
    require(result['recordKey'], '须明确记录唯一键，以检测重复行。')
    require(isinstance(result['parameters'], dict) and len(result['parameters']) <= 20, '参数配置无效。')
    for name, definition in result['parameters'].items():
        identifier(name)
        shape(definition, ('type',))
        require(definition['type'] in TYPES, '参数类型无效。')
    require(isinstance(result['ranges'], list) and len(result['ranges']) <= 10, '范围配置无效。')
    for bounds in result['ranges']:
        shape(bounds, ('start', 'end'))
        start, end = (result['parameters'].get(bounds[key]) for key in ('start', 'end'))
        require(start and end and start['type'] == end['type'] and start['type'] in ('date', 'int', 'decimal'), '范围参数类型不一致。')
    require(isinstance(result['filters'], list) and len(result['filters']) <= 30, '筛选条件过多或无效。')
    for predicate in result['filters']:
        shape(predicate, ('field', 'op'), ('value', 'parameter'))
        require(('value' in predicate) != ('parameter' in predicate) and predicate['field'] in fields and predicate['op'] in OPS, '筛选条件须引用字段及唯一参数或常量。')
        kind = fields[predicate['field']]['type']
        if 'parameter' in predicate:
            parameter = result['parameters'].get(predicate['parameter'])
            require(parameter and parameter['type'] == kind, '筛选参数与字段类型不匹配。')
        else:
            require(predicate['value'] is not None, '筛选常量不能是空值。')
            typed(predicate['value'], kind)
    require(isinstance(result['measures'], list) and 1 <= len(result['measures']) <= 32 and isinstance(result['formulas'], list) and len(result['formulas']) <= 32, '指标数量超出范围。')
    units, specs, trees = {}, {}, {}
    for item in result['measures'] + result['formulas']:
        formula = 'expression' in item
        shape(item, ('id', 'name', 'unit', 'scale', 'rounding', 'expression', 'zeroDivision') if formula else ('id', 'name', 'unit', 'scale', 'rounding', 'op', 'field', 'nullPolicy'))
        identifier(item['id'])
        require(item['id'] not in specs and item['id'] not in fields, '指标标识重复或与原始字段冲突。')
        text(item['name'])
        units[item['id']] = unit(item['unit'])
        require(type(item['scale']) is int and 0 <= item['scale'] <= 12 and item['rounding'] in ROUNDINGS, '舍入精度或方式无效。')
        specs[item['id']] = item
        if formula:
            require(item in result['formulas'] and item['zeroDivision'] in ('error', 'null'), '公式配置无效。')
            trees[item['id']] = expression(item['expression'])
        else:
            require(item in result['measures'] and item['op'] in ('sum', 'count', 'min', 'max', 'mean') and item['field'] in fields and item['nullPolicy'] in ('reject', 'skip'), '聚合指标配置无效。')
            field = fields[item['field']]
            require(item['op'] == 'count' or field['type'] in ('decimal', 'int'), '此聚合只支持数值字段。')
            require(item['unit'] == '1' if item['op'] == 'count' else units[item['id']] == unit(field['unit']), '聚合指标与字段单位不一致；计数单位必须为 1。')
    order, pending = [], dict(trees)
    known = {item['id'] for item in result['measures']}
    while pending:
        ready = [name for name, (_, names) in pending.items() if set(names) <= known]
        require(ready, '公式含未知指标引用或循环依赖。')
        for name in ready:
            tree, names = pending.pop(name)
            require(formula_units(tree, specs[name]['expression'], units) == units[name], '公式结果与声明的单位不一致。')
            known.add(name)
            order.append(name)
    return result, specs, trees, order


class MetricRules:
    def __init__(self, gateway):
        self.gateway = gateway
        self.store = gateway.store
        with self.store.connect() as database:
            database.executescript('''CREATE TABLE IF NOT EXISTS metric_rules (id TEXT NOT NULL, version INTEGER NOT NULL, record TEXT NOT NULL, PRIMARY KEY(id,version));
CREATE TABLE IF NOT EXISTS metric_executions (result_id TEXT PRIMARY KEY, record TEXT NOT NULL);''')

    def _latest(self, identifier, database=None):
        if database is None:
            with self.store.connect() as connection:
                return self._latest(identifier, connection)
        row = database.execute('SELECT record FROM metric_rules WHERE id=? ORDER BY version DESC LIMIT 1', (identifier,)).fetchone()
        require(row, '指标规则不存在。')
        return json.loads(row[0])

    def _list(self, source_id=None):
        with self.store.connect() as database:
            rows = database.execute('SELECT r.record FROM metric_rules r WHERE version=(SELECT MAX(version) FROM metric_rules WHERE id=r.id) ORDER BY r.rowid DESC')
            return [record for row in rows if (record := json.loads(row[0])) and (source_id is None or record['sourceId'] == source_id)]

    def manage(self, payload):
        operation = payload.get('operation')
        if operation == 'list':
            return {'rules': self._list(payload.get('sourceId'))}
        if operation == 'proof':
            self.gateway.snapshots.path(payload.get('resultId'))
            with self.store.connect() as database:
                row = database.execute('SELECT record FROM metric_executions WHERE result_id=?', (payload['resultId'],)).fetchone()
            require(row, '该结果没有保存的指标执行证明。')
            stored = json.loads(row[0])
            require(stored.get('proofHash') == digest(stored.get('proof')) and stored['proof'].get('resultId') == payload['resultId'], '保存的执行证明指纹不一致。')
            return stored
        if operation == 'save':
            definition, _, _, _ = validate_definition(payload['definition'])
            source = self.store.get(payload['sourceId'])
            require(source['engine'] in ('postgresql', 'mysql', 'clickhouse'), '当前指标规则支持 SQL 数据源；其他数据源仍可普通分析。')
            namespace = source['schema'] if source['engine'] == 'postgresql' else source['database']
            require(definition['table'].get('schema', namespace) == namespace, '指标表须属于绑定的数据源，跨库关系请先配置治理视图。')
            identifier(namespace)
            definition['table']['schema'] = namespace
            with self.store.connect() as database:
                database.execute('BEGIN IMMEDIATE')
                old = self._latest(payload['id'], database) if payload.get('id') else None
                if old:
                    require(type(payload.get('expectedVersion')) is int and payload['expectedVersion'] == old['version'], '规则已被修改，请重新加载后保存。')
                    require(old['sourceId'] == source['id'], '不能将既有规则转移到其他数据源。')
                record = {'id': old['id'] if old else secrets.token_hex(16), 'version': old['version'] + 1 if old else 1,
                          'sourceId': source['id'], 'sourceVersion': source['version'], 'definition': definition,
                          'status': 'draft', 'createdAt': now()}
                record['hash'] = digest({key: record[key] for key in ('sourceId', 'sourceVersion', 'definition')})
                database.execute('INSERT INTO metric_rules VALUES (?,?,?)', (record['id'], record['version'], canonical(record)))
            return {'rule': record}
        require(operation in ('confirm', 'disable'), '未知指标规则操作。')
        with self.store.connect() as database:
            database.execute('BEGIN IMMEDIATE')
            record = self._latest(payload.get('id'), database)
            require(type(payload.get('version')) is int and record['version'] == payload['version'] and record['hash'] == payload.get('expectedHash'), '规则版本或指纹已变化，请重新加载。')
            if operation == 'confirm':
                require(record['status'] == 'draft', '只有当前草稿可以确认；修改已确认口径需新建版本。')
                source = self.gateway.require(record['sourceId'])
                require(source['version'] == record['sourceVersion'], '数据源配置已变化，请重新保存并确认口径。')
                confirmation = payload.get('confirmation')
                shape(confirmation, ('businessOwner', 'dataSteward', 'note'))
                record.update(status='confirmed', confirmedAt=now(), confirmation={key: text(value, 2000) for key, value in confirmation.items()},
                              confirmationScope='Current authenticated user acknowledgment; role names are declarations, not verified identities or dual approval.')
            else:
                require(record['status'] != 'disabled', '该指标口径已经停用。')
                record.update(status='disabled', disabledAt=now())
            database.execute('UPDATE metric_rules SET record=? WHERE id=? AND version=?', (canonical(record), record['id'], record['version']))
        return {'rule': record}

    def assert_current(self, rule_id, version, expected_hash):
        record = self._latest(rule_id)
        require(type(version) is int and record['version'] == version and record['hash'] == expected_hash and record['status'] == 'confirmed', '指标口径已修改、未确认或已停用，请重新选择当前口径执行。')
        require(record['hash'] == digest({key: record[key] for key in ('sourceId', 'sourceVersion', 'definition')}), '指标定义指纹不一致。')
        source = self.store.get(record['sourceId'])
        if not source['enabled']:
            self.gateway.require(record['sourceId'])
        require(source['version'] == record['sourceVersion'], '指标绑定的数据源配置已变化，请重新保存并确认口径。')
        self.gateway.require(record['sourceId'])
        return record

    def available(self, source_id=None):
        result = []
        for record in self._list(source_id):
            try:
                self.assert_current(record['id'], record['version'], record['hash'])
            except ValueError:
                continue
            result.append(record)
        return {'rules': result}

    @staticmethod
    def _parameters(definition, parameters):
        require(isinstance(parameters, dict) and set(parameters) == set(definition['parameters']), '参数须完整匹配口径声明，不接受额外参数。')
        values = {name: typed(parameters[name], spec['type']) for name, spec in definition['parameters'].items()}
        require(all(value is not None for value in values.values()), '口径参数不能是空值。')
        for bounds in definition['ranges']:
            require(values[bounds['start']] < values[bounds['end']], '范围开始值必须小于结束值。')
        return values

    @staticmethod
    def _schema(metadata):
        return digest(metadata['columns'])

    @staticmethod
    def _binding(metadata):
        return digest({key: metadata.get(key) for key in ('resultId', 'columns', 'rowCount', 'sha256', 'complete', 'connectionId', 'connectionVersion', 'connectionDependencies', 'query', 'executedQuery', 'sourceKind', 'ownerThreadId', 'parentThreadId', 'inputResultIds', 'inputSources', 'acquisition')})

    def _read(self, metadata):
        import pyarrow.parquet as pq
        require(metadata.get('complete') is True and type(metadata.get('rowCount')) is int and 0 <= metadata['rowCount'] <= MAX_ROWS, '治理计算需要完整且未超出行数预算的结果。')
        columns = metadata['columns']
        names = [column['name'] for column in columns]
        require(len(names) == len(set(names)) and len(names) <= 128, '结果字段重复或超出预算。')
        parquet = pq.ParquetFile(self.gateway.snapshots.path(metadata['resultId']))
        require(parquet.schema_arrow.names == names and all(str(field.type) == 'string' for field in parquet.schema_arrow), '快照物理字段结构与记录不一致。')
        digest_value, rows = hashlib.sha256(), []
        for batch in parquet.iter_batches(batch_size=1000):
            self.gateway.cancel.check()
            for row in batch.to_pylist():
                encoded = json.dumps([row[name] for name in names], ensure_ascii=False, separators=(',', ':')).encode()
                digest_value.update(encoded)
                digest_value.update(b'\n')
                rows.append(row)
                require(len(rows) <= MAX_ROWS, '完整数据超过治理计算行数预算，未生成部分结果。')
        require(len(rows) == metadata['rowCount'] and digest_value.hexdigest() == metadata['sha256'], '快照实际内容指纹与记录不一致。')
        return rows

    @staticmethod
    def _sql(definition, engine):
        quote = '`' if engine in ('mysql', 'clickhouse') else '"'
        quoted = lambda value: quote + identifier(value) + quote
        table = definition['table']
        columns = ', '.join(quoted(field['column']) + ' AS ' + quoted(alias) for alias, field in definition['fields'].items())
        # Filtering is deterministic against complete source rows. No model SQL,
        # literals, implicit collation or timezone conversion enter this query.
        return 'SELECT ' + columns + ' FROM ' + quoted(table['schema']) + '.' + quoted(table['name'])

    def _compute(self, definition, source_rows, parameters):
        definition, specs, trees, order = validate_definition(definition)
        params = self._parameters(definition, parameters)
        fields, grouped, keys = definition['fields'], {}, set()
        predicates = [(item, params[item['parameter']] if 'parameter' in item else typed(item['value'], fields[item['field']]['type'])) for item in definition['filters']]
        if not definition['groupBy']:
            grouped[()] = {'indices': [], 'values': {item['id']: [] for item in definition['measures']}}
        for index, source in enumerate(source_rows):
            if index % 1000 == 0:
                self.gateway.cancel.check()
            require(set(source) == set(fields), '实际查询字段与口径映射不一致。')
            row = {alias: typed(source[alias], field['type']) for alias, field in fields.items()}
            key = tuple(row[alias] for alias in definition['recordKey'])
            require(None not in key and key not in keys, '原始数据唯一粒度为空或重复，未发布可能重复累计的指标。')
            keys.add(key)
            selected = True
            for predicate, right in predicates:
                left = row[predicate['field']]
                if left is None:
                    selected = False
                    break
                op = predicate['op']
                selected = {'eq': lambda: left == right, 'ne': lambda: left != right, 'lt': lambda: left < right,
                            'lte': lambda: left <= right, 'gt': lambda: left > right, 'gte': lambda: left >= right}[op]()
                if not selected:
                    break
            if not selected:
                continue
            group = tuple(row[alias] for alias in definition['groupBy'])
            if group not in grouped:
                require(len(grouped) < MAX_GROUPS, '分组超过治理计算预算，请使用已确认的治理视图缩小范围。')
                grouped[group] = {'indices': [], 'values': {item['id']: [] for item in definition['measures']}}
            current = grouped[group]
            current['indices'].append(index)
            for item in definition['measures']:
                value = row[item['field']]
                require(value is not None or item['nullPolicy'] == 'skip', '聚合字段包含空值，口径要求拒绝该结果。')
                current['values'][item['id']].append(value)
        output, trace = [], []
        for group, collected in grouped.items():
            self.gateway.cancel.check()
            values, nodes = {}, {}
            group_values = {alias: str(decimal_fraction(value)) if isinstance(value, Fraction) else raw_value(value) for alias, value in zip(definition['groupBy'], group)}
            rendered = {alias: (decimal_fraction(value) if isinstance(value, Fraction) else value.isoformat() if isinstance(value, date) else value) for alias, value in zip(definition['groupBy'], group)}
            for item in definition['measures']:
                numbers = [value for value in collected['values'][item['id']] if value is not None]
                operation = item['op']
                if operation == 'count':
                    value = Fraction(len(numbers))
                elif not numbers:
                    value = None
                elif operation == 'sum':
                    value = sum(map(Fraction, numbers), Fraction())
                elif operation == 'mean':
                    value = sum(map(Fraction, numbers), Fraction()) / len(numbers)
                else:
                    value = Fraction(min(numbers) if operation == 'min' else max(numbers))
                values[item['id']] = value
                nodes[item['id']] = {'kind': 'aggregate', 'operation': operation, 'field': item['field'], 'sourceColumn': fields[item['field']]['column'],
                                     'contributingRows': len(numbers), 'skippedNulls': len(collected['indices']) - len(numbers), 'exact': raw_value(value)}
            for name in order:
                item = specs[name]
                node, dependencies = trees[name]
                value = evaluate(node, item['expression'], values, item['zeroDivision'])
                values[name] = value
                nodes[name] = {'kind': 'formula', 'expression': item['expression'], 'inputs': {key: raw_value(values[key]) for key in dependencies}, 'exact': raw_value(value)}
            for item in definition['measures'] + definition['formulas']:
                value = rounded(values[item['id']], item['scale'], item['rounding'])
                rendered[item['id']] = value
                nodes[item['id']].update(display=None if value is None else str(value), unit=item['unit'], scale=item['scale'], rounding=item['rounding'])
            output.append(rendered)
            trace.append({'group': group_values, 'sourceRows': collected['indices'], 'nodes': nodes})
        columns = []
        for alias in definition['groupBy']:
            kind = fields[alias]['type']
            columns.append({'name': alias, 'type': 'number' if kind in ('decimal', 'int') else 'string', 'nativeType': 'Decimal' if kind == 'decimal' else 'int' if kind == 'int' else 'str'})
        columns += [{'name': item['id'], 'type': 'number', 'nativeType': 'Decimal', 'scale': item['scale']} for item in definition['measures'] + definition['formulas']]
        return columns, output, trace

    @staticmethod
    def _source_types(definition, metadata):
        columns = {column['name']: column for column in metadata['columns']}
        require(set(columns) == set(definition['fields']), '实际源字段与口径定义不匹配。')
        for alias, field in definition['fields'].items():
            native = columns[alias].get('nativeType')
            if field['type'] in ('decimal', 'int'):
                require(native in ('Decimal', 'int', 'str', None), '治理精确计算不接受浮点源字段，请先在治理视图中明确十进制规则。')
            if field['type'] == 'date':
                require(native in ('date', 'str', None), '日期口径不能隐式截取时间戳。')

    def execute(self, rule_id, version, parameters):
        record = self._latest(rule_id)
        self.assert_current(rule_id, version, record['hash'])
        self._parameters(record['definition'], parameters)
        source = self.gateway.require(record['sourceId'])
        sql = self._sql(record['definition'], source['engine'])
        source_result = self.gateway.query(record['sourceId'], sql)
        require(source_result.get('connectionId') == record['sourceId'] and source_result.get('connectionVersion') == record['sourceVersion'] and source_result.get('sourceKind', 'database') == 'database', '实际查询来源与确认口径不一致。')
        self._source_types(record['definition'], source_result)
        source_rows = self._read(source_result)
        columns, output, trace = self._compute(record['definition'], source_rows, parameters)
        self.assert_current(rule_id, version, record['hash'])
        self.gateway.result_owner(source_result)
        metadata = {'sourceKind': 'python', 'sourceName': record['definition']['name'], 'engine': 'metric-contract',
                    'ownerThreadId': self.gateway.thread_id, 'parentThreadId': self.gateway.parent_thread_id,
                    'inputResultIds': [source_result['resultId']],
                    'inputSources': [{'kind': 'dataset', 'resultId': source_result['resultId'], 'sha256': source_result['sha256'], 'source': source['name']}],
                    'connectionDependencies': source_result['connectionDependencies'], 'knowledgeDependencies': source_result.get('knowledgeDependencies', []), 'acquisition': source_result.get('acquisition', []),
                    'metricProof': {'ruleId': rule_id, 'version': version, 'definitionHash': record['hash']}}
        result = None
        try:
            with self.gateway.cancel.commit():
                result = self.gateway.snapshots.write(metadata, iter([(columns, output)]))
                proof = {'version': VERSION, 'resultId': result['resultId'], 'ruleId': rule_id, 'ruleVersion': version, 'definitionHash': record['hash'],
                         'definition': record['definition'], 'confirmation': record.get('confirmation'), 'parameters': parameters,
                         'executionContext': {'threadId': self.gateway.thread_id, 'turnId': self.gateway.turn_id},
                         'source': {'resultId': source_result['resultId'], 'sha256': source_result['sha256'], 'schemaHash': self._schema(source_result), 'binding': self._binding(source_result),
                                    'sourceId': record['sourceId'], 'sourceVersion': record['sourceVersion'], 'query': source_result.get('executedQuery', sql), 'columns': source_result['columns']},
                         'output': {'sha256': result['sha256'], 'schemaHash': self._schema(result), 'binding': self._binding(result)}, 'steps': trace, 'createdAt': now()}
                proof_hash = digest(proof)
                result['metricProof']['proofHash'] = proof_hash
                from analysis_evidence import Evidence
                Evidence.write(self.gateway.snapshots.path(result['resultId']).with_suffix('.json'), result)
                with self.store.connect() as database:
                    database.execute('BEGIN IMMEDIATE')
                    current = self._latest(rule_id, database)
                    require(current['status'] == 'confirmed' and current['version'] == version and current['hash'] == record['hash'], '计算期间指标口径已变更，结果未发布。')
                    current_source = self.gateway.require(record['sourceId'])
                    require(current_source['version'] == record['sourceVersion'], '计算期间数据源配置已变更。')
                    database.execute('INSERT INTO metric_executions VALUES (?,?)', (result['resultId'], canonical({'proofHash': proof_hash, 'proof': proof})))
            return result
        except Exception:
            if result:
                for suffix in ('.json', '.parquet'):
                    self.gateway.snapshots.path(result['resultId']).with_suffix(suffix).unlink(missing_ok=True)
            raise

    def verify(self, metadata, checked=None):
        summary = metadata.get('metricProof')
        if summary is None:
            return None
        require(isinstance(summary, dict), '指标证据摘要无效。')
        record = self.assert_current(summary.get('ruleId'), summary.get('version'), summary.get('definitionHash'))
        with self.store.connect() as database:
            row = database.execute('SELECT record FROM metric_executions WHERE result_id=?', (metadata['resultId'],)).fetchone()
        require(row, '此结果没有由指标执行器生成的推导证据。')
        stored = json.loads(row[0])
        proof = stored['proof']
        require(stored['proofHash'] == summary.get('proofHash') == digest(proof) and proof['version'] == VERSION and proof['resultId'] == metadata['resultId'], '指标执行证明指纹不一致。')
        require(proof['ruleId'] == record['id'] and proof['ruleVersion'] == record['version'] and proof['definitionHash'] == record['hash'] and proof['definition'] == record['definition'], '执行证明与当前指标定义不一致。')
        require(self._binding(metadata) == proof['output']['binding'] and self._schema(metadata) == proof['output']['schemaHash'] and metadata['sha256'] == proof['output']['sha256'], '输出结果或来源元数据已变化。')
        self.gateway.result_owner(metadata, checked)
        self._read(metadata)
        source = self.gateway.snapshots.metadata(proof['source']['resultId'])
        require(self._binding(source) == proof['source']['binding'] and self._schema(source) == proof['source']['schemaHash'] and source['sha256'] == proof['source']['sha256'], '输入快照或字段定义已变化。')
        self.gateway.result_owner(source, checked)
        self._read(source)
        self.assert_current(record['id'], record['version'], record['hash'])
        definition = record['definition']
        specs = {item['id']: item for item in definition['measures'] + definition['formulas']}
        result = {}
        for name, item in specs.items():
            result[name] = {'status': 'confirmedDefinitionMatched', 'scope': 'Executed against user-acknowledged definition; not a proof of business truth or narrative semantics.',
                            'ruleId': record['id'], 'version': record['version'], 'definitionHash': record['hash'], 'ruleName': definition['name'],
                            'name': item['name'], 'column': name, 'unit': item['unit'], 'scale': item['scale'], 'rounding': item['rounding'],
                            'formula': item.get('expression'), 'operation': item.get('op'), 'field': item.get('field'),
                            'parameters': proof['parameters'], 'proofHash': stored['proofHash'], 'source': proof['source'],
                            'rows': [{'row': index, 'group': step['group'], 'node': step['nodes'][name], 'sourceRows': step['sourceRows']} for index, step in enumerate(proof['steps'])]}
        return result
