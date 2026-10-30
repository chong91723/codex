"""Bounded real-process sampling; no arguments/environment or database content saved."""
from pathlib import Path
import json,os,time,urllib.request,http.cookiejar
from datetime import datetime,timezone
BASE=Path('/tmp/codex-audit-20261030');deadline=time.monotonic()+3600;started=datetime.now(timezone.utc).isoformat();out=(BASE/'resource-final-samples.jsonl').open('a')
clients={}
for port in (34837,42399):
 c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));c.open(f'http://127.0.0.1:{port}/',timeout=4).close();clients[port]=c
count=0;peak=0
while time.monotonic()<deadline and not (BASE/'resource-final-stop').exists():
 roots=set();execution={}
 for port,c in clients.items():
  try:
   try:
    r=c.open(f'http://127.0.0.1:{port}/api/status',timeout=2)
   except urllib.error.HTTPError as e:
    if e.code!=401:raise
    c.open(f'http://127.0.0.1:{port}/',timeout=2).close();r=c.open(f'http://127.0.0.1:{port}/api/status',timeout=2)
   with r:s=json.load(r)
   roots.add(s['pid']);execution[str(port)]=s.get('nativeRuntime',{}).get('execution',{}).get('status')
  except OSError:
   execution[str(port)]='unavailable'
   if port==42399:
    try:
     cfg=json.loads((BASE/'context.json').read_text());pid=cfg['pid'];args=(Path('/proc')/str(pid)/'cmdline').read_bytes().split(b'\0')
     if b'/root/Codex/web/server.py' in args and cfg['workspace'].encode() in args:roots.add(pid)
    except (OSError,ValueError,KeyError):pass
 processes={}
 for path in Path('/proc').iterdir():
  if not path.name.isdigit():continue
  try:
   fields=(path/'stat').read_text().rsplit(')',1)[1].split();args=(path/'cmdline').read_bytes().split(b'\0');pid=int(path.name)
   if b'/tmp/codex-audit-20261030/browser_driver.mjs' in args:roots.add(pid)
   processes[pid]=(int(fields[1]),path,fields)
  except (OSError,IndexError,ValueError):continue
 selected=set(roots)
 while True:
  extra={pid for pid,(parent,_,_) in processes.items() if parent in selected};old=len(selected);selected|=extra
  if len(selected)==old:break
 rows=[]
 for pid in selected:
  if pid not in processes:continue
  parent,path,fields=processes[pid]
  try:
   memory={line.split(':',1)[0]:int(line.split()[1]) for line in (path/'smaps_rollup').read_text().splitlines() if line.startswith(('Rss:','Pss:'))}
   rows.append({'pid':pid,'parent':parent,'birth':fields[19],'executable':Path(os.readlink(path/'exe')).name,'rssKiB':memory.get('Rss',0),'pssKiB':memory.get('Pss',0),'cpuTicks':int(fields[11])+int(fields[12])})
  except (OSError,ValueError):continue
 total=sum(p['pssKiB'] for p in rows);peak=max(peak,total);count+=1
 try:phase=json.loads((BASE/'resource-phase.json').read_text())
 except (OSError,ValueError):phase={'phase':'initial-native-tests'}
 out.write(json.dumps({'at':datetime.now(timezone.utc).isoformat(),'phase':phase,'execution':execution,'processes':rows,'totalPssKiB':total})+'\n');out.flush();time.sleep(2)
out.close();(BASE/'resource-final-summary.json').write_text(json.dumps({'startedAt':started,'finishedAt':datetime.now(timezone.utc).isoformat(),'samples':count,'peakAggregatePssKiB':peak,'scope':'Two owned Web service trees plus audit browser; actual selected native/MCP/Python descendants; not whole-host or database-container memory; timestamps and phases distinguish idle/active.'},indent=2))
