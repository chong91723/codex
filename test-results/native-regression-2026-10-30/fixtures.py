from pathlib import Path
import ast,os,json,secrets,sys,subprocess,hashlib,csv
BASE=Path('/tmp/codex-audit-20261030');source=Path('/root/Codex/web/tests/run_database_discovery.py');os.environ['CODEX_DISCOVERY_REPORT_DIR']=str(BASE/'fixtures');tree=ast.parse(source.read_text());ns={'__file__':str(source),'__name__':'audit_fixture_helpers'};nodes=[]
for n in tree.body:
 if isinstance(n,ast.Try):break
 nodes.append(n)
exec(compile(ast.Module(body=nodes,type_ignores=[]),str(source),'exec'),ns)
rows=list(csv.reader((BASE/'adventureworks-orders.tsv').open(),delimiter='\t'));engine=sys.argv[1];path=BASE/('fixture-private-'+engine+'.json')
if len(sys.argv)>2 and sys.argv[2]=='stop':
 cfg=json.loads(path.read_text());assert cfg['container'].startswith('codex-discovery-');ns['docker'](['stop',cfg['container']]);print(json.dumps({'stoppedOwned':cfg['container'],'engine':engine}));sys.exit()
password=secrets.token_urlsafe(24);d=ns['docker'];start=ns['start'];until=ns['until'];es=ns['es_request']
try:
 if engine=='postgresql':
  name,port=start('aw-postgres','postgres:17',5432,['-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=fixture'])
  until(lambda:subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','fixture'],capture_output=True).returncode==0,'Postgres')
  sql="CREATE TABLE aw_orders(order_id bigint PRIMARY KEY,order_date timestamp,territory_id integer,subtotal numeric(24,4),tax_amount numeric(24,4),freight numeric(24,4),total_due numeric(24,4));\nCOPY aw_orders FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t');\n"+(BASE/'adventureworks-orders.tsv').read_text()+"\\.\nCREATE USER reader WITH PASSWORD '"+password+"'; GRANT CONNECT ON DATABASE fixture TO reader; GRANT USAGE ON SCHEMA public TO reader; GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader; ALTER ROLE reader SET default_transaction_read_only=on;"
  d(['exec','-i',name,'psql','-h','127.0.0.1','-v','ON_ERROR_STOP=1','-U','postgres','-d','fixture'],input=sql)
  cfg={'engine':engine,'container':name,'port':port,'database':'fixture','schema':'public'}
 elif engine=='clickhouse':
  name,port=start('aw-clickhouse','clickhouse/clickhouse-server:25.8',8123,['-e','CLICKHOUSE_SKIP_USER_SETUP=1'],memory='768m');until(lambda:subprocess.run(['docker','exec',name,'clickhouse-client','--query','SELECT 1'],capture_output=True).returncode==0,'ClickHouse')
  d(['exec','-i',name,'clickhouse-client','--multiquery'],input="CREATE DATABASE fixture; CREATE TABLE fixture.aw_orders(order_id UInt64,order_date DateTime,territory_id UInt32,subtotal Decimal(24,4),tax_amount Decimal(24,4),freight Decimal(24,4),total_due Decimal(24,4)) ENGINE=MergeTree ORDER BY (territory_id,order_date,order_id);CREATE USER reader IDENTIFIED WITH plaintext_password BY '"+password+"' SETTINGS readonly=1; GRANT SELECT ON fixture.* TO reader;GRANT SELECT ON system.* TO reader;")
  d(['exec','-i',name,'clickhouse-client','--query','INSERT INTO fixture.aw_orders FORMAT TabSeparated'],input=(BASE/'adventureworks-orders.tsv').read_text());cfg={'engine':engine,'container':name,'port':port,'database':'fixture'}
 elif engine=='elasticsearch':
  admin=secrets.token_urlsafe(24);name,port=start('aw-elasticsearch','docker.elastic.co/elasticsearch/elasticsearch:8.19.0',9200,['-e','discovery.type=single-node','-e','xpack.security.enabled=true','-e','xpack.security.http.ssl.enabled=false','-e','ES_JAVA_OPTS=-Xms256m -Xmx256m','-e','ELASTIC_PASSWORD='+admin],memory='1g');until(lambda:es(port,admin,'/_cluster/health?wait_for_status=yellow&timeout=1s').get('status') in ('yellow','green'),'Elasticsearch',120)
  mapping={'order_id':{'type':'long'},'order_date':{'type':'date','format':'yyyy-MM-dd HH:mm:ss'},'territory_id':{'type':'integer'}};mapping.update({n:{'type':'long'} for n in ['subtotal_10000','tax_amount_10000','freight_10000','total_due_10000']})
  es(port,admin,'/aw-orders',{'settings':{'number_of_shards':1,'number_of_replicas':0},'mappings':{'dynamic':'strict','properties':mapping}},'PUT')
  from decimal import Decimal
  for startat in range(0,len(rows),200):
   lines=[]
   for r in rows[startat:startat+200]:
    doc={'order_id':int(r[0]),'order_date':r[1],'territory_id':int(r[2])};doc.update({k:int(Decimal(v)*10000) for k,v in zip(['subtotal_10000','tax_amount_10000','freight_10000','total_due_10000'],r[3:])});lines.extend([json.dumps({'index':{'_index':'aw-orders','_id':r[0]}}),json.dumps(doc)])
   import urllib.request,base64
   q=urllib.request.Request(f'http://127.0.0.1:{port}/_bulk?refresh=true',data=('\n'.join(lines)+'\n').encode(),headers={'Content-Type':'application/x-ndjson','Authorization':'Basic '+base64.b64encode(('elastic:'+admin).encode()).decode()})
   with urllib.request.urlopen(q,timeout=30) as response:assert not json.load(response)['errors']
  es(port,admin,'/_security/role/aw_reader',{'cluster':[],'indices':[{'names':['aw-orders'],'privileges':['read','view_index_metadata']}]},'PUT');es(port,admin,'/_security/user/reader',{'password':password,'roles':['aw_reader']},'PUT');del admin;cfg={'engine':engine,'container':name,'port':port,'database':'aw-orders'}
 else:raise ValueError(engine)
 cfg.update(host='127.0.0.1',username='reader',password=password,readOnly=True,name='独立 AdventureWorks '+engine+' T30');path.write_text(json.dumps(cfg));path.chmod(0o600)
 receipt={k:v for k,v in cfg.items() if k!='password'};receipt.update(realBusinessRows=len(rows),sourceFileSha256=hashlib.sha256((BASE/'adventureworks-orders.tsv').read_bytes()).hexdigest(),existingCredentialsCopied=False);(BASE/('fixture-'+engine+'.json')).write_text(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps(receipt,ensure_ascii=False))
except BaseException:
 for name in ns['owned']:subprocess.run(['docker','stop',name],capture_output=True)
 raise
