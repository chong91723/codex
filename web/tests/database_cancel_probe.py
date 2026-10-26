"""Observe server-side queries after a real browser initiated action. Read-only."""
import json,subprocess,sys,base64,urllib.request,os
from pathlib import Path
credentials=json.loads(Path(os.environ.get('CODEX_DATABASE_CREDENTIALS','/tmp/codex-database-work/fixture-credentials.json')).read_text())
engine=sys.argv[1]
if engine=='mysql':
 r=subprocess.run(['docker','exec','-e','MYSQL_PWD='+credentials[engine]['admin'],'codex-web-mysql','mysql','-uroot','-N','-B','-e',"SELECT ID FROM information_schema.PROCESSLIST WHERE USER='codex_reader' AND COMMAND='Query' AND INFO LIKE '%cancel_marker%'"],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('Could not inspect MySQL test query')
 print(json.dumps({'active':len(r.stdout.splitlines())}))
elif engine=='postgresql':
 r=subprocess.run(['docker','exec','-e','PGPASSWORD='+credentials[engine]['admin'],'codex-web-postgres','psql','-U','postgres','-d','analytics','-t','-A','-c',"SELECT count(*) FROM pg_stat_activity WHERE usename='codex_reader' AND state='active' AND query LIKE '%cancel_marker%'"],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('Could not inspect PostgreSQL test query')
 print(json.dumps({'active':int(r.stdout.strip())}))
elif engine=='clickhouse':
 q="SELECT count() FROM system.processes WHERE user='codex_reader' AND query LIKE '%cancel_marker%' FORMAT JSON"
 request=urllib.request.Request('http://127.0.0.1:18123/',data=q.encode(),headers={'Authorization':'Basic '+base64.b64encode(('admin:'+credentials[engine]['admin']).encode()).decode()})
 with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request,timeout=3) as response:print(json.dumps({'active':int(json.load(response)['data'][0]['count()'])}))
