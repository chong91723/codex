#!/usr/bin/env python3
"""One authenticated web request, transported over stdin without command-line secrets."""
import json
import sys

def main():
    try:
        request=json.load(sys.stdin)
        payload=request.get('payload') or {}
        # Existing servers already forward the result operation to this worker.
        # Keep numerical verification usable during a frontend-first upgrade.
        evidence=payload.get('analysisEvidence') if request['action']=='result' else None
        if isinstance(evidence,dict):
            from pathlib import Path
            sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
            from analysis_evidence import Evidence
            store=Evidence()
            if evidence.get('action')=='register':
                store.identity(evidence.get('threadId'));store.identity(evidence.get('turnId'))
                store.observe({'method':'turn/started','params':{'threadId':evidence.get('threadId'),'turn':{'id':evidence.get('turnId')}}})
                result={'registered':True}
            elif evidence.get('action')=='remove_thread':
                store.remove_thread(evidence.get('threadId'));result={'removed':True}
            elif evidence.get('action')=='configuration':
                from database_bridge import database_status
                result=database_status(evidence.get('workspace'))
            elif evidence.get('action')=='verify':result=store.verify(evidence.get('threadId'),evidence.get('turnId'),evidence.get('text'),evidence.get('requireEvidence') is True)
            else:raise ValueError('未知的数值依据操作。')
        else:
            from service import Gateway
            if request['action']=='result' and isinstance(payload.get('freshnessPolicy'),dict):
                result=Gateway().manage('freshness',payload['freshnessPolicy'])
            else:result=Gateway().manage(request['action'],payload)
        print(json.dumps({'result':result},ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error':str(error)[:1000]},ensure_ascii=False))
if __name__=='__main__':main()
