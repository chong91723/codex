#!/usr/bin/env python3
"""Build the exact clean upstream commit without writing build output into it."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[2]


def git(*args):
    return subprocess.check_output(['git','-C',str(ROOT/'upstream'),*args],text=True).strip()


def clean():
    status=git('status','--porcelain','--untracked-files=all')
    if status:
        raise SystemExit('Upstream is modified; refusing to build. Preserve or restore your changes manually.\n'+status)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--jobs',type=int,default=2)
    parser.add_argument('--release',action='store_true')
    args=parser.parse_args()
    clean()
    commit,tree=git('rev-parse','HEAD'),git('rev-parse','HEAD^{tree}')
    env=os.environ.copy()
    local_cargo=ROOT/'.toolchains'/'cargo'
    if (local_cargo/'bin'/'cargo').is_file():
        env.update(CARGO_HOME=str(local_cargo),RUSTUP_HOME=str(ROOT/'.toolchains'/'rustup'))
        env['PATH']=str(local_cargo/'bin')+os.pathsep+env['PATH']
    sysroot=ROOT/'.toolchains'/'sysroot'/'usr'
    if sysroot.is_dir():
        lib=sysroot/'lib'/'x86_64-linux-gnu'
        env['PATH']=str(sysroot/'bin')+os.pathsep+env['PATH']
        env['PKG_CONFIG_PATH']=str(lib/'pkgconfig')+os.pathsep+env.get('PKG_CONFIG_PATH','')
        env['LD_LIBRARY_PATH']=str(lib)+os.pathsep+env.get('LD_LIBRARY_PATH','')
        env['CFLAGS']=env.get('CFLAGS','')+' -I'+str(sysroot/'include'/'x86_64-linux-gnu')
    cargo=shutil.which('cargo',path=env['PATH'])
    if not cargo:
        raise SystemExit('Install the Rust toolchain specified in upstream/codex-rs/rust-toolchain.toml first.')
    target=ROOT/'native'/'target'
    command=[cargo,'build','--locked','--target-dir',str(target),'-j',str(args.jobs)]
    if args.release:
        command.append('--release')
    else:
        command+=['--config','profile.dev.debug=0','--config','profile.dev.incremental=false']
    print('Building exact upstream commit '+commit,flush=True)
    try:
        subprocess.run([*command,'-p','codex-cli','--bin','codex'],cwd=ROOT/'upstream'/'codex-rs',env=env,check=True)
        from prepare_v8 import prepare
        env.update(prepare())
        subprocess.run([*command,'-p','codex-code-mode-host','--bin','codex-code-mode-host'],cwd=ROOT/'upstream'/'codex-rs',env=env,check=True)
    finally:
        clean()
        if git('rev-parse','HEAD')!=commit:
            raise SystemExit('Upstream commit changed during the build')
    binary_dir=ROOT/'native'/'bin'
    binary_dir.mkdir(parents=True,exist_ok=True)
    hashes={}
    for name in ['codex','codex-code-mode-host']:
        built=target/('release'if args.release else'debug')/name
        destination=binary_dir/name
        shutil.copy2(built,destination)
        with destination.open('rb') as file:
            hashes[name]=hashlib.file_digest(file,'sha256').hexdigest()
    provenance={'sourceCommit':commit,'sourceTree':tree,'profile':'release'if args.release else'dev',
                'builtAt':datetime.now(timezone.utc).isoformat(),'sha256':hashes}
    (ROOT/'native'/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    print('Source build complete; upstream is clean.',flush=True)
    subprocess.run([str(binary_dir/'codex'),'--version'],check=True)


if __name__=='__main__':
    main()
