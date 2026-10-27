"""Runs only inside the filesystem/network-isolated calculation process."""
import contextlib
from datetime import date, datetime
from decimal import Decimal
import io
import json
import math
from pathlib import Path
import sys


def cell(value):
    if hasattr(value, 'item'):
        value = value.item()
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, Decimal) and not value.is_finite() or isinstance(value, float) and not math.isfinite(value):
        raise ValueError('计算结果包含 NaN 或 Infinity，不能作为回答数值。')
    if isinstance(value, (str, int, float, Decimal)):
        return value
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise ValueError('结果单元格必须是字符串、数字、日期、布尔值或空值。')


class DiagnosticLog(io.StringIO):
    def write(self, text):
        value=(self.getvalue()+text)[-8000:]
        self.seek(0);self.truncate(0);super().write(value)
        return len(text)


def main():
    request = json.load(sys.stdin)
    datasets = {}
    import pyarrow.parquet as pq
    for identifier, metadata in request['datasets'].items():
        rows = pq.read_table('/inputs/'+identifier+'.parquet').to_pylist()
        for row in rows:
            for column in metadata['columns']:
                key = column['name']; value = row[key]; native = column.get('nativeType')
                if value is not None and native in ('Decimal', 'int', 'float', 'bool'):
                    row[key] = {'Decimal': Decimal, 'int': int, 'float': float, 'bool': lambda x: x == 'true'}[native](value)
        datasets[identifier] = rows
    documents = {}
    import csv
    for identifier, document in request['documents'].items():
        if document['format']=='json':documents[identifier]=json.loads(document['text'],parse_float=Decimal)
        elif document['format']=='csv':
            reader=csv.DictReader(io.StringIO(document['text']));fields=reader.fieldnames
            if not fields or any(not name.strip() for name in fields) or len(set(fields))!=len(fields):
                raise ValueError('CSV 表头为空或字段重复，未覆盖或猜测数据。')
            records=list(reader)
            if any(None in row or any(value is None for value in row.values()) for row in records):
                raise ValueError('CSV 数据行字段数与表头不一致，未丢弃或填补字段。')
            documents[identifier]=records
        else:documents[identifier]=document['text']
    namespace = {'datasets': datasets, 'documents': documents, 'parameters': request.get('parameters', {}), 'Decimal': Decimal}
    # Logs are diagnostics, never substituted for a successful structured result.
    log = DiagnosticLog()
    with contextlib.redirect_stdout(log):
        exec(compile(request['code'], '<analysis-calculation>', 'exec'), namespace)
    result = namespace.get('result')
    if hasattr(result, 'to_dict'):
        result = result.to_dict(orient='records')
    if not isinstance(result, list) or len(result) > 200000:
        raise ValueError('请将 result 设为不超过保护上限的记录列表或 DataFrame。')
    definitions = namespace.get('columns')
    names = list(result[0]) if result else definitions
    if not isinstance(names, list) or not names or len(names) > 200 or any(not isinstance(name, str) or not name or len(name) > 200 for name in names):
        raise ValueError('结果需要有效字段；空结果请显式设置 columns 为字段名列表。')
    columns = [{'name': name, 'type': 'string', 'nativeType': 'str'} for name in names]
    rows = []
    for source in result:
        if not isinstance(source, dict) or set(source) != set(names):
            raise ValueError('计算结果的记录字段必须一致。')
        row = {}
        for definition in columns:
            value = cell(source[definition['name']]); native = type(value).__name__
            if value is not None:
                if native in ('Decimal', 'int', 'float'):
                    definition.update(type='number', nativeType=native)
                elif native == 'bool':
                    definition.update(type='boolean', nativeType='bool')
            row[definition['name']] = str(value) if isinstance(value, Decimal) else value
        rows.append(row)
    # Reject ambiguous mixed columns before creating a complete snapshot.
    for definition in columns:
        original=[cell(row[definition['name']]) for row in result if row[definition['name']] is not None]
        kinds={type(value).__name__ for value in original}
        if kinds and kinds <= {'int','float','Decimal'}:
            if len(kinds)>1 or 'Decimal' in kinds:
                definition.update(type='number',nativeType='Decimal')
                for row in rows:
                    if row[definition['name']] is not None:row[definition['name']]=str(row[definition['name']])
        elif len(kinds)>1:
            raise ValueError('同一字段混合了数字、文本或布尔类型，请先在 Python 中显式统一类型。')
    value = {'columns': columns, 'rows': rows, 'stdout': log.getvalue()[-8000:]}
    data = json.dumps(value, ensure_ascii=False, allow_nan=False)
    if len(data.encode()) > 32*1024*1024:
        raise ValueError('计算输出超出保护上限，请在 Python 中聚合或筛选后输出。')
    Path('/work/result.json').write_text(data)


if __name__ == '__main__':
    main()
