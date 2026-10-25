#!/usr/bin/env python3
"""Build a transparent method matrix from real browser receipts.

RPC return success and asynchronous feature completion are different evidence.
Never changes a failed/blocked receipt into a passed one.
"""
from collections import Counter
from datetime import datetime,timezone
import json
from pathlib import Path
from verify_upstream import source_exports,methods

ROOT=Path(__file__).resolve().parents[2];RESULTS=ROOT/'test-results'

def read(path):return json.loads((RESULTS/path).read_text())
def main():
    protocol=sorted(methods(json.loads(source_exports()['ClientRequest.json'])))
    evidence={method:[]for method in protocol};browser_errors=[];features=[]
    for path in sorted(RESULTS.glob('browser-*.json')):
        if '.browser.'in path.name:continue
        data=json.loads(path.read_text())
        for item in data.get('records',[]):
            if item.get('method')in evidence and item['status']!='not_tested':evidence[item['method']].append({'receipt':path.name,'status':item['status']})
            if 'feature'in item:features.append({'receipt':path.name,**item})
    for path in sorted(RESULTS.glob('browser-*.json.browser.json')):
        data=json.loads(path.read_text());browser_errors.extend(data['browserErrors'])
        for item in data['requests']:
            if item['method']in evidence:evidence[item['method']].append({'receipt':path.name,'status':'returned'if item['status']=='returned'else'native_error','origin':item['origin']})
    workflows=[]
    for directory in ['browser-desktop','browser-provider','browser-daemon','browser-chatgpt','browser-oauth']:
        name='desktop-results.json'if directory in ['browser-desktop','browser-provider','browser-daemon']else'results.json'
        path=directory+'/'+name;data=read(path);browser_errors.extend(data.get('browserErrors',[]))
        cases=data.get('results',[{'name':'HTTP MCP OAuth PKCE and authenticated native tool','status':data.get('status')}])
        workflows.extend({'receipt':path,'name':item['name'],'status':item['status']}for item in cases)
        for item in data.get('nativeCalls',data.get('calls',[])):
            if item['method']in evidence:evidence[item['method']].append({'receipt':path,'status':item.get('status','browser_sent'),'origin':'browser'})
    oauth=read('browser-oauth/results.json')
    if oauth['status']=='passed':evidence['mcpServer/oauth/login'].append({'receipt':'browser-oauth/results.json','status':'passed','origin':'browser:mcp-login-button'})
    skipped={'account/rateLimitResetCredit/consume','account/sendAddCreditsNudgeEmail','feedback/upload'}
    notes={
        'thread/prediction/request':'Official source returns not implemented yet.',
        'thread/approveGuardianDeniedAction':'Verified using a real DeepSeek denial, the web confirmation button and newly persisted guardian.approved_action context.',
        'account/workspaceMessages/read':'Authenticated native service request timed out.',
        'userVerification/enroll':'Native build/account returns providerUnavailable.',
        'userVerification/verify':'Native build/account returns providerUnavailable.',
        'userVerification/delete':'Native build/account returns providerUnavailable.',
        'mcpServer/event/stream/start':'Native subscriptions require hosted apps. A standalone MCP server is not a hosted app.',
        'plugin/skill/read':'Remote shared plugin needs an accessible hosted plugin; local plugin skill is exercised separately.',
        'plugin/share/checkout':'The private fixture is not available for checkout in personal space.',
        'plugin/share/updateTargets':'Native backend requires an active workspace; current account has personal space only.',
        'plugin/share/delete':'Native workspace delete endpoint rejects personal space. One PRIVATE test fixture still needs cleanup.',
        'account/gatewayOAuth/login':'Current DeepSeek provider does not use gateway OAuth.',
        'account/bedrock/setup':'AWS credentials/provider prerequisite is unavailable; DeepSeek is independently tested.',
        'remoteControl/client/revoke':'No disposable paired remote client is available; existing user clients were not revoked.',
        'windowsSandbox/readiness':'Windows only. Three Linux sandbox enforcement tests passed through web buttons.',
        'windowsSandbox/setupStart':'Windows only; native asynchronous setup completed with success=false on Linux.',
    }
    rows=[]
    for method in protocol:
        records=evidence[method];statuses={x['status']for x in records}
        status='not_exercised'
        if statuses&{'passed','returned'}:status='returned'
        elif statuses&{'blocked','native_error','failed'}:status='native_error_or_blocked'
        elif records:status='browser_sent'
        if method in skipped:status='user_requested_skip'
        rows.append({'method':method,'webEntry':True,'rpcEvidence':status,'note':notes.get(method,''),'receipts':sorted({x['receipt']for x in records})})
    output={'generatedAt':datetime.now(timezone.utc).isoformat(),'sourceCommit':json.loads((ROOT/'upstream-lock.json').read_text())['sourceCommit'],'webMethodCount':len(protocol),'scope':'Every functional audit request was initiated by actual browser controls. RPC returned means the method returned a result, not that every asynchronous/cloud capability completed. See feature outcomes and TEST_REPORT.md.','methodCounts':dict(Counter(row['rpcEvidence']for row in rows)),'workflowCounts':dict(Counter(row['status']for row in workflows)),'browserErrors':browser_errors,'workflows':workflows,'featureOutcomes':features,'methods':rows}
    (RESULTS/'coverage.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    lines=['| 原生方法 | 网页入口 | 实际 RPC 证据 | 说明 |','|---|---|---|---|']
    for row in rows:lines.append('| `'+row['method']+'` | 有 | '+row['rpcEvidence']+' | '+row['note']+' |')
    (RESULTS/'METHODS.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps({key:output[key]for key in ['webMethodCount','methodCounts','workflowCounts','browserErrors']},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
