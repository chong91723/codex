"""Own fictional PostgreSQL, real existing web/DeepSeek service; no key access."""
from pathlib import Path
import json
import os
import secrets
import socket
import subprocess
import tempfile
import time

if os.environ.get('CODEX_CONFIRM_LIVE_MODEL_TEST')!='1':
    raise SystemExit('Set CODEX_CONFIRM_LIVE_MODEL_TEST=1 only after authorizing a live-service model test.')
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'test-results/deepseek-discovery-2026-10-28'
OUT.mkdir(parents=True,exist_ok=True)
name='codex-flash-discovery-'+str(os.getpid())
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
owned=False
try:
    subprocess.run(['docker','run','--rm','--pull=never','-d','--name',name,'--memory','512m','--cpus','2','-p',f'127.0.0.1:{port}:5432','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=exploration_demo','postgres:17'],capture_output=True,check=True)
    owned=True
    until=time.monotonic()+60
    while time.monotonic()<until:
        ready=subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','exploration_demo'],capture_output=True).returncode==0
        if ready:
            test=subprocess.run(['docker','exec',name,'psql','-h','127.0.0.1','-U','postgres','-d','exploration_demo','-Atc','SELECT 1'],capture_output=True)
            if test.returncode==0:break
        time.sleep(.2)
    else:raise RuntimeError('Owned PostgreSQL did not become ready')
    password=secrets.token_urlsafe(24)
    sql="""CREATE TABLE customers(customer_id integer PRIMARY KEY, customer_name text NOT NULL);
CREATE TABLE orders(order_id integer PRIMARY KEY,customer_id integer NOT NULL REFERENCES customers(customer_id),status text NOT NULL,amount numeric(20,2) NOT NULL,order_date date NOT NULL);
CREATE TABLE refunds(refund_id integer PRIMARY KEY,order_id integer NOT NULL REFERENCES orders(order_id),refund_amount numeric(20,2) NOT NULL);
COMMENT ON TABLE orders IS 'Fictional demo orders; status and amount business definitions must be confirmed by a user.';
COMMENT ON COLUMN orders.amount IS 'Recorded order amount; tax treatment and currency are not specified by the schema.';
INSERT INTO customers VALUES(1,'Demo customer A'),(2,'Demo customer B');
INSERT INTO orders VALUES(101,1,'completed',12.30,'2026-01-01'),(102,2,'completed',40.00,'2026-01-02'),(103,1,'cancelled',7.70,'2026-01-03'),(104,2,'pending',99.00,'2026-01-04');
INSERT INTO refunds VALUES(201,101,2.30);
CREATE USER exploration_reader WITH PASSWORD '"""+password+"""';
GRANT CONNECT ON DATABASE exploration_demo TO exploration_reader;
GRANT USAGE ON SCHEMA public TO exploration_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO exploration_reader;
ALTER ROLE exploration_reader SET default_transaction_read_only=on;
"""
    subprocess.run(['docker','exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-d','exploration_demo','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True,check=True)
    with tempfile.TemporaryDirectory(prefix='codex-flash-discovery-') as directory:
        private=Path(directory)/'fixture.json'
        private.write_text(json.dumps({'name':'DeepSeek自主探索 · 独立虚构验收','engine':'postgresql','host':'127.0.0.1','port':port,'database':'exploration_demo','schema':'public','username':'exploration_reader','password':password}))
        private.chmod(0o600)
        env={'CODEX_CONFIRM_LIVE_MODEL_TEST':'1','PATH':os.environ.get('PATH','/usr/bin:/bin'),'CODEX_WEB_URL':'http://127.0.0.1:8765','CODEX_DISCOVERY_FIXTURE':str(private),'REPORT_DIR':str(OUT/'flash'),'PLAYWRIGHT_MODULE':str(ROOT/'.toolchains/playwright/node_modules/playwright/index.mjs'),'CHROMIUM_BIN':str(ROOT/'.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome')}
        print('Independent read-only fixture ready; starting actual DeepSeek web tasks.',flush=True)
        with (OUT/'browser-run.txt').open('w') as log:
            result=subprocess.run([str(ROOT/'.toolchains/node24/bin/node'),str(ROOT/'web/tests/deepseek_discovery_live.mjs')],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=1200)
        print(json.dumps({'browserExitCode':result.returncode}),flush=True)
        raise SystemExit(result.returncode)
finally:
    stopped=False
    if owned:stopped=subprocess.run(['docker','stop','-t','5',name],capture_output=True).returncode==0
    (OUT/'environment-cleanup.json').write_text(json.dumps({'ownedContainer':name,'ownedContainerStopped':stopped,'temporaryFixtureCredentialsRemoved':True,'keyReadByTest':False,'model':'deepseek-flash'},indent=2)+'\n')
