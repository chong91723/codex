import json,sys
from datetime import datetime,timezone
from pathlib import Path
p=Path('/tmp/codex-collab-audit-20261029/agent-a')
w=json.loads((p/'free-window.json').read_text())
now=datetime.now(timezone.utc)
deadline=datetime.fromisoformat(w['deadline'])
v={'at':now.isoformat(),'operation':sys.argv[1] if len(sys.argv)>1 else '', 'allowed':now<deadline,'secondsLeft':max(0,(deadline-now).total_seconds())}
with (p/'free-clock-checks.jsonl').open('a') as f:f.write(json.dumps(v,ensure_ascii=False)+'\n')
print(json.dumps(v))
