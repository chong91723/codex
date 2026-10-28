"""Read-only, paged metadata collection for the four existing adapters.

No model SQL, row sampling, third-party service, or inferred relationships enter
the observed catalog. Business interpretations are managed separately.
"""
from datetime import datetime, timezone
import json
import hashlib
import time
from adapters import connect, DatabaseError

MAX_TABLES = 1000
MAX_COLUMNS = 20000
PAGE_SIZE = 500


def _time():
    return datetime.now(timezone.utc).isoformat()


def _table(name, namespace, kind, comment=''):
    return dict(name=name, namespace=namespace, kind=kind, comment=comment or '',
                columns=[], primaryKey=[], uniqueKeys=[], foreignKeys=[], indexes=[], properties={})


def _pages(adapter, query, parameters, cancellation, maximum=MAX_COLUMNS):
    offset = 0
    while True:
        cancellation.check()
        if time.monotonic() > getattr(adapter, '_exploration_deadline', float('inf')):
            raise DatabaseError('元数据探索超出时间预算，未保存部分结构。')
        with cancellation.watch(adapter.cancel):
            _, rows = adapter.execute(query + f' LIMIT {PAGE_SIZE} OFFSET {offset}', parameters)
        if len(rows) > PAGE_SIZE:
            raise DatabaseError('元数据分页返回超出请求范围，未保存不完整结构。')
        offset += len(rows)
        if offset > maximum:
            raise DatabaseError('元数据超过探索预算；请按数据库或 schema 拆分连接范围，未保存截断结构。')
        yield from rows
        if len(rows) < PAGE_SIZE:
            return


def _column(row):
    nullable = row.get('nullable')
    if isinstance(nullable, str):
        nullable = {'YES': True, 'NO': False, 'true': True, 'false': False}.get(nullable)
    return dict(name=row['column_name'], dataType=row['data_type'], nullable=nullable,
                default=row.get('default_value'), comment=row.get('comment') or '', position=int(row['position']))


def _postgres(adapter, record, cancellation):
    namespace = record['schema']
    visible = "n.nspname=%s AND c.relkind IN ('r','p','v','m','f') AND has_table_privilege(c.oid,'SELECT')"
    tables = {}
    query = "SELECT c.relname AS table_name,c.relkind AS kind,COALESCE(obj_description(c.oid,'pg_class'),'') AS comment FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE " + visible + ' ORDER BY c.relname'
    kinds = {'r': 'table', 'p': 'partitioned_table', 'v': 'view', 'm': 'materialized_view', 'f': 'foreign_table'}
    for row in _pages(adapter, query, (namespace,), cancellation, MAX_TABLES):
        tables[row['table_name']] = _table(row['table_name'], namespace, kinds.get(row['kind'], row['kind']), row['comment'])
    query = """SELECT c.relname AS table_name,a.attname AS column_name,
pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,NOT a.attnotnull AS nullable,
pg_get_expr(d.adbin,d.adrelid) AS default_value,COALESCE(col_description(c.oid,a.attnum),'') AS comment,
a.attnum AS position FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE """ + visible + ' ORDER BY c.relname,a.attnum'
    for row in _pages(adapter, query, (namespace,), cancellation):
        if row['table_name'] not in tables:
            raise DatabaseError('探索期间表结构发生变化，请重新刷新。')
        tables[row['table_name']]['columns'].append(_column(row))
    # pg_catalog works for dedicated SELECT users, unlike some ownership-filtered
    # information_schema constraint views. ordinality preserves composite pairs.
    query = """SELECT c.relname AS table_name,k.conname AS constraint_name,k.contype AS constraint_type,
a.attname AS column_name,s.position,tn.nspname AS target_namespace,tc.relname AS target_table,
ta.attname AS target_column FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL generate_subscripts(k.conkey,1) AS s(position)
JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.conkey[s.position]
LEFT JOIN pg_catalog.pg_class tc ON tc.oid=k.confrelid
LEFT JOIN pg_catalog.pg_namespace tn ON tn.oid=tc.relnamespace
LEFT JOIN pg_catalog.pg_attribute ta ON ta.attrelid=tc.oid AND ta.attnum=k.confkey[s.position]
WHERE k.contype IN ('p','u','f') AND """ + visible + ' ORDER BY c.relname,k.conname,s.position'
    _keys(tables, _pages(adapter, query, (namespace,), cancellation))
    query = """SELECT c.relname AS table_name,i.relname AS index_name,x.indisunique AS is_unique,
pg_get_indexdef(i.oid) AS expression FROM pg_catalog.pg_index x JOIN pg_catalog.pg_class c ON c.oid=x.indrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_class i ON i.oid=x.indexrelid
WHERE """ + visible + ' ORDER BY c.relname,i.relname'
    for row in _pages(adapter, query, (namespace,), cancellation):
        if row['table_name'] in tables:
            tables[row['table_name']]['indexes'].append(dict(name=row['index_name'], columns=[], unique=row['is_unique'], expression=row['expression']))
    return list(tables.values()), dict(columns=True, comments=True, primaryKeys=True, foreignKeys=True, indexes=True), []


