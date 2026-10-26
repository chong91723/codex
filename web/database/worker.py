#!/usr/bin/env python3
"""One authenticated web request, transported over stdin without command-line secrets."""
import json
import sys
from service import Gateway

def main():
    try:
        request=json.load(sys.stdin);result=Gateway().manage(request['action'],request.get('payload') or {});print(json.dumps({'result':result},ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error':str(error)[:1000]},ensure_ascii=False))
if __name__=='__main__':main()
