from pathlib import Path
import os,sys,json,urllib.request,http.cookiejar,signal,subprocess,time,hashlib
B=Path('/tmp/codex-uploaded-skills-20261030');cfig=json.loads((B/'context.json').read_text());c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));c.open(cfig['url']+'/',timeout=5).close()
with c.open(cfig['url']+'/api/status',timeout=5) as f:before=json.load(f)
assert before['pid']==cfig['pid'] and before['workspace']==cfig['workspace'] and before['nativeRuntime']['execution']['status']=='idle'
p=Path('/proc',str(before['pid']));stat=p.joinpath('stat').read_text().rsplit(')',1)[1].split();birth=stat[19];argv=[v.decode() for v in p.joinpath('cmdline').read_bytes().split(b'\0') if v];assert '/root/Codex/web/server.py' in argv and str(cfig['port']) in argv and cfig['workspace'] in argv
cwd=os.readlink(p/'cwd');env=dict(v.decode().split('=',1) for v in p.joinpath('environ').read_bytes().split(b'\0') if b'=' in v);assert env['CODEX_HOME']==cfig['home'];assert p.joinpath('stat').read_text().rsplit(')',1)[1].split()[19]==birth
os.kill(before['pid'],signal.SIGINT)
for _ in range(200):
 try:
  if p.joinpath('stat').read_text().rsplit(')',1)[1].split()[0]=='Z':break
 except FileNotFoundError:break
 time.sleep(.1)
else:raise RuntimeError('Owned lab did not stop; no duplicate launch')
with (B/'live/service.log').open('ab',buffering=0) as log:new=subprocess.Popen(argv,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
del env;cfig['pid']=new.pid;(B/'context.json').write_text(json.dumps(cfig,indent=2))
for _ in range(250):
 try:
  c.open(cfig['url']+'/',timeout=3).close()
  with c.open(cfig['url']+'/api/status',timeout=3) as f:s=json.load(f)
  if s['pid']==new.pid:break
 except OSError:pass
 if new.poll() is not None:raise RuntimeError('Owned lab restart failed; private log preserved')
 time.sleep(.1)
else:raise RuntimeError('Owned lab readiness not observed')
r={'oldPid':before['pid'],'newPid':new.pid,'workspace':cfig['workspace'],'profileAndHistoryPreserved':True,'credentialsOnlyInMemory':True,'sourceSha256':{name:hashlib.sha256((Path('/root/Codex')/name).read_bytes()).hexdigest() for name in ('web/server.py','web/skill_packages.py','web/public/app.js')}};(B/'restart-after-review.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
