"""Authorized in-memory environment inheritance; never emits credentials."""
from pathlib import Path
import http.cookiejar,json,os,signal,subprocess,time,urllib.request,sqlite3
ROOT=Path('/root/Codex');OUT=Path('/tmp/codex-audit-20261030');base='http://127.0.0.1:8765'
def main():
 jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
 opener.open(base+'/',timeout=5).close()
 with opener.open(base+'/api/status',timeout=5) as response:before=json.load(response)
 old=before['pid'];proc=Path('/proc')/str(old);birth=(proc/'stat').read_text().rsplit(')',1)[1].split()[19]
 argv=[part.decode() for part in (proc/'cmdline').read_bytes().split(b'\0') if part]
 assert '/root/Codex/web/server.py' in argv and argv[argv.index('--port')+1]=='8765' and argv[argv.index('--bind')+1]=='127.0.0.1'
 cwd=os.readlink(proc/'cwd');env=dict(item.decode().split('=',1) for item in (proc/'environ').read_bytes().split(b'\0') if b'=' in item)
 assert env.get('DEEPSEEK_API_KEY'),'No existing key; leave running'
 home=Path(env.get('CODEX_HOME','/root/.codex'));active=[];checked=0
 for dbpath in home.glob('state_*.sqlite'):
  with sqlite3.connect(dbpath.resolve().as_uri()+'?mode=ro',uri=True) as db:
   for tid,raw in db.execute('SELECT id,rollout_path FROM threads WHERE updated_at>? ORDER BY updated_at DESC LIMIT 50',(time.time()-86400,)):
    file=Path(raw)
    if not file.is_file():continue
    state=None;checked+=1
    # Inspect lifecycle only. Never export user text or model responses.
    for line in file.open():
     try:payload=json.loads(line).get('payload',{})
     except (ValueError,AttributeError):continue
     kind=payload.get('type')
     if kind=='task_started':state='running'
     elif kind in ('task_complete','turn_aborted','task_failed'):state='finished'
    if state=='running':active.append(tid)
 if active:raise RuntimeError('Daily restart deferred: unfinished native tasks exist; active count='+str(len(active)))
 for dbpath in home.glob('memories*.sqlite'):
  with sqlite3.connect(dbpath.resolve().as_uri()+'?mode=ro',uri=True) as db:
   if db.execute("SELECT count(*) FROM sqlite_master WHERE name='jobs'").fetchone()[0]:
    running=db.execute("SELECT count(*) FROM jobs WHERE status='running' AND (lease_until IS NULL OR lease_until>?)",(int(time.time()),)).fetchone()[0]
    if running:raise RuntimeError('Daily restart deferred: native memory work is running')
 receipt={'oldPid':old,'checkedRecentThreads':checked,'unfinishedTasks':0,'sameArguments':True,'sameWorkingDirectory':True,'existingEnvironmentInheritedInMemory':True,'credentialsPrintedOrPersisted':False}
 (OUT/'daily-restart-preflight.json').write_text(json.dumps(receipt,indent=2))
 assert (proc/'stat').read_text().rsplit(')',1)[1].split()[19]==birth
 os.kill(old,signal.SIGINT);deadline=time.monotonic()+20
 while proc.exists() and time.monotonic()<deadline:
  if (proc/'stat').read_text().rsplit(')',1)[1].split()[0]=='Z':break
  time.sleep(.1)
 if proc.exists() and (proc/'stat').read_text().rsplit(')',1)[1].split()[0]!='Z':raise RuntimeError('Daily server did not stop; no duplicate started')
 private=ROOT/'.local-state/single-execution-2026-10-29';private.mkdir(parents=True,exist_ok=True,mode=0o700);log=(private/'service.log').open('ab',buffering=0);os.chmod(private/'service.log',0o600)
 new=subprocess.Popen(argv,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);del env;log.close()
 deadline=time.monotonic()+45
 while time.monotonic()<deadline:
  try:
   opener.open(base+'/',timeout=3).close()
   with opener.open(base+'/api/status',timeout=3) as response:status=json.load(response)
   if status.get('pid')==new.pid and status.get('nativeProcessLifetime')=='web-service':
    receipt.update(newPid=new.pid,gracefulStop=True,httpReady=True,analysisBridgeVersion=status.get('analysisBridgeVersion'),nativeProcessLifetime=status['nativeProcessLifetime'],workspace=status['workspace'],historyDeleted=False);(OUT/'daily-restart.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt));return
  except (OSError,ValueError):pass
  if new.poll() is not None:raise RuntimeError('Daily service exited; private log preserved')
  time.sleep(.2)
 raise RuntimeError('Daily service not ready; preserve process for diagnosis')
if __name__=='__main__':main()
