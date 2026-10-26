#!/usr/bin/env python3
"""Install optional, pinned read-only database and local chart components."""
import argparse,json,os,shutil,subprocess,sys,venv
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--node',help='Node.js 20+ executable');parser.add_argument('--npm',help='npm executable');parser.add_argument('--proxy',help='Optional HTTP proxy for dependency downloads');args=parser.parse_args()
    python=ROOT/'.toolchains/databases/bin/python';target=python.parents[1]
    if not python.exists():venv.EnvBuilder(with_pip=True).create(target)
    command=[str(python),'-m','pip','install','--index-url','https://pypi.org/simple','-r',str(ROOT/'web/database/requirements.txt')]
    if args.proxy:command+=['--proxy',args.proxy]
    subprocess.run(command,check=True)
    node=Path(args.node or shutil.which('node') or '').resolve();npm=args.npm or shutil.which('npm')
    if not node.is_file() or not npm:raise SystemExit('Install Node.js 20+ and npm first, or provide --node and --npm.')
    version=subprocess.check_output([str(node),'--version'],text=True).strip()
    if int(version.lstrip('v').split('.')[0])<20:raise SystemExit('Node.js 20+ required')
    chart=ROOT/'.toolchains/chart-mcp';chart.mkdir(parents=True,exist_ok=True)
    for name in ('package.json','package-lock.json'):shutil.copy2(ROOT/'web/database'/('chart-'+name),chart/name)
    env={**os.environ,'PATH':str(node.parent)+os.pathsep+os.environ.get('PATH','')}
    command=[str(npm),'ci','--prefix',str(chart),'--registry=https://registry.npmjs.org','--no-audit','--no-fund']
    if args.proxy:command+=['--https-proxy='+args.proxy]
    subprocess.run(command,check=True,env=env)
    if node!=chart/'node':shutil.copy2(node,chart/'node')
    print('Database adapters, full-result snapshots and local ECharts MCP installed. Codex upstream unchanged.')
if __name__=='__main__':main()
