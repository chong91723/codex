"""Recheck only the existing private acceptance fixture from the actual web page.

Never creates a second remote fixture. The ignored marker is retained until the
native delete operation really succeeds. Remote identifiers are not published.
"""
import argparse
import json
from pathlib import Path
from browser_client import BrowserNativeClient

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url',default='http://127.0.0.1:8766')
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args();client=BrowserNativeClient(args.url,str(args.output)+'.browser.json');records=[]
try:
    info=client.rpc('initialize',{})['result'];home=Path(info['codexHome'])
    if 'chatgpt-acceptance'not in str(home):raise RuntimeError('Isolated profile required')
    marker=home/'test-plugin-cleanup-id';remote=marker.read_text().strip()
    fixture=home/'private-plugin-fixture'
    requests=[('plugin/share/save',{'pluginPath':str(fixture),'remotePluginId':remote}),('plugin/share/updateTargets',{'remotePluginId':remote,'discoverability':'PRIVATE','shareTargets':[]}),('plugin/share/checkout',{'remotePluginId':remote}),('plugin/share/delete',{'remotePluginId':remote})]
    for method,params in requests:
        response=client.rpc(method,params);error=response.get('error',{}).get('message')
        status='blocked'if error else'passed'
        message=(error or'').replace(remote,'[test-plugin-id]')[:1000]
        records.append({'method':method,'status':status,**({'error':message}if error else{})})
        print(status.upper()+' '+method,flush=True)
        if method=='plugin/share/delete'and not error:marker.unlink()
    records.append({'feature':'private_test_plugin_cleanup','status':'blocked'if marker.exists()else'passed','reason':'The native workspace delete endpoint requires an active workspace; the current account has only personal space.'if marker.exists()else'Native delete completed.'})
finally:
    client.close();args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps({'origin':'real browser protocol panel buttons','records':records},indent=2)+'\n')
