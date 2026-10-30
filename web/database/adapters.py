"""Four database adapters. No database write endpoint is implemented."""
import base64
from contextlib import contextmanager
import http.client
import socket
import uuid
from cancellation import Cancellation
from datetime import date,datetime,time as date_time
from decimal import Decimal
import json
import math
import ssl
import urllib.error
import urllib.parse
import urllib.request

class DatabaseError(ValueError):
    pass

def normalize(value):
    if value is None or isinstance(value,bool):return value
    if isinstance(value,int):return str(value) if abs(value)>9007199254740991 else value
    if isinstance(value,float):return value if math.isfinite(value) else str(value)
    if isinstance(value,Decimal):return format(value,'f')
    if isinstance(value,(datetime,date,date_time)):return value.isoformat()
    if isinstance(value,bytes):return base64.b64encode(value).decode()
    if isinstance(value,(dict,list)):return json.dumps(value,ensure_ascii=False,default=str)
    return str(value)

def dataset(columns,rows):
    used=set();names=[]
    for name in columns:
        base=str(name);candidate=base;suffix=2
        while candidate in used:candidate=base+'_'+str(suffix);suffix+=1
        used.add(candidate);names.append(candidate)
    values=[dict(zip(names,[normalize(value) for value in row])) for row in rows]
    definitions=[]
    for i,name in enumerate(names):
        sample=next((row[i] for row in rows if row[i] is not None),None)
        kind='boolean' if isinstance(sample,bool) else 'number' if isinstance(sample,(int,float,Decimal)) else 'datetime' if isinstance(sample,(datetime,date,date_time)) else 'string'
        definitions.append({'name':name,'type':kind,'nativeType':type(sample).__name__ if sample is not None else None})
    return definitions,values

def tls_context(config):
    context=ssl.create_default_context(cafile=config.get('caFile') or None)
    if not config.get('verifyTls',True):context.check_hostname=False;context.verify_mode=ssl.CERT_NONE
    return context

def mysql_bit(value):
    # MySQL's declared BIT wire type is an unsigned bit string, not a BLOB.
    # Decode only that driver type; arbitrary binary columns remain base64.
    return int.from_bytes(value, 'big')

class Mysql:
    def __init__(self,config):
        import pymysql
        from pymysql.constants import FIELD_TYPE
        conversions=dict(pymysql.converters.conversions);conversions[FIELD_TYPE.BIT]=mysql_bit
        self.config=config;kwargs={'host':config['host'],'port':config['port'],'user':config['username'],'password':config['password'],'database':config['database'],'charset':'utf8mb4','autocommit':False,'connect_timeout':5,'read_timeout':12,'write_timeout':12,'local_infile':False,'conv':conversions}
        if config['tls']:kwargs['ssl']=tls_context(config)
        self.connection=pymysql.connect(**kwargs)
        with self.connection.cursor() as cursor:
            cursor.execute('SET SESSION max_execution_time=60000');cursor.execute('START TRANSACTION READ ONLY');cursor.execute('SHOW GRANTS')
            grants=[row[0] for row in cursor.fetchall()]
        for grant in grants:
            if ' ON ' not in grant.upper():raise DatabaseError('不接受间接角色授权；请使用仅授予 SELECT 的专用只读账号。')
            privileges=grant.split(' ON ',1)[0].removeprefix('GRANT ').split(',')
            if any(value.strip().upper() not in ('USAGE','SELECT','SHOW VIEW') for value in privileges) or 'WITH GRANT OPTION' in grant.upper():raise DatabaseError('账号具有写入或管理权限，禁止接入。请使用只有 SELECT 权限的账号。')
    def execute(self,query,parameters=None):
        with self.connection.cursor() as cursor:
            cursor.execute(query,parameters);rows=cursor.fetchmany(501);columns=[column[0] for column in cursor.description or []]
        return dataset(columns,rows)
    def schema(self,table=None):
        return self.execute('SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name,DATA_TYPE AS data_type,IS_NULLABLE AS nullable,COLUMN_KEY AS column_key FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=%s'+(' AND TABLE_NAME=%s' if table else '')+' ORDER BY TABLE_NAME,ORDINAL_POSITION LIMIT 501',(self.config['database'],table) if table else (self.config['database'],))
    def cancel(self):
        # MySQL permits a user to cancel its own connection's query, with no
        # administrative grant. This control command is never an Agent tool.
        import pymysql
        config=self.config
        options=dict(host=config['host'],port=config['port'],user=config['username'],password=config['password'],connect_timeout=3,read_timeout=3,write_timeout=3)
        if config['tls']:options['ssl']=tls_context(config)
        control=pymysql.connect(**options)
        try:
            with control.cursor() as cursor:cursor.execute('KILL QUERY '+str(int(self.connection.thread_id())))
        finally:control.close()
    def close(self):
        if self.connection.open:self.connection.rollback();self.connection.close()