def _keys(tables, rows):
    keys = {}
    for row in rows:
        name = row['table_name']
        if name not in tables:
            raise DatabaseError('探索期间约束所属表发生变化，请刷新。')
        identity = (name, row['constraint_name'])
        entry = keys.setdefault(identity, dict(name=row['constraint_name'], columns=[], kind=row['constraint_type'], targetNamespace=row.get('target_namespace'), targetTable=row.get('target_table'), targetColumns=[]))
        entry['columns'].append(row['column_name'])
        if row.get('target_column'):
            entry['targetColumns'].append(row['target_column'])
    for (name, _), key in keys.items():
        kind = key.pop('kind')
        if kind in ('p', 'PRIMARY KEY'):
            tables[name]['primaryKey'] = key['columns']
        elif kind in ('u', 'UNIQUE'):
            tables[name]['uniqueKeys'].append({k: key[k] for k in ('name', 'columns')})
        elif kind in ('f', 'FOREIGN KEY'):
            tables[name]['foreignKeys'].append(key)


def _mysql(adapter, record, cancellation):
    namespace = record['database']
    tables = {}
    query = 'SELECT TABLE_NAME AS table_name,TABLE_TYPE AS kind,TABLE_COMMENT AS comment FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s ORDER BY TABLE_NAME'
    for row in _pages(adapter, query, (namespace,), cancellation, MAX_TABLES):
        tables[row['table_name']] = _table(row['table_name'], namespace, row['kind'].lower().replace(' ', '_'), row['comment'])
    query = 'SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name,COLUMN_TYPE AS data_type,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS default_value,COLUMN_COMMENT AS comment,ORDINAL_POSITION AS position FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=%s ORDER BY TABLE_NAME,ORDINAL_POSITION'
    for row in _pages(adapter, query, (namespace,), cancellation):
        if row['table_name'] not in tables:
            raise DatabaseError('探索期间表结构发生变化，请重新刷新。')
        tables[row['table_name']]['columns'].append(_column(row))
    query = """SELECT k.TABLE_NAME AS table_name,k.CONSTRAINT_NAME AS constraint_name,t.CONSTRAINT_TYPE AS constraint_type,
k.COLUMN_NAME AS column_name,k.ORDINAL_POSITION AS position,k.REFERENCED_TABLE_SCHEMA AS target_namespace,
k.REFERENCED_TABLE_NAME AS target_table,k.REFERENCED_COLUMN_NAME AS target_column
FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.TABLE_CONSTRAINTS t
ON t.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND t.TABLE_NAME=k.TABLE_NAME AND t.CONSTRAINT_NAME=k.CONSTRAINT_NAME
WHERE k.TABLE_SCHEMA=%s ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION"""
    _keys(tables, _pages(adapter, query, (namespace,), cancellation))
    query = 'SELECT TABLE_NAME AS table_name,INDEX_NAME AS index_name,COLUMN_NAME AS column_name,NON_UNIQUE AS non_unique,SEQ_IN_INDEX AS position,EXPRESSION AS expression FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=%s ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX'
    indices = {}
    for row in _pages(adapter, query, (namespace,), cancellation):
        key = (row['table_name'], row['index_name'])
        entry = indices.setdefault(key, dict(name=row['index_name'], columns=[], unique=not bool(row['non_unique']), expression=[]))
        entry['columns'].append(row['column_name'])
        entry['expression'].append(row['expression'])
    for (name, _), entry in indices.items():
        if name in tables:
            tables[name]['indexes'].append(entry)
    return list(tables.values()), dict(columns=True, comments=True, primaryKeys=True, foreignKeys=True, indexes=True), []


def _clickhouse(adapter, record, cancellation):
    namespace = record['database']
    # Literal values only come from the already validated source registry.
    literal = "'" + namespace.replace('\\', '\\\\').replace("'", "\\'") + "'"
    tables = {}
    query = 'SELECT name AS table_name,engine,comment,primary_key,sorting_key,partition_key FROM system.tables WHERE database=' + literal + ' ORDER BY name'
    for row in _pages(adapter, query, None, cancellation, MAX_TABLES):
        table = _table(row['table_name'], namespace, row['engine'], row['comment'])
        table['properties'] = dict(engine=row['engine'], primaryKeyExpression=row['primary_key'], sortingKeyExpression=row['sorting_key'], partitionKeyExpression=row['partition_key'])
        tables[row['table_name']] = table
    query = 'SELECT table AS table_name,name AS column_name,type AS data_type,default_expression AS default_value,comment,position FROM system.columns WHERE database=' + literal + ' ORDER BY table,position'
    for row in _pages(adapter, query, None, cancellation):
        if row['table_name'] not in tables:
            raise DatabaseError('探索期间表结构发生变化，请刷新。')
        column = _column(row)
        # Preserve the actual type expression; do not infer Nullable through wrappers.
        column['nullable'] = None
        tables[row['table_name']]['columns'].append(column)
    return list(tables.values()), dict(columns=True, comments=True, primaryKeys=False, foreignKeys=False, indexes=False, sortingExpressions=True), ['ClickHouse 排序键和主键表达式单独展示，不作为关系数据库的唯一键或外键证明；本次未采集跳数索引。']


