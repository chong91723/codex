from pathlib import Path
from datetime import datetime,timezone
import os,json,sqlite3,signal,time,http.cookiejar,urllib.request
B=Path('/tmp/codex-memory-management-20261030');labs=[]
def alive(pid,birth=None):
 try:
  s=(Path('/proc')/str(pid)/'stat').read_text().rsplit(')',1)[1].split();return s[0]!='Z' and (birth is None or s[19]==birth)
 except FileNotFoundError:return False
for cfgfile in [B/'context.json',B/'background/context.json']:
 c=json.loads(cfgfile.read_text());o=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));o.open(c['url']+'/',timeout=5).close()
 with o.open(c['url']+'/api/status',timeout=5) as r:st=json.load(r)
 assert st['pid']==c['pid'] and st['workspace']==c['workspace'] and st['nativeRuntime']['execution']['status']=='idle'
 home=Path(c['home'])
 for path in home.glob('memories*.sqlite'):
  with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as db:
   if db.execute("SELECT count(*) FROM sqlite_master WHERE name='jobs'").fetchone()[0]:assert db.execute("SELECT count(*) FROM jobs WHERE status='running'").fetchone()[0]==0,'Native jobs unfinished; do not stop'
 ids=[c['pid'],st['nativeRuntime']['pid']];sched=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:args=(p/'cmdline').read_bytes().split(b'\0')
  except (OSError,ProcessLookupError):continue
  if b'/root/Codex/web/memory_scheduler.py' in args and str(home).encode() in args:ids.append(int(p.name));sched.append(int(p.name))
 identities={pid:(Path('/proc')/str(pid)/'stat').read_text().rsplit(')',1)[1].split()[19] for pid in ids}
 proc=Path('/proc')/str(c['pid']);args=(proc/'cmdline').read_bytes().split(b'\0');assert b'/root/Codex/web/server.py' in args and c['workspace'].encode() in args and str(c['port']).encode() in args
 labs.append({'config':c,'nativePid':st['nativeRuntime']['pid'],'schedulerPids':sched,'identities':identities})
request=B/'control/zz-final-stop.request.json';response=request.with_name('zz-final-stop.response.json');request.write_text(json.dumps({'code':'return {closedByAcceptanceController:true};','stop':True}));deadline=time.monotonic()+10
while not response.exists() and time.monotonic()<deadline:time.sleep(.1)
assert response.exists() and json.loads(response.read_text())['ok'],'Browser driver close not acknowledged'
for lab in labs:
 c=lab['config'];assert alive(c['pid'],lab['identities'][c['pid']]);os.kill(c['pid'],signal.SIGINT)
deadline=time.monotonic()+30
while time.monotonic()<deadline and any(alive(pid,birth) for lab in labs for pid,birth in lab['identities'].items()):time.sleep(.1)
remaining=[pid for lab in labs for pid,birth in lab['identities'].items() if alive(pid,birth)];assert not remaining,'Owned processes still draining; no broad kill'
receipt={'at':datetime.now(timezone.utc).isoformat(),'onlyOwnedLabsStopped':[{'url':x['config']['url'],'web':x['config']['pid'],'native':x['nativePid'],'schedulerPids':x['schedulerPids']} for x in labs],'browserCloseAcknowledged':True,'beforeExecution':'idle','unfinishedMemoryJobs':0,'forceKill':False,'profilesAndHistoryPreserved':all(Path(x['config']['home']).is_dir() for x in labs),'original42399ServiceAndHistoryUntouched':True,'dailyServiceStoppedByCleanup':False};(B/'owned-labs-cleanup.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt))