class Postgresql:
    def __init__(self,config):
        import psycopg
        self.config=config;kwargs={'host':config['host'],'port':config['port'],'user':config['username'],'password':config['password'],'dbname':config['database'],'connect_timeout':5,'autocommit':True,'sslmode':('verify-full' if config.get('verifyTls',True) else 'require') if config['tls'] else 'disable'}
        if config.get('caFile'):kwargs['sslrootcert']=config['caFile']
        self.connection=psycopg.connect(**kwargs);self.connection.execute('BEGIN READ ONLY');self.connection.execute("SET LOCAL statement_timeout='60s'")
        flags=self.connection.execute('SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user').fetchone()
        if any(flags):raise DatabaseError('账号具有管理权限，禁止接入；请使用专用只读账号。')
        writable=self.connection.execute("SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relkind IN ('r','p','v','m','f') AND (has_table_privilege(c.oid,'INSERT') OR has_table_privilege(c.oid,'UPDATE') OR has_table_privilege(c.oid,'DELETE') OR has_table_privilege(c.oid,'TRUNCATE') OR has_table_privilege(c.oid,'TRIGGER'))",(config['schema'],)).fetchone()[0]
        creation=self.connection.execute("SELECT has_database_privilege(current_database(),'CREATE') OR has_schema_privilege(%s,'CREATE')",(config['schema'],)).fetchone()[0]
        if writable or creation:raise DatabaseError('账号具有写入或建表权限，禁止接入；请移除这些权限。')
        from psycopg import sql
        self.connection.execute(sql.SQL('SET LOCAL search_path TO {}').format(sql.Identifier(config['schema'])))
    def execute(self,query,parameters=None):
        with self.connection.cursor() as cursor:
            cursor.execute(query,parameters);rows=cursor.fetchmany(501);columns=[column.name for column in cursor.description or []]
        return dataset(columns,rows)
    def schema(self,table=None):
        return self.execute('SELECT table_name,column_name,data_type,is_nullable AS nullable FROM information_schema.columns WHERE table_catalog=%s AND table_schema=%s'+(' AND table_name=%s' if table else '')+' ORDER BY table_name,ordinal_position LIMIT 501',(self.config['database'],self.config['schema'],table) if table else (self.config['database'],self.config['schema']))
    def cancel(self):
        self.connection.cancel_safe(timeout=3)
    def close(self):
        if not self.connection.closed:self.connection.execute('ROLLBACK');self.connection.close()

