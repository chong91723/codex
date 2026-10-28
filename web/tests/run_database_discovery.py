"""Four-engine metadata/knowledge validation, using owned synthetic containers only.

No image pulls, credentials from user services, production database or model calls.
"""
from pathlib import Path
import base64
import json
import os
import secrets
import signal
import socket
import sys
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('CODEX_DISCOVERY_REPORT_DIR',str(ROOT/'test-results/database-discovery-2026-10-28')))
if '--runtime-fixture' in sys.argv:OUT=OUT/'runtime-elasticsearch'
OUT.mkdir(parents=True,exist_ok=True)
PREFIX='codex-discovery-'+str(os.getpid())
owned=[]
process=None


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0))
        return sock.getsockname()[1]


def docker(args,*,input=None):
    return subprocess.run(['docker',*args],input=input,text=True,capture_output=True,check=True)


def start(engine,image,container_port,options=(),memory='512m'):
    name=PREFIX+'-'+engine
    port=free_port()
    docker(['run','--rm','--pull=never','-d','--name',name,'--memory',memory,'--cpus','2','-p',f'127.0.0.1:{port}:{container_port}',*options,image])
    owned.append(name)
    return name,port


def until(action,description,timeout=90):
    deadline=time.monotonic()+timeout
    last=None
    while time.monotonic()<deadline:
        try:
            if action():return
        except Exception as error:last=type(error).__name__
        time.sleep(.2)
    raise RuntimeError(description+' did not become ready ('+str(last)+')')


