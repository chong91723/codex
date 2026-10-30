from pathlib import Path
import os,json,sqlite3,time,hashlib
B=Path('/tmp/codex-memory-management-20261030');H=B/'background/live/profile';rows=[]
for p in H.glob('memories_v2_*.sqlite'):
 with sqlite3.connect(p.as_uri()+'?mode=ro',uri=True) as db:
  db.row_factory=sqlite3.Row
  if db.execute("SELECT count(*) FROM sqlite_master WHERE name='jobs'").fetchone()[0]:rows.extend(dict(r) for r in db.execute('SELECT kind,job_key,status,worker_id,lease_until,finished_at,last_error FROM jobs'))
with sqlite3.connect((H/'web-memory/maintenance-sessions.sqlite').as_uri()+'?mode=ro',uri=True) as db:regs=[json.loads(r[0]) for r in db.execute('SELECT record FROM sessions')]
locks=[]
for r in regs:
 root=Path('/proc')/str(r['pid'])
 if not root.is_dir():continue
 for fd in (root/'fd').iterdir():
  try:target=os.readlink(fd)
  except OSError:continue
  if r['threadId'] in target:locks.append({'pid':r['pid'],'target':target,'info':(root/'fdinfo'/fd.name).read_text()})
summary=H/'memories_v2/memory_summary.md';value={'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'jobs':rows,'registry':regs,'openThreadFiles':locks,'summaryExists':summary.exists(),'summarySha256':hashlib.sha256(summary.read_bytes()).hexdigest() if summary.exists() else None,'expectedMarkerInActualSummary':'清泉验收' in summary.read_text() if summary.exists() else False};(B/'background-native-observation.json').write_text(json.dumps(value,ensure_ascii=False,indent=2));print(json.dumps(value,ensure_ascii=False))
