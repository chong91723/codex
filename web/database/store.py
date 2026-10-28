"""Private connection registry, outside Git. Complete data lives in snapshots.py."""
from contextlib import contextmanager
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time

PUBLIC_FIELDS=('id','name','engine','host','port','database','schema','username','tls','verifyTls','caFile','enabled','status','error','checkedAt','version','maxAgeMinutes')
DEFAULT_PORTS={'mysql':3306,'postgresql':5432,'clickhouse':8123,'elasticsearch':9200}

def state_directory():
    default=Path(os.environ.get('CODEX_HOME',Path.home()/'.codex'))/'web-databases'
    return Path(os.environ.get('CODEX_WEB_DB_STATE',default)).resolve()

def fingerprint(record):
    fields={key:value for key,value in record.items() if key not in ('status','error','checkedAt','version','id')}
    return hashlib.sha256(json.dumps(fields,sort_keys=True).encode()).hexdigest()

def public(record):
    value={key:record.get(key) for key in PUBLIC_FIELDS};value['readOnly']=True;value['hasPassword']=bool(record.get('password'));return value

class Store:
    def __init__(self,directory=None):
        self.directory=Path(directory or state_directory());self.directory.mkdir(parents=True,exist_ok=True,mode=0o700);self.directory.chmod(0o700)
        self.path=self.directory/'registry.sqlite3'
        with self.connect() as database:
            database.executescript('CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, version INTEGER NOT NULL, record TEXT NOT NULL);')
        self.path.chmod(0o600)
    @contextmanager
    def connect(self):
        database=sqlite3.connect(self.path,timeout=15)
        try:
            with database:yield database
        finally:database.close()
    def all(self):
        with self.connect() as database:return [json.loads(row[0]) for row in database.execute('SELECT record FROM connections ORDER BY rowid')]
    def get(self,identifier):
        with self.connect() as database:row=database.execute('SELECT record FROM connections WHERE id=?',(identifier,)).fetchone()
        if not row:raise ValueError('数据库连接不存在或已删除。')
        return json.loads(row[0])
    def save(self,payload):
        if payload.get('readOnly',True) is not True:
            raise ValueError('所有数据库强制只读，不能授权写入。')
        old=self.get(payload['id']) if payload.get('id') else None
        engine=payload.get('engine');name=str(payload.get('name','')).strip();host=str(payload.get('host','')).strip();database=str(payload.get('database','')).strip();username=str(payload.get('username','')).strip()
        if engine not in DEFAULT_PORTS:raise ValueError('不支持的数据库类型。')
        if not name or len(name)>100 or not host or len(host)>253 or any(c in host for c in '/@?#\\\x00 \t\n'):raise ValueError('请填写有效的名称和主机地址。')
        if not database or len(database)>200 or not username or len(username)>200:raise ValueError('请填写数据库/索引和只读账号。')
        if engine=='elasticsearch' and any(c in database for c in '/?#\\\x00 \t\n'):raise ValueError('索引名称或匹配模式无效。')
        port=int(payload.get('port') or DEFAULT_PORTS[engine]);schema=str(payload.get('schema') or 'public')
        if not 1<=port<=65535:raise ValueError('端口范围为 1–65535。')
        if len(self.all())>=32 and not old:raise ValueError('最多配置 32 个数据库连接。')
        password=payload.get('password') or (old or {}).get('password','')
        record={'id':(old or {}).get('id') or secrets.token_hex(12),'name':name,'engine':engine,'host':host,'port':port,'database':database,'schema':schema,'username':username,'password':password,'tls':payload.get('tls') is True,'verifyTls':payload.get('verifyTls',True) is True,'caFile':str(payload.get('caFile') or ''),'enabled':payload.get('enabled',True) is True,'maxAgeMinutes':(old or {}).get('maxAgeMinutes'),'status':'unverified','error':None,'checkedAt':None,'version':(old or {}).get('version',0)+1}
        with self.connect() as db:db.execute('INSERT INTO connections VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,record=excluded.record',(record['id'],record['version'],json.dumps(record)))
        return record
    def set_freshness(self,identifier,minutes):
        if minutes is not None and (isinstance(minutes,bool) or not isinstance(minutes,int) or not 0<=minutes<=525600):
            raise ValueError('复用时长请输入零至一年之间的整数分钟，留空表示未设置。')
        self.get(identifier)
        # Policy edits do not change connectivity or invalidate every snapshot.
        with self.connect() as db:
            changed=db.execute("UPDATE connections SET record=json_set(record,'$.maxAgeMinutes',?) WHERE id=?",(minutes,identifier)).rowcount
            if not changed:raise ValueError('数据库连接已删除。')
        return self.get(identifier)
    def status(self,record,status,error=None):
        checked=datetime.now(timezone.utc).isoformat()
        # A probe begun before a policy edit must not overwrite the new policy.
        with self.connect() as db:
            changed=db.execute("UPDATE connections SET record=json_set(record,'$.status',?,'$.error',?,'$.checkedAt',?) WHERE id=? AND version=?",(status,error,checked,record['id'],record['version'])).rowcount
            if not changed:raise ValueError('连接配置已经变更，请重新测试连接。')
            current=json.loads(db.execute('SELECT record FROM connections WHERE id=?',(record['id'],)).fetchone()[0])
        return current
    def toggle(self,identifier,enabled):
        record=self.get(identifier);record['enabled']=enabled;record['version']+=1;record.update(status='unverified',error=None,checkedAt=None)
        with self.connect() as db:db.execute('UPDATE connections SET version=?,record=? WHERE id=?',(record['version'],json.dumps(record),identifier))
        return record
    def remove(self,identifier):
        self.get(identifier)
        with self.connect() as db:db.execute('DELETE FROM connections WHERE id=?',(identifier,))
