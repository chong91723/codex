"""Real account-backed native acceptance, using an isolated, already signed-in profile.

Remote fixture creation is opt-in; cleanup must really succeed before its marker
is removed. Personal accounts can be rejected by the native workspace endpoint. Does not send email, spend reset credits, or upload feedback logs.
Never records access tokens, account identifiers, private catalog contents or URLs.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import time
import uuid

from browser_client import BrowserNativeClient


def clean_error(message):
    if 'cf_chl_'in message or 'challenge-platform'in message:return 'HTTP 403: Cloudflare requires browser verification on this service endpoint.'
    if '<html'in message.lower():return 'HTTP service returned an HTML error page.'
    return re.sub(r'sk-[A-Za-z0-9_-]+','[redacted]',message)[:600]


parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url',default='http://127.0.0.1:8766')
parser.add_argument('--output',type=Path,default=Path('/tmp/codex-account-acceptance.json'))
parser.add_argument('--only-private-plugin',action='store_true')
parser.add_argument('--create-private-fixture',action='store_true',help='Opt in to a private remote fixture; requires an active workspace')
args=parser.parse_args();client=BrowserNativeClient(args.url,str(args.output)+'.browser.json');records=[]

def call(method,params=None):
    begin=time.monotonic()
    try:
        response=client.rpc(method,params)
        if 'error'in response:
            message=clean_error(response['error'].get('message',''))
            records.append({'method':method,'status':'blocked','error':message,'seconds':round(time.monotonic()-begin,2)})
            print('BLOCKED '+method+': '+message,flush=True);return None
        result=response.get('result')
        records.append({'method':method,'status':'passed','resultKeys':list(result)if isinstance(result,dict)else[],'seconds':round(time.monotonic()-begin,2)})
        print('PASS '+method,flush=True);return result
    except Exception as error:
        records.append({'method':method,'status':'failed','error':clean_error(str(error))})
        print('FAIL '+method+': '+clean_error(str(error)),flush=True);return None

def wait(method,seconds=20):
    cursor=0;deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        if cursor<len(client.events):
            event=client.events[cursor];cursor+=1
            if event.get('method')==method:return event
        else:
            event=client.receive_timeout(max(0,deadline-time.monotonic()))
            if event is None:return None
            client.events.append(event)
    return None

remote_id=None;remote_control_enabled=False
try:
    initialized=call('initialize',{'clientInfo':{'name':'codex_web_account_acceptance','version':'1'},'capabilities':{'experimentalApi':True}})
    client.send({'method':'initialized'})
    home=Path(initialized['codexHome'])
    if 'chatgpt-acceptance'not in str(home):raise RuntimeError('Use the isolated ChatGPT acceptance profile')
    account=call('account/read',{'refreshToken':False})
    if not account or account.get('account',{}).get('type')!='chatgpt':raise RuntimeError('A real ChatGPT sign-in is required')
    if not args.only_private_plugin:
        call('account/rateLimits/read');call('account/usage/read');call('account/workspaceMessages/read')
        call('app/list',{});call('app/installed',{})
    call('plugin/share/list',{})
    if args.create_private_fixture:
        if (home/'test-plugin-cleanup-id').exists():raise RuntimeError('Resolve the existing private test fixture before creating another')
        # The fixture contains only files created for this acceptance run.
        plugin=home/'private-plugin-fixture';plugin.mkdir(parents=True,exist_ok=True)
        shutil.copytree(Path(__file__).resolve().parents[2]/'workspaces/acceptance/fixture-marketplace/plugins/native-test',plugin,dirs_exist_ok=True)
        manifest=plugin/'.codex-plugin/plugin.json';data=json.loads(manifest.read_text())
        data['name']='native-web-acceptance-'+uuid.uuid4().hex[:8];data['author']={'name':'Codex Web Acceptance'};data['license']='Apache-2.0';data['interface']={'displayName':'Native Web Acceptance','shortDescription':'Disposable native acceptance fixture','longDescription':'A private disposable plugin used to verify the unmodified Codex plugin lifecycle.','developerName':'Codex Web Acceptance','category':'productivity','capabilities':['Read']};manifest.write_text(json.dumps(data))
        saved=call('plugin/share/save',{'pluginPath':str(plugin),'discoverability':'PRIVATE','shareTargets':[]})
        if saved:
            remote_id=saved['remotePluginId'];(home/'test-plugin-cleanup-id').write_text(remote_id)
            access=call('plugin/share/updateTargets',{'remotePluginId':remote_id,'discoverability':'PRIVATE','shareTargets':[]})
            records.append({'feature':'private_plugin_visibility','status':'passed'if access and access.get('discoverability')=='PRIVATE'else'failed'})
            checked=call('plugin/share/checkout',{'remotePluginId':remote_id})
            if checked:
                skill=call('plugin/skill/read',{'remoteMarketplaceName':checked['marketplaceName'],'remotePluginId':remote_id,'skillName':'plugin-echo'})
                records.append({'feature':'private_plugin_skill_contents','status':'passed'if skill and'NATIVE_PLUGIN_OK'in str(skill.get('contents'))else'failed'})
            deleted=call('plugin/share/delete',{'remotePluginId':remote_id})
            if deleted is not None:remote_id=None;(home/'test-plugin-cleanup-id').unlink(missing_ok=True)
    remote=None if args.only_private_plugin else call('remoteControl/enable',{'ephemeral':True});remote_control_enabled=remote is not None
    if remote:
        deadline=time.monotonic()+25
        while time.monotonic()<deadline:
            status=call('remoteControl/status/read')
            if status and status.get('environmentId'):
                eid=status['environmentId'];call('remoteControl/client/list',{'environmentId':eid})
                pairing=call('remoteControl/pairing/start',{'manualCode':False})
                if pairing and pairing.get('pairingCode'):call('remoteControl/pairing/status',{'pairingCode':pairing['pairingCode']})
                break
            time.sleep(1)
        else:records.append({'feature':'remote_control_enrollment','status':'blocked','reason':'The native enrollment did not produce an environment before the test deadline.'})
    if remote_control_enabled:call('remoteControl/disable',{'ephemeral':True});remote_control_enabled=False
    workspace=Path(__file__).resolve().parents[2]/'workspaces/chatgpt-acceptance'
    thread=None if args.only_private_plugin else call('thread/start',{'cwd':str(workspace),'model':'gpt-5.6-luna'})
    if thread:
        tid=thread['thread']['id']
        call('thread/realtime/start',{'threadId':tid,'outputModality':'text','includeStartupContext':False})
        connected=wait('thread/realtime/started',seconds=15)
        errors=[e['params'].get('message')for e in client.events if e.get('method')=='thread/realtime/error']
        records.append({'feature':'chatgpt_realtime_connection','status':'passed'if connected else'blocked','errors':[clean_error(error or'')for error in errors]})
        if connected:
            call('thread/realtime/appendText',{'threadId':tid,'text':'Reply exactly REALTIME_NATIVE_AUTH_OK.'})
            output=wait('thread/realtime/itemAdded',seconds=10)
            records.append({'feature':'chatgpt_realtime_output','status':'passed'if output else'not_verified'})
        call('thread/realtime/stop',{'threadId':tid})
finally:
    if remote_id:call('plugin/share/delete',{'remotePluginId':remote_id})
    if remote_control_enabled:call('remoteControl/disable',{'ephemeral':True})
    client.close();args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps({'scope':'Real account-native calls, with private identity and content omitted. A passed RPC alone does not prove an asynchronous capability completed.','records':records},ensure_ascii=False,indent=2)+'\n')
