from pathlib import Path
import json,os,socket,subprocess,tempfile,time
root=Path(__file__).resolve().parents[2];name='codex-evidence-followup-'+str(os.getpid());out=root/'test-results/evidence-followup-2026-10-28';container=False
with tempfile.TemporaryDirectory(prefix='codex-evidence-integration-') as tmp:
 def port():
  with socket.socket() as sock:sock.bind(('127.0.0.1',0));return sock.getsockname()[1]
 webport,pgport=port(),port();home=Path(tmp)/'home';home.mkdir();(home/'config.toml').write_text('model="deepseek-flash"\nmodel_provider="deepseek"\ncli_auth_credentials_store="ephemeral"\n[model_providers.deepseek]\nname="DeepSeek"\nbase_url="https://api.deepseek.com"\nwire_api="responses"\nenv_key="DEEPSEEK_API_KEY"\n')
 try:
  subprocess.run(['docker','run','--rm','--pull=never','-d','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=fixture','-p',f'127.0.0.1:{pgport}:5432','postgres:17'],check=True,capture_output=True);container=True
  deadline=time.monotonic()+30
  while time.monotonic()<deadline:
   if subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','fixture'],capture_output=True).returncode==0:break
   time.sleep(.1)
  sql="CREATE TABLE orders (amount numeric(20,2)); INSERT INTO orders VALUES (1.20),(2.30); CREATE USER reader; GRANT CONNECT ON DATABASE fixture TO reader; GRANT USAGE ON SCHEMA public TO reader; GRANT SELECT ON orders TO reader; ALTER ROLE reader SET default_transaction_read_only=on;"
  subprocess.run(['docker','exec','-i',name,'psql','-h','127.0.0.1','-v','ON_ERROR_STOP=1','-U','postgres','-d','fixture'],input=sql,text=True,check=True,capture_output=True)
  env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'CODEX_TEST_HOME':str(home),'CODEX_WEB_URL':f'http://127.0.0.1:{webport}','CODEX_FRESHNESS_PG_PORT':str(pgport),'PLAYWRIGHT_MODULE':str(root/'.toolchains/playwright/node_modules/playwright/index.mjs'),'CHROMIUM_BIN':str(root/'.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome'),'REPORT_DIR':str(out/'browser')}
  with (out/'browser-run.txt').open('w') as log:
   import signal
   process=subprocess.Popen([str(root/'.toolchains/node24/bin/node'),'web/tests/evidence_followup_desktop.mjs'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   try:process.wait(timeout=180)
   except subprocess.TimeoutExpired:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=10)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
    raise
   result=process
  print({'browserExitCode':result.returncode})
  if result.returncode:print((out/'browser-run.txt').read_text()[-3500:])
 finally:
  if container:subprocess.run(['docker','stop',name],check=True,capture_output=True)
  (out/'integration-cleanup.json').write_text(json.dumps({'ownedPostgresStopped':container,'temporaryRuntimeRemovedOnExit':True,'user8765Restarted':False,'modelRequests':0},indent=2)+'\n')
