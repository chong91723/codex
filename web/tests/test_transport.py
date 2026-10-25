import base64
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import threading
import types
import unittest
import urllib.error
import urllib.request

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import Handler, ThreadingHTTPServer, WebSocket


class Sink:
    def __init__(self):self.output=bytearray()
    def sendall(self,data):self.output.extend(data)
    def shutdown(self,*args):pass


def frame(payload,opcode=1,final=True):
    payload=payload.encode()if isinstance(payload,str)else payload
    mask=b'1234'
    header=bytes([(128 if final else 0)|opcode])
    if len(payload)<126:header+=bytes([128|len(payload)])
    else:header+=bytes([128|126])+struct.pack('!H',len(payload))
    return header+mask+bytes(c^mask[i%4]for i,c in enumerate(payload))


class FrameTests(unittest.TestCase):
    def socket(self,data):
        handler=types.SimpleNamespace(rfile=io.BytesIO(data),connection=Sink())
        return WebSocket(handler),handler.connection

    def test_fragmented_json_survives_interleaved_ping(self):
        ws,sink=self.socket(frame('{"id":"server-',final=False)+frame('ping',9)+frame('42","result":{"decision":"accept"}}',opcode=0))
        self.assertEqual(ws.receive(),{'id':'server-42','result':{'decision':'accept'}})
        self.assertEqual(sink.output,b'\x8a\x04ping')

    def test_unicode_and_extended_payload(self):
        expected={'method':'turn/start','params':{'text':'测试'*1000}}
        ws,_=self.socket(frame(json.dumps(expected,ensure_ascii=False)))
        self.assertEqual(ws.receive(),expected)

    def test_unmasked_browser_frame_rejected(self):
        ws,_=self.socket(b'\x81\x02{}')
        with self.assertRaises(ValueError):ws.receive()

    def test_oversized_frame_rejected_before_allocation(self):
        ws,_=self.socket(b'\x81\xff'+struct.pack('!Q',33*1024*1024))
        with self.assertRaises(ValueError):ws.receive()

    def test_control_frames_cannot_be_fragmented(self):
        ws,_=self.socket(frame(b'ping',9,False))
        with self.assertRaises(ValueError):ws.receive()


class HttpBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        cls.server.settings=types.SimpleNamespace(remote=False,token='local-test-token',schema_dir=types.SimpleNamespace(name=cls.temp.name),status=lambda:{'native':True})
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.base='http://127.0.0.1:'+str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.temp.cleanup()

    def request(self,path,headers=None):
        request=urllib.request.Request(self.base+path,headers=headers or {})
        try:return urllib.request.urlopen(request)
        except urllib.error.HTTPError as response:return response

    def test_api_requires_session_cookie(self):
        with self.request('/api/status')as response:self.assertEqual(response.status,401)
        with self.request('/')as response:
            cookie=response.headers['Set-Cookie'];self.assertIn('HttpOnly',cookie);self.assertIn('SameSite=Strict',cookie)
        with self.request('/api/status',{'Cookie':cookie.split(';')[0]})as response:
            self.assertEqual(response.status,200);self.assertEqual(json.load(response),{'native':True})

    def test_cross_origin_and_dns_rebinding_blocked(self):
        for headers in [{'Host':'attacker.example'},{'Origin':'https://attacker.example','Cookie':'codex_web=local-test-token'}]:
            with self.request('/api/status',headers)as response:self.assertEqual(response.status,403)

    def test_schema_and_static_traversal_blocked(self):
        for path in ['/api/schema/../server.py','/../server.py','/%2e%2e/server.py']:
            with self.request(path,{'Cookie':'codex_web=local-test-token'})as response:self.assertEqual(response.status,404)


if __name__=='__main__':unittest.main()
