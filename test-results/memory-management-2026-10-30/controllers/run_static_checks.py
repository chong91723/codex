"""Syntax-only first-party verification; no imports or model calls."""
from datetime import datetime,timezone
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import time
ROOT=Path('/root/Codex');BASE=Path('/tmp/codex-memory-management-20261030');NODE=ROOT/'.toolchains/node24/bin/node'
paths=subprocess.check_output(['rg','--files','web','-g','*.py','-g','*.js','-g','*.mjs','-g','*.cjs','-g','!web/public/vendor/**','-g','!**/__pycache__/**'],cwd=ROOT,text=True).splitlines()
records=[];failures=[];start=time.monotonic()
with (BASE/'static-checks.log').open('w') as log:
 for relative in sorted(paths):
  path=ROOT/relative;kind='python_ast' if path.suffix=='.py' else 'node_check';error=None
  try:
   if kind=='python_ast':ast.parse(path.read_text(),filename=relative)
   else:
    result=subprocess.run([str(NODE),'--check',str(path)],cwd=ROOT,capture_output=True,text=True,timeout=30)
    if result.returncode:error=result.stderr or result.stdout
  except Exception as exc:error=str(exc)
  record={'path':relative,'check':kind,'passed':error is None,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()};records.append(record)
  log.write(('PASS ' if error is None else 'FAIL ')+kind+' '+relative+'\n')
  if error:failures.append({'path':relative,'detail':error});log.write(error+'\n')
 diff=subprocess.run(['git','diff','--check'],cwd=ROOT,capture_output=True,text=True)
 log.write('git diff --check: '+str(diff.returncode)+'\n'+diff.stdout+diff.stderr)
 if diff.returncode:failures.append({'check':'git diff --check','detail':diff.stdout+diff.stderr})
summary={'passed':not failures,'pythonAST':sum(r['check']=='python_ast' for r in records),'nodeSyntax':sum(r['check']=='node_check' for r in records),'gitDiffCheckPassed':not diff.returncode,'failures':failures,'seconds':round(time.monotonic()-start,3),'completedAt':datetime.now(timezone.utc).isoformat(),'scope':'First-party web Python and JavaScript syntax; vendor excluded; does not replace runtime tests'}
(BASE/'static-checks-files.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n');(BASE/'static-checks-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False));raise SystemExit(0 if summary['passed'] else 1)
