"""Schedule the unmodified native memory pipeline, independent of browser WS.

No custom summarizer or replacement agent loop. One native maintenance turn
triggers the upstream extraction/consolidation; SQLite is inspected read-only
for due work and progress. Owned processes stop with the Web service.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import queue
import signal
import sqlite3
import subprocess
import sys
import threading
import time

INTERVAL = 300
SCHEDULER_VERSION = "native-memory-scheduler-v7"


def process_birth(pid):
    try:return Path('/proc',str(pid),'stat').read_text().rsplit(')',1)[1].split()[19]
    except OSError:return None


def alive(pid):
    try:
        os.kill(pid,0)
        state=Path('/proc',str(pid),'stat').read_text().rsplit(')',1)[1].split()[0]
        return state not in ('Z','X')
    except (ProcessLookupError,PermissionError,FileNotFoundError):return False


def eligible(home, current_time=None):
    current_time = time.time() if current_time is None else current_time
    processed = {}
    for path in Path(home).glob('memories_v2_*.sqlite'):
        if path.is_symlink():raise ValueError('原生状态路径无效。')
        with sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True) as db:
            if db.execute("SELECT count(*) FROM sqlite_master WHERE name='stage1_outputs'").fetchone()[0]:
                processed.update({r[0]:r[1] for r in db.execute('SELECT thread_id,source_updated_at FROM stage1_outputs')})
    result=[]
    for path in Path(home).glob('state_*.sqlite'):
        if path.is_symlink():raise ValueError('原生状态路径无效。')
        with sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True) as db:
            if not db.execute("SELECT count(*) FROM sqlite_master WHERE name='threads'").fetchone()[0]:continue
            for identifier, updated in db.execute("SELECT id,updated_at FROM threads WHERE memory_mode='enabled' AND updated_at<=? AND updated_at>=? ORDER BY updated_at DESC", (current_time-3600,current_time-30*86400)):
                if processed.get(identifier,-1)<updated:result.append(identifier)
    return result


def consolidation_due(home, current_time=None):
    current_time=time.time() if current_time is None else current_time
    for path in Path(home).glob('memories_v2_*.sqlite'):
        if path.is_symlink():raise ValueError('原生状态路径无效。')
        with sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True) as db:
            names={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {'stage1_outputs','jobs'}<=names:continue
            latest=db.execute('SELECT max(source_updated_at) FROM stage1_outputs').fetchone()[0]
            if latest is None:continue
            job=db.execute("SELECT status,last_error,lease_until,retry_at,last_success_watermark FROM jobs WHERE kind='memory_consolidate_global' AND job_key='global'").fetchone()
            if job and ((job[0]=='running' and (job[2] is None or job[2]>current_time)) or (job[3] and job[3]>current_time)):continue
            if not job or latest>(job[4] or -1) or (job[1] and job[0] not in ('done','completed')) or not (Path(home)/'memories_v2'/'memory_summary.md').exists():return True
    return False


def native_control(home, current_time=None):
    # Pinned upstream state/src/runtime/memories.rs: successful phase 2 has a
    # non-configurable six-hour cooldown. Do not reset jobs or timestamps.
    current_time=time.time() if current_time is None else current_time
    for path in Path(home).glob('memories_v2_*.sqlite'):
        if path.is_symlink():raise ValueError('原生状态路径无效。')
        with sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True) as db:
            if not db.execute("SELECT count(*) FROM sqlite_master WHERE name='jobs'").fetchone()[0]:continue
            row=db.execute("SELECT status,lease_until,retry_at,finished_at,last_error FROM jobs WHERE kind='memory_consolidate_global' AND job_key='global'").fetchone()
            if not row:continue
            if row[0]=='running' and row[1] and row[1]>current_time:return {'state':'waiting_native_busy','until':row[1]}
            if row[2] and row[2]>current_time:return {'state':'waiting_native_retry','until':row[2]}
            if not row[4] and row[3] and row[3]+21600>current_time:return {'state':'waiting_native_cooldown','until':row[3]+21600}
    return {'state':'ready'}


def notes_token(home):
    root=Path(home)/'memories_v2'/'extensions'/'ad_hoc'/'notes'
    if not root.exists():return None
    from native_memory import NativeMemory
    NativeMemory.safe_dir(root)
    files=[]
    for path in sorted(root.glob('*.md')):
        if path.is_symlink():raise ValueError('原生笔记路径无效。')
        stat=path.stat();files.append([path.name,stat.st_size,stat.st_mtime_ns])
    return hashlib.sha256(json.dumps(files).encode()).hexdigest() if files else None


def notes_due(home):
    token=notes_token(home)
    if token is None:return False
    progress=Path(home)/'web-memory'/'scheduler-progress.json'
    from native_memory import NativeMemory
    value=json.loads(NativeMemory.read(progress) or '{}')
    return value.get('notesToken')!=token


def generated_token(home):
    from native_memory import NativeMemory
    root=Path(home)/'memories_v2';digest=hashlib.sha256()
    if not root.exists():return digest.hexdigest()
    for path in sorted(root.rglob('*.md')):
        relative=path.relative_to(root)
        if {'extensions','rollout_summaries','.git'}&set(relative.parts) or path.name in ('phase2_workspace_diff.md','raw_memories.md'):continue
        if any((root/Path(*relative.parts[:i])).is_symlink() for i in range(1,len(relative.parts)+1)):raise ValueError('原生生成记忆路径无效。')
        digest.update(relative.as_posix().encode());digest.update(b'\x00');digest.update(NativeMemory.read(path).encode());digest.update(b'\x00')
    return digest.hexdigest()


def ensure_scheduler(codex, home, owner_pid=None):
    from native_memory import NativeMemory
    memory=NativeMemory(codex,home)
    state_path=memory.directory/'scheduler.json'
    if state_path.is_file():
        state=json.loads(memory.read(state_path))
        if state.get('pid') and alive(state['pid']) and (state.get('birth') is None or state.get('birth')==process_birth(state['pid'])):
            if state.get('version')==SCHEDULER_VERSION:return
            # Drain an older memory worker; never interrupt user turns or kill an
            # unknown PID referenced by a stale/corrupt receipt.
            if memory.pipeline()['running']:return
            try:
                command=Path('/proc',str(state['pid']),'cmdline').read_bytes().split(b'\x00')
                script=str(Path(__file__).resolve()).encode();expected_home=str(Path(home)).encode()
                owned=script in command and b'--home' in command and command[command.index(b'--home')+1]==expected_home
                if owned:os.kill(state['pid'],signal.SIGTERM)
            except (OSError,ValueError,IndexError):pass
    owner_pid=owner_pid or os.getppid() # worker is a direct child of the Web service
    subprocess.Popen([sys.executable,'-B',str(Path(__file__).resolve()),'--codex',str(codex),'--home',str(home),'--owner-pid',str(owner_pid),'--interval',os.environ.get('CODEX_WEB_MEMORY_CHECK_INTERVAL',str(INTERVAL))],
                     stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True,close_fds=True)


class NativeSession:
    def __init__(self,codex,home,owner,stop):
        overrides=['cli_auth_credentials_store="ephemeral"','memories.version="v2"',
                   'memories.extract_model="deepseek-flash"','memories.consolidation_model="deepseek-flash"']
        self.process=subprocess.Popen([codex,*[arg for value in overrides for arg in ('-c',value)],'app-server','--listen','stdio://'],
            env=dict(os.environ,CODEX_HOME=str(home)),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1,start_new_session=True)
        self.messages=queue.Queue();self.serial=0;self.owner=owner;self.stop=stop;self.birth=process_birth(self.process.pid)
        def read():
            try:
                for line in self.process.stdout:
                    try:self.messages.put(json.loads(line))
                    except json.JSONDecodeError:pass
            finally:self.messages.put(None)
        threading.Thread(target=read,daemon=True).start()
    def call(self,method,params):
        self.serial+=1;identifier=self.serial
        self.process.stdin.write(json.dumps({'id':identifier,'method':method,'params':params})+'\n');self.process.stdin.flush()
        deadline=time.monotonic()+30
        while time.monotonic()<deadline and not self.stop.is_set() and alive(self.owner):
            try:value=self.messages.get(timeout=.5)
            except queue.Empty:continue
            if value is None:raise RuntimeError('原生记忆进程已退出。')
            if value.get('id')==identifier:
                if 'error' in value:raise RuntimeError('原生记忆协议请求失败：'+method)
                return value.get('result')
        raise RuntimeError('原生记忆协议等待超时。')
    def close(self):
        def signal_owned(sig):
            current=process_birth(self.process.pid)
            if current is not None and current!=self.birth:return
            try:os.killpg(self.process.pid,sig)
            except ProcessLookupError:pass
        # The parent's normal/crash exit does not prove its owned descendants
        # have exited; release this dedicated session's group too.
        signal_owned(signal.SIGTERM)
        if self.process.poll() is None:
            try:self.process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                signal_owned(signal.SIGKILL);self.process.wait(timeout=5)
        signal_owned(signal.SIGKILL)
        for pipe in (self.process.stdin,self.process.stdout):
            if pipe:pipe.close()


def maintain(codex,home,owner,stop,status):
    from native_memory import NativeMemory
    # Clearing and native startup are mutually exclusive, including the gap
    # before native jobs acquire their SQLite leases.
    with NativeMemory(codex,home).maintenance_lock():
        return _maintain(codex,home,owner,stop,status)


def _maintain(codex,home,owner,stop,status):
    from native_memory import NativeMemory
    memory=NativeMemory(codex,home)
    candidates=eligible(home);pending_notes=notes_due(home);captured_notes=notes_token(home);artifacts_before=generated_token(home)
    if not candidates and not consolidation_due(home) and not pending_notes:return 'waiting_for_eligible_history'
    control=native_control(home)
    if not candidates and control['state']!='ready':
        status(control['state'],nativeControl=control);return control['state']
    session=NativeSession(codex,home,owner,stop);thread_id=None
    try:
        session.call('initialize',{'clientInfo':{'name':'codex_web_memory_maintenance','version':'1'},'capabilities':{'experimentalApi':True}})
        session.process.stdin.write('{"method":"initialized"}\n');session.process.stdin.flush()
        config=session.call('config/read',{'includeLayers':False})['config']
        if config.get('features',{}).get('memories') is False:return 'paused_by_native_config'
        if config.get('model_provider') in (None,'openai'):return 'provider_not_configured'
        # App-server starts native memory only on a nonempty turn/start
        # (turn_processor.rs), not thread/start. This bounded trigger is not a
        # summary prompt. Its own history is excluded from future extraction.
        workspace=memory.directory/'maintenance';workspace.mkdir(exist_ok=True,mode=0o700)
        overrides={f'mcp_servers.{name}.enabled':False for name in config.get('mcp_servers',{})}
        result=session.call('thread/start',{'cwd':str(workspace),'model':'deepseek-flash','sandbox':'read-only','approvalPolicy':'never','config':{**overrides,
            'features':{'memories':True},'memories':{'version':'v2','dual_write':False,'generate_memories':False,'use_memories':True,
            'extract_model':'deepseek-flash','consolidation_model':'deepseek-flash','min_rollout_idle_hours':1,'max_rollouts_per_startup':4}}})
        thread_id=result['thread']['id']
        session.call('turn/start',{'threadId':thread_id,'model':'deepseek-flash','effort':'low','input':[{'type':'text','text':'Internal memory-maintenance trigger. Do not query databases, read files, call tools or perform analysis. Reply only: Maintenance started.'}]})
        status('running',candidateCount=len(candidates),nativeTriggerSubmitted=True)
        deadline=time.monotonic()+600;seen_work=False;last_update=time.monotonic()
        while time.monotonic()<deadline and not stop.wait(2) and alive(owner):
            pipeline=memory.pipeline(thread_id);remaining=eligible(home)
            # Pause prevents new batches; let a claimed native job drain so
            # stopping memory does not abandon its one-hour upstream lease.
            if memory.user_record().get('paused') and not pipeline['running']:return 'paused'
            if time.monotonic()-last_update>=10:
                status('running',candidateCount=len(candidates),remaining=len(remaining),nativePipeline=pipeline)
                last_update=time.monotonic()
            seen_work=seen_work or bool(pipeline['jobs']) or len(remaining)<len(candidates)
            if seen_work and not pipeline['running']:
                control=native_control(home)
                if pipeline.get('extracted') and not pipeline['consolidated'] and control['state']!='ready':
                    status('history_processed_waiting_merge',nativeControl=control,remaining=len(remaining));return 'history_processed_waiting_merge'
                # A finished native summary, not a timer, is the success signal.
                ready=session.call('memory/status',{'minConsolidatedThreads':1})
                summary=session.call('thread/memory/read',{'threadId':thread_id})
                summary_updated=generated_token(home)!=artifacts_before
                if summary.get('summary') and not pipeline['failed'] and pipeline['consolidated'] and (ready.get('v2Ready') or pending_notes) and (not pending_notes or summary_updated):
                    if captured_notes and captured_notes==notes_token(home):
                        from analysis_evidence import Evidence
                        Evidence.write(memory.directory/'scheduler-progress.json',{'notesToken':captured_notes,'completedAt':datetime.now(timezone.utc).isoformat(),'nativeWorker':thread_id})
                    status('completed',candidateCount=len(remaining),nativeReady=ready,mode='notes_and_history' if candidates else 'native_notes_consolidation')
                    return 'completed'
                if pipeline['consolidated'] and not summary.get('summary'):return 'no_useful_memory'
                if pipeline['consolidated'] and pending_notes and not summary_updated:return 'native_summary_unchanged'
                if pipeline['failed']:raise RuntimeError('原生历史提取或合并报告失败。')
        return 'interrupted' if stop.is_set() or not alive(owner) else 'timeout'
    finally:
        try:
            if thread_id and not stop.is_set() and alive(owner) and not memory.pipeline(thread_id)['running']:
                try:session.call('thread/delete',{'threadId':thread_id});status(None,maintenanceThreadRemoved=True)
                except RuntimeError:status(None,cleanupWarning='本次后台维护会话未能自动移除；原生记忆结果不受此提示保证。')
        finally:session.close()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--codex',required=True);parser.add_argument('--home',required=True);parser.add_argument('--owner-pid',type=int,required=True);parser.add_argument('--interval',type=int,default=INTERVAL);args=parser.parse_args()
    if not 5<=args.interval<=3600:raise ValueError('调度检查间隔超出范围。')
    from native_memory import NativeMemory
    memory=NativeMemory(args.codex,args.home);stop=threading.Event()
    for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,lambda *_:stop.set())
    fd=os.open(memory.directory/'scheduler.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'r+') as lock:
        deadline=time.monotonic()+15
        while True:
            try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);break
            except BlockingIOError:
                receipt=json.loads(memory.read(memory.directory/'scheduler.json') or '{}')
                if receipt.get('version')==SCHEDULER_VERSION and alive(receipt.get('pid',0)):return
                if time.monotonic()>=deadline:return
                stop.wait(.1)
        last_record={}
        def status(value,**extra):
            nonlocal last_record
            from analysis_evidence import Evidence
            value=value or last_record.get('status','running')
            record={**(last_record if last_record.get('status')==value else {}),'version':SCHEDULER_VERSION,'pid':os.getpid(),'birth':process_birth(os.getpid()),'ownerPid':args.owner_pid,'status':value,'checkedAt':datetime.now(timezone.utc).isoformat(),'intervalSeconds':args.interval,**extra}
            Evidence.write(memory.directory/'scheduler.json',record);last_record=record
        while not stop.is_set() and alive(args.owner_pid):
            try:
                result='paused' if memory.user_record().get('paused') else maintain(args.codex,args.home,args.owner_pid,stop,status)
                status(result)
            except Exception as error:
                # Retain a diagnostic category and our own actionable protocol
                # errors, without serializing native response bodies or secrets.
                status('failed',error='后台原生记忆整理未完成；将在下次检查重试。',errorType=type(error).__name__,
                       detail=str(error) if isinstance(error,RuntimeError) else '请检查服务日志及当前配置空间的存储、权限与原生记忆状态。')
            until=time.monotonic()+args.interval
            while not stop.wait(2) and alive(args.owner_pid) and time.monotonic()<until:pass
        status('stopped')


if __name__=='__main__':main()
