#!/usr/bin/env python3
"""Real local MCP stdio service used by native integration acceptance."""
import json
import sys

for line in sys.stdin:
    request=json.loads(line)
    if 'id'not in request:continue
    method=request.get('method');params=request.get('params',{})
    if method=='initialize':result={'protocolVersion':params.get('protocolVersion','2025-03-26'),'capabilities':{'tools':{},'resources':{}},'serverInfo':{'name':'codex-web-acceptance','version':'1.0.0'}}
    elif method=='tools/list':result={'tools':[{'name':'echo','description':'Echo text for Codex native integration acceptance','inputSchema':{'type':'object','properties':{'text':{'type':'string'}},'required':['text']}}]}
    elif method=='tools/call':result={'content':[{'type':'text','text':'NATIVE_MCP_OK: '+params.get('arguments',{}).get('text','')}],'isError':False}
    elif method=='resources/list':result={'resources':[{'uri':'test://codex/native','name':'Native acceptance fixture','mimeType':'text/plain'}]}
    elif method=='resources/read':result={'contents':[{'uri':params['uri'],'mimeType':'text/plain','text':'NATIVE_RESOURCE_OK'}]}
    elif method in ('resources/templates/list','prompts/list'):result={'resourceTemplates':[]}if method.startswith('resources')else{'prompts':[]}
    elif method=='ping':result={}
    else:
        print(json.dumps({'jsonrpc':'2.0','id':request['id'],'error':{'code':-32601,'message':'Unknown fixture method'}}),flush=True);continue
    print(json.dumps({'jsonrpc':'2.0','id':request['id'],'result':result}),flush=True)
