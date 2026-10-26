"""Optional database extension safety and cancellation transport checks."""
import http.server
import importlib.util
import json
from pathlib import Path
import socket
import sys
import tempfile
import threading
import time
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'database'))
from cancellation import Cancellation,Cancelled


class CancellationTests(unittest.TestCase):
    def test_cancel_is_request_scoped_and_removed_hooks_do_not_run(self):
        token=Cancellation();other=Cancellation();calls=[]
        with token.watch(lambda:calls.append('removed')):pass
        with token.watch(lambda:calls.append('active')):token.cancel()
        self.assertEqual(calls,['active'])
        with self.assertRaises(Cancelled):token.check()
        other.check()

    def test_cancel_callbacks_keep_resource_registration_order(self):
        token=Cancellation();calls=[]
        with token.watch(lambda:calls.append('server-query')):
            with token.watch(lambda:calls.append('transport')):token.cancel()
        self.assertEqual(calls,['server-query','transport'])

    def test_cancel_before_dispatch_never_opens_resource(self):
        token=Cancellation();token.cancel()
        with self.assertRaises(Cancelled):
            with token.watch(lambda:None):self.fail('cancelled request admitted')


class SlowHttpTests(unittest.TestCase):
    def run_transport(self,headers_first):
        from adapters import HttpDatabase
        entered=threading.Event();release=threading.Event();cancelled=threading.Event()
        class Slow(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                if headers_first:
                    self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length','2');self.end_headers();self.wfile.flush()
                entered.set();release.wait(5)
                try:
                    if not headers_first:self.send_response(200);self.end_headers()
                    self.wfile.write(b'{}')
                except OSError:pass
            def log_message(self,*args):pass
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Slow);threading.Thread(target=server.serve_forever,daemon=True).start()
        adapter=HttpDatabase(dict(host='127.0.0.1',port=server.server_port,tls=False,username='reader',password=''))
        def request():
            try:adapter.request('/')
            except Exception:cancelled.set()
        worker=threading.Thread(target=request);worker.start()
        try:
            self.assertTrue(entered.wait(2));started=time.monotonic();adapter.cancellation.cancel();worker.join(2)
            self.assertFalse(worker.is_alive(),'HTTP query kept waiting after cancellation')
            self.assertTrue(cancelled.is_set());self.assertLess(time.monotonic()-started,2)
        finally:release.set();worker.join(5);server.shutdown();server.server_close()

    def test_cancel_before_response_headers(self):self.run_transport(False)
    def test_cancel_during_response_body(self):self.run_transport(True)


@unittest.skipUnless(importlib.util.find_spec('sqlglot'),'Install optional database requirements')
class ReadOnlySqlTests(unittest.TestCase):
    def test_write_and_external_access_rejected_before_batch_executes(self):
        from sql_guard import validate_queries,ReadOnlyError
        config=dict(engine='mysql',database='sakila')
        for sql in ["SELECT 1; DELETE FROM film", "SELECT LOAD_FILE('/etc/passwd')", "SELECT * FROM mysql.user", "SELECT 1 INTO OUTFILE '/tmp/export'", "SELECT * FROM film FOR UPDATE", "SELECT SLEEP(10)"]:
            with self.subTest(sql=sql),self.assertRaises(ReadOnlyError):validate_queries(sql,config)

    def test_batch_and_admitted_cross_database_are_read_only_without_implicit_limit(self):
        from sql_guard import validate_queries
        config=dict(engine='mysql',database='sakila',allowedNamespaces=['sakila','reference'])
        statements=validate_queries('SELECT * FROM sakila.film; SELECT * FROM reference.labels',config)
        self.assertEqual(len(statements),2);self.assertTrue(all('LIMIT' not in sql for sql in statements))

    def test_elasticsearch_lookup_cannot_read_unconfigured_index(self):
        from adapters import Elasticsearch,DatabaseError
        adapter=object.__new__(Elasticsearch)
        for query in [{'query':{'terms':{'category':{'index':'other','id':'1','path':'tags'}}}},{'query':{'more_like_this':{'like':[{'_index':'other','_id':'1'}]}}}]:
            with self.assertRaises(DatabaseError):adapter.validate_search(query)
        adapter.validate_search({'query':{'match_all':{}},'size':10})

if __name__=='__main__':unittest.main()
