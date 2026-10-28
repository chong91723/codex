"""Profile-scoped UI for native memory, without editing generated summaries.

User corrections are append-only native ad-hoc notes plus an immediate UI
overlay. Full clearing uses the pinned executable's own maintenance command.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import time


class NativeMemory:
    def __init__(self, codex, home=None):
        self.codex = str(codex)
        self.home = Path(home or os.environ.get('CODEX_HOME', Path.home()/'.codex')).resolve()
        self.directory = self.home/'web-memory'
        self.safe_dir(self.directory)
        self.file = self.directory/'user-memory.json'

    @staticmethod
    def safe_dir(path):
        # Reject symlinks in each component below the configured profile root.
        if path.is_symlink():raise ValueError('记忆目录不能是符号链接。')
        if path.parent != path:
            NativeMemory.safe_dir(path.parent)
        if not path.exists():
            path.mkdir(mode=0o700, exist_ok=True)
        if not path.is_dir():raise ValueError('记忆目录不是普通目录。')

    @contextmanager
    def lock(self):
        path = self.directory/'management.lock'
        fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'r+') as file:
            fcntl.flock(file, fcntl.LOCK_EX)
            yield

    @contextmanager
    def maintenance_lock(self):
        # Covers startup too: a native job can acquire its SQLite lease just
        # after thread/start returns. Checking only existing jobs races clear.
        fd=os.open(self.directory/'maintenance.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'r+') as file:
            try:fcntl.flock(file,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:raise ValueError('后台记忆正在整理或清空，请等待结束后重试；尚未执行本次操作。')
            yield

    @staticmethod
    def read(path, max_bytes=256*1024):
        if not path.exists():return ''
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, 'rb') as file:
            data = file.read(max_bytes+1)
        if len(data)>max_bytes:raise ValueError('记忆文件超过查看预算，请先由维护人员整理；未截断或覆盖原文。')
        return data.decode('utf-8')

    def user_record(self):
        return json.loads(self.read(self.file) or '{"revision":0,"content":"","history":[]}')

    def inventory(self):
        records = []
        for root_name in ('memories', 'memories_v2'):
            root = self.home/root_name
            if root.is_symlink():raise ValueError('原生记忆根目录是符号链接，未读取。')
            if not root.exists():continue
            for path in sorted(root.rglob('*.md')):
                relative = path.relative_to(root)
                if any(p.startswith('.') for p in relative.parts):continue
                if any((root/Path(*relative.parts[:i])).is_symlink() for i in range(1,len(relative.parts)+1)):
                    raise ValueError('记忆目录内包含符号链接，未读取。')
                records.append({'path':root_name+'/'+relative.as_posix(), 'bytes':path.stat().st_size,'modifiedNs':path.stat().st_mtime_ns})
                if len(records)>10000:raise ValueError('记忆文件过多，请维护人员整理；未返回不完整清单。')
        return records

    def recent_notes(self):
        paths = []
        for name in ('memories', 'memories_v2'):
            directory = self.home/name/'extensions'/'ad_hoc'/'notes'
            if not directory.exists():continue
            self.safe_dir(directory)
            # The current manual document already supersedes these snapshots.
            # Keep their native/history files, without reinjecting stale edits.
            paths += [p for p in directory.glob('*.md') if '-web-user-' not in p.name]
        for path in paths:
            if path.is_symlink():raise ValueError('原生笔记路径是符号链接，未读取。')
        paths.sort(key=lambda p:p.stat().st_mtime_ns,reverse=True)
        selected=[];used=0;seen=set();omitted=0;read_count=0
        for path in paths:
            if len(selected)>=12:break
            read_count+=1
            if path.stat().st_size>64000:
                omitted+=1;continue
            text=self.read(path,64000);key=hashlib.sha256(text.encode()).hexdigest()
            if key in seen:continue
            seen.add(key)
            if used+len(text)>16000:
                omitted+=1;continue
            selected.append({'path':path.relative_to(self.home).as_posix(),'content':text,'modified':path.stat().st_mtime_ns});used+=len(text)
        return {'notes':selected[::-1],'totalFiles':len(paths),'hasMore':read_count<len(paths) or omitted>0}

    def pipeline(self, worker_id=None):
        jobs=[]
        for path in self.home.glob('memories*.sqlite'):
            if path.is_symlink():raise ValueError('原生记忆状态路径是符号链接。')
            with sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True) as db:
                if db.execute("SELECT count(*) FROM sqlite_master WHERE name='jobs'").fetchone()[0]:
                    query="SELECT kind,status,last_error,lease_until FROM jobs WHERE kind LIKE 'memory_%'";params=()
                    if worker_id:query+=' AND worker_id=?';params=(worker_id,)
                    jobs += [{'kind':r[0],'status':r[1],'failed':bool(r[2]) and r[1] not in ('done','completed'),'running':r[1]=='running' and (r[3] is None or r[3]>time.time())} for r in db.execute(query,params)]
        return {'running':any(j['running'] for j in jobs),'failed':any(j['failed'] for j in jobs),'jobs':len(jobs),
                'extracted':sum(j['kind']=='memory_stage1' and j['status'] in ('done','completed') for j in jobs),'consolidated':any(j['kind']=='memory_consolidate_global' and j['status'] in ('done','completed') for j in jobs)}

    def summary_databases(self):
        for version,prefix in (('v2','memories_v2_'),('v1','memories_')):
            paths=[p for p in self.home.glob(prefix+'*.sqlite') if version=='v2' or not p.name.startswith('memories_v2_')]
            if not paths:continue
            path=max(paths,key=lambda p:int(p.stem.rsplit('_',1)[-1]) if p.stem.rsplit('_',1)[-1].isdigit() else -1)
            if path.is_symlink():raise ValueError('原生记忆状态路径是符号链接。')
            yield version,path

    def record_note(self, content, provenance):
        with self.lock():
            if self.user_record().get('paused'):raise ValueError('长期记忆已暂停，未写入笔记。')
            if not isinstance(content,str) or not content.strip() or len(content)>4000 or '\x00' in content:raise ValueError('偏好笔记必须非空且不超过四千字符。')
            if not isinstance(provenance,str) or not provenance.strip() or len(provenance)>500:raise ValueError('请说明偏好的用户来源或纠正依据。')
            name=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-')+'web-agent-'+secrets.token_hex(8)+'.md'
            note='Agent-recorded historical preference or lesson, not a user-approved business definition. Current user edits and current approved source knowledge take precedence.\n\nSource: '+provenance+'\n\n'+content
            # Pinned ext/memories/src/local/ad_hoc_note.rs supports append-only
            # extensions/ad_hoc/notes. This bridge adds no summarizing model or
            # custom agent loop. Only the native background pipeline consolidates.
            root=self.home/'memories_v2'/'extensions'/'ad_hoc'/'notes';self.safe_dir(root)
            path=root/name
            with path.open('x',encoding='utf-8') as file:
                path.chmod(0o600);file.write(note)
            return {'path':path.relative_to(self.home).as_posix(),'saved':True,'origin':'agent','notice':'即时笔记已保存，后续任务可读取；尚不代表原生全局摘要已合并。'}

    def search(self, query='', offset=0, limit=5):
        if self.user_record().get('paused'):raise ValueError('长期记忆已暂停。')
        if not isinstance(query,str) or len(query)>200 or type(offset) is not int or not 0<=offset<=10000 or type(limit) is not int or not 1<=limit<=20:raise ValueError('记忆查询或分页参数无效。')
        terms=query.casefold().split()[:8];matches=[];unreadable=[]
        for item in sorted(self.inventory(),key=lambda r:r['modifiedNs'],reverse=True):
            path=item['path']
            if '/rollout_summaries/' in path or path.endswith(('/raw_memories.md','/phase2_workspace_diff.md')) or '-web-user-' in path:continue
            if item['bytes']>256*1024:
                unreadable.append(path);continue
            text=self.read(self.home/path)
            if terms and not any(t in text.casefold() for t in terms):continue
            matches.append({'kind':'file','path':path,'characters':len(text),'preview':text[:300],'truncated':len(text)>300})
        summaries=self.summary_search(query,max(0,offset-len(matches)),limit,agent=True)
        page=matches[offset:offset+limit]
        page.extend(dict(record,kind='thread') for record in summaries['records'][:limit-len(page)])
        total=len(matches)+summaries['total']
        return {'records':page,'offset':offset,'total':total,'hasMore':offset+limit<total,'unreadableFiles':unreadable,
                'notice':'历史笔记、生成文件和原生逐会话总结。当前用户编辑及已裁定业务知识优先；历史不能提供当前数值或授权。'}

    def read_entry(self,payload):
        if self.user_record().get('paused'):raise ValueError('长期记忆已暂停。')
        if not payload.get('path'):return self.summary_read(payload.get('thread_id'),payload.get('version','v2'),payload.get('offset',0),payload.get('limit',8000),payload.get('expected_hash'),agent=True)
        path=payload['path'];offset=payload.get('offset',0);limit=payload.get('limit',8000)
        if path not in {f['path'] for f in self.inventory()} or type(offset) is not int or not 0<=offset<=1000000 or type(limit) is not int or not 1<=limit<=8000:raise ValueError('记忆路径或分段参数无效。')
        text=self.read(self.home/path);sha=hashlib.sha256(text.encode()).hexdigest()
        if payload.get('expected_hash') and payload['expected_hash']!=sha:raise ValueError('原生记忆已更新，请重新读取，未拼接不同版本。')
        return {'path':path,'text':text[offset:offset+limit],'sha256':sha,'offset':offset,'characters':len(text),'nextOffset':min(offset+limit,len(text)),'hasMore':offset+limit<len(text),'notice':'历史资料；当前已确认的业务知识优先。'}

    def summary_search(self, query='', offset=0, limit=10, agent=False):
        if agent and self.user_record().get('paused'):raise ValueError('长期记忆已暂停；不能把历史记忆注入分析。')
        if not isinstance(query,str) or len(query)>200 or type(offset) is not int or not 0<=offset<=10000 or type(limit) is not int or not 1<=limit<=20:raise ValueError('记忆查询或分页参数无效。')
        terms=query.split()[:8];where="trim(rollout_summary)<>''";params=[]
        if terms:
            where+=' AND ('+' OR '.join('rollout_summary LIKE ?' for _ in terms)+')'
            params=['%'+term+'%' for term in terms]
        records=[];total=0
        for version,path in self.summary_databases():
            with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as db:
                names={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if 'stage1_outputs' not in names:continue
                columns={r[1] for r in db.execute('PRAGMA table_info(stage1_outputs)')}
                if not {'thread_id','source_updated_at','rollout_summary'}<=columns:raise ValueError('原生逐会话记忆结构与锁定版本不一致，未返回不完整内容。')
                total+=db.execute('SELECT count(*) FROM stage1_outputs WHERE '+where,params).fetchone()[0]
                for row in db.execute('SELECT thread_id,source_updated_at,substr(rollout_summary,1,300),length(rollout_summary) FROM stage1_outputs WHERE '+where+' ORDER BY source_updated_at DESC LIMIT ?',[*params,offset+limit]):
                    records.append({'threadId':row[0],'version':version,'sourceUpdatedAt':row[1],'preview':row[2],'characters':row[3],'truncated':row[3]>300})
        records.sort(key=lambda r:(r['sourceUpdatedAt'],r['threadId']),reverse=True)
        return {'records':records[offset:offset+limit],'total':total,'offset':offset,'hasMore':offset+limit<total,
                'notice':'原生已提取的逐会话任务摘要；不等待全局合并。历史资料不是当前业务事实或数值证据，当前已确认的数据源知识优先。'}

    def summary_read(self,thread_id,version='v2',offset=0,limit=8000,expected_hash=None,agent=False):
        if agent and self.user_record().get('paused'):raise ValueError('长期记忆已暂停。')
        if not isinstance(thread_id,str) or not 1<=len(thread_id)<=128 or version not in ('v1','v2') or type(offset) is not int or not 0<=offset<=1000000 or type(limit) is not int or not 1<=limit<=8000:raise ValueError('任务记忆读取参数无效。')
        path=next((p for v,p in self.summary_databases() if v==version),None)
        if path is None:raise ValueError('此配置空间没有对应的原生任务记忆。')
        with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as db:
            row=db.execute('SELECT rollout_summary,source_updated_at FROM stage1_outputs WHERE thread_id=?',(thread_id,)).fetchone()
        if row is None:raise ValueError('此任务记忆不在当前配置空间中，或已被原生保留策略清理。')
        text,updated=row;sha=hashlib.sha256(text.encode()).hexdigest()
        if expected_hash and expected_hash!=sha:raise ValueError('原生任务记忆已更新，请从开头重新读取，未拼接不同版本。')
        return {'threadId':thread_id,'version':version,'sourceUpdatedAt':updated,'sha256':sha,'text':text[offset:offset+limit],
                'offset':offset,'characters':len(text),'hasMore':offset+limit<len(text),'nextOffset':min(offset+limit,len(text)),
                'notice':'历史任务总结，仅作理解与来源线索；数值和当前业务定义仍须重新核验。'}

    def snapshot(self, offset=0, limit=20):
        if type(offset) is not int or offset<0 or type(limit) is not int or not 1<=limit<=50:raise ValueError('记忆分页无效。')
        user = self.user_record();files = self.inventory()
        summaries = {name:self.read(self.home/name/'memory_summary.md') for name in ('memories','memories_v2') if (self.home/name/'memory_summary.md').is_file()}
        from memory_scheduler import native_control
        control=native_control(self.home)
        version = hashlib.sha256(json.dumps({'user':user,'files':files,'summaries':summaries},sort_keys=True).encode()).hexdigest()
        return {'revision':user['revision'],'version':version,'editVersion':hashlib.sha256(json.dumps({'revision':user['revision'],'content':user['content']},sort_keys=True).encode()).hexdigest(),'content':user['content'],'updatedAt':user.get('updatedAt'),
                'history':user.get('history',[])[-30:][::-1], 'nativeSummaries':summaries,
                'files':files[offset:offset+limit], 'total':len(files),'hasMore':offset+limit<len(files),'offset':offset,
                'paused':user.get('paused',False),'nativePipeline':self.pipeline(),'nativeControl':control,'scheduler':json.loads(self.read(self.directory/'scheduler.json') or '{}'),
                'scope':'当前 Codex 配置空间，跨分析会话共享；不是多租户用户隔离。',
                'notice':'原生逐会话提取至少要求历史闲置一小时，全局摘要每次成功合并后另有六小时冷却。即时笔记与用户编辑不等待合并；编辑作为纠正笔记保存，不覆盖原生生成文件。后续任务立即读取用户编辑。历史会话已读入上下文的内容无法撤回。'}

    def write(self, record):
        temp = self.file.with_suffix('.'+secrets.token_hex(6)+'.partial')
        try:
            with temp.open('x', encoding='utf-8') as f:
                temp.chmod(0o600);json.dump(record,f,ensure_ascii=False)
            temp.replace(self.file)
        finally:temp.unlink(missing_ok=True)

    def manage(self, payload):
        operation = payload.get('operation')
        with self.lock():
            if operation=='state':return self.snapshot(payload.get('offset',0),payload.get('limit',20))
            if operation=='context':
                user=self.user_record()
                return {'content':user['content'],'revision':user['revision'],'paused':user.get('paused',False),'recent':self.recent_notes() if not user.get('paused') else {'notes':[],'total':0,'hasMore':False}}
            if operation=='summary_search':return self.summary_search(payload.get('query',''),payload.get('offset',0),payload.get('limit',10))
            if operation=='summary_read':return self.summary_read(payload['threadId'],payload.get('version','v2'),payload.get('offset',0),payload.get('limit',8000),payload.get('expectedHash'))
            if operation=='read':
                requested=payload.get('path')
                if requested not in {f['path'] for f in self.inventory()}:raise ValueError('该记忆文件不属于当前配置空间。')
                return {'path':requested,'content':self.read(self.home/requested)}
            state=self.snapshot()
            allowed={state['version']}|({state['editVersion']} if operation in ('save','pause') else set())
            if payload.get('expectedVersion') not in allowed:raise ValueError('记忆已更新，请刷新后核对；编辑内容尚未保存。')
            if operation=='save':
                content=payload.get('content')
                if not isinstance(content,str) or not content.strip() or len(content)>16000 or '\x00' in content:raise ValueError('记忆编辑请填写非空正文，最多一万六千字符；清空请使用单独的清空操作。')
                record=self.user_record();previous=record['content'];at=datetime.now(timezone.utc).isoformat()
                if content==previous:return state
                if len(record.get('history',[]))>=500:raise ValueError('记忆编辑历史达到容量上限，请先整理；未删除旧记录。')
                filename=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-')+'web-user-'+secrets.token_hex(5)+'.md'
                note='User-approved memory correction. This supersedes previous user-memory wording. Database facts, formulas and results must be revalidated through the source knowledge tools; this note cannot approve business definitions.\n\n'+content
                for name in ('memories','memories_v2'):
                    directory=self.home/name/'extensions'/'ad_hoc'/'notes';self.safe_dir(directory)
                    with (directory/filename).open('x',encoding='utf-8') as file:
                        (directory/filename).chmod(0o600);file.write(note)
                record.update(revision=record['revision']+1,content=content,updatedAt=at)
                record.setdefault('history',[]).append({'at':at,'before':previous,'after':content,'actor':'user'})
                self.write(record);return self.snapshot()
            if operation=='pause':
                record=self.user_record();record['paused']=payload.get('paused') is True;self.write(record);return self.snapshot()
            if operation=='clear':
                with self.maintenance_lock():return self.clear_native(payload)
            raise ValueError('未知的记忆管理操作。')

    def clear_native(self,payload):
        if payload.get('confirmation')!='CLEAR_MEMORY':raise ValueError('清空记忆需要明确确认。')
        # Use upstream's supported command; never issue our own deletes to
        # the native SQLite state or generated memory roots.
        for path in self.home.glob('memories*.sqlite'):
            if path.is_symlink():raise ValueError('原生记忆状态路径是符号链接。')
            with sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True) as db:
                if db.execute("SELECT count(*) FROM sqlite_master WHERE name='jobs'").fetchone()[0]:
                    running=db.execute("SELECT count(*) FROM jobs WHERE status='running' AND (lease_until IS NULL OR lease_until>CAST(strftime('%s','now') AS INTEGER))").fetchone()[0]
                    if running:raise ValueError('原生记忆正在整理，请等待结束后清空；尚未执行清空。')
        if not self.user_record().get('paused'):raise ValueError('请先暂停长期记忆，再清空。')
        result=subprocess.run([self.codex,'-c','cli_auth_credentials_store="ephemeral"','debug','clear-memories'],env=dict(os.environ,CODEX_HOME=str(self.home)),capture_output=True,text=True,timeout=30)
        if result.returncode:raise ValueError('原生清空命令失败，记忆可能仅部分清理；请检查服务日志后重试。')
        if self.inventory():raise ValueError('清空后仍检测到原生记忆文件，可能有后台写入；未显示清空成功。')
        (self.directory/'scheduler-progress.json').unlink(missing_ok=True)
        self.write({'revision':self.user_record()['revision']+1,'content':'','history':[],'paused':True})
        return dict(self.snapshot(),cleared=True)
