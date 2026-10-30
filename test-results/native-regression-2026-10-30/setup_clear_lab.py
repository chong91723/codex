"""Owned isolated regression setup; model environment stays in memory."""
from pathlib import Path
import http.cookiejar,urllib.request,json,os,socket,subprocess,sys,time

ROOT=Path('/root/Codex');BASE=Path('/tmp/codex-audit-20261030/clear-lab')
def client(port):
 c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));c.open(f'http://127.0.0.1:{port}/',timeout=5).close()
 with c.open(f'http://127.0.0.1:{port}/api/status',timeout=5) as r:return c,json.load(r)
def environment(pid,workspace):
 p=Path('/proc',str(pid));args=(p/'cmdline').read_bytes().split(b'\0')
 assert b'/root/Codex/web/server.py' in args and workspace.encode() in args
 return dict(v.decode().split('=',1) for v in (p/'environ').read_bytes().split(b'\0') if b'=' in v)
def main():
 BASE.mkdir(mode=0o700,exist_ok=True);run=BASE/'live';run.mkdir(mode=0o700,exist_ok=False)
 home=run/'profile';workspace=run/'workspace';workspace.mkdir(mode=0o700)
 _,previous=client(34837);env=environment(previous['pid'],previous['workspace'])
 assert previous['nativeRuntime']['execution']['status']=='idle'
 assert env.get('DEEPSEEK_API_KEY'),'Existing authorized model environment missing'
 sys.path[:0]=[str(ROOT/'web'),str(ROOT/'web/database')]
 from start import deepseek_profile
 deepseek_profile(home)
 env.update(CODEX_HOME=str(home),CODEX_WEB_DB_STATE=str(home/'web-databases'),CODEX_WEB_ANALYSIS_ROOTS=str(workspace),CODEX_WEB_MEMORY_CHECK_INTERVAL='300')
 for key in ('CODEX_WEB_TOKEN','CODEX_WEB_PUBLIC_DIR'):env.pop(key,None)
 # Deliberately do NOT open, copy, symlink or share any existing database
 # registry. Database tests use the already-owned AdventureWorks service.
 # This new profile is for native lifecycle and destructive-memory tests.
 sources=[]
 sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
 fd=os.open(run/'service.log',os.O_CREAT|os.O_APPEND|os.O_WRONLY,0o600)
 with os.fdopen(fd,'ab',buffering=0) as log:p=subprocess.Popen(['/usr/bin/python3','-B',str(ROOT/'web/server.py'),'--codex',str(ROOT/'native/bin/codex'),'--bind','127.0.0.1','--port',str(port),'--workspace',str(workspace)],cwd=str(ROOT),env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 del env
 for _ in range(150):
  try:
   _,current=client(port)
   if current['pid']==p.pid:break
  except (OSError,ValueError):pass
  if p.poll() is not None:raise RuntimeError('Owned service exited; private log preserved')
  time.sleep(.1)
 else:raise RuntimeError('Owned service readiness unknown')
 value={'root':str(ROOT),'base':str(BASE),'home':str(home),'workspace':str(workspace),'url':f'http://127.0.0.1:{port}','port':port,'pid':p.pid,'sources':sources,'model':'deepseek-flash','provider':'deepseek','originalProfilesChanged':False,'credentialsPrintedOrSavedInReceipts':False,'oldHistoriesDeleted':False}
 (BASE/'context.json').write_text(json.dumps(value,ensure_ascii=False,indent=2));print(json.dumps(value,ensure_ascii=False))

if __name__=='__main__':main()
