"""Execute source-native trusted command hooks against the disposable profile."""
import argparse
import json
from pathlib import Path
import shlex
import sys
import time
import uuid

from browser_client import BrowserNativeClient

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url',default='http://127.0.0.1:8765')
parser.add_argument('--output',type=Path,default=Path('/tmp/codex-hooks-acceptance.json'))
args=parser.parse_args();client=BrowserNativeClient(args.url,str(args.output)+'.browser.json')

def call(method,params):
    response=client.rpc(method,params)
    if 'error'in response:raise RuntimeError(method+': '+str(response['error']))
    return response['result']

def write(key,value):
    return call('config/value/write',{'keyPath':key,'value':value,'mergeStrategy':'replace','reloadUserConfig':True})

report={};saved=None
try:
    call('initialize',{'clientInfo':{'name':'native_hooks_acceptance','version':'1'},'capabilities':{'experimentalApi':True}})
    client.send({'method':'initialized'})
    config=call('config/read',{'includeLayers':True})
    user=next(layer for layer in config['layers']if layer['name']['type']=='user')
    home=Path(user['name']['file']).parent
    if 'acceptance'not in str(home):raise RuntimeError('Use the isolated acceptance profile')
    saved={'hooks':user['config'].get('hooks'),'features.hooks':user['config'].get('features',{}).get('hooks')}
    workspace=Path('/root/Codex/workspaces/acceptance')
    log=workspace/('hooks-'+uuid.uuid4().hex[:8]+'.jsonl')
    command=shlex.quote(sys.executable)+' '+shlex.quote(str(Path(__file__).with_name('hook_fixture.py')))+' '+shlex.quote(str(log))
    events=['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','Stop']
    hooks={event:[{'hooks':[{'type':'command','command':command,'timeout':10}]}]for event in events}
    write('features.hooks',True);write('hooks',hooks)
    listed=call('hooks/list',{'cwds':[str(workspace)]})
    metadata=[hook for entry in listed['data']for hook in entry['hooks']if hook.get('command')==command]
    if len(metadata)!=len(events):raise AssertionError('Native hook declarations were not all discovered: '+str(listed))
    for hook in metadata:write('hooks.state.'+json.dumps(hook['key'])+'.trusted_hash',hook['currentHash'])
    thread=call('thread/start',{'cwd':str(workspace),'model':'deepseek-flash'})['thread']
    turn=call('turn/start',{'threadId':thread['id'],'effort':'low','input':[{'type':'text','text':'Run printf NATIVE_HOOK_TOOL_OK using your native shell tool, then reply HOOKS_COMPLETE.'}]})['turn']
    finished=None;deadline=time.monotonic()+120
    while time.monotonic()<deadline:
        event=client.receive();client.events.append(event)
        if event.get('method')=='turn/completed'and event['params']['turn']['id']==turn['id']:
            finished=event['params']['turn'];break
    if not finished or finished['status']!='completed':raise AssertionError('Native hook turn did not complete: '+str(finished))
    received=[json.loads(line)for line in log.read_text().splitlines()]
    seen={entry['event']for entry in received}
    if not set(events)<=seen:raise AssertionError('Missing hook executions: '+str(set(events)-seen))
    report={'status':'passed','threadId':thread['id'],'events':received,'trustedHookCount':len(metadata),'turnStatus':finished['status']}
    print('PASS native hook discovery, trust and five real lifecycle events')
except Exception as error:
    report={'status':'failed','error':str(error)};print('FAIL '+str(error));raise
finally:
    if saved is not None:
        write('hooks',saved['hooks']);write('features.hooks',saved['features.hooks'])
    client.close();args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
