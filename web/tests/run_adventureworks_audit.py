#!/usr/bin/env python3
"""Real analyst audit against a newly owned public MySQL fixture and live Flash.

CODEX_CONFIRM_LIVE_MODEL_TEST=1 .toolchains/databases/bin/python -B \
    web/tests/run_adventureworks_audit.py --live-url http://127.0.0.1:8765

No model credential is read. The existing service performs its normal native
authentication. Only the newly created read-only source and owned threads are
used; its container and temporary credentials are removed in finally.
"""
import argparse, hashlib, json, os, secrets, socket, subprocess, sys, tempfile, time, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--live-url',required=True)
parser.add_argument('--report-dir',default=str(ROOT/'test-results/adventureworks-user-audit-rerun'))
args=parser.parse_args()
if os.environ.get('CODEX_CONFIRM_LIVE_MODEL_TEST')!='1':raise SystemExit('Explicit live Flash test authorization required.')
out=Path(args.report_dir);out.mkdir(parents=True,exist_ok=True)
cache=ROOT/'.local-state/test-fixtures/adventureworks';cache.mkdir(parents=True,exist_ok=True)
archive=cache/'fixture.zip';sha='c2e0c6d72bbbbd5abae2bc24e6053c9ddfd05b2cb7d8ac49d7787ba13edf359a';commit='b287f5995a967bf2751b7249878759eb4bbd53fc'
if not archive.exists():subprocess.run(['curl','-fL','--retry','3','-o',str(archive),f'https://raw.githubusercontent.com/tapsey/AdventureWorksMYSQL/{commit}/AdventureWorks-MySQL-with-FKs.zip'],check=True)
if hashlib.sha256(archive.read_bytes()).hexdigest()!=sha:raise SystemExit('Unreviewed fixture checksum; no database started.')
sql=cache/'AdventureWorks-MySQL-with-FKs.sql'
with zipfile.ZipFile(archive) as z:
 info=z.getinfo(sql.name)
 if info.file_size>100*1024*1024:raise SystemExit('Fixture exceeds budget')
 sql.write_bytes(z.read(info))
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
name='codex-aw-user-audit-'+secrets.token_hex(5);owned=False
def docker(*items,**kw):return subprocess.run(['docker',*items],check=True,capture_output=True,**kw)
cleanup={}
try:
 docker('run','--rm','--pull=never','-d','--name',name,'--memory','640m','--cpus','1.5','-e','MYSQL_ALLOW_EMPTY_PASSWORD=yes','-p',f'127.0.0.1:{port}:3306','mysql:8.4','--local-infile=0');owned=True
 for _ in range(350):
  if subprocess.run(['docker','exec',name,'mysqladmin','ping','-h','127.0.0.1','-uroot','--silent'],capture_output=True).returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('Owned MySQL unavailable')
 with sql.open('rb') as stream:docker('exec','-i',name,'mysql','--binary-mode=1','--init-command=SET SESSION restrict_fk_on_non_standard_key=OFF','-uroot',stdin=stream)
 password=secrets.token_hex(18)
 docker('exec','-i',name,'mysql','-uroot',input=("CREATE USER 'exploration_reader'@'%' IDENTIFIED BY '"+password+"'; GRANT SELECT,SHOW VIEW ON adventureworks.* TO 'exploration_reader'@'%';").encode())
 (out/'dataset.json').write_text(json.dumps({'repository':'https://github.com/tapsey/AdventureWorksMYSQL','commit':commit,'archiveSha256':sha,'mysql':'8.4','scope':'Dedicated local container; readonly SELECT/SHOW VIEW user; import session compatibility only.'},indent=2)+'\n')
 with tempfile.TemporaryDirectory(prefix='codex-aw-analyst-private-') as directory:
  private=Path(directory)/'fixture.json';private.write_text(json.dumps(dict(engine='mysql',name='AdventureWorks 用户体验审计（独立只读）',host='127.0.0.1',port=port,database='adventureworks',username='exploration_reader',password=password,readOnly=True,container=name)));private.chmod(0o600)
  receipt=Path(directory)/'source.json'
  env={key:os.environ[key] for key in ('PATH','LANG','LC_ALL') if key in os.environ}
  env.update(CODEX_CONFIRM_LIVE_MODEL_TEST='1',CODEX_WEB_URL=args.live_url,CODEX_DISCOVERY_FIXTURE=str(private),CODEX_AUDIT_SOURCE=str(receipt),REPORT_DIR=str(out),PLAYWRIGHT_MODULE=str(ROOT/'.toolchains/playwright/node_modules/playwright/index.mjs'),CHROMIUM_BIN=str(ROOT/'.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome'))
  def node(script,phase=None):
   current=dict(env)
   if phase:current['CODEX_AUDIT_PHASE']=phase
   subprocess.run([str(ROOT/'.toolchains/node24/bin/node'),str(ROOT/'web/tests'/script)],env=current,cwd=ROOT,check=True,timeout=1800)
  try:
   subprocess.run([str(ROOT/'.toolchains/databases/bin/python'),'-B',str(ROOT/'web/tests/adventureworks_oracles.py'),str(private),str(out)],check=True,timeout=60)
   node('adventureworks_exploration_live.mjs')
   for phase in ('corrections','analysis','manual-plan','reject-query','resilience','running-cancel','report-presentation','configuration'):node('adventureworks_analyst_live.mjs',phase)
  finally:
   if receipt.exists():
    try:node('adventureworks_audit_cleanup.mjs');cleanup.update(json.loads((out/'cleanup.json').read_text()))
    except Exception:cleanup['ownedSourceRemoved']=False
finally:
 cleanup.update(ownedContainer=name,ownedContainerStopped=owned and subprocess.run(['docker','stop','-t','5',name],capture_output=True).returncode==0,temporaryCredentialsRemoved=True,productionDatabasesUsed=False)
 (out/'cleanup.json').write_text(json.dumps(cleanup,indent=2)+'\n')