class HttpDatabase:
    def __init__(self,config):
        self.config=config
        self.cancellation=Cancellation()
        self.active_http=None
    def cancel(self):
        wire=self.active_http
        if wire:self.abort_http(wire)
    @contextmanager
    def open(self,path,body=None,method=None,content_type='application/json',cancellable=True):
        if isinstance(body,(dict,list)):body=json.dumps(body,ensure_ascii=False).encode()
        elif isinstance(body,str):body=body.encode()
        config=self.config
        cls=http.client.HTTPSConnection if config['tls'] else http.client.HTTPConnection
        options={'timeout':12 if cancellable else 3}
        if config['tls']:options['context']=tls_context(config)
        connection=cls(config['host'].strip('[]'),config['port'],**options)
        credential=base64.b64encode((config['username']+':'+config['password']).encode()).decode()
        headers={'Authorization':'Basic '+credential,'Content-Type':content_type,'Accept':'application/json','Connection':'close'}
        token=self.cancellation if cancellable else Cancellation()
        response=None
        try:
            # Explicit connect avoids the race where cancellation happens before
            # http.client has created its socket. Connect itself is bounded.
            token.check();connection.connect();token.check()
            wire=connection.sock
            if cancellable:self.active_http=wire
            with token.watch(lambda:self.abort_http(wire)):
                token.check()
                connection.request(method or ('POST' if body is not None else 'GET'),path,body=body,headers=headers)
                response=connection.getresponse()
                if response.status>=400:
                    text=response.read(4096).decode(errors='replace')
                    if config['password']:text=text.replace(config['password'],'[已隐藏]')
                    raise DatabaseError('数据库 HTTP '+str(response.status)+'：'+text[:500])
                yield response
                token.check()
        finally:
            if cancellable and self.active_http is locals().get('wire'):self.active_http=None
            if response:response.close()
            connection.close()
    @staticmethod
    def abort_http(wire):
        try:wire.shutdown(socket.SHUT_RDWR)
        except OSError:pass
        wire.close()
    def request(self,path,body=None,method=None,content_type='application/json',cancellable=True):
        with self.open(path,body,method,content_type,cancellable) as response:
            data=response.read(4*1024*1024+1)
            if len(data)>4*1024*1024:raise DatabaseError('此响应超过读取预算；未返回部分结果，请细化查询。')
            return json.loads(data)
    def close(self):self.cancel()

class Clickhouse(HttpDatabase):
    def __init__(self,config):
        super().__init__(config)
        settings=self.raw("SELECT name,value FROM system.settings WHERE name='readonly'")
        if not settings['data'] or str(settings['data'][0]['value'])!='1':raise DatabaseError('ClickHouse 账号必须由服务器设置 readonly=1，禁止接入可写账号。')
    def raw(self,query):
        return self.request('/?'+urllib.parse.urlencode({'database':self.config['database'],'default_format':'JSON'}),query,content_type='text/plain; charset=utf-8')
    def cancel(self):
        query_id=getattr(self,'active_query_id',None)
        if query_id:
            try:self.request('/?default_format=JSON',"KILL QUERY WHERE query_id='"+query_id+"' SYNC",content_type='text/plain; charset=utf-8',cancellable=False)
            finally:super().cancel()
        else:super().cancel()
    def execute(self,query,parameters=None):
        value=self.raw(query);columns=[column['name'] for column in value['meta']];rows=[[row.get(column) for column in columns] for row in value['data'][:501]];definitions,values=dataset(columns,rows)
        for definition,meta in zip(definitions,value['meta']):
            if any(word in meta['type'] for word in ('Int','Float','Decimal')):definition['type']='number'
        return definitions,values
    def schema(self,table=None):
        def literal(value):return "'"+value.replace('\\','\\\\').replace("'","\\'")+"'"
        return self.execute('SELECT table AS table_name,name AS column_name,type AS data_type FROM system.columns WHERE database='+literal(self.config['database'])+(' AND table='+literal(table) if table else '')+' ORDER BY table,position LIMIT 501')

