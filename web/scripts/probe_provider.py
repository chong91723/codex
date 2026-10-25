#!/usr/bin/env python3
"""Read a test key without echo and probe the native provider endpoints."""
import getpass
import json
import urllib.error
import urllib.request

key=getpass.getpass('DeepSeek test API key (not saved): ')
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
for path,body in [('/models',None),('/responses',{'model':'deepseek-flash','input':'Reply exactly CODEX_NATIVE_OK.', 'stream':False, 'max_output_tokens':32})]:
    request=urllib.request.Request('https://api.deepseek.com'+path,data=json.dumps(body).encode() if body else None,
        headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    try:
        response=opener.open(request,timeout=45)
        data=json.load(response)
        if path=='/models':
            print(json.dumps({'path':path,'status':response.status,'models':[m['id'] for m in data.get('data',[])]}))
        else:
            print(json.dumps({'path':path,'status':response.status,'responseStatus':data.get('status'),
                'outputTypes':[m.get('type') for m in data.get('output',[])]}))
    except urllib.error.HTTPError as error:
        data=error.read().decode(errors='replace').replace(key,'[redacted]')
        print(json.dumps({'path':path,'status':error.code,'error':data[:700]}))
    except Exception as error:
        print(json.dumps({'path':path,'error':str(error).replace(key,'[redacted]')}))
