"""Real MySQL + unchanged Web gateway; mutate knowledge only while SQL is observed."""
from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,time,urllib.request,http.cookiejar
BASE=Path('/tmp/codex-audit-20261030');URL='http://127.0.0.1:34837';SID='36390c697136fae83168e7fb'
def utc():return datetime.now(timezone.utc).isoformat()
c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));c.open(URL+'/').close()
def api(payload):
 q=urllib.request.Request(URL+'/api/databases/result',data=json.dumps({'databaseKnowledge':payload}).encode(),headers={'Content-Type':'application/json','Origin':URL})
 with c.open(q,timeout=20) as r:return json.load(r)
def controller(code):
 r=subprocess.run(['/usr/bin/python3','-B',str(BASE/'call_driver.py'),'20'],input=code,text=True,capture_output=True,timeout=25);v=json.loads(r.stdout);assert v['ok'],v.get('error');return v['result']
def mysql_active():
 query="SELECT ID,TIME,STATE FROM information_schema.PROCESSLIST WHERE USER <> 'root' AND INFO LIKE '%audit30_inflight%'"
 r=subprocess.run(['docker','exec','codex-lifecycle-mysql-5f2bec9146','mysql','-uroot','-N','-e',query],capture_output=True,text=True,timeout=3);assert r.returncode==0,'Owned MySQL observation unavailable';return r.stdout.strip()
before=api({'operation':'state','sourceId':SID});original=before['businessContext']['content'];tag='\n回归测试 T30-001：查询执行期间保存本说明后，旧版本结果需要重新核对。'
sql='SELECT SUM(a.OrderQty * b.OrderQty) AS audit30_inflight FROM salesorderdetail a CROSS JOIN salesorderdetail b WHERE a.SalesOrderDetailID <= 7000 AND b.SalesOrderDetailID <= 7000'
receipt={'case':'T30-001','kind':'realMySQLAndWebGateway','modelUsed':False,'query':sql,'beforeRevision':before['businessContext']['revision'],'startedAt':utc(),'dataModified':False}
changed=False
try:
 controller('globalThis.t01StartedAt=new Date().toISOString();globalThis.t01Query=api(db,"query",{id:sourceId,query:'+json.dumps(sql)+'}).then(async value=>{await save("T01-query-response",{startedAt:t01StartedAt,finishedAt:new Date().toISOString(),...value});return value;});return {started:true};')
 deadline=time.monotonic()+10;active=''
 while time.monotonic()<deadline:
  active=mysql_active()
  if active:break
  if (BASE/'T01-query-response.json').exists():break
  time.sleep(.03)
 assert active,'Query was not observed executing; do not count as in-flight coverage'
 receipt.update(sqlObservedAt=utc(),mysqlProcess=active)
 receipt['mutationSentAt']=utc();after=api({'operation':'save_business','sourceId':SID,'expectedRevision':before['businessContext']['revision'],'content':original+tag});changed=True
 receipt.update(mutationAcknowledgedAt=utc(),afterRevision=after['businessContext']['revision'])
 controller('return await t01Query;')
 response=json.loads((BASE/'T01-query-response.json').read_text());receipt['queryResponse']=response
 assert response['status']==400 and '查询期间业务知识' in json.dumps(response['body'],ensure_ascii=False),'Expected actual in-flight knowledge rejection'
 assert receipt['mutationAcknowledgedAt']<response['finishedAt'],'Mutation did not finish within the query window'
 receipt['passed']=True
finally:
 if changed:
  current=api({'operation':'state','sourceId':SID})
  if current['businessContext']['content']==original+tag:
   restored=api({'operation':'save_business','sourceId':SID,'expectedRevision':current['businessContext']['revision'],'content':original});receipt['restoredContentRevision']=restored['businessContext']['revision'];receipt['restoreIsNewHistoryVersion']=True
  else:receipt['restoreSkipped']='Someone changed the test source; preserved their content'
 receipt['finishedAt']=utc();(BASE/'T01-inflight-result.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
