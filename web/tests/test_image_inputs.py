"""Actual image containers / native scope / removed HTTP upload action; no model."""
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from image_inputs import image_input_size, image_inputs_reason
from server import ScopePolicy

PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=')
def url(data=PNG,mime='image/png'):
    return 'data:'+mime+';base64,'+base64.b64encode(data).decode()

class ImageInputs(unittest.TestCase):
    def test_native_image_and_normal_text_skill_flow_remain_available(self):
        self.assertEqual(image_input_size(url()),len(PNG))
        self.assertIsNone(image_inputs_reason([{'type':'text','text':'分析图片'},{'type':'image','url':url()}]))

    def test_all_submission_paths_reject_audio_documents_and_spoofed_images(self):
        policy=ScopePolicy()
        for method in ('turn/start','turn/steer','thread/queue/add','thread/queue/update'):
            for item in ({'type':'audio','url':'x'},{'type':'localImage','path':'/tmp/data.csv'},
                         {'type':'file','name':'data.xlsx'}, {'type':'image','url':url(b'amount\n999\n')},
                         {'type':'image','url':url(mime='image/jpeg')},
                         {'type':'image','url':'data:image/svg+xml;base64,PHN2Zy8+'},
                         {'type':'image','url':'https://example.com/data.csv'}):
                with self.subTest(method=method,item=item):
                    self.assertTrue(policy.reason({'method':method,'params':{'input':[item]}}))
            self.assertIsNone(policy.reason({'method':method,'params':{'input':[{'type':'image','url':url()}]}}))

    def test_malformed_encoding_and_aggregate_budget(self):
        for value in ('data:image/png;base64,@@',url(b''),url(PNG[:12])):
            with self.subTest(value=value),self.assertRaises(ValueError):image_input_size(value)
        large=PNG+b'\0'*(9*1024*1024)
        self.assertTrue(image_inputs_reason([{'type':'image','url':url(large)}]*2))

    def test_retired_upload_action_never_writes_documents(self):
        with tempfile.TemporaryDirectory(prefix='codex-no-file-upload-') as directory:
            environment=dict(os.environ,CODEX_WEB_DB_STATE=directory)
            request={'action':'result','payload':{'analysisEvidence':{'action':'upload','threadId':'thread','name':'data.csv','format':'csv','text':'amount\n999\n'}}}
            reply=subprocess.run([sys.executable,'-B',str(Path(__file__).resolve().parents[1]/'database/worker.py')],input=json.dumps(request),text=True,capture_output=True,env=environment,check=True)
            self.assertIn('error',json.loads(reply.stdout))
            self.assertEqual(list(Path(directory).rglob('*.json')),[])

if __name__=='__main__':unittest.main()
