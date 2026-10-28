"""Actual stdio MCP/Python/worker flow, no model or business database requests."""
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]

class MarkdownPublicationMcpTests(unittest.TestCase):
    def test_bad_table_rejected_then_valid_publication_verified_through_worker(self):
        with tempfile.TemporaryDirectory(prefix='codex-markdown-mcp-') as directory:
            env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'CODEX_HOME':directory,'CODEX_WEB_DB_STATE':directory+'/web-databases','PYTHONUTF8':'1'}
            process=subprocess.Popen([sys.executable,'-B',str(ROOT/'web/database/mcp_server.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
            sequence=0
            def request(method,params):
                nonlocal sequence
                sequence+=1;process.stdin.write(json.dumps({'jsonrpc':'2.0','id':sequence,'method':method,'params':params})+'\n');process.stdin.flush()
                self.assertTrue(select.select([process.stdout],[],[],25)[0],'Actual stdio MCP response timed out')
                response=json.loads(process.stdout.readline());self.assertEqual(response['id'],sequence);self.assertNotIn('error',response);return response['result']
            def tool(name,args):return request('tools/call',{'name':name,'arguments':args,'_meta':{'threadId':'markdown-fixture','x-codex-turn-metadata':json.dumps({'turn_id':'native-turn-fixture'})}})
            try:
                request('initialize',{'protocolVersion':'2025-06-18','capabilities':{},'clientInfo':{'name':'markdown-test','version':'1'}})
                result=tool('run_python',{'code':"result=[{'label':'示例','amount':Decimal('1.20')+Decimal('2.30'),'percentage':Decimal(1)/Decimal(8)*Decimal(100)}]"})
                self.assertFalse(result['isError']);identifier=result['structuredContent']['resultId']
                references={name:{'result_id':identifier,'row':0,'column':column} for name,column in [('label','label'),('amount','amount'),('rate','percentage')]}
                template='| 类别 | 金额 | 占比 | 来源 |\n|---|---|---|\n| {{label}} | {{amount}} | {{rate}}% | Python |'
                bad=tool('publish_answer',{'template':template,'references':references});self.assertTrue(bad['isError']);self.assertIn('分隔行',bad['content'][0]['text'])
                self.assertEqual(list(Path(directory).rglob('answers/**/*.json')),[])
                good=tool('publish_answer',{'template':template.replace('|---|---|---|','|---|---|---|---|'),'references':references});self.assertFalse(good['isError']);text=good['structuredContent']['text'];self.assertIn('3.50',text);self.assertIn('12.500',text)
                for answer,expected in [(text,'verified'),(text.replace('3.50','3.51'),'rejected')]:
                    worker=subprocess.run([sys.executable,str(ROOT/'web/database/worker.py')],input=json.dumps({'action':'result','payload':{'analysisEvidence':{'action':'verify','threadId':'markdown-fixture','turnId':'native-turn-fixture','text':answer,'requireEvidence':True}}}),capture_output=True,text=True,env=env,timeout=10)
                    self.assertEqual(worker.returncode,0,worker.stderr);self.assertEqual(json.loads(worker.stdout)['result']['status'],expected)
            finally:
                process.stdin.close()
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:process.kill();process.wait()
                process.stdout.close();process.stderr.close()

if __name__=='__main__':unittest.main()
