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
import tempfile
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[2]


def git(*args):
    return subprocess.check_output(['git','-C',str(ROOT/'upstream'),*args],text=True).strip()


def clean():
    status=git('status','--porcelain','--untracked-files=all')
    ignored=git('ls-files','--others','--ignored','--exclude-standard')
    if ignored:
        raise SystemExit('Generated files were found inside upstream; keep all build output outside it.\n'+ignored)
    if status:
        raise SystemExit('Upstream is modified; refusing to build. Preserve or restore your changes manually.\n'+status)


def assemble(profile='dev',rg_bin=None):
    clean()
    commit,tree=git('rev-parse','HEAD'),git('rev-parse','HEAD^{tree}')
    output=ROOT/'.toolchains'/'build-target'/('release'if profile=='release'else'debug')
    os.environ['CODEX_REPO_ROOT']=str(ROOT/'upstream')
    sys.dont_write_bytecode=True
    sys.path.insert(0,str(ROOT/'upstream'/'scripts'))
    from codex_package.layout import build_package_dir,validate_package_dir
    from codex_package.targets import PACKAGE_VARIANTS,TARGET_SPECS,PackageInputs
    from codex_package.ripgrep import resolve_rg_bin
    spec=TARGET_SPECS['x86_64-unknown-linux-gnu'];variant=PACKAGE_VARIANTS['codex']
    rg=resolve_rg_bin(spec,Path(rg_bin)if rg_bin else(Path(shutil.which('rg'))if shutil.which('rg')else None))
    inputs=PackageInputs(entrypoint_bin=output/'codex',code_mode_host_bin=output/'codex-code-mode-host',rg_bin=rg,bwrap_bin=output/'bwrap',codex_command_runner_bin=None,codex_windows_sandbox_setup_bin=None)
    native=ROOT/'native';native.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.package-',dir=native)as temp:
        stage=Path(temp)
        build_package_dir(stage,'0.0.0',variant,spec,inputs)
        validate_package_dir(stage,variant,spec)
        for path in stage.rglob('*'):
            destination=native/path.relative_to(stage)
            if path.is_dir():destination.mkdir(exist_ok=True)
            else:path.replace(destination)
    names=['bin/codex','bin/codex-code-mode-host','codex-resources/bwrap','codex-path/rg','codex-package.json']
    hashes={}
    for name in names:
        with (native/name).open('rb')as file:hashes[name]=hashlib.file_digest(file,'sha256').hexdigest()
    provenance={'sourceCommit':commit,'sourceTree':tree,'profile':profile,'layoutVersion':1,'builtAt':datetime.now(timezone.utc).isoformat(),'sha256':hashes}
    (native/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    clean()
    print('Source package complete; CLI, code-mode host, sandbox, ripgrep and metadata verified.',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--jobs',type=int,default=2)
    parser.add_argument('--release',action='store_true')
    parser.add_argument('--rg-bin',type=Path,help='Optional existing ripgrep binary, as supported by the upstream package builder')
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
    target=ROOT/'.toolchains'/'build-target'
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
        subprocess.run([*command,'-p','codex-bwrap','--bin','bwrap'],cwd=ROOT/'upstream'/'codex-rs',env=env,check=True)
    finally:
        clean()
        if git('rev-parse','HEAD')!=commit:
            raise SystemExit('Upstream commit changed during the build')
    assemble('release'if args.release else'dev',args.rg_bin)
    print('Source build complete; upstream is clean.',flush=True)
    subprocess.run([str(ROOT/'native/bin/codex'),'--version'],check=True)


if __name__=='__main__':
    main()
