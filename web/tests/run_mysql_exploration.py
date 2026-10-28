#!/usr/bin/env python3
"""Reproduce isolated AdventureWorks preparation. Optional live Flash/web test.

Only a newly named Docker container and a temporary profile are used. The
public fixture is pinned and cached outside Git. No model key is read.
"""
import argparse,hashlib,json,os
from pathlib import Path
import secrets,socket,subprocess,sys,tempfile,time,zipfile
ROOT=Path(__file__).resolve().parents[2]
PYTHON=ROOT/'.toolchains/databases/bin/python'
if Path(sys.executable).parent!=PYTHON.parent:
 os.execv(str(PYTHON),[str(PYTHON),'-B',__file__,*sys.argv[1:]])
sys.path[:0]=[str(ROOT/'web/database'),str(ROOT/'web')]
from service import Gateway
from database_knowledge import DatabaseKnowledge
from exploration_jobs import ExplorationJobs,process_identity
from schema_explorer import runtime
COMMIT='b287f5995a967bf2751b7249878759eb4bbd53fc'
SHA256='c2e0c6d72bbbbd5abae2bc24e6053c9ddfd05b2cb7d8ac49d7787ba13edf359a'
URL=f'https://raw.githubusercontent.com/tapsey/AdventureWorksMYSQL/{COMMIT}/AdventureWorks-MySQL-with-FKs.zip'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--live-url',help='Explicit existing Web URL; enables one real DeepSeek Flash turn')
parser.add_argument('--report-dir',default=str(ROOT/'test-results/mysql-preparation-2026-10-28'))
args=parser.parse_args()
if args.live_url and os.environ.get('CODEX_CONFIRM_LIVE_MODEL_TEST')!='1':raise SystemExit('Set CODEX_CONFIRM_LIVE_MODEL_TEST=1 to authorize a real model task.')
runtime();out=Path(args.report_dir);out.mkdir(parents=True,exist_ok=True)
cache=ROOT/'.local-state/test-fixtures/adventureworks';cache.mkdir(parents=True,exist_ok=True)
archive=cache/'fixture.zip'
if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest()!=SHA256:
 subprocess.run(['curl','-fL','--retry','5','--retry-all-errors','--connect-timeout','20','-o',str(archive),URL],check=True,stdout=subprocess.DEVNULL)
if hashlib.sha256(archive.read_bytes()).hexdigest()!=SHA256:raise SystemExit('Fixture checksum mismatch; no database started.')
sql=cache/'AdventureWorks-MySQL-with-FKs.sql'
with zipfile.ZipFile(archive) as z:
 info=z.getinfo(sql.name)
 if info.file_size>100*1024*1024:raise SystemExit('Fixture exceeds reviewed size budget.')
 sql.write_bytes(z.read(info))
provenance={'repository':'https://github.com/tapsey/AdventureWorksMYSQL','commit':COMMIT,'archiveSha256':SHA256,'sqlBytes':sql.stat().st_size,'mysqlCompatibility':'Import session uses restrict_fk_on_non_standard_key=OFF for the old sample constraints. Production settings unchanged.'}
(out/'dataset.json').write_text(json.dumps(provenance,indent=2)+'\n')
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
name='codex-aw-preparation-'+secrets.token_hex(5);owned=False;job_result={}
def docker(*items,**kw):return subprocess.run(['docker',*items],capture_output=True,check=True,**kw)
def wait_job(jobs,source,job_id,seconds=150):
 deadline=time.monotonic()+seconds;stages=[]
 while time.monotonic()<deadline:
  value=jobs.status(source,job_id);stages.append((value['status'],value.get('stage')))
  if value['status'] not in ('queued','running','cancelling'):return value,sorted(set(stages))
  time.sleep(.15)
 raise RuntimeError('Exploration job exceeded test timeout')
