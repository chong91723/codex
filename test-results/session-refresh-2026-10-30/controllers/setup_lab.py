from pathlib import Path
import os,json,subprocess,socket,time,urllib.request,http.cookiejar,sqlite3
B=Path('/tmp/codex-refresh-20261030');R=Path('/root/Codex');prev=json.loads(Path('/tmp/codex-memory-management-20261030/context.json').read_text());home=Path(prev['home']);workspace=Path(prev['workspace'])
c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));c.open('http://127.0.0.1:8765/').close()
with c.open('http://127.0.0.1:8765/api/status') as r:daily=json.load(r)
p=Path('/proc',str(daily['pid']));args=p.joinpath('cmdline').read_bytes().split(b'\0');assert b'/root/Codex/web/server.py' in args and b'8765' in args
inherited=dict(v.decode().split('=',1) for v in p.joinpath('environ').read_bytes().split(b'\0') if b'=' in v)
env={k:v for k,v in inherited.items() if k in ('PATH','HOME','LANG','LC_ALL','SSL_CERT_FILE','SSL_CERT_DIR','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy','DEEPSEEK_API_KEY')};del inherited
assert env.get('DEEPSEEK_API_KEY');env.update(CODEX_HOME=str(home),CODEX_WEB_DB_STATE=str(home/'web-databases'),CODEX_WEB_ANALYSIS_ROOTS=str(workspace),PYTHONDONTWRITEBYTECODE='1')
s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close()
fd=os.open(B/'private-service.log',os.O_CREAT|os.O_APPEND|os.O_WRONLY,0o600)
with os.fdopen(fd,'ab',buffering=0) as log:proc=subprocess.Popen(['/usr/bin/python3','-B',str(R/'web/server.py'),'--codex',str(R/'native/bin/codex'),'--bind','127.0.0.1','--port',str(port),'--workspace',str(workspace)],cwd=str(R),env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
del env
for _ in range(250):
 try:
  c.open(f'http://127.0.0.1:{port}/',timeout=2).close()
  with c.open(f'http://127.0.0.1:{port}/api/status',timeout=3) as r:status=json.load(r)
  if status['pid']==proc.pid:break
 except OSError:pass
 if proc.poll() is not None:raise RuntimeError('Owned lab failed; private log retained')
 time.sleep(.1)
else:raise RuntimeError('Readiness not observed')
cfg={'url':f'http://127.0.0.1:{port}','pid':proc.pid,'port':port,'home':str(home),'workspace':str(workspace),'birth':Path('/proc',str(proc.pid),'stat').read_text().rsplit(')',1)[1].split()[19],'model':'deepseek-flash','provider':'deepseek','envInheritedOnlyInMemory':True,'dailyServiceUnchanged':True}
(B/'context.json').write_text(json.dumps(cfg,indent=2));print(json.dumps(cfg))
c=sqlite3.connect('file:'+str(home/'state_5.sqlite')+'?mode=ro',uri=True);rows=c.execute('select id,title,archived,memory_mode from threads order by updated_at desc').fetchall();assert all(row[3]=='disabled' for row in rows)
(B/'fixture-threads.json').write_text(json.dumps([dict(zip(('id','title','archived','memoryMode'),row)) for row in rows],ensure_ascii=False,indent=2))
