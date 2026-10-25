"""Private IPC adapter driving Playwright clicks, never a direct RPC connection."""
import itertools
import json
import os
from pathlib import Path
import queue
import subprocess
import threading


class BrowserNativeClient:
    def __init__(self,url,trace):
        self.events=[];self.counter=0;self._sequence=itertools.count(1)
        self._waiting={};self._messages=queue.Queue();self._ready=queue.Queue()
        env={**os.environ,'CODEX_WEB_URL':url,'CODEX_BROWSER_TRACE':str(trace)}
        Path(trace).parent.mkdir(parents=True,exist_ok=True)
        self.process=subprocess.Popen([os.environ.get('CODEX_TEST_NODE','node'),str(Path(__file__).with_name('browser_transport.mjs'))],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1,env=env)
        self._reader=threading.Thread(target=self._read,daemon=True);self._reader.start()
        try:self._ready.get(timeout=75)
        except queue.Empty:
            self.process.terminate();raise RuntimeError('Browser initialization failed; verify Playwright and source-built web service')

    def _read(self):
        for line in self.process.stdout:
            value=json.loads(line)
            if value.get('ready'):self._ready.put(True)
            elif 'event'in value:self._messages.put(value['event'])
            elif value.get('id')in self._waiting:self._waiting[value['id']].put(value)
        for waiting in list(self._waiting.values()):waiting.put({'error':'Browser driver exited'})

    def _request(self,action,**values):
        ident=next(self._sequence);pending=queue.Queue();self._waiting[ident]=pending
        self.process.stdin.write(json.dumps({'id':ident,'action':action,**values})+'\n');self.process.stdin.flush()
        try:reply=pending.get(timeout=650)
        finally:self._waiting.pop(ident,None)
        if 'error'in reply:raise RuntimeError(reply['error'])
        return reply.get('value')

    def rpc(self,method,params):return self._request('rpc',method=method,params=params)
    def send(self,message):return self._request('send',message=message)
    def fetch_api(self,path):return self._request('fetch',path=path)
    def show_thread(self,thread):return self._request('showThread',thread=thread)
    def confirm_guardian(self):return self._request('guardianConfirm')
    def receive(self):return self._messages.get(timeout=180)
    def receive_timeout(self,seconds):
        try:return self._messages.get(timeout=seconds)
        except queue.Empty:return None
    def close(self):
        try:self._request('close')
        finally:
            try:self.process.wait(timeout=15)
            except subprocess.TimeoutExpired:self.process.terminate();self.process.wait(timeout=5)
            self._reader.join(timeout=5)
            for pipe in (self.process.stdin,self.process.stdout,self.process.stderr):pipe.close()