try:
 docker('run','--rm','--pull=never','-d','--name',name,'--memory','640m','--cpus','1.5','-e','MYSQL_ALLOW_EMPTY_PASSWORD=yes','-p',f'127.0.0.1:{port}:3306','mysql:8.4','--local-infile=0');owned=True
 deadline=time.monotonic()+70
 while time.monotonic()<deadline:
  p=subprocess.run(['docker','exec',name,'mysqladmin','ping','-h','127.0.0.1','-uroot','--silent'],capture_output=True)
  if p.returncode==0:break
  time.sleep(.2)
 else:raise RuntimeError('Owned MySQL startup failed')
 with sql.open('rb') as stream:
  docker('exec','-i',name,'mysql','--binary-mode=1','--init-command=SET SESSION restrict_fk_on_non_standard_key=OFF','-uroot',stdin=stream)
 password=secrets.token_hex(18)
 docker('exec','-i',name,'mysql','-uroot',input=("CREATE USER 'exploration_reader'@'%' IDENTIFIED BY '"+password+"'; GRANT SELECT,SHOW VIEW ON adventureworks.* TO 'exploration_reader'@'%';").encode())
 config=dict(engine='mysql',host='127.0.0.1',port=port,database='adventureworks',username='exploration_reader',password=password,name='AdventureWorks 独立探索验收',readOnly=True)
 oracle=docker('exec',name,'mysql','-uroot','-N','-e','SELECT COUNT(*),SUM(SubTotal) FROM adventureworks.salesorderheader WHERE Status=5 AND OnlineOrderFlag=1;').stdout.decode().strip().split('\t')
 config['expected']={'order_count':oracle[0],'subtotal':oracle[1]}
 with tempfile.TemporaryDirectory(prefix='codex-aw-private-') as directory:
  g=Gateway(Path(directory)/'profile');source=g.store.save(config);source=g.probe(source);assert source['status']=='connected'
  k=DatabaseKnowledge(g);jobs=ExplorationJobs(g)
  job=jobs.start(source['id'],0);assert jobs.start(source['id'],0)['id']==job['id']
  completed,stages=wait_job(jobs,source['id'],job['id']);assert completed['status']=='completed',completed
  report=k.manage({'operation':'exploration_report','sourceId':source['id']});assert len(report['catalog']['tables'])==70
  assert sum(len(t['columns']) for t in report['catalog']['tables'])==479
  assert sum(len(t['foreignKeys']) for t in report['catalog']['tables'])==81
  k.save_business(source['id'],0,'有效线上订单只包含 Status=5 且 OnlineOrderFlag=1，收入字段为 SubTotal，不含税费和运费。')
  new=Gateway(Path(directory)/'profile',thread_id='new-analysis-task');notes=DatabaseKnowledge(new).context(source['id'])['notes'];assert any(n['aspect']=='business_context' for n in notes)
  # Capture an actual Java child before cancelling; verify its identity exits.
  cancel_job=jobs.start(source['id'],k.state(source['id'])['revision']);java_children={};deadline=time.monotonic()+20
  while time.monotonic()<deadline:
   row=jobs._get(source['id'],cancel_job['id']);pid=row.get('pid')
   try:
    children=Path(f'/proc/{pid}/task/{pid}/children').read_text().split()
    java_children={int(p):process_identity(p) for p in children if Path(f'/proc/{p}/comm').read_text().strip()=='java'}
   except OSError:pass
   if java_children:break
   time.sleep(.05)
  assert java_children,'No in-flight Java process observed'
  jobs.cancel(source['id'],cancel_job['id']);cancelled,_=wait_job(jobs,source['id'],cancel_job['id'],15);assert cancelled['status']=='cancelled'
  assert all(process_identity(pid)!=identity for pid,identity in java_children.items())
  assert k.state(source['id'])['snapshot']['id']==report['snapshotId']
  job_result={'scope':'Real MySQL 8.4 + fixed SchemaCrawler CLI; no model in backend checks','completeJob':completed,'observedStages':stages,'duplicateReused':True,'inFlightJavaCancellationVerified':True,'cancelPreservedSnapshot':True,'newTaskReadsSavedBusinessContext':True,'tableCount':70,'columnCount':479,'foreignKeys':81,'expected':config['expected']}
  (out/'backend.json').write_text(json.dumps(job_result,ensure_ascii=False,indent=2)+'\n')
  if args.live_url:
   private=Path(directory)/'fixture.json';private.write_text(json.dumps(config));private.chmod(0o600)
   env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'CODEX_CONFIRM_LIVE_MODEL_TEST':'1','CODEX_WEB_URL':args.live_url,'CODEX_DISCOVERY_FIXTURE':str(private),'REPORT_DIR':str(out/'live'),'PLAYWRIGHT_MODULE':str(ROOT/'.toolchains/playwright/node_modules/playwright/index.mjs'),'CHROMIUM_BIN':str(ROOT/'.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome')}
   subprocess.run([str(ROOT/'.toolchains/node24/bin/node'),str(ROOT/'web/tests/mysql_exploration_live.mjs')],env=env,cwd=ROOT,check=True,timeout=600)
 print(json.dumps({'passed':True,'tables':70,'columns':479,'foreignKeys':81,'liveModelTest':bool(args.live_url)}))
finally:
 stopped=owned and subprocess.run(['docker','stop','-t','5',name],capture_output=True).returncode==0
 (out/'cleanup.json').write_text(json.dumps({'ownedContainer':name,'ownedContainerStopped':stopped,'temporaryCredentialsRemoved':True,'productionDatabasesUsed':False},indent=2)+'\n')
