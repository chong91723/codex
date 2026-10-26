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

    def test_boolean_predicates_and_case_are_sql_syntax_in_each_supported_dialect(self):
        from sql_guard import validate_queries
        import sqlglot
        queries=[
            "SELECT COUNT(*) FROM payment WHERE payment_date >= '2005-06-01' AND payment_date < '2005-09-01'",
            "SELECT SUM(CASE WHEN amount > 0 AND (rental_id IS NOT NULL OR customer_id = 1) THEN amount ELSE 0 END) AS revenue FROM payment",
            "SELECT CASE WHEN NOT (amount = 0 OR amount < 0) THEN 'paid' ELSE 'zero' END AS status FROM payment WHERE customer_id = 1 OR customer_id = 2",
        ]
        for engine,dialect in [('mysql','mysql'),('postgresql','postgres'),('clickhouse','clickhouse')]:
            config=dict(engine=engine,database='sakila',schema='public')
            for query in queries:
                with self.subTest(engine=engine,query=query):
                    result=validate_queries(query,config)
                    self.assertEqual(len(result),1)
                    # ClickHouse emits extra parentheses around NOT/IS. Compare
                    # the logical AST without redundant grouping wrappers.
                    actual=sqlglot.parse_one(result[0],read=dialect)
                    expected=sqlglot.parse_one(query,read=dialect)
                    for tree in (actual,expected):
                        for wrapper in list(tree.find_all(sqlglot.exp.Paren)):
                            wrapper.replace(wrapper.this)
                    self.assertEqual(actual,expected)
                    self.assertNotIn('LIMIT',result[0])

    def test_boolean_and_case_children_still_reject_unsafe_or_unknown_functions(self):
        from sql_guard import validate_queries,ReadOnlyError
        config=dict(engine='mysql',database='sakila')
        queries=[
            "SELECT * FROM payment WHERE amount > 0 AND LOAD_FILE('/etc/passwd') IS NOT NULL",
            "SELECT * FROM payment WHERE amount = 0 OR SLEEP(1) = 0",
            "SELECT CASE WHEN amount > 0 THEN LOAD_FILE('/etc/passwd') ELSE '' END FROM payment",
            "SELECT CASE WHEN SLEEP(1) = 0 THEN amount ELSE 0 END FROM payment",
            "SELECT CASE WHEN amount > 0 THEN 1 ELSE unknown_side_effect(amount) END FROM payment",
            "SELECT * FROM payment WHERE amount > 0 AND (customer_id = 1 OR unknown_side_effect(amount) = 1)",
            "SELECT COALESCE(CASE WHEN amount > 0 THEN 1 ELSE SLEEP(1) END,0) FROM payment",
        ]
        for query in queries:
            with self.subTest(query=query),self.assertRaisesRegex(ReadOnlyError,'函数'):
                validate_queries(query,config)

    def test_boolean_syntax_does_not_relax_write_cte_batch_or_namespace_guards(self):
        from sql_guard import validate_queries,ReadOnlyError
        config=dict(engine='postgresql',database='analytics',schema='public')
        queries=[
            'WITH changed AS (DELETE FROM sales WHERE amount > 0 AND amount < 10 RETURNING *) SELECT * FROM changed',
            'WITH changed AS (UPDATE sales SET amount = 0 WHERE amount > 0 OR category IS NULL RETURNING *) SELECT * FROM changed',
            'SELECT CASE WHEN amount > 0 THEN amount ELSE 0 END FROM sales; DELETE FROM sales',
            'SELECT * FROM unconfigured.sales WHERE amount > 0 AND amount < 10',
            'SELECT * FROM sales WHERE amount > 0 OR amount < 0 FOR UPDATE',
        ]
        for query in queries:
            with self.subTest(query=query),self.assertRaises(ReadOnlyError):
                validate_queries(query,config)

    def test_date_format_arguments_are_allowed_but_unsafe_children_are_not(self):
        from sql_guard import validate_queries,ReadOnlyError
        import sqlglot
        cases=[
            ('mysql','mysql',"SELECT DATE_FORMAT(payment_date,'%Y-%m') AS month FROM payment WHERE amount > 0 AND amount < 10"),
            ('postgresql','postgres',"SELECT TO_CHAR(payment_date,'YYYY-MM') AS month FROM payment WHERE amount > 0 OR amount = 0"),
            ('clickhouse','clickhouse',"SELECT formatDateTime(payment_date,'%Y-%m') AS month FROM payment WHERE amount > 0 AND amount < 10"),
        ]
        for engine,dialect,query in cases:
            with self.subTest(engine=engine):
                tree=sqlglot.parse_one(query,read=dialect)
                formatter=tree.find(sqlglot.exp.TimeToStr)
                self.assertIsNotNone(formatter)
                self.assertIsInstance(formatter.args['format'],sqlglot.exp.Literal)
                validated=validate_queries(query,dict(engine=engine,database='sakila'))
                self.assertEqual(len(validated),1)
                self.assertIn('YYYY' if engine=='postgresql' else '%Y',validated[0])
        for query in ["SELECT DATE_FORMAT(LOAD_FILE('/etc/passwd'),'%Y')", "SELECT DATE_FORMAT(SLEEP(1),'%Y')", "SELECT DATE_FORMAT(unknown_side_effect(),'%Y')", "SELECT DATE_FORMAT(payment_date,LOAD_FILE('/etc/passwd')) FROM payment"]:
            with self.subTest(query=query),self.assertRaisesRegex(ReadOnlyError,'函数'):
                validate_queries(query,dict(engine='mysql',database='sakila'))

    def test_query_format_export_settings_and_select_into_remain_forbidden(self):
        from sql_guard import validate_queries,ReadOnlyError
        import sqlglot
        for query in ['SELECT 1 FORMAT CSV','SELECT 1 FORMAT JSONEachRow']:
            with self.subTest(query=query):
                tree=sqlglot.parse_one(query,read='clickhouse')
                self.assertIsInstance(tree,sqlglot.exp.Query)
                self.assertIsInstance(tree.args['format'],sqlglot.exp.Identifier)
                with self.assertRaisesRegex(ReadOnlyError,'导出'):
                    validate_queries(query,dict(engine='clickhouse',database='analytics'))
        for engine,query in [('clickhouse','SELECT 1 SETTINGS max_threads=1'),('postgresql','SELECT 1 INTO forbidden_export')]:
            with self.subTest(engine=engine,query=query),self.assertRaises(ReadOnlyError):
                validate_queries(query,dict(engine=engine,database='analytics'))

    def test_elasticsearch_lookup_cannot_read_unconfigured_index(self):
        from adapters import Elasticsearch,DatabaseError
        adapter=object.__new__(Elasticsearch)
        for query in [{'query':{'terms':{'category':{'index':'other','id':'1','path':'tags'}}}},{'query':{'more_like_this':{'like':[{'_index':'other','_id':'1'}]}}}]:
            with self.assertRaises(DatabaseError):adapter.validate_search(query)
        adapter.validate_search({'query':{'match_all':{}},'size':10})

if __name__=='__main__':unittest.main()
