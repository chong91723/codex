#!/usr/bin/env python3
"""Create disposable fixtures outside upstream; this does not touch real projects."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

def create(workspace,profile):
    workspace.mkdir(parents=True,exist_ok=True)
    skill=workspace/'.agents/skills/native-acceptance/SKILL.md';skill.parent.mkdir(parents=True,exist_ok=True)
    skill.write_text('---\nname: native-acceptance\ndescription: Exercise the native Codex skill loader in an isolated acceptance workspace.\n---\nWhen this skill is invoked, include NATIVE_SKILL_OK in your response.\n')
    plugin=workspace/'fixture-marketplace/plugins/native-test';(plugin/'.codex-plugin').mkdir(parents=True,exist_ok=True)
    (plugin/'.codex-plugin/plugin.json').write_text(json.dumps({'name':'native-test','version':'1.0.0','description':'Local plugin acceptance fixture'}))
    plugin_skill=plugin/'skills/plugin-echo/SKILL.md';plugin_skill.parent.mkdir(parents=True,exist_ok=True);plugin_skill.write_text('---\nname: plugin-echo\ndescription: Local plugin acceptance skill.\n---\nRespond with NATIVE_PLUGIN_OK.\n')
    marketplace=workspace/'fixture-marketplace/.agents/plugins/marketplace.json';marketplace.parent.mkdir(parents=True,exist_ok=True)
    marketplace.write_text(json.dumps({'name':'native-test-market','plugins':[{'name':'native-test','source':{'source':'local','path':'./plugins/native-test'}}]}))
    (workspace/'readme-test.txt').write_text('NATIVE_FILE_OK\n')
    (workspace/'calculator.py').write_text('def average(values):\n    return sum(values) / len(values) if values else 0\n')
    subprocess.run(['git','init','-q',str(workspace)],check=True)
    subprocess.run(['git','-C',str(workspace),'config','user.name','Codex Acceptance'],check=True)
    subprocess.run(['git','-C',str(workspace),'config','user.email','acceptance@example.invalid'],check=True)
    subprocess.run(['git','-C',str(workspace),'add','.'],check=True)
    subprocess.run(['git','-C',str(workspace),'commit','-qm','Create isolated acceptance fixtures'],check=True)
    config=profile/'config.toml'
    text=config.read_text()
    if '[mcp_servers.native_test]'not in text:
        fixture=Path(__file__).resolve().parents[1]/'tests/mcp_fixture.py'
        with config.open('a')as file:file.write('\n[mcp_servers.native_test]\ncommand = '+json.dumps(sys.executable)+'\nargs = ['+json.dumps(str(fixture))+']\n')
    return {'workspace':str(workspace),'skill':str(skill),'marketplace':str(marketplace),'profile':str(profile)}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--workspace',type=Path,required=True);parser.add_argument('--profile',type=Path,required=True);args=parser.parse_args()
    print(json.dumps(create(args.workspace.resolve(),args.profile.resolve()),indent=2))
