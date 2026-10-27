"""Independent deterministic API fixture; never represents live market data."""
import argparse
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json

DATA={'notice':'独立行情格式测试夹具，不是真实市场行情','symbol':'DEMO','prices':[{'date':'2026-10-01','close':10},{'date':'2026-10-02','close':20},{'date':'2026-10-03','close':15}]}
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path!='/prices.json':self.send_response(404);self.end_headers();return
        body=json.dumps(DATA,ensure_ascii=False).encode()
        self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def log_message(self,*args):pass
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,required=True);args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print('Independent API fixture ready',flush=True);server.serve_forever()
