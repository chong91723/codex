"""Legacy native audit helpers, retained for imported Audit users.

The old broad account/marketplace/custom-skill run is outside the current Flash-only
product scope and cannot run by default. Use the current Flash desktop acceptance
scripts. Direct command/sandbox probes remain explicit, isolated opt-ins.

No mocks are used. A success means the native method returned a result. Assertions
validate file contents, history and model output where applicable. Errors and
unexercised external requirements are reported separately, never as passes.
"""
import argparse
import base64
from datetime import datetime,timezone
import json
import os
from pathlib import Path
import socket
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

from browser_client import BrowserNativeClient


def public_result(value):
    if isinstance(value,list):return [public_result(item)for item in value]
    if isinstance(value,dict):return {key:('[redacted]'if isinstance(item,str)and any(word in key.lower()for word in ['token','apikey','authurl','authorization'])else public_result(item))for key,item in value.items()}
    return value


class Audit:
    def __init__(self,url,output):
        self.url,self.output=url,output
        self.client=BrowserNativeClient(url,str(output)+'.browser.json')
        self.records=[]
        self.call('initialize',{'clientInfo':{'name':'codex_acceptance_audit','version':'1.0'},'capabilities':{'experimentalApi':True}})
        self.client.send({'method':'initialized'})
        self.status=self.client.fetch_api('/api/status')
        if not self.status.get('build'):raise RuntimeError('This acceptance audit requires a source-built runtime')
        self.schema=self.client.fetch_api('/api/schema/ClientRequest.json')
        self.workspace=Path(self.status['workspace'])
        if 'acceptance'not in str(self.workspace):raise RuntimeError('Use a disposable directory containing acceptance in its name')

    def call(self,method,params=None,assertion=None):
        start=time.monotonic()
        try:
            if hasattr(self,'schema'):
                entry=next((x for x in self.schema['oneOf']if x['properties']['method']['enum'][0]==method),None)
                if entry and entry['properties'].get('params',{}).get('type')=='null':params=None
            response=self.client.rpc(method,params)
            if 'error'in response:
                error=response['error'];message=error.get('message','')
                blocked=any(word in message.lower()for word in ['not supported','unsupported','not enabled','unavailable','requires chatgpt','not authenticated','authentication required','requires a chatgpt','must be logged','not logged','requires login','only supported','not available','feature is disabled','requires an active','no active realtime','not running','not found in the configured','not configured','not implemented yet','does not use gateway oauth','require the step_model_switching feature'])
                self.records.append({'method':method,'status':'blocked'if blocked else'failed','error':error,'duration':round(time.monotonic()-start,3)})
                print(('BLOCKED 'if blocked else'FAIL ')+method+': '+message[:180],flush=True)
                return None
            result=response.get('result')
            if assertion:assertion(result)
            self.records.append({'method':method,'status':'passed','result':public_result(result),'duration':round(time.monotonic()-start,3)})
            print('PASS '+method,flush=True)
            return result
        except Exception as error:
            self.records.append({'method':method,'status':'failed','error':str(error),'duration':round(time.monotonic()-start,3)})
            print('FAIL '+method+': '+str(error),flush=True)
            return None

    def wait_turn(self,thread_id,turn_id,expected='completed'):
        text=[];cursor=0
        deadline=time.monotonic()+150
        while time.monotonic()<deadline:
            if cursor<len(self.client.events):
                event=self.client.events[cursor];cursor+=1
            else:
                self.client.events.append(self.client.receive());continue
            if event.get('method')=='item/agentMessage/delta'and event['params'].get('turnId')==turn_id:text.append(event['params']['delta'])
            if event.get('method')=='turn/completed'and event['params']['turn']['id']==turn_id:
                turn=event['params']['turn']
                self.records.append({'feature':'real_model_completion','status':'passed'if turn['status']==expected else'failed','expected':expected,'text':''.join(text),'turn':turn})
                return turn
            if event.get('id')is not None and event.get('method'):
                self.records.append({'feature':'unexpected_server_request','status':'failed','method':event['method']})
                self.client.send({'id':event['id'],'error':{'code':-32000,'message':'Unexpected request in isolated audit'}})
        raise TimeoutError('Native turn did not complete')

    def wait_event(self,method,predicate=lambda event:True,seconds=30):
        cursor=0;deadline=time.monotonic()+seconds
        while time.monotonic()<deadline:
            if cursor<len(self.client.events):
                event=self.client.events[cursor];cursor+=1
                if event.get('method')==method and predicate(event):return event
            else:
                event=self.client.receive_timeout(max(0,deadline-time.monotonic()))
                if event is None:return None
                self.client.events.append(event)
        return None

    def run(self):
        w=self.workspace;unique=uuid.uuid4().hex[:10]
        for method,params in [('server/diagnostics',{}),('model/list',{}),('modelProvider/capabilities/read',{}),('experimentalFeature/list',{'limit':100}),('permissionProfile/list',{}),('collaborationMode/list',{}),('config/read',{'includeLayers':True,'cwd':str(w)}),('configRequirements/read',{}),('account/read',{'refreshToken':False}),('skills/list',{'cwds':[str(w)],'forceReload':True}),('hooks/list',{'cwds':[str(w)]}),('skills/extraRoots/set',{'extraRoots':[]}),('plugin/list',{'cwds':[str(w)]}),('plugin/installed',{}),('plugin/reconcile',{}),('app/list',{}),('app/installed',{}),('mcpServerStatus/list',{'limit':100}),('memory/status',{}),('account/gatewayOAuth/read',{}),('account/rateLimits/read',{}),('account/usage/read',{}),('account/workspaceMessages/read',{}),('remoteControl/status/read',{}),('remoteControl/client/list',{'environmentId':'acceptance-local'}),('userVerification/status',{}),('windowsSandbox/readiness',{}),('externalAgentConfig/import/readHistories',{})]:self.call(method,params)
        folder=w/('audit-'+unique)
        self.call('fs/createDirectory',{'path':str(folder)})
        self.call('fs/watch',{'path':str(folder),'watchId':'audit-watch'})
        content=b'NATIVE_FS_AUDIT_OK\n'
        self.call('fs/writeFile',{'path':str(folder/'a.txt'),'dataBase64':base64.b64encode(content).decode()})
        self.call('fs/readFile',{'path':str(folder/'a.txt')},lambda result:self.equal(base64.b64decode(result['dataBase64']),content))
        self.call('fs/copy',{'sourcePath':str(folder/'a.txt'),'destinationPath':str(folder/'b.txt')})
        self.call('fs/getMetadata',{'path':str(folder/'b.txt')})
        self.call('fs/readDirectory',{'path':str(folder)})
        self.call('fs/unwatch',{'watchId':'audit-watch'})
        self.call('fs/remove',{'path':str(folder),'recursive':True})
        self.call('command/exec',{'command':['/usr/bin/printf','NATIVE_EXEC_AUDIT_OK'],'cwd':str(w)},lambda result:self.equal(result['stdout'],'NATIVE_EXEC_AUDIT_OK'))
        self.call('process/spawn',{'command':['/bin/sh','-c','cat'],'cwd':str(w),'processHandle':'audit-process','tty':True,'size':{'rows':20,'cols':80}})
        self.call('process/resizePty',{'processHandle':'audit-process','size':{'rows':24,'cols':100}})
        self.call('process/writeStdin',{'processHandle':'audit-process','deltaBase64':base64.b64encode(b'PTY_AUDIT_OK\n').decode()})
        self.call('process/kill',{'processHandle':'audit-process'})
        self.call('fuzzyFileSearch',{'query':'readme-test','roots':[str(w)]})
        self.call('fuzzyFileSearch/sessionStart',{'sessionId':'audit-search','roots':[str(w)]})
        self.call('fuzzyFileSearch/sessionUpdate',{'sessionId':'audit-search','query':'readme-test'})
        self.call('fuzzyFileSearch/sessionStop',{'sessionId':'audit-search'})
        self.call('config/value/write',{'keyPath':'features.step_model_switching','value':True,'mergeStrategy':'replace','reloadUserConfig':True})
        self.call('experimentalFeature/enablement/set',{'enablement':{'step_model_switching':True}})
        start=self.call('thread/start',{'cwd':str(w),'model':'deepseek-flash'})
        if not start:return
        tid=start['thread']['id'];tp={'threadId':tid}
        turn=self.call('turn/start',{**tp,'input':[{'type':'text','text':'Reply exactly NATIVE_SOURCE_AUDIT_OK. Do not call tools.'}],'effort':'low'})
        if turn:self.wait_turn(tid,turn['turn']['id'])
        self.call('thread/resume',tp)
        self.call('thread/name/set',{**tp,'name':'Isolated native capability audit'})
        self.call('thread/list',{'limit':100,'searchTerm':'Isolated native capability audit'})
        self.call('thread/loaded/list',{})
        self.call('thread/read',{**tp,'includeTurns':False})
        turns=self.call('thread/turns/list',{**tp,'itemsView':'full','sortDirection':'asc'})
        items=self.call('thread/items/list',tp)
        if items and items.get('data'):
            item=items['data'][0];self.call('thread/items/read',{**tp,'turnId':item['turnId'],'itemIds':[item['item']['id']]})
        self.call('thread/timeline/list',tp)
        self.call('thread/metadata/update',{**tp,'gitInfo':{'branch':'acceptance-audit'}})
        self.call('thread/settings/update',{**tp,'effort':'low'})
        self.call('thread/increment_elicitation',tp);self.call('thread/decrement_elicitation',tp)
        self.call('thread/memory/read',tp)
        self.call('thread/backgroundTerminals/list',tp)
        self.call('thread/backgroundTerminals/clean',tp)
        self.call('thread/attachment/add',{**tp,'attachmentType':'acceptance','identityKey':unique,'payload':{'fixture':True}})
        attachments=self.call('thread/attachment/list',tp)
        self.call('thread/attachmentOwner/list',{'attachmentType':'acceptance','identityKey':unique})
        self.call('thread/attachment/remove',{**tp,'attachmentType':'acceptance','identityKey':unique})
        section=self.call('threadSection/create',{'name':'Acceptance '+unique})
        self.call('threadSection/list',{})
        if section:
            sid=section.get('section',{}).get('id')or section.get('id')
            if sid:
                self.call('threadSection/update',{'sectionId':sid,'name':'Updated acceptance'})
                self.call('thread/section/move',{**tp,'sectionId':sid})
                self.call('thread/section/move',{**tp,'sectionId':None})
                self.call('threadSection/delete',{'sectionId':sid})
        self.call('experimentalFeature/enablement/set',{'enablement':{'step_model_switching':True}})
        interrupt=self.call('turn/start',{**tp,'input':[{'type':'text','text':'Reply with the numbers from 1 to 1000.'}],'effort':'low'})
        if interrupt:
            self.wait_event('turn/started',lambda event:event['params']['turn']['id']==interrupt['turn']['id'])
            self.call('turn/settings/update',{**tp,'turnId':interrupt['turn']['id'],'effort':'high'})
            self.call('turn/interrupt',{**tp,'turnId':interrupt['turn']['id']})
            self.wait_turn(tid,interrupt['turn']['id'],'interrupted')
        queued=self.call('thread/queue/add',{**tp,'clientUserMessageId':str(uuid.uuid4()),'input':[{'type':'text','text':'Reply exactly NATIVE_QUEUE_OK. Do not use tools.'}]})
        queue=self.call('thread/queue/list',tp)
        if queue:
            entries=queue.get('items',queue.get('data',queue.get('queuedSubmissions',[])))
            if entries:
                qid=entries[0].get('id')or entries[0].get('queuedSubmissionId')
                if qid:
                    self.call('thread/queue/update',{**tp,'queuedSubmissionId':qid,'input':[{'type':'text','text':'Updated acceptance message'}]})
                    self.call('thread/queue/reorder',{**tp,'queuedSubmissionIds':[qid]})
                    self.call('thread/queue/delete',{**tp,'queuedSubmissionId':qid})
        if queued:
            self.call('thread/queue/add',{**tp,'clientUserMessageId':str(uuid.uuid4()),'input':[{'type':'text','text':'Reply exactly NATIVE_QUEUE_OK. Do not use tools.'}]})
            started=self.call('thread/queue/start',tp)
            if started:self.wait_turn(tid,started['turn']['id'])
        self.call('feedback/save',{'threadId':tid,'classification':'acceptance-test','includeLogs':False,'savePath':str(w/('feedback-'+unique+'.zip'))})
        fork=self.call('thread/fork',tp)
        if fork:
            fid=fork['thread']['id'];self.call('thread/archive',{'threadId':fid});self.call('thread/unarchive',{'threadId':fid});self.call('thread/unsubscribe',{'threadId':fid});self.call('thread/delete',{'threadId':fid})
        self.call('config/value/write',{'keyPath':'model_reasoning_effort','value':'low','mergeStrategy':'replace'})
        self.call('config/batchWrite',{'edits':[{'keyPath':'model_reasoning_effort','value':'high','mergeStrategy':'replace'}]})
        self.call('config/mcpServer/reload',None)
        self.call('mcpServer/tool/call',{**tp,'server':'native_test','tool':'echo','arguments':{'text':'NATIVE_AUDIT'}})
        self.call('mcpServer/resource/read',{**tp,'server':'native_test','uri':'test://codex/native'})
        self.call('skills/config/write',{'path':str(w/'.agents/skills/native-acceptance/SKILL.md'),'enabled':False})
        self.call('skills/config/write',{'path':str(w/'.agents/skills/native-acceptance/SKILL.md'),'enabled':True})
        self.thread_commands(tid,unique)
        self.extra(tid,unique)
        self.streaming_command(unique)
        self.environment(unique)
        self.marketplace(unique)
        self.auth_prerequisites()
        self.call('config/value/write',{'keyPath':'features.step_model_switching','value':False,'mergeStrategy':'replace','reloadUserConfig':True})

    def thread_commands(self,tid,unique):
        marker='NATIVE_USER_SHELL_'+unique
        self.call('thread/shellCommand',{'threadId':tid,'command':'printf '+marker,'timeoutMs':5000})
        completed=self.wait_event('item/completed',lambda event:event['params'].get('threadId')==tid and event['params'].get('item',{}).get('type')=='commandExecution'and marker in event['params']['item'].get('aggregatedOutput',''))
        self.records.append({'feature':'native_user_shell_output','status':'passed'if completed else'failed'})
        if completed:
            self.wait_event('turn/completed',lambda event:event['params'].get('threadId')==tid and event['params']['turn']['id']==completed['params'].get('turnId'))
        turn=self.call('turn/start',{'threadId':tid,'input':[{'type':'text','text':'Call exec_command with cmd="sleep 30" and yield_time_ms=1000. After it yields a session ID, immediately reply BACKGROUND_CREATED. Do not wait for it or call write_stdin.'}],'effort':'low'})
        if turn:self.wait_turn(tid,turn['turn']['id'])
        terminals=self.call('thread/backgroundTerminals/list',{'threadId':tid})
        if terminals and terminals.get('data'):
            for terminal in terminals['data']:
                self.call('thread/backgroundTerminals/terminate',{'threadId':tid,'processId':terminal['processId']},lambda result:self.equal(result['terminated'],True))
            remaining=self.call('thread/backgroundTerminals/list',{'threadId':tid})
            self.records.append({'feature':'background_terminal_lifecycle','status':'passed'if remaining and not remaining.get('data')else'failed'})
        else:self.records.append({'feature':'background_terminal_lifecycle','status':'not_verified','reason':'The model did not retain a background terminal.'})

    def environment(self,unique):
        with socket.socket()as listener:
            listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
        with tempfile.TemporaryDirectory(prefix='codex-exec-acceptance-')as home,tempfile.TemporaryFile()as log:
            process=subprocess.Popen([self.status['runtimePath'],'exec-server','--listen',f'ws://127.0.0.1:{port}'],cwd=self.workspace,env={**os.environ,'CODEX_HOME':home},stdout=log,stderr=log,start_new_session=True)
            try:
                for _ in range(60):
                    try:
                        with socket.create_connection(('127.0.0.1',port),timeout=.1):break
                    except OSError:time.sleep(.1)
                eid='exec-audit-'+unique
                self.call('environment/add',{'environmentId':eid,'execServerUrl':f'ws://127.0.0.1:{port}','connectTimeoutMs':3000})
                info=self.call('environment/info',{'environmentId':eid})
                status=self.call('environment/status',{'environmentId':eid})
                self.records.append({'feature':'source_exec_server_connection','status':'passed'if info and status and status.get('status')=='ready'else'failed','info':info,'connection':status})
            finally:
                process.terminate()
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:process.kill();process.wait()

    def marketplace(self,unique):
        source=self.workspace/'fixture-marketplace';manifest=source/'.agents/plugins/marketplace.json'
        self.call('marketplace/add',{'source':str(source)})
        self.call('plugin/install',{'marketplacePath':str(manifest),'pluginName':'native-test'})
        self.call('plugin/read',{'marketplacePath':str(manifest),'pluginName':'native-test'})
        listing=self.call('plugin/list',{'cwds':[str(self.workspace)]})
        if listing:
            for marketplace in listing.get('marketplaces',[]):
                for plugin in marketplace.get('plugins',[]):
                    if plugin.get('name')=='native-test'and plugin.get('installed'):
                        self.call('plugin/uninstall',{'pluginId':plugin['id']})
        self.call('marketplace/upgrade',{'marketplaceName':'native-test-market'})
        self.call('marketplace/remove',{'marketplaceName':'native-test-market'})

    def auth_prerequisites(self):
        self.call('plugin/skill/read',{'remoteMarketplaceName':'native-test-market','remotePluginId':'native-test','skillName':'plugin-echo'})
        self.call('plugin/share/checkout',{'remotePluginId':'acceptance-nonexistent'})
        self.call('plugin/share/list',{})
        gateway=self.call('account/gatewayOAuth/login',None)
        self.call('account/gatewayOAuth/cancel',None)
        login=self.call('account/login/start',{'type':'chatgpt'})
        if login and login.get('loginId'):self.call('account/login/cancel',{'loginId':login['loginId']})
        self.call('account/logout',None)
        self.call('account/bedrock/discover',{})
        self.call('account/bedrock/setup',{'type':'profile','profile':'acceptance-nonexistent','region':'us-east-1'})
        self.call('account/bedrock/checkGovCloudRequirements',{})
        self.call('remoteControl/client/revoke',{'environmentId':'acceptance-local','clientId':'acceptance-nonexistent'})

    def streaming_command(self,unique):
        process='stream-'+unique
        self.client.counter+=1;request=self.client.counter
        self.client.send({'id':request,'method':'command/exec','params':{'command':['/bin/sh','-c','printf COMMAND_READY; exec cat'],'cwd':str(self.workspace),'processId':process,'tty':True,'size':{'rows':20,'cols':80},'timeoutMs':10000}})
        ready=self.wait_event('command/exec/outputDelta',lambda event:event['params'].get('processId')==process)
        if not ready:
            self.records.append({'feature':'streaming_command_ready','status':'failed'});return
        self.call('command/exec/resize',{'processId':process,'size':{'rows':30,'cols':100}})
        self.call('command/exec/write',{'processId':process,'deltaBase64':base64.b64encode(b'NATIVE_STREAM_STDIN_OK\n').decode()})
        echoed=self.wait_event('command/exec/outputDelta',lambda event:event['params'].get('processId')==process and b'NATIVE_STREAM_STDIN_OK'in base64.b64decode(event['params'].get('deltaBase64','')))
        self.records.append({'feature':'streaming_command_stdin','status':'passed'if echoed else'failed'})
        self.call('command/exec/terminate',{'processId':process})

    def linux_sandbox(self):
        unique=uuid.uuid4().hex[:10]
        inside=self.workspace/('linux-sandbox-'+unique+'.txt')
        outside=self.workspace.parent/('acceptance-outside-'+unique+'.txt')
        def command(path):return ['/usr/bin/python3','-c','from pathlib import Path; Path('+repr(str(path))+').write_text("NATIVE_LINUX_SANDBOX_OK")']
        policy={'type':'workspaceWrite','writableRoots':[str(self.workspace)],'networkAccess':False,'excludeTmpdirEnvVar':True,'excludeSlashTmp':True}
        denied=self.call('command/exec',{'command':command(inside),'cwd':str(self.workspace),'sandboxPolicy':{'type':'readOnly'},'timeoutMs':5000})
        self.records.append({'feature':'linux_read_only_sandbox','status':'passed'if denied and denied['exitCode']!=0 and not inside.exists()else'failed','exitCode':denied.get('exitCode')if denied else None})
        allowed=self.call('command/exec',{'command':command(inside),'cwd':str(self.workspace),'sandboxPolicy':policy,'timeoutMs':5000})
        self.records.append({'feature':'linux_workspace_write_allowed','status':'passed'if allowed and allowed['exitCode']==0 and inside.read_text()=='NATIVE_LINUX_SANDBOX_OK'else'failed'})
        blocked=self.call('command/exec',{'command':command(outside),'cwd':str(self.workspace),'sandboxPolicy':policy,'timeoutMs':5000})
        self.records.append({'feature':'linux_workspace_boundary_enforced','status':'passed'if blocked and blocked['exitCode']!=0 and not outside.exists()else'failed','exitCode':blocked.get('exitCode')if blocked else None})
        inside.unlink(missing_ok=True);outside.unlink(missing_ok=True)

    def git_marketplace(self):
        name='git-upgrade-acceptance'
        with tempfile.TemporaryDirectory(prefix='codex-git-marketplace-acceptance-')as temp:
            work=Path(temp)/'source'
            shutil.copytree(self.workspace/'fixture-marketplace',work)
            manifest=work/'.agents/plugins/marketplace.json'
            data=json.loads(manifest.read_text());data['name']=name;manifest.write_text(json.dumps(data))
            def git(*args):subprocess.run(['git','-C',str(work),*args],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            git('init','-q');git('config','user.name','Acceptance');git('config','user.email','acceptance@example.invalid');git('add','.');git('commit','-qm','Native Git marketplace fixture v1')
            self.call('config/value/write',{'keyPath':'marketplaces.'+name,'value':{'source_type':'git','source':str(work)},'mergeStrategy':'replace','reloadUserConfig':True})
            try:
                first=self.call('marketplace/upgrade',{'marketplaceName':name})
                if not first:raise AssertionError('Initial Git marketplace checkout failed')
                root=Path(first['upgradedRoots'][0])
                plugin=work/'plugins/native-test/.codex-plugin/plugin.json'
                data=json.loads(plugin.read_text());data['version']='2.0.0';plugin.write_text(json.dumps(data))
                git('add','.');git('commit','-qm','Native Git marketplace fixture v2')
                second=self.call('marketplace/upgrade',{'marketplaceName':name})
                actual=json.loads((root/'plugins/native-test/.codex-plugin/plugin.json').read_text())
                self.records.append({'feature':'git_marketplace_upgrade','status':'passed'if second and not second['errors']and actual['version']=='2.0.0'else'failed','version':actual['version']})
            finally:self.call('marketplace/remove',{'marketplaceName':name})

    def extra(self,tid,unique):
        """Exercise local lifecycle APIs and record real native prerequisite errors."""
        w=self.workspace;tp={'threadId':tid}
        project=self.call('project/create',{'name':'Native audit '+unique,'roots':[{'path':str(w)}],'idempotencyKey':unique})
        self.call('project/list',{})
        if project:
            pid=project.get('project',project).get('id')
            if pid:
                self.call('project/read',{'projectId':pid})
                self.call('project/update',{'projectId':pid,'name':'Renamed native audit '+unique})
                self.call('project/move',{'projectId':pid,'beforeProjectId':None})
                self.call('thread/metadata/update',{**tp,'projectId':pid})
                self.call('thread/metadata/update',{**tp,'projectId':''})
                self.call('project/delete',{'projectId':pid})
        imported=self.call('project/import',{'name':'Imported audit '+unique,'roots':[{'path':str(w)}],'threads':[tid],'idempotencyKey':'import-'+unique})
        if imported:
            pid=imported.get('project',imported).get('id')
            if pid:self.call('project/delete',{'projectId':pid})
        self.call('thread/search',{'searchTerm':'NATIVE_SOURCE_AUDIT_OK'})
        self.call('thread/searchOccurrences',{**tp,'searchTerm':'NATIVE_SOURCE_AUDIT_OK'})
        recent=self.call('thread/turns/list',{**tp,'itemsView':'full','sortDirection':'desc','limit':1})
        if recent and recent.get('data'):
            last=recent['data'][0]['id']
            self.call('thread/sample',{**tp,'expectedTurnId':last,'prompt':'Reply exactly NATIVE_SAMPLE_OK. Do not call tools.'},lambda result:self.equal(result.get('text'),'NATIVE_SAMPLE_OK'))
            self.call('thread/prediction/request',{**tp,'sourceTurnId':last})
            sample_id='sample-cancel-'+unique
            self.client.send({'id':sample_id,'method':'thread/sample','params':{**tp,'expectedTurnId':last,'prompt':'Write the numbers from 1 to 1000 without using tools.'}})
            self.call('thread/sample/cancel',{'requestId':sample_id})
        read=self.call('thread/read',{**tp,'includeTurns':False})
        if read and read.get('readState'):
            self.call('thread/readState/update',{**tp,'expectedRevision':read['readState']['revision'],'operation':{'type':'read'}})
        self.call('thread/inject_items',{**tp,'items':[{'type':'message','role':'user','content':[{'type':'input_text','text':'This is an isolated native history-injection fixture.'}]}]})
        self.call('thread/memoryMode/set',{**tp,'mode':'disabled'})
        self.call('thread/memoryMode/set',{**tp,'mode':'enabled'})
        self.call('thread/goal/get',tp)
        self.call('thread/goal/set',{**tp,'objective':'Isolated API fixture already completed','status':'complete','origin':'user'})
        self.call('thread/goal/clear',tp)
        self.call('experimentalFeature/enablement/set',{'enablement':{}})
        self.call('mock/experimentalMethod',{'value':'native-test-only-method'})
        self.call('plugin/search',{'searchTerm':'native-test','cwds':[str(w)]})
        self.call('app/read',{'appIds':[],'includeTools':True})
        self.call('externalAgentConfig/detect',{'includeHome':False,'cwds':[str(w)]})
        self.call('externalAgentConfig/import',{'migrationItems':[],'providerId':'acceptance-fixture'})
        self.call('externalAgentConfig/import/recordHistory',{'providerId':'acceptance-fixture','itemTypeResults':[]})
        # This process owns an isolated CODEX_HOME, so clearing its test memory is safe.
        self.call('memory/reset',None)
        self.call('rollout/compress',None)
        self.call('windowsSandbox/setupStart',{'mode':'unelevated','cwd':str(w)})
        self.call('userVerification/enroll',{})
        self.call('userVerification/verify',{'challenge':'TkFUSVZFX0FVRElU','title':'Native acceptance test','description':'Disposable local verification fixture'})
        self.call('userVerification/cancel',{'requestId':'no-pending-acceptance-verification'})
        self.call('userVerification/delete',{})
        self.call('remoteControl/enable',{'ephemeral':True})
        self.call('remoteControl/pairing/start',{'manualCode':False})
        self.call('remoteControl/pairing/status',{'pairingCode':'acceptance-no-enrollment'})
        self.call('remoteControl/disable',{'ephemeral':True})
        self.call('thread/realtime/listVoices',{})
        self.call('thread/realtime/start',{**tp,'outputModality':'text','includeStartupContext':False})
        realtime_error=self.wait_event('thread/realtime/error',lambda event:event['params'].get('threadId')==tid,seconds=5)
        self.records.append({'feature':'realtime_transport_connection','status':'blocked'if realtime_error else'not_verified','reason':realtime_error['params']['message']if realtime_error else'Native start was accepted; a working external realtime transport was not established.'})
        self.call('thread/realtime/appendText',{**tp,'text':'Native acceptance test'})
        self.call('thread/realtime/appendAudio',{**tp,'audio':{'data':base64.b64encode(bytes(480)).decode(),'numChannels':1,'sampleRate':24000,'samplesPerChannel':240}})
        self.call('thread/realtime/appendSpeech',{**tp,'text':'Native acceptance test'})
        self.call('thread/realtime/stop',tp)
        self.call('mcpServer/event/stream/start',{**tp,'server':'native_test','name':'echo','arguments':{'text':'event-test'},'subscriptionId':'acceptance-event'})
        self.call('mcpServer/event/stream/stop',{'subscriptionId':'acceptance-event'})
        self.call('mcpServer/oauth/login',{'name':'native_test','threadId':tid,'timeoutSecs':1})

    @staticmethod
    def equal(actual,expected):
        if actual!=expected:raise AssertionError(f'{actual!r} != {expected!r}')

    def finish(self):
        seen={x['method']for x in self.records if'method'in x}
        for entry in self.schema['oneOf']:
            method=entry['properties']['method']['enum'][0]
            if method not in seen:self.records.append({'method':method,'status':'not_tested','reason':'Requires a separate desktop workflow, platform/account/service prerequisite, or explicit external side-effect authorization. See desktop-results.json and TEST_REPORT.md.'})
        asynchronous=[event for event in self.client.events if event.get('method')=='error'or event.get('method','').startswith(('thread/realtime/','windowsSandbox/'))]
        report={'testedAt':datetime.now(timezone.utc).isoformat(),'sourceCommit':self.status['build']['sourceCommit'],'transport':'real browser protocol panel buttons','scope':'passed method records mean successful real native RPC results; asynchronous feature outcomes are recorded separately. This is not a claim that every external capability completed.','records':self.records,'asynchronousEvents':asynchronous}
        self.output.parent.mkdir(parents=True,exist_ok=True);self.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
        self.client.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:8765');parser.add_argument('--output',type=Path,default=Path('/tmp/codex-native-acceptance.json'));parser.add_argument('--only-commands',action='store_true');parser.add_argument('--only-sandbox',action='store_true');parser.add_argument('--only-git-marketplace',action='store_true');args=parser.parse_args()
    if not (args.only_commands or args.only_sandbox) or args.only_git_marketplace:
        parser.error('The historical broad/account/marketplace audit is outside the current Flash-only scope. Run flash_menu_followup_desktop.mjs and native_builtin_skills_desktop.mjs against an isolated audit instance. Audit remains importable; only explicit --only-commands or --only-sandbox probes are available here.')
    audit=Audit(args.url,args.output)
    try:
        if args.only_git_marketplace:audit.git_marketplace()
        elif args.only_sandbox:audit.linux_sandbox()
        elif args.only_commands:
            thread=audit.call('thread/start',{'cwd':str(audit.workspace),'model':'deepseek-flash'})
            if thread:audit.thread_commands(thread['thread']['id'],uuid.uuid4().hex[:10])
        else:audit.run()
    finally:audit.finish()
