#!/usr/bin/env python3
"""A real command hook that records only acceptance lifecycle metadata."""
import json
from pathlib import Path
import sys

target=Path(sys.argv[1]).resolve()
if 'acceptance'not in str(target):raise SystemExit('Use an isolated acceptance directory')
payload=json.load(sys.stdin)
with target.open('a')as file:
    file.write(json.dumps({'event':payload.get('hook_event_name'),'tool':payload.get('tool_name')})+'\n')
print('{}')