class Elasticsearch(HttpDatabase):
    def __init__(self,config):
        super().__init__(config);privileges=self.request('/_security/user/_privileges')
        allowed_cluster={'monitor','monitor_snapshot','read_ilm','read_pipeline','read_slm'};allowed_index={'read','view_index_metadata','read_cross_cluster'}
        if set(privileges.get('cluster',[]))-allowed_cluster or privileges.get('run_as') or privileges.get('applications') or privileges.get('global'):raise DatabaseError('Elasticsearch 账号具有非只读权限，禁止接入。')
        for index in privileges.get('indices',[]):
            if set(index.get('privileges',[]))-allowed_index:raise DatabaseError('Elasticsearch 索引账号只能授予 read 和 view_index_metadata。')
        self.index=urllib.parse.quote(config['database'],safe='*,._-')
        self.request('/'+self.index+'/_mapping')
    def validate_search(self,query):
        allowed={'query','aggs','aggregations','size','from','sort','_source','track_total_hits'}
        if not isinstance(query,dict) or set(query)-allowed:raise DatabaseError('仅允许 Elasticsearch 只读搜索与聚合参数。')
        def inspect(value):
            if isinstance(value,dict):
                if 'index' in value and ('id' in value or 'path' in value) or '_index' in value and '_id' in value:raise DatabaseError('禁止通过查询引用未配置的其他索引文档。')
                for key,item in value.items():
                    if key in ('script','script_fields','runtime_mappings'):raise DatabaseError('禁止执行 Elasticsearch 脚本。')
                    if key in ('size','from') and (not isinstance(item,int) or isinstance(item,bool) or not 0<=item<=100000000):raise DatabaseError('搜索大小与偏移须为 非负 的整数。')
                    inspect(item)
            elif isinstance(value,list):
                for item in value:inspect(item)
        inspect(query)
    def execute(self,query,parameters=None):
        if isinstance(query,str):
            try:query=json.loads(query)
            except json.JSONDecodeError:raise DatabaseError('Elasticsearch 请提供只读 Query DSL JSON。') from None
        self.validate_search(query)
        body={**query,'timeout':'10s'};value=self.request('/'+self.index+'/_search',body)
        if value.get('timed_out') or value.get('_shards',{}).get('failed',0):raise DatabaseError('搜索未完整执行，请重试。')
        rows=[]
        def buckets(aggregations,prefix=None):
            for name,aggregation in aggregations.items():
                if not isinstance(aggregation,dict):continue
                if 'buckets' in aggregation:
                    entries=aggregation['buckets'];entries=[dict(entry,key=key) for key,entry in entries.items()] if isinstance(entries,dict) else entries
                    for bucket in entries:
                        row={**(prefix or {}),name:bucket.get('key_as_string',bucket.get('key')),'count':bucket.get('doc_count')};children={}
                        for key,item in bucket.items():
                            if isinstance(item,dict) and 'value' in item:row[key]=item['value']
                            elif isinstance(item,dict) and 'buckets' in item:children[key]=item
                        if children:buckets(children,row)
                        else:rows.append(row)
                elif 'value' in aggregation:rows.append({**(prefix or {}),name:aggregation['value']})
        self.native_response=value
        if value.get('aggregations'):buckets(value['aggregations'])
        else:
            for hit in value.get('hits',{}).get('hits',[]):rows.append({'_id':hit.get('_id'),**hit.get('_source',{}),'_raw_hit':hit})
        names=list(dict.fromkeys(key for row in rows for key in row));return dataset(names,[[row.get(key) for key in names] for row in rows])
    def schema(self,table=None):
        value=self.request('/'+self.index+'/_mapping');rows=[]
        def fields(properties,index,prefix=''):
            for name,definition in properties.items():
                path=prefix+name;rows.append((index,path,definition.get('type','object')))
                if definition.get('properties'):fields(definition['properties'],index,path+'.')
        for index,data in value.items():fields(data.get('mappings',{}).get('properties',{}),index)
        return dataset(['index','field','data_type'],rows[:501])

ADAPTERS={'mysql':Mysql,'postgresql':Postgresql,'clickhouse':Clickhouse,'elasticsearch':Elasticsearch}

def connect(config,cancellation=None):
    if cancellation:cancellation.check()
    adapter=ADAPTERS[config['engine']].__new__(ADAPTERS[config['engine']])
    try:
        adapter.__init__(config);adapter.cancellation=cancellation or Cancellation();adapter.cancellation.check();return adapter
    except Exception as error:
        if getattr(adapter,'connection',None):
            try:adapter.close()
            except Exception:adapter.connection.close()
        password=config.get('password','');message=str(error);message=message.replace(password,'[已隐藏]') if password else message
        raise DatabaseError(message[:700]) from None