def es_request(port,password,path,body=None,method=None,user='elastic'):
    data=None if body is None else json.dumps(body).encode()
    request=urllib.request.Request(f'http://127.0.0.1:{port}'+path,data=data,method=method or ('POST' if data else 'GET'),headers={'Authorization':'Basic '+base64.b64encode((user+':'+password).encode()).decode(),'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=20) as response:return json.loads(response.read())


def wide_sql(engine):
    result=[]
    for table in range(34):
        fields=', '.join('field_'+str(column)+' INTEGER' for column in range(16))
        suffix=' ENGINE=Memory' if engine=='clickhouse' else ''
        result.append('CREATE TABLE '+('fixture.' if engine=='clickhouse' else '')+'wide_'+str(table).zfill(2)+' ('+fields+')'+suffix+';')
    return '\n'.join(result)


def setup_postgres(password):
    name,port=start('postgres','postgres:17',5432,['-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=fixture'])
    until(lambda:subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','fixture'],capture_output=True).returncode==0,'Owned PostgreSQL')
    sql="""CREATE TABLE customers(tenant_id integer NOT NULL, customer_id integer NOT NULL, customer_name text, PRIMARY KEY(tenant_id,customer_id));
CREATE TABLE orders(tenant_id integer NOT NULL, order_id integer NOT NULL, customer_id integer NOT NULL, amount numeric(20,2) NOT NULL, PRIMARY KEY(tenant_id,order_id), CONSTRAINT fk_orders_customer FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,customer_id));
COMMENT ON TABLE orders IS 'Synthetic orders for metadata discovery';
COMMENT ON COLUMN orders.amount IS 'Synthetic amount, not a confirmed business definition';
INSERT INTO customers VALUES(1,1,'First tenant'),(2,1,'Second tenant');
INSERT INTO orders VALUES(1,101,1,12.30),(2,102,1,40.00);
CREATE VIEW order_amounts AS SELECT tenant_id,order_id,amount FROM orders;
"""+wide_sql('postgres')+"\nCREATE USER reader WITH PASSWORD '"+password+"'; GRANT CONNECT ON DATABASE fixture TO reader; GRANT USAGE ON SCHEMA public TO reader; GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader; ALTER ROLE reader SET default_transaction_read_only=on;"
    docker(['exec','-i',name,'psql','-h','127.0.0.1','-v','ON_ERROR_STOP=1','-U','postgres','-d','fixture'],input=sql)
    return {'engine':'postgresql','container':name,'host':'127.0.0.1','port':port,'database':'fixture','schema':'public','username':'reader','password':password,'readOnly':True,'name':'独立 PostgreSQL 结构夹具'}


def setup_mysql(password):
    name,port=start('mysql','mysql:8.4',3306,['-e','MYSQL_ALLOW_EMPTY_PASSWORD=yes','-e','MYSQL_DATABASE=fixture'],memory='768m')
    until(lambda:subprocess.run(['docker','exec',name,'mysqladmin','ping','-h','127.0.0.1','--silent'],capture_output=True).returncode==0,'Owned MySQL')
    sql="""CREATE TABLE customers(tenant_id integer NOT NULL, customer_id integer NOT NULL, customer_name varchar(80), PRIMARY KEY(tenant_id,customer_id));
CREATE TABLE orders(tenant_id integer NOT NULL, order_id integer NOT NULL, customer_id integer NOT NULL, amount decimal(20,2) NOT NULL COMMENT 'Synthetic amount, not a confirmed business definition', PRIMARY KEY(tenant_id,order_id), CONSTRAINT fk_orders_customer FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,customer_id)) COMMENT='Synthetic orders for metadata discovery';
INSERT INTO customers VALUES(1,1,'First tenant'),(2,1,'Second tenant');
INSERT INTO orders VALUES(1,101,1,12.30),(2,102,1,40.00);
CREATE VIEW order_amounts AS SELECT tenant_id,order_id,amount FROM orders;
"""+wide_sql('mysql')+"\nCREATE USER 'reader'@'%' IDENTIFIED BY '"+password+"'; GRANT SELECT,SHOW VIEW ON fixture.* TO 'reader'@'%';"
    docker(['exec','-i',name,'mysql','--default-character-set=utf8mb4','-uroot','fixture'],input=sql)
    return {'engine':'mysql','container':name,'host':'127.0.0.1','port':port,'database':'fixture','username':'reader','password':password,'readOnly':True,'name':'独立 MySQL 结构夹具'}


def setup_clickhouse(password):
    name,port=start('clickhouse','clickhouse/clickhouse-server:25.8',8123,['-e','CLICKHOUSE_SKIP_USER_SETUP=1'],memory='768m')
    until(lambda:subprocess.run(['docker','exec',name,'clickhouse-client','--query','SELECT 1'],capture_output=True).returncode==0,'Owned ClickHouse')
    sql="""CREATE DATABASE fixture;
CREATE TABLE fixture.customer_events(tenant_id UInt32,customer_id UInt32,order_id UInt64,event_date Date,amount Decimal64(2)) ENGINE=MergeTree PARTITION BY toYYYYMM(event_date) PRIMARY KEY(tenant_id,event_date) ORDER BY(tenant_id,event_date,order_id);
INSERT INTO fixture.customer_events VALUES(1,1,101,'2026-01-01',12.30),(1,1,102,'2026-01-01',40.00);
"""+wide_sql('clickhouse')+"\nCREATE USER reader IDENTIFIED WITH plaintext_password BY '"+password+"' SETTINGS readonly=1; GRANT SELECT ON fixture.* TO reader; GRANT SELECT ON system.* TO reader;"
    docker(['exec','-i',name,'clickhouse-client','--multiquery'],input=sql)
    return {'engine':'clickhouse','container':name,'host':'127.0.0.1','port':port,'database':'fixture','username':'reader','password':password,'readOnly':True,'name':'独立 ClickHouse 结构夹具'}


def setup_elasticsearch(password):
    admin=secrets.token_urlsafe(24)
    name,port=start('elasticsearch','docker.elastic.co/elasticsearch/elasticsearch:8.19.0',9200,['-e','discovery.type=single-node','-e','xpack.security.enabled=true','-e','xpack.security.http.ssl.enabled=false','-e','ES_JAVA_OPTS=-Xms256m -Xmx256m','-e','ELASTIC_PASSWORD='+admin],memory='1g')
    until(lambda:es_request(port,admin,'/_cluster/health?wait_for_status=yellow&timeout=1s').get('status') in ('yellow','green'),'Owned Elasticsearch',120)
    fields={'amount':{'type':'scaled_float','scaling_factor':100},'amount_alias':{'type':'alias','path':'amount'},'customer':{'properties':{'city':{'type':'keyword'}}},'items':{'type':'nested','properties':{'sku':{'type':'keyword'},'quantity':{'type':'integer'}}},'title':{'type':'text','fields':{'raw':{'type':'keyword'}}},'relation':{'type':'join','relations':{'parent':'child'}}}
    fields.update({'extra_'+str(i).zfill(3):{'type':'keyword'} for i in range(520)})
    mapping={'dynamic':False,'properties':fields}
    if '--runtime-fixture' in sys.argv:
        mapping['runtime']={'title':{'type':'keyword','script':{'source':'emit(params._source.title)'}},'runtime_label':{'type':'keyword','script':{'source':"emit('fixture')"}}}
    es_request(port,admin,'/demo-discovery',{'settings':{'number_of_shards':1,'number_of_replicas':0},'mappings':mapping,'aliases':{'demo-discovery-alias':{}}},'PUT')
    es_request(port,admin,'/private-discovery',{'settings':{'number_of_shards':1,'number_of_replicas':0},'mappings':{'properties':{'private_value':{'type':'keyword'}}}},'PUT')
    es_request(port,admin,'/demo-discovery/_doc/parent?refresh=true',{'amount':12.30,'title':'Synthetic parent','relation':'parent','customer':{'city':'Demo city'},'items':[{'sku':'sku-a','quantity':2}]},'PUT')
    es_request(port,admin,'/demo-discovery/_doc/child?routing=parent&refresh=true',{'amount':40.00,'title':'Synthetic child','relation':{'name':'child','parent':'parent'}},'PUT')
    es_request(port,admin,'/_security/role/discovery_reader',{'cluster':[],'indices':[{'names':['demo-discovery'],'privileges':['read','view_index_metadata']}]},'PUT')
    es_request(port,admin,'/_security/user/reader',{'password':password,'roles':['discovery_reader']},'PUT')
    return {'engine':'elasticsearch','container':name,'host':'127.0.0.1','port':port,'database':'demo-discovery','username':'reader','password':password,'readOnly':True,'name':'独立 Elasticsearch 结构夹具'}


def stop_process():
    if process is not None and process.poll() is None:
        os.killpg(process.pid,signal.SIGTERM)
        try:process.wait(timeout=10)
        except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=10)


try:
    with tempfile.TemporaryDirectory(prefix='codex-discovery-runtime-') as directory:
        folder=Path(directory);home=folder/'home';home.mkdir()
        (home/'config.toml').write_text('model="deepseek-flash"\nmodel_provider="deepseek"\ncli_auth_credentials_store="ephemeral"\n[model_providers.deepseek]\nname="DeepSeek"\nbase_url="https://api.deepseek.com"\nwire_api="responses"\nenv_key="DEEPSEEK_API_KEY"\n')
        configs=[]
        setups=(setup_elasticsearch,) if '--elasticsearch-only' in sys.argv else (setup_postgres,setup_mysql,setup_clickhouse,setup_elasticsearch)
        for setup in setups:
            config=setup(secrets.token_urlsafe(24));configs.append(config);print('Prepared owned '+config['engine']+' fixture',flush=True)
        fixtures=folder/'fixtures.json';fixtures.write_text(json.dumps({'connections':configs,'ownedPrefix':PREFIX,'runtimeMappingFixture':'--runtime-fixture' in sys.argv}));fixtures.chmod(0o600)
        env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'CODEX_TEST_HOME':str(home),'CODEX_WEB_URL':'http://127.0.0.1:'+str(free_port()),'CODEX_DISCOVERY_FIXTURES':str(fixtures),'PLAYWRIGHT_MODULE':str(ROOT/'.toolchains/playwright/node_modules/playwright/index.mjs'),'CHROMIUM_BIN':str(ROOT/'.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome'),'REPORT_DIR':str(OUT/'browser')}
        with (OUT/'browser-run.txt').open('w') as log:
            command=[str(ROOT/'.toolchains/databases/bin/python'),'-B','web/tests/database_discovery_probe.py'] if '--collector-only' in sys.argv else [str(ROOT/'.toolchains/node24/bin/node'),'web/tests/database_discovery_desktop.mjs']
            process=subprocess.Popen(command,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            try:process.wait(timeout=420)
            finally:stop_process()
        print(json.dumps({'browserExitCode':process.returncode,'modelRequests':0,'engines':[c['engine'] for c in configs]}))
        if process.returncode:
            print((OUT/'browser-run.txt').read_text()[-6000:]);raise SystemExit(process.returncode)
finally:
    stop_process();stopped=[]
    for name in reversed(owned):
        if subprocess.run(['docker','stop',name],capture_output=True).returncode==0:stopped.append(name)
    (OUT/'integration-cleanup.json').write_text(json.dumps({'ownedContainersStarted':len(owned),'ownedContainersStopped':len(stopped),'allOwnedContainersStopped':len(owned)==len(stopped),'temporaryRuntimeRemovedOnExit':True,'user8765Restarted':False,'modelRequests':0,'data':'Independent fictional fixtures only; existing services were not inspected or mutated.'},indent=2)+'\n')
