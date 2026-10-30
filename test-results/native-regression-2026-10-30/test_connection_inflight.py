from pathlib import Path
from datetime import datetime,timezone
import json,urllib.request,urllib.error,http.cookiejar,time,subprocess
B=Path('/tmp/codex-audit-20261030');URL='http://127.0.0.1:34837';SID='36390c697136fae83168e7fb';c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));c.open(URL+'/').close()
def utc():return datetime.now(timezone.utc).isoformat()
def api(action='',data=None):
 q=urllib.request.Request(URL+'/api/databases'+('/'+action if action else ''),data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','Origin':URL})
 try:
  with c.open(q,timeout=90) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
def ctl(code):
 r=subprocess.run(['python3','-B',str(B/'call_driver.py'),'30'],input=code,text=True,capture_output=True);x=json.loads(r.stdout);assert x['ok'],x.get('error');return x['result']
def active():
 r=subprocess.run(['docker','exec','codex-lifecycle-mysql-5f2bec9146','mysql','-uroot','-N','-e',"SELECT ID,TIME,STATE FROM information_schema.PROCESSLIST WHERE USER <> 'root' AND INFO LIKE '%audit30_connection_inflight%'"],capture_output=True,text=True);assert r.returncode==0;return r.stdout.strip()
_,s=api();original=next(r for r in s['connections'] if r['id']==SID);payload={k:original[k] for k in ('id','name','engine','host','port','database','schema','username','tls','verifyTls','caFile','enabled') if k in original};payload['expectedVersion']=original['version'];payload['password']='';sql='SELECT SUM(a.OrderQty * b.OrderQty) AS audit30_connection_inflight FROM salesorderdetail a CROSS JOIN salesorderdetail b WHERE a.SalesOrderDetailID <= 7000 AND b.SalesOrderDetailID <= 7000';receipt={'case':'T30-001B','startedAt':utc(),'modelUsed':False,'existingCredentialsReadOrCopied':False,'businessRowsModified':False,'connectionVersionBefore':original['version']};changed=False
try:
 ctl('globalThis.db=await newPage("'+URL+'","aw-inflight");globalThis.connectionRace=api(db,"query",{id:"'+SID+'",query:'+json.dumps(sql)+'}).then(async r=>{await save("T01B-query-response",{at:new Date().toISOString(),...r});return r;});return {started:true};')
 deadline=time.monotonic()+10
 while time.monotonic()<deadline:
  running=active()
  if running:break
  time.sleep(.03)
 assert running,'No actual in-flight SQL; no pass claimed';receipt['observedAt']=utc();receipt['mysqlProcess']=running;payload['name']=original['name']+' T30配置并发测试';code,saved=api('save',payload);assert code==200;changed=True;receipt['mutationAt']=utc();receipt['savedVersion']=saved['connection']['version'];ctl('return await connectionRace;');response=json.loads((B/'T01B-query-response.json').read_text());receipt['response']=response;assert response['status']==400 and ('查询期间' in json.dumps(response['body'],ensure_ascii=False) or '未启用或尚未通过' in json.dumps(response['body'],ensure_ascii=False));receipt['passed']=True
finally:
 if changed:
  _,latest=api();current=next(r for r in latest['connections'] if r['id']==SID)
  if current['name']==payload['name']:
   payload.update(name=original['name'],expectedVersion=current['version']);code,value=api('save',payload);receipt['restoreConnectionVersion']=value.get('connection',{}).get('version');receipt['retest']=api('test',{'id':SID})
   # No business content edits. Preparation can be explicitly refreshed later;
   # old source versions and historical reports remain preserved.
 receipt['finishedAt']=utc();(B/'T01B-connection-inflight.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
