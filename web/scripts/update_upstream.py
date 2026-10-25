#!/usr/bin/env python3
"""Apply pristine official Codex updates, rebuild, and verify the native protocol.

Only an official Git checkout and this project's lock/build output are changed.
Local upstream edits (including ignored generated files) are always rejected.
"""
import argparse
from datetime import datetime,timezone
import json
import os
from pathlib import Path
import subprocess
import sys

from build_native import clean
from verify_upstream import verify

ROOT=Path(__file__).resolve().parents[2]

def git(*args):
    return subprocess.check_output(['git','-C',str(ROOT/'upstream'),*args],text=True).strip()

def fetch():
    env=os.environ.copy()
    ssh=subprocess.run(['git','-C',str(ROOT),'config','--get','core.sshCommand'],text=True,capture_output=True)
    if ssh.returncode==0:env.setdefault('GIT_SSH_COMMAND',ssh.stdout.strip())
    errors=[]
    for url in ['https://github.com/openai/codex.git','git@github.com:openai/codex.git']:
        try:
            result=subprocess.run(['git','-C',str(ROOT/'upstream'),'fetch','--depth=1',url,'HEAD'],env=env,text=True,capture_output=True,timeout=45)
            if result.returncode==0:return git('rev-parse','FETCH_HEAD')
            errors.append(result.stderr.strip())
        except subprocess.TimeoutExpired:errors.append('Official fetch timed out: '+url)
    raise RuntimeError('\n'.join(errors))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Fetch and compare the official HEAD without changing the checkout or lock')
    parser.add_argument('--jobs',type=int,default=2)
    parser.add_argument('--release',action='store_true')
    parser.add_argument('--rebuild',action='store_true',help='Rebuild even when the source is already current')
    args=parser.parse_args()
    clean();verify()
    before=git('rev-parse','HEAD');latest=fetch()
    print(json.dumps({'current':before,'officialHead':latest,'updateAvailable':latest!=before},indent=2),flush=True)
    if args.check:return
    if latest!=before:
        lock_path=ROOT/'upstream-lock.json';old_lock=lock_path.read_text()
        subprocess.run(['git','-C',str(ROOT/'upstream'),'checkout','--detach',latest],check=True)
        try:
            clean();lock=json.loads(old_lock)
            lock.update(sourceCommit=latest,sourceTree=git('rev-parse','HEAD^{tree}'),sourceCommitDate=git('show','-s','--format=%cI','HEAD'),checkedOn=datetime.now(timezone.utc).date().isoformat())
            lock_path.write_text(json.dumps(lock,indent=2)+'\n')
            command=[sys.executable,str(ROOT/'web/scripts/build_native.py'),'--jobs',str(args.jobs)]
            if args.release:command.append('--release')
            subprocess.run(command,check=True)
        except Exception:
            # Keep the official checkout and lock together for inspection/retry.
            # Never patch upstream or silently select an older executable.
            print('Update/build failed. Inspect the error, then rerun with --rebuild. The Web launcher will reject a mismatched source/runtime.',file=sys.stderr)
            raise
    elif args.rebuild:
        command=[sys.executable,str(ROOT/'web/scripts/build_native.py'),'--jobs',str(args.jobs)]
        if args.release:command.append('--release')
        subprocess.run(command,check=True)
    print(json.dumps(verify(ROOT/'native/bin/codex'),indent=2))
    print('Official source and runtime verified. Restart the Web service, run acceptance, and commit the parent repository lock/submodule pointer.')

if __name__=='__main__':main()