def sql_stream(self,query):
    import uuid
    if isinstance(self,Mysql):
        import pymysql
        cursor=self.connection.cursor(pymysql.cursors.SSCursor)
    else:cursor=self.connection.cursor(name='codex_ro_'+uuid.uuid4().hex)
    finished=False
    try:
        cursor.execute(query);names=[column[0] for column in cursor.description or []]
        while True:
            self.cancellation.check();rows=cursor.fetchmany(1000)
            yield dataset(names,rows)
            if not rows:break
        finished=True
    finally:
        if not finished:self.connection.close()
        else:cursor.close()
Mysql.stream=sql_stream
Postgresql.stream=sql_stream

def clickhouse_stream(self,query):
    self.active_query_id='codex_web_'+uuid.uuid4().hex
    path='/?'+urllib.parse.urlencode({'database':self.config['database'],'default_format':'JSONCompactEachRowWithNamesAndTypes','query_id':self.active_query_id})
    try:
        with self.open(path,query,content_type='text/plain; charset=utf-8') as response:
            names=json.loads(response.readline());types=json.loads(response.readline());batch=[]
            def convert(batch):
                definitions,rows=dataset(names,batch)
                for d,t in zip(definitions,types):
                    if 'Int' in t:d.update(type='number',nativeType='int')
                    elif 'Float' in t:d.update(type='number',nativeType='float')
                    elif 'Decimal' in t:d.update(type='number',nativeType='Decimal')
                return definitions,rows
            for line in response:
                self.cancellation.check()
                if not line.strip():continue
                batch.append(json.loads(line))
                if len(batch)>=1000:yield convert(batch);batch=[]
            yield convert(batch)
    finally:self.active_query_id=None

Clickhouse.stream=clickhouse_stream

def elasticsearch_stream(self,query):
    if isinstance(query,str):query=json.loads(query)
    # Aggregations describe the exact requested DSL result. Native aggregation sizes
    # remain explicit query semantics; raw responses are kept as a separate result.
    if query.get('aggs') or query.get('aggregations'):
        yield self.execute(query);return
    self.validate_search(query)
    if query.get('from'):raise DatabaseError('完整明细读取请使用 query 条件，不使用 from 偏移；结果快照支持任意分页。')
    wanted=query.get('size');remaining=wanted if wanted is not None else None
    pit=self.request('/'+self.index+'/_pit?keep_alive=1m',method='POST')['id'];after=None;names=None
    try:
        while remaining is None or remaining>0:
            self.cancellation.check()
            body={**query,'size':min(1000,remaining) if remaining is not None else 1000,'pit':{'id':pit,'keep_alive':'1m'},'sort':[*(query.get('sort') or []),'_shard_doc'],'track_total_hits':True,'timeout':'10s'}
            if after:body['search_after']=after
            value=self.request('/_search',body);pit=value.get('pit_id',pit)
            if value.get('timed_out') or value.get('_shards',{}).get('failed',0):raise DatabaseError('搜索超时或分片失败；完整结果读取失败，不返回部分结果。')
            hits=value.get('hits',{}).get('hits',[])
            records=[{'_id':hit.get('_id'),**hit.get('_source',{}),'_raw_hit':hit} for hit in hits]
            # Mapping gives stable columns even when later documents have extra fields.
            if names is None:
                mapping=self.request('/'+self.index+'/_mapping');mapped=[]
                for m in mapping.values():mapped.extend(m.get('mappings',{}).get('properties',{}))
                names=list(dict.fromkeys(['_id','_raw_hit',*mapped,*[key for row in records for key in row]]))
            if any(key not in names for row in records for key in row):raise DatabaseError('搜索期间字段结构变化，请重新查询。')
            yield dataset(names,[[row.get(key) for key in names] for row in records])
            if not hits:break
            if remaining is not None:remaining-=len(hits)
            after=hits[-1]['sort']
    finally:
        try:self.request('/_pit',{'id':pit},method='DELETE',cancellable=False)
        except Exception:pass
Elasticsearch.stream=elasticsearch_stream
