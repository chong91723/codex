"""Opt-in real app-server integration: CODEX_WEB_TEST_URL=http://127.0.0.1:8765."""
import base64
import json
import os
import secrets
import socket
import struct
import unittest
import urllib.request
from urllib.parse import urlparse


class NativeClient:
    def __init__(self,url):
        parsed=urlparse(url)
        with urllib.request.urlopen(url+'/')as response:self.cookie=response.headers['Set-Cookie'].split(';')[0]
        self.socket=socket.create_connection((parsed.hostname,parsed.port),timeout=60)
        self.reader=self.socket.makefile('rb')
        key=base64.b64encode(secrets.token_bytes(16)).decode()
        request=f'GET /ws/rpc HTTP/1.1\r\nHost: {parsed.netloc}\r\nOrigin: {url}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: {key}\r\nCookie: {self.cookie}\r\n\r\n'
        self.socket.sendall(request.encode())
        status=self.reader.readline();assert b'101' in status,status
        while self.reader.readline()!=b'\r\n':pass
        self.counter=0;self.events=[]

    def send(self,message):
        data=json.dumps(message).encode();mask=secrets.token_bytes(4)
        header=b'\x81'+(bytes([128|len(data)])if len(data)<126 else b'\xfe'+struct.pack('!H',len(data)))
        self.socket.sendall(header+mask+bytes(c^mask[i%4]for i,c in enumerate(data)))

    def receive(self):
        first=self.reader.read(2)
        if len(first)!=2:raise EOFError()
        n=first[1]&127
        if n==126:n=struct.unpack('!H',self.reader.read(2))[0]
        if n==127:n=struct.unpack('!Q',self.reader.read(8))[0]
        data=self.reader.read(n)
        if first[0]&15==8:raise EOFError()
        return json.loads(data)

    def rpc(self,method,params):
        self.counter+=1;ident=self.counter;self.send({'id':ident,'method':method,'params':params})
        while True:
            response=self.receive()
            if response.get('id')==ident and 'method'not in response:return response
            self.events.append(response)

    def close(self):
        self.socket.shutdown(socket.SHUT_RDWR);self.reader.close();self.socket.close()


@unittest.skipUnless(os.environ.get('CODEX_WEB_TEST_URL'),'Set CODEX_WEB_TEST_URL to test the real native runtime')
class NativeIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.client=NativeClient(os.environ['CODEX_WEB_TEST_URL'])
        result=self.client.rpc('initialize',{'clientInfo':{'name':'codex_web_test','version':'1.0'},'capabilities':{'experimentalApi':True}})
        self.assertIn('result',result);self.client.send({'method':'initialized'})

    def tearDown(self):self.client.close()

    def test_native_model_catalog_and_ephemeral_thread(self):
        models=self.client.rpc('model/list',{})
        self.assertIn('data',models['result'])
        thread=self.client.rpc('thread/start',{'ephemeral':True})
        self.assertTrue(thread['result']['thread']['id'])

    def test_native_filesystem_and_errors(self):
        response=self.client.rpc('fs/readDirectory',{'path':'/tmp'})
        self.assertIsInstance(response['result']['entries'],list)
        invalid=self.client.rpc('this/method/does/not/exist',{})
        self.assertIn('error',invalid)

    def test_native_command_execution(self):
        response=self.client.rpc('command/exec',{'command':['/usr/bin/printf','CODEX_NATIVE_TOOL_OK'],'timeoutMs':5000})
        self.assertEqual(response['result']['exitCode'],0)
        self.assertIn('CODEX_NATIVE_TOOL_OK',response['result']['stdout'])


if __name__=='__main__':unittest.main()
