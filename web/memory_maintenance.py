"""Identity receipts for Web-owned native memory triggers, never title matching.

This is Web lifecycle metadata, not native memory state. Native databases and
history are read-only here; removal remains a supported native RPC operation.
"""
from contextlib import closing
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3


def now():
    return datetime.now(timezone.utc).isoformat()


def process_birth(pid):
    try:return Path('/proc',str(int(pid)),'stat').read_text().rsplit(')',1)[1].split()[19]
    except (OSError,ValueError,TypeError):return None


def process_alive(pid,birth):
    if not pid or not birth or process_birth(pid)!=str(birth):return False
    try:
        os.kill(int(pid),0)
        return Path('/proc',str(int(pid)),'stat').read_text().rsplit(')',1)[1].split()[0] not in ('Z','X')
    except (OSError,ValueError,TypeError):return False


class MaintenanceSessions:
    def __init__(self,home):
        from native_memory import NativeMemory
        self.home=Path(home).resolve();self.directory=self.home/'web-memory'
        NativeMemory.safe_dir(self.directory);self.path=self.directory/'maintenance-sessions.sqlite'

    def connect(self,create=False):
        if self.path.is_symlink():raise ValueError('后台记忆维护登记路径不能是符号链接。')
        if not self.path.exists() and not create:return None
        if create:
            fd=os.open(self.path,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);os.close(fd)
        db=sqlite3.connect(self.path,timeout=5)
        if create:db.execute('CREATE TABLE IF NOT EXISTS sessions (thread_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, record TEXT NOT NULL)')
        return db

    def register(self,thread_id,*,pid,birth,owner_pid,scheduler_pid,workspace):
        if not isinstance(thread_id,str) or not thread_id or not birth:raise ValueError('后台维护身份不完整，未登记。')
        record={'threadId':thread_id,'pid':pid,'birth':str(birth),'ownerPid':owner_pid,'ownerBirth':process_birth(owner_pid),
                'schedulerPid':scheduler_pid,'schedulerBirth':process_birth(scheduler_pid),'workspace':str(Path(workspace).resolve()),
                'createdAt':now(),'updatedAt':now(),'status':'created','removed':False,'identitySource':'web-owned-native-thread-start'}
        with closing(self.connect(True)) as db, db:db.execute('INSERT INTO sessions VALUES (?,?,?)',(thread_id,record['createdAt'],json.dumps(record)))
        return record

    def update(self,thread_id,**values):
        with closing(self.connect(True)) as db, db:
            row=db.execute('SELECT record FROM sessions WHERE thread_id=?',(thread_id,)).fetchone()
            if row is None:raise ValueError('后台维护会话尚未登记，未更新身份。')
            record=json.loads(row[0]);record.update(values,updatedAt=now())
            db.execute('UPDATE sessions SET record=? WHERE thread_id=?',(json.dumps(record),thread_id))
        return record

    def records(self,limit=50):
        db=self.connect()
        if db is None:return []
        try:
            records=[json.loads(row[0]) for row in db.execute('SELECT record FROM sessions ORDER BY created_at DESC LIMIT ?',(limit,))]
        finally:db.close()
        for record in records:record['processAlive']=process_alive(record['pid'],record['birth'])
        return records

    def identities(self):
        db=self.connect()
        if db is None:return set()
        try:return {row[0] for row in db.execute('SELECT thread_id FROM sessions')}
        finally:db.close()
