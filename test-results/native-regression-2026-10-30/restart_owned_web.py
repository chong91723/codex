from pathlib import Path
import json,os,signal,subprocess,time,urllib.request,http.cookiejar
BASE=Path('/tmp/codex-audit-20261030');cfg=json.loads((BASE/'context.json').read_text());p=Path('/proc',str(cfg['pid']));args=[v.decode() for v in (p/'cmdline').read_bytes().split(b'\0') if v];assert cfg['workspace'] in args and '/root/Codex/web/server.py' in args
env=dict(v.decode().split('=',1) for v in (p/'environ').read_bytes().split(b'\0') if b'=' in v);assert env['CODEX_HOME']==cfg['home']
def alive():
 try:return p.joinpath('stat').read_text().rsplit(')',1)[1].split()[0] not in ('Z','X')
 except OSError:return False
os.kill(cfg['pid'],signal.SIGINT);deadline=time.monotonic()+30
while alive() and time.monotonic()<deadline:time.sleep(.1)
assert not alive()
with (BASE/'live/service.log').open('ab',buffering=0) as log:new=subprocess.Popen(args,cwd='/root/Codex',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
del env;cfg['pid']=new.pid;(BASE/'context.json').write_text(json.dumps(cfg,indent=2))
c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
for _ in range(150):
 try:
  c.open(cfg['url']+'/',timeout=2).close()
  with c.open(cfg['url']+'/api/status',timeout=2) as r:s=json.load(r)
  if s['pid']==new.pid:break
 except OSError:pass
 time.sleep(.1)
else:raise RuntimeError('Owned service did not become ready')
print(json.dumps({'restartedPid':new.pid,'home':cfg['home'],'environmentInMemoryOnly':True,'historyDeleted':False}))
