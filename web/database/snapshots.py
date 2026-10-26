"""Immutable, complete query artifacts. Only explicit detail reads enter model context."""
from datetime import datetime,timezone
from decimal import Decimal
import hashlib,json,os,secrets,time,threading,math
from pathlib import Path
from cancellation import Cancellation
import pyarrow as pa
import pyarrow.parquet as pq

MAX_BYTES=1024*1024*1024
MAX_CACHE_BYTES=5*MAX_BYTES
class Snapshots:
    def __init__(self,directory,cancellation=None):self.cancel=cancellation or Cancellation();self.directory=Path(directory)/'results';self.directory.mkdir(mode=0o700,exist_ok=True)
    def path(self,identifier):
        if not isinstance(identifier,str) or len(identifier)!=32 or any(c not in '0123456789abcdef' for c in identifier):raise ValueError('无效的结果 ID。')
        return self.directory/(identifier+'.parquet')
    def write(self,metadata,batches):
        if sum(p.stat().st_size for p in self.directory.glob('*.parquet'))>MAX_CACHE_BYTES:raise ValueError('完整结果缓存空间已达到 5 GiB，请先在数据库页面清理历史结果。')
        identifier=secrets.token_hex(16);path=self.path(identifier);temporary=path.with_suffix('.partial');started=time.monotonic();count=0;size=0;writer=None;columns=None;digest=hashlib.sha256();native_types={}
        try:
            for definitions,rows in batches:
                self.cancel.check()
                if time.monotonic()-started>60:raise ValueError('完整结果读取超过 60 秒，任务失败；未将部分结果标记为完整。请缩小查询范围。')
                if columns is None:
                    columns=definitions
                    schema=pa.schema([(column['name'],pa.string()) for column in columns]);writer=pq.ParquetWriter(temporary,schema,compression='zstd')
                if [d['name'] for d in definitions]!=[d['name'] for d in columns]:raise ValueError('读取期间结果结构发生变化。')
                for a,b in zip(columns,definitions):
                    if b['type']!='string' or not a.get('nativeType'):a.update(b)
                batch=[]
                for row in rows:
                    values=[]
                    for definition in columns:
                        value=row[definition['name']]
                        if definition.get('nativeType')=='Decimal' and value is not None:definition['scale']=max(definition.get('scale',0),max(0,-Decimal(str(value)).as_tuple().exponent))
                        if value is None:values.append(None)
                        elif isinstance(value,(dict,list)):values.append(json.dumps(value,ensure_ascii=False,separators=(',',':')))
                        elif isinstance(value,bool):values.append('true' if value else 'false')
                        else:values.append(str(value))
                    encoded=json.dumps(values,ensure_ascii=False,separators=(',',':')).encode();size+=len(encoded);digest.update(encoded);digest.update(b'\n')
                    if size>MAX_BYTES:raise ValueError('完整结果超过单次 1 GiB 保护上限，任务失败；不会返回截断结果。请按业务条件拆分查询。')
                    batch.append(values)
                if batch:writer.write_table(pa.Table.from_arrays([pa.array([row[i] for row in batch],type=pa.string()) for i in range(len(columns))],schema=schema),row_group_size=1000)
                count+=len(rows)
            if columns is None:raise ValueError('数据库没有返回结果结构。')
            self.cancel.check()
            writer.add_key_value_metadata({'codex:metadata':json.dumps({**metadata,'columns':columns,'rowCount':count,'complete':True,'sha256':digest.hexdigest(),'encoding':'Lossless string cells with original nativeType, NULL preserved; binary cells are base64.'},ensure_ascii=False)})
            writer.close();writer=None;temporary.chmod(0o600);temporary.replace(path)
            result={**metadata,'version':2,'resultId':identifier,'columns':columns,'rowCount':count,'storedBytes':path.stat().st_size,'logicalBytes':size,'sha256':digest.hexdigest(),'complete':True,'truncated':False,'storage':'parquet','createdAt':datetime.now(timezone.utc).isoformat(),'elapsedMs':round((time.monotonic()-started)*1000),'readOnly':True}
            self.path(identifier).with_suffix('.json').write_text(json.dumps(result,ensure_ascii=False));self.path(identifier).with_suffix('.json').chmod(0o600)
            return result
        except Exception:
            if hasattr(batches,'close'):batches.close()
            if writer:writer.close()
            temporary.unlink(missing_ok=True);path.unlink(missing_ok=True);raise
    def metadata(self,identifier):
        path=self.path(identifier).with_suffix('.json')
        if not path.is_file():raise ValueError('查询结果不存在或已清理。')
        return json.loads(path.read_text())
    def restore(self,value,definition):
        if value is None:return None
        kind=definition.get('nativeType')
        if kind=='int':
            integer=int(value);return str(integer) if abs(integer)>9007199254740991 else integer
        if kind=='float':
            number=float(value);return number if math.isfinite(number) else value
        if kind=='bool':return value=='true'
        return value
    def page(self,identifier,offset=0,limit=100,columns=None):
        metadata=self.metadata(identifier)
        if not isinstance(offset,int) or isinstance(offset,bool) or offset<0 or not isinstance(limit,int) or not 1<=limit<=200:raise ValueError('明细页须指定非负偏移和 1–200 行。')
        definitions=metadata['columns'];selected=columns or [d['name'] for d in definitions]
        if not isinstance(selected,list) or not selected or any(c not in [d['name'] for d in definitions] for c in selected):raise ValueError('字段不存在。')
        indices=[i for i,d in enumerate(definitions) if d['name'] in selected];definitions=[metadata['columns'][i] for i in indices];file=pq.ParquetFile(self.path(identifier));rows=[];position=0
        for group in range(file.num_row_groups):
            length=file.metadata.row_group(group).num_rows
            if position+length<=offset:position+=length;continue
            table=file.read_row_group(group,columns=[d['name'] for d in definitions]);start=max(0,offset-position);count=min(limit-len(rows),table.num_rows-start)
            records=table.slice(start,count).to_pylist()
            for record in records:rows.append({d['name']:self.restore(record[d['name']],d) for i,d in zip(indices,definitions)})
            position+=length
            if len(rows)>=limit:break
        return {**metadata,'columns':definitions,'rows':rows,'offset':offset,'returnedRows':len(rows),'hasMore':offset+len(rows)<metadata['rowCount']}
    def analyze(self,identifier,query):
        import duckdb,sqlglot
        from sql_guard import validate_queries
        config={'engine':'postgresql','database':'snapshot','schema':'snapshot'};queries=validate_queries(query,config,enforce_limit=False)
        if len(queries)!=1:raise ValueError('结果分析每次只接受一条 SELECT。')
        statement=sqlglot.parse_one(queries[0],read='postgres')
        if any(t.name!='result' or t.db or t.catalog for t in statement.find_all(sqlglot.exp.Table)):raise ValueError('仅可读取本结果的 result 表，不允许读取文件、其他数据库或网络。')
        metadata=self.metadata(identifier);db=duckdb.connect(config={'enable_external_access':'false','threads':'2','memory_limit':'256MB'})
        timer=threading.Timer(30,db.interrupt);timer.daemon=True;timer.start()
        watcher=self.cancel.watch(db.interrupt);watching=False
        try:
            watcher.__enter__();watching=True
            self.cancel.check()
            # A reusable Arrow dataset can be scanned repeatedly for joins/CTEs
            # without loading the complete result into memory. Only this trusted
            # server-generated path is registered; SQL cannot open other files.
            import pyarrow.dataset as ds
            source=ds.dataset(self.path(identifier),format='parquet');expressions=[]
            db.register('_snapshot_arrow',source)
            for i,column in enumerate(metadata['columns']):
                native=column.get('nativeType');value='"'+column['name'].replace('"','""')+'"'
                if native=='int':value='CAST('+value+' AS HUGEINT)'
                elif native=='float':value='CAST('+value+' AS DOUBLE)'
                elif native=='bool':value='CAST('+value+' AS BOOLEAN)'
                elif native=='Decimal':
                    # Decimal values stay exact; unsupported precision fails rather than rounding.
                    scale=column.get('scale',0)
                    if scale>38:raise ValueError('此字段精度超出本地精确计算范围，请回原数据库进行精确聚合。')
                    value='CAST('+value+' AS DECIMAL(38,'+str(scale)+'))'
                expressions.append(value+' AS "'+column['name'].replace('"','""')+'"')
            db.execute('CREATE TEMP VIEW result AS SELECT '+','.join(expressions)+' FROM _snapshot_arrow')
            self.cancel.check()
            output=db.execute(statement.sql(dialect='duckdb'));names=[d[0] for d in output.description]
            from adapters import dataset
            while True:
                self.cancel.check();rows=output.fetchmany(1000)
                yield dataset(names,rows)
                if not rows:break
        finally:
            timer.cancel()
            if watching:watcher.__exit__(None,None,None)
            db.close()
