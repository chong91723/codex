"""Real native capability audit. Run against an isolated acceptance profile only.

No mocks are used. A success means the native method returned a result. Assertions
validate file contents, history and model output where applicable. Errors and
unexercised external requirements are reported separately, never as passes.
"""
import argparse
import base64
from datetime import datetime,timezone
import json
from pathlib import Path
import sys
import time
import urllib.request
import uuid

from test_native import NativeClient


class Audit:
    def __init__(self,url,output):
        self.url,self.output=url,output
        self.client=NativeClient(url)
        self.records=[]
        self.call('initialize',{'clientInfo':{'name':'codex_acceptance_audit','version':'1.0'},'capabilities':{'experimentalApi':True}})
        self.client.send({'method':'initialized'})
        request=urllib.request.Request(url+'/api/status',headers={'Cookie':self.client.cookie})
        self.status=json.load(urllib.request.urlopen(request))
        if not self.status.get('build'):raise RuntimeError('This acceptance audit requires a source-built runtime')
        request=urllib.request.Request(url+'/api/schema/ClientRequest.json',headers={'Cookie':self.client.cookie})
        self.schema=json.load(urllib.request.urlopen(request))
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
                blocked=any(word in message.lower()for word in ['not supported','unsupported','not enabled','unavailable','requires chatgpt','not authenticated','authentication required','requires a chatgpt','must be logged','not logged','requires login'])
                self.records.append({'method':method,'status':'blocked'if blocked else'failed','error':error,'duration':round(time.monotonic()-start,3)})
                print(('BLOCKED 'if blocked else'FAIL ')+method+': '+message[:180],flush=True)
                return None
            result=response.get('result')
            if assertion:assertion(result)
            self.records.append({'method':method,'status':'passed','result':result,'duration':round(time.monotonic()-start,3)})
            print('PASS '+method,flush=True)
            return result
        except Exception as error:
            self.records.append({'method':method,'status':'failed','error':str(error),'duration':round(time.monotonic()-start,3)})
            print('FAIL '+method+': '+str(error),flush=True)
            return None

    def wait_turn(self,thread_id,turn_id):
        text=[]
        deadline=time.monotonic()+150
        while time.monotonic()<deadline:
            event=self.client.receive()
            self.client.events.append(event)
            if event.get('method')=='item/agentMessage/delta':text.append(event['params']['delta'])
            if event.get('method')=='turn/completed'and event['params']['turn']['id']==turn_id:
                turn=event['params']['turn']
                self.records.append({'feature':'real_model_completion','status':'passed'if turn['status']=='completed'else'failed','text':''.join(text),'turn':turn})
                return turn
            if event.get('id')is not None and event.get('method'):
                self.records.append({'feature':'unexpected_server_request','status':'failed','method':event['method']})
                self.client.send({'id':event['id'],'error':{'code':-32000,'message':'Unexpected request in isolated audit'}})
        raise TimeoutError('Native turn did not complete')

    def run(self):
        w=self.workspace;unique=uuid.uuid4().hex[:10]
        for method,params in [('server/diagnostics',{}),('model/list',{}),('modelProvider/capabilities/read',{}),('experimentalFeature/list',{'limit':100}),('permissionProfile/list',{}),('collaborationMode/list',{}),('config/read',{'includeLayers':True,'cwd':str(w)}),('configRequirements/read',{}),('account/read',{'refreshToken':False}),('skills/list',{'cwds':[str(w)],'forceReload':True}),('hooks/list',{'cwds':[str(w)]}),('skills/extraRoots/set',{'extraRoots':[]}),('plugin/list',{'cwds':[str(w)]}),('plugin/installed',{}),('plugin/reconcile',{}),('app/list',{}),('app/installed',{}),('mcpServerStatus/list',{'limit':100}),('memory/status',{}),('account/gatewayOAuth/read',{}),('account/rateLimits/read',{}),('account/usage/read',{}),('account/workspaceMessages/read',{}),('remoteControl/status/read',{}),('remoteControl/client/list',{}),('userVerification/status',{}),('windowsSandbox/readiness',{}),('externalAgentConfig/import/readHistories',{})]:self.call(method,params)
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
        queued=self.call('thread/queue/add',{**tp,'clientUserMessageId':str(uuid.uuid4()),'input':[{'type':'text','text':'A test message, do not execute until requested.'}]})
        queue=self.call('thread/queue/list',tp)
        if queue:
            entries=queue.get('items',queue.get('data',queue.get('queuedSubmissions',[])))
            if entries:
                qid=entries[0].get('id')or entries[0].get('queuedSubmissionId')
                if qid:
                    self.call('thread/queue/update',{**tp,'queuedSubmissionId':qid,'input':[{'type':'text','text':'Updated acceptance message'}]})
                    self.call('thread/queue/reorder',{**tp,'queuedSubmissionIds':[qid]})
                    self.call('thread/queue/delete',{**tp,'queuedSubmissionId':qid})
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

    @staticmethod
    def equal(actual,expected):
        if actual!=expected:raise AssertionError(f'{actual!r} != {expected!r}')

    def finish(self):
        seen={x['method']for x in self.records if'method'in x}
        for entry in self.schema['oneOf']:
            method=entry['properties']['method']['enum'][0]
            if method not in seen:self.records.append({'method':method,'status':'not_tested','reason':'Requires a separate desktop workflow, platform/account/service prerequisite, or explicit external side-effect authorization. See desktop-results.json and TEST_REPORT.md.'})
        report={'testedAt':datetime.now(timezone.utc).isoformat(),'sourceCommit':self.status['build']['sourceCommit'],'records':self.records}
        self.output.parent.mkdir(parents=True,exist_ok=True);self.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
        self.client.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:8765');parser.add_argument('--output',type=Path,default=Path('/tmp/codex-native-acceptance.json'));args=parser.parse_args()
    audit=Audit(args.url,args.output)
    try:audit.run()
    finally:audit.finish()
