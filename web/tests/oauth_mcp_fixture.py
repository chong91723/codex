"""Disposable, real HTTP MCP + OAuth authorization server with PKCE validation.

Only local generated test identities are accepted. No external account or token
is used. Implements actual discovery, registration, redirects and token exchange.
"""
import base64
import hashlib
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json
import secrets
from urllib.parse import parse_qs,urlparse,urlencode

codes={};tokens=set();counts={}
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def respond(self,status,value=None,headers=None):
        data=json.dumps(value).encode()if value is not None else b''
        self.send_response(status)
        for key,item in (headers or {}).items():self.send_header(key,item)
        self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def do_GET(self):
        path=urlparse(self.path).path;base=self.server.base
        if 'oauth-protected-resource'in path:return self.respond(200,{'resource':base+'/mcp','authorization_servers':[base],'scopes_supported':['mcp']})
        if 'oauth-authorization-server'in path or'openid-configuration'in path:return self.respond(200,{'issuer':base,'authorization_endpoint':base+'/authorize','token_endpoint':base+'/token','registration_endpoint':base+'/register','response_types_supported':['code'],'grant_types_supported':['authorization_code','refresh_token'],'code_challenge_methods_supported':['S256'],'token_endpoint_auth_methods_supported':['none'],'scopes_supported':['mcp']})
        if path=='/authorize':
            query=parse_qs(urlparse(self.path).query);code=secrets.token_urlsafe(24)
            codes[code]={'challenge':query.get('code_challenge',[''])[0],'redirect':query['redirect_uri'][0]}
            counts['authorization_redirect']=counts.get('authorization_redirect',0)+1
            location=query['redirect_uri'][0]+'?'+urlencode({'code':code,'state':query.get('state',[''])[0]})
            return self.respond(302,headers={'Location':location})
        if path=='/evidence':return self.respond(200,counts,{'Access-Control-Allow-Origin':'*'})
        return self.respond(405)
    def do_POST(self):
        path=urlparse(self.path).path;raw=self.rfile.read(int(self.headers.get('Content-Length',0)));base=self.server.base
        if path=='/register':
            data=json.loads(raw);return self.respond(201,{**data,'client_id':'native-local-browser-client','token_endpoint_auth_method':'none'})
        if path=='/token':
            params=parse_qs(raw.decode());grant=codes.pop(params.get('code',[''])[0],None);verifier=params.get('code_verifier',[''])[0]
            challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
            if not grant or grant['challenge']!=challenge:return self.respond(400,{'error':'invalid_grant'})
            token=secrets.token_urlsafe(32);tokens.add(token);counts['pkce_token_exchange']=counts.get('pkce_token_exchange',0)+1
            return self.respond(200,{'access_token':token,'token_type':'Bearer','expires_in':3600,'scope':'mcp'})
        if path!='/mcp':return self.respond(404)
        if self.headers.get('Authorization','').removeprefix('Bearer ')not in tokens:return self.respond(401,headers={'WWW-Authenticate':f'Bearer resource_metadata="{base}/.well-known/oauth-protected-resource"'})
        data=json.loads(raw);method=data.get('method');ident=data.get('id');counts[method]=counts.get(method,0)+1
        if ident is None:return self.respond(202)
        if method=='initialize':result={'protocolVersion':data['params']['protocolVersion'],'capabilities':{'tools':{},'resources':{}},'serverInfo':{'name':'native-oauth-fixture','version':'1.0'}}
        elif method=='tools/list':result={'tools':[{'name':'echo','description':'Echo a local OAuth acceptance marker','inputSchema':{'type':'object','properties':{'text':{'type':'string'}},'required':['text']}}]}
        elif method=='tools/call':result={'content':[{'type':'text','text':'NATIVE_HTTP_OAUTH_OK:'+data['params']['arguments']['text']}]}
        elif method=='resources/list':result={'resources':[]}
        elif method=='resources/templates/list':result={'resourceTemplates':[]}
        elif method=='prompts/list':result={'prompts':[]}
        elif method=='ping':result={}
        else:return self.respond(200,{'jsonrpc':'2.0','id':ident,'error':{'code':-32601,'message':'Method not implemented by fixture'}})
        return self.respond(200,{'jsonrpc':'2.0','id':ident,'result':result})

server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.base='http://127.0.0.1:'+str(server.server_port)
print(json.dumps({'url':server.base}),flush=True);server.serve_forever()
