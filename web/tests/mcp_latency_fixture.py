#!/usr/bin/env python3
"""Add real startup/resource latency to the native stdio acceptance service."""
import json
import os
from pathlib import Path
import runpy
import sys
import time

class Requests:
    def __iter__(self):
        for line in sys.__stdin__:
            request=json.loads(line)
            method=request.get('method')
            if method=='initialize':
                time.sleep(4)
            elif method=='resources/list':
                time.sleep(2)
            evidence=os.environ.get('MCP_FIXTURE_EVIDENCE')
            if evidence:
                with open(evidence,'a') as output:
                    output.write(json.dumps({'method':method,'time':time.time()})+'\n')
            yield line

sys.stdin=Requests()
runpy.run_path(str(Path(__file__).with_name('mcp_fixture.py')),run_name='__main__')
