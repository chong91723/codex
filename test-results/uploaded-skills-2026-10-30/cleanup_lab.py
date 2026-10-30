from pathlib import Path
import json,time,signal,os,http.cookiejar,urllib.request
B=Path('/tmp/codex-uploaded-skills-20261030');cfg=json.loads((B/'context.json').read_text());jar=http.cookiejar.CookieJar();o=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));o.open(cfg['url']+'/',timeout=5).close()
with o.open(cfg['url']+'/api/status',timeout=5) as r:s=json.load(r)
assert s['pid']==cfg['pid'] and s['workspace']==cfg['workspace'] and s['nativeRuntime']['execution']['status']=='idle'
with o.open(cfg['url']+'/api/skills',timeout=5) as r:assert json.load(r)['skills']==[]
p=Path('/proc')/str(cfg['pid']);argv=(p/'cmdline').read_bytes().split(b'\0');assert b'/root/Codex/web/server.py' in argv and str(cfg['port']).encode() in argv and cfg['workspace'].encode() in argv
birth=(p/'stat').read_text().rsplit(')',1)[1].split()[19];native=s['nativeRuntime']['pid'];nativeProc=Path('/proc')/str(native);assert int((nativeProc/'status').read_text().split('PPid:')[1].split()[0])==cfg['pid']
name='zz-final-stop';control=B/'control';(control/(name+'.request.json')).write_text(json.dumps({'code':'return {closedByAcceptanceController:true};','stop':True}));deadline=time.monotonic()+8
while not (control/(name+'.response.json')).exists() and time.monotonic()<deadline:time.sleep(.1)
assert (control/(name+'.response.json')).is_file(),'Driver stop not acknowledged'
assert (p/'stat').read_text().rsplit(')',1)[1].split()[19]==birth
os.kill(cfg['pid'],signal.SIGINT);deadline=time.monotonic()+20
while time.monotonic()<deadline:
 def alive(q):
  try:return (q/'stat').read_text().rsplit(')',1)[1].split()[0]!='Z'
  except FileNotFoundError:return False
 if not alive(p) and not alive(nativeProc):break
 time.sleep(.1)
assert not alive(p) and not alive(nativeProc),'Owned lab still running; no broad kill'
receipt={'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'stoppedOnlyOwnedWeb':cfg['pid'],'nativePid':native,'browserDriverAcknowledgedClose':True,'executionBefore':'idle','registryEmpty':True,'originalProfilesOrServicesStopped':False,'memoryTimer42399Untouched':True,'profileAndHistoryPreserved':Path(cfg['home']).is_dir(),'actualProofPreserved':(Path(cfg['workspace'])/'acceptance/uploaded-skill-proof.json').is_file()};(B/'cleanup.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt))
