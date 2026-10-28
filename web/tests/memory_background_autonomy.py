"""Real daemon checks with no browser; no aged native rows or model requests."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'web'))
from native_memory import NativeMemory
from memory_scheduler import alive

with tempfile.TemporaryDirectory(prefix='codex-offline-memory-') as directory:
    memory=NativeMemory(ROOT/'native/bin/codex',directory)
    # The independent Web service remains owner even while every browser is closed.
    owner=int(sys.argv[1]) if len(sys.argv)>1 else os.getpid()
    process=subprocess.Popen([sys.executable,'-B',str(ROOT/'web/memory_scheduler.py'),'--codex',str(ROOT/'native/bin/codex'),
                              '--home',directory,'--owner-pid',str(owner),'--interval','5'],start_new_session=True)
    try:
        states=[];deadline=time.monotonic()+20
        while time.monotonic()<deadline:
            path=memory.directory/'scheduler.json'
            if path.exists():
                state=json.loads(path.read_text())
                if not states or states[-1]['checkedAt']!=state['checkedAt']:states.append(state)
                if len(states)>=2:break
            time.sleep(.1)
        assert len(states)>=2,states
        assert all(s['status']=='waiting_for_eligible_history' for s in states),states
        assert process.poll() is None and alive(owner)
        print(json.dumps({'passed':True,'browserConnections':0,'actualChecks':len(states),'states':states,
                          'modelRequests':0,'nativeIdleThresholdUnchanged':True,'scope':'Real daemon liveness, not model extraction'},ensure_ascii=False))
    finally:
        os.killpg(process.pid,signal.SIGTERM)
        try:process.wait(timeout=10)
        except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