def _elasticsearch(adapter, record, cancellation):
    with cancellation.watch(adapter.cancel):
        mapping = adapter.request('/' + adapter.index + '/_mapping')
    if not isinstance(mapping, dict) or len(mapping) > MAX_TABLES:
        raise DatabaseError('索引映射无效或超过探索预算。')
    tables, count = [], 0
    for name, data in sorted(mapping.items()):
        table = _table(name, record['database'], 'index')
        definition = data.get('mappings', {})
        table['properties'] = {key: definition[key] for key in ('dynamic', 'date_detection', 'numeric_detection', '_meta') if key in definition}
        def walk(fields, prefix='', parent=None, multi=False, depth=0):
            nonlocal count
            if depth > 32 or not isinstance(fields, dict):
                raise DatabaseError('索引映射嵌套过深或无效，未保存部分结构。')
            for field, value in sorted(fields.items()):
                cancellation.check()
                if not isinstance(value, dict):
                    raise DatabaseError('字段映射格式无效。')
                count += 1
                if count > MAX_COLUMNS:
                    raise DatabaseError('索引字段超过探索预算，请缩小配置的索引模式。')
                path = prefix + field
                kind = value.get('type', 'object')
                column = dict(name=path, dataType=kind, nullable=None, default=value.get('null_value'), comment='', position=len(table['columns']) + 1, kind='multi_field' if multi else kind)
                if parent:
                    column['parentField'] = parent
                if kind == 'alias':
                    column['target'] = value.get('path')
                if kind == 'join':
                    column['relations'] = value.get('relations', {})
                table['columns'].append(column)
                if 'properties' in value:
                    walk(value['properties'], path + '.', path, False, depth + 1)
                if 'fields' in value:
                    walk(value['fields'], path + '.', path, True, depth + 1)
        walk(definition.get('properties', {}))
        for field, value in sorted(definition.get('runtime', {}).items()):
            cancellation.check()
            count += 1
            if count > MAX_COLUMNS or not isinstance(value, dict):
                raise DatabaseError('运行时字段无效或超出探索预算。')
            previous=next((column for column in table['columns'] if column['name']==field),None)
            runtime=dict(name=field,dataType=value.get('type','unknown'),nullable=None,default=None,comment='',position=previous['position'] if previous else len(table['columns'])+1,kind='runtime',runtimeDefinitionHash=hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest())
            if previous:
                runtime['mappedField']=dict(previous)
                table['columns'][table['columns'].index(previous)]=runtime
            else:
                table['columns'].append(runtime)
        tables.append(table)
    return tables, dict(columns=True, comments=False, primaryKeys=False, foreignKeys=False, indexes=False, nested=True, multiFields=True, fieldAliases=True, joinMappings=True, runtimeFields=True), ['Elasticsearch 映射中的 nested、multi-field、alias、join 分别保留；它们不是 SQL 外键。runtime 字段单独标注，同名覆盖时保留 mappedField 原映射，定义仅保存指纹、不执行脚本。未推断未声明的文档字段或关联。']


COLLECTORS = {'mysql': _mysql, 'postgresql': _postgres, 'clickhouse': _clickhouse, 'elasticsearch': _elasticsearch}


def collect_metadata(gateway, source_id):
    record = gateway.require(source_id)
    observed = _time()
    started = time.monotonic()
    adapter = None
    try:
        adapter = connect(record, gateway.cancel)
        adapter._exploration_deadline = started + 80
        tables, capabilities, warnings = COLLECTORS[record['engine']](adapter, record, gateway.cancel)
        warnings.append('完整性表示配置与权限范围内的元数据枚举完成；多次读取不是并发 DDL 的原子快照，请在结构稳定时准备，变更后显式重新采集。')
        gateway.cancel.check()
        current = gateway.require(source_id)
        if current['version'] != record['version']:
            raise DatabaseError('探索期间数据源配置已变化，未保存旧连接的结构。')
        if time.monotonic() - started > 80:
            raise DatabaseError('元数据探索超时，未保存部分结构。')
        return dict(engine=record['engine'], database=record['database'], namespace=record['schema'] if record['engine'] == 'postgresql' else record['database'],
                    sourceId=source_id, sourceVersion=record['version'], observedAt=observed, completedAt=_time(), complete=True,
                    capabilities=capabilities, warnings=warnings, tables=tables)
    finally:
        if adapter:
            adapter.close()
