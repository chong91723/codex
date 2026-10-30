from pathlib import Path
import subprocess,re,json,time
b=Path('/tmp/codex-uploaded-skills-20261030');paths=(b/'js-unit-files.txt').read_text().splitlines()+['/root/Codex/web/tests/mcp_management_state.mjs','/root/Codex/web/tests/skill_draft_state.mjs','/root/Codex/web/tests/uploaded_skills_state.mjs'];paths=list(dict.fromkeys(paths));rows=[]
with (b/'js-tests.log').open('w') as log:
 for path in paths:
  p=subprocess.run(['/root/Codex/.toolchains/node24/bin/node',path],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,cwd='/root/Codex');log.write(path+'\n'+p.stdout+'\n');log.flush();counts={k:int(v) for k,v in re.findall(r'^(?:#|ℹ) (tests|pass|fail|skipped) (\d+)$',p.stdout,re.M)};rows.append({'file':path,'exit':p.returncode,**counts})
v={'files':len(rows),'tests':sum(x.get('tests',0) for x in rows),'passed':sum(x.get('pass',0) for x in rows),'failed':sum(x.get('fail',0) for x in rows),'failedFiles':[x for x in rows if x['exit']],'results':rows};(b/'js-summary.json').write_text(json.dumps(v,indent=2));print(json.dumps({k:v for k,v in v.items() if k!='results'}));raise SystemExit(bool(v['failedFiles']))
