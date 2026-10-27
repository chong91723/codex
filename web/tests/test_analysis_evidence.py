"""Real isolated calculations / immutable data; fixtures never claim market truth."""
from decimal import Decimal
import hashlib
import http.server
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
sys.path[:0]=[str(ROOT/'web'),str(ROOT/'web/database')]
from analysis_evidence import Evidence,has_number
from analysis_tools import AnalysisTools
from calculation import run_python
from cancellation import Cancelled
from service import Gateway


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='codex-evidence-test-')
        self.addCleanup(self.temp.cleanup)
        self.gateway=Gateway(directory=self.temp.name,thread_id='thread-A',turn_id='turn-A')
        self.tools=AnalysisTools(self.gateway,'thread-A')
        self.evidence=Evidence(self.temp.name)
        self.evidence.observe({'method':'turn/started','params':{'threadId':'thread-A','turn':{'id':'turn-A'}}})

    def compute(self,code="result=[{'label':'合计','value':Decimal('1.20')+Decimal('2.30'),'date':'2026-10-27'}]",**kwargs):
        return self.tools.calculate(code,**kwargs)

    @staticmethod
    def ref(result,column='value',row=0):return {'result_id':result['resultId'],'row':row,'column':column}

    def test_permanent_thread_delete_removes_its_raw_documents_and_proof_but_archive_keeps_them(self):
        result=self.compute();answer=self.tools.publish('金额 {{v}}',{'v':self.ref(result)})
        self.tools.document('private fixture content','text',{'kind':'file','name':'fixture'})
        other=Gateway(directory=self.temp.name,thread_id='thread-B',turn_id='turn-B')
        AnalysisTools(other,'thread-B').calculate("result=[{'v':sum([1,2])}]")
        self.evidence.observe({'method':'thread/archived','params':{'threadId':'thread-A'}})
        self.assertEqual(self.evidence.verify('thread-A','turn-A',answer['text'])['status'],'verified')
        self.evidence.observe({'method':'thread/deleted','params':{'threadId':'thread-A'}})
        for kind in ['turns','datasets','documents','answers']:self.assertFalse((self.evidence.root/kind/'thread-A').exists())
        self.assertTrue((self.evidence.root/'datasets'/'thread-B').exists())
        self.assertTrue(self.gateway.snapshots.path(result['resultId']).exists(),'Shared result cache is managed separately')
        self.evidence.remove_thread('thread-A')
        with self.assertRaises(ValueError):self.evidence.remove_thread('../invalid')

    def test_old_server_worker_provides_current_managed_configuration(self):
        import subprocess
        request={'action':'result','payload':{'analysisEvidence':{'action':'configuration','workspace':self.temp.name}}}
        env=dict(os.environ,CODEX_HOME=self.temp.name,CODEX_WEB_ANALYSIS_ROOTS=self.temp.name,CODEX_WEB_DATA_ORIGINS='http://localhost:18875')
        process=subprocess.run([sys.executable,str(ROOT/'web/database/worker.py')],input=json.dumps(request),capture_output=True,text=True,env=env,timeout=10)
        self.assertEqual(process.returncode,0,process.stderr)
        config=json.loads(process.stdout)['result']['mcpConfig']['env']
        self.assertEqual(config['CODEX_WEB_ANALYSIS_ROOTS'],self.temp.name)
        self.assertEqual(config['CODEX_WEB_DATA_ORIGINS'],'http://localhost:18875')

    def test_agent_cannot_materialize_external_numbers_through_a_tableless_database_query(self):
        record=self.gateway.store.save({'name':'guard-only fixture','engine':'mysql','host':'127.0.0.1','database':'fixture','username':'reader'})
        self.gateway.store.status(record,'connected')
        for query in ["SELECT '2026-10-01' AS day,10 AS price UNION ALL SELECT '2026-10-02',15",'WITH literal_rows AS (SELECT 1 AS price) SELECT * FROM literal_rows']:
            with self.subTest(query=query),patch('service.connect') as connect:
                with self.assertRaisesRegex(ValueError,'没有读取实际数据表'):self.gateway.query(record['id'],query)
                connect.assert_not_called()

    def test_pandas_decimal_computation_and_chart_require_no_database(self):
        result=self.compute("import pandas as pd\nresult=pd.DataFrame([{'label':'合计','value':Decimal('1.20')+Decimal('2.30')}])")
        page=self.gateway.result(result['resultId'])
        self.assertEqual(page['rows'][0]['value'],'3.50');self.assertEqual(result['sourceKind'],'python')
        chart=self.gateway.chart(result['resultId'],'bar','label',['value'],'独立计算')
        full=self.gateway.read_chart(chart['chartId'])
        self.assertEqual(full['option']['dataset']['source'][0]['value'],3.5)
        self.assertEqual(self.gateway.store.all(),[])
        self.assertNotIn('Sakila',full['connectionName'])

    def test_every_published_value_resolves_exact_row_column_and_sha(self):
        result=self.compute();answer=self.tools.publish('合计 {{amount}}，日期 {{day}}。',{'amount':self.ref(result),'day':self.ref(result,'date')})
        self.assertEqual(answer['text'],'合计 3.50，日期 2026-10-27。')
        verified=self.evidence.verify('thread-A','turn-A',answer['text'])
        self.assertEqual(verified['status'],'verified');self.assertEqual(len(verified['evidence']),2)
        self.assertEqual(verified['evidence'][0]['sha256'],result['sha256'])
        self.assertIn('pythonCode',verified['sources'][result['resultId']])

    def test_literal_numbers_dates_percentages_numbered_lists_and_unicode_rejected(self):
        self.assertFalse(has_number('请检查千位分隔符，核对结果一致，异常时一律停止。'))
        for template in ['The count is twelve.','合计十','金额为 十二','一、结果','金额为 999','保留三位小数','共有两项结果','2026-10-27 的结果','上涨5%','1. 结果','总数为十二','百分之五','３．５０','Ⅳ 项','½ 倍']:
            with self.subTest(template=template),self.assertRaisesRegex(ValueError,'未引用'):
                self.tools.publish(template,{})

    def test_modified_published_text_and_numbers_are_not_verified(self):
        result=self.compute();answer=self.tools.publish('合计 {{amount}}。',{'amount':self.ref(result)})
        for text in [answer['text'].replace('3.50','3.51'),answer['text']+' 日期2026',answer['text']+' 已独立复验']:
            self.assertEqual(self.evidence.verify('thread-A','turn-A',text)['status'],'rejected')

    def test_thread_and_missing_data_guards_cannot_borrow_other_evidence(self):
        result=self.compute();other=AnalysisTools(Gateway(directory=self.temp.name,thread_id='thread-B',turn_id='turn-B'),'thread-B')
        with self.assertRaisesRegex(ValueError,'当前会话'):other.publish('值 {{v}}',{'v':self.ref(result)})
        with self.assertRaisesRegex(ValueError,'不属于当前会话'):other.gateway.chart(result['resultId'],'bar','label',['value'])
        with self.assertRaisesRegex(ValueError,'行不存在'):self.tools.publish('值 {{v}}',{'v':self.ref(result,row=2)})
        with self.assertRaisesRegex(ValueError,'字段不存在'):self.tools.publish('值 {{v}}',{'v':self.ref(result,'missing')})

    def test_no_silent_exceptions_for_bad_placeholders_or_markup(self):
        result=self.compute()
        for template,refs in [('值 {{missing}}',{}),('值 {{bad}',{}),('值 {{v}}',{'v':self.ref(result),'unused':self.ref(result)}),('![图](/plot.png)',{}),('<svg></svg>',{})]:
            with self.subTest(template=template),self.assertRaises(ValueError):self.tools.publish(template,refs)

    def test_exact_large_integer_decimal_and_source_text_are_not_model_formatted(self):
        result=self.compute("result=[{'integer':900719925474099312345,'decimal':Decimal('12345678901234567890.123456789'),'text':'<img src=x> [link](javascript:bad)'}]")
        answer=self.tools.publish('整数 {{i}}，小数 {{d}}，字段 {{t}}',{'i':self.ref(result,'integer'),'d':self.ref(result,'decimal'),'t':self.ref(result,'text')})
        self.assertIn('900719925474099312345',answer['text']);self.assertIn('12345678901234567890.123456789',answer['text']);self.assertIn('\\<img',answer['text'])

    def test_same_text_in_a_new_turn_cannot_reuse_an_old_publication(self):
        result=self.compute();answer=self.tools.publish('值 {{v}}',{'v':self.ref(result)})
        self.evidence.observe({'method':'turn/started','params':{'threadId':'thread-A','turn':{'id':'turn-B'}}})
        self.assertEqual(self.evidence.verify('thread-A','turn-B',answer['text'])['status'],'rejected')
        self.gateway.turn_id='turn-B';self.tools.publish('值 {{v}}',{'v':self.ref(result)})
        self.assertEqual(self.evidence.verify('thread-A','turn-B',answer['text'])['status'],'verified')
        self.assertEqual(self.evidence.verify('thread-A','turn-A',answer['text'])['status'],'verified')

    def test_numeric_chart_titles_need_publication_and_calculation_titles_stay_qualitative(self):
        result=self.compute()
        with self.assertRaisesRegex(ValueError,'标题'):self.tools.check_chart_title('价格999')
        with self.assertRaisesRegex(ValueError,'标题'):self.compute(title='合计999')
        answer=self.tools.publish('价格 {{v}}',{'v':self.ref(result)})
        self.tools.check_chart_title(answer['text'])

    def test_native_parent_can_explicitly_read_child_output_but_unrelated_thread_cannot(self):
        child=Gateway(directory=self.temp.name,thread_id='child',turn_id='child-turn',parent_thread_id='thread-A')
        result=AnalysisTools(child,'child').calculate("result=[{'value':sum([1,2,3])}]")
        self.gateway.result(result['resultId'],model=True)
        answer=self.tools.publish('合计 {{v}}',{'v':self.ref(result)})
        self.assertEqual(answer['text'],'合计 6')

    def test_legacy_answers_are_labelled_and_live_turns_require_evidence(self):
        self.assertEqual(self.evidence.verify('thread-A','old-turn','历史结果 99')['status'],'legacy')
        self.assertEqual(self.evidence.verify('thread-A','turn-A','新结果 99')['status'],'rejected')
        self.assertEqual(self.evidence.verify('thread-A','turn-A','无法读取数据，请检查连接。')['status'],'notRequired')

    def test_proposed_plan_wrapper_can_match_native_body_without_changing_numbers(self):
        result=self.compute();answer=self.tools.publish('<proposed_plan>日期 {{day}} 的分析方案</proposed_plan>',{'day':self.ref(result,'date')})
        self.assertEqual(self.evidence.verify('thread-A','turn-A',answer['text'].removeprefix('<proposed_plan>').removesuffix('</proposed_plan>'))['status'],'verified')

    def test_python_cannot_read_host_files_environment_or_use_network(self):
        secret=Path(self.temp.name)/'private.txt';secret.write_text('private-test-only')
        code="import os,socket\nfrom pathlib import Path\nblocked=False\ntry: socket.create_connection(('127.0.0.1',1),timeout=.1)\nexcept OSError: blocked=True\nresult=[{'host_file_visible':Path(parameters['host_file']).exists(),'credential_visible':'DEEPSEEK_API_KEY' in os.environ,'network_blocked':blocked}]"
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'test-only-not-a-real-credential'}):result=self.compute(code,parameters={'host_file':str(secret)})
        row=self.gateway.result(result['resultId'])['rows'][0]
        self.assertEqual(row,{'host_file_visible':False,'credential_visible':False,'network_blocked':True})

    def test_mixed_numeric_types_preserve_exact_cells_and_ambiguous_text_is_rejected(self):
        result=self.compute("result=[{'v':900719925474099312345},{'v':Decimal('1.20')}]")
        rows=self.gateway.result(result['resultId'])['rows']
        self.assertEqual(rows[0]['v'],'900719925474099312345');self.assertEqual(rows[1]['v'],'1.20')
        with self.assertRaisesRegex(ValueError,'混合'):self.compute("result=[{'v':1},{'v':'unknown'}]")

    def test_python_errors_nonfinite_and_plotting_never_publish_success(self):
        before=list(self.gateway.snapshots.directory.glob('*.parquet'))
        for code in ['raise RuntimeError("fixture calculation failure")',"result=[{'v':float('nan')}]",'import matplotlib', 'import plotly', 'import pip']:
            with self.subTest(code=code),self.assertRaises(ValueError):self.compute(code)
        self.assertEqual(list(self.gateway.snapshots.directory.glob('*.parquet')),before)

    def test_timeout_terminates_real_calculation_and_cancelled_request_starts_no_process(self):
        with self.assertRaisesRegex(ValueError,'超时'):run_python('while True: pass',{}, {},{},self.gateway.snapshots,self.gateway.cancel,timeout=1)
        self.gateway.cancel.cancel()
        with patch('calculation.subprocess.Popen') as process:
            with self.assertRaises(Cancelled):self.compute()
            process.assert_not_called()
        self.assertEqual(list(self.gateway.snapshots.directory.glob('*.parquet')),[])

    def test_inflight_cancel_kills_only_its_python_process(self):
        failure=[];started=time.monotonic()
        def work():
            try:self.compute('while True: pass')
            except Exception as error:failure.append(error)
        worker=threading.Thread(target=work);worker.start()
        deadline=time.monotonic()+5
        while not self.gateway.cancel.callbacks and time.monotonic()<deadline:time.sleep(.01)
        self.assertTrue(self.gateway.cancel.callbacks);self.gateway.cancel.cancel();worker.join(3)
        self.assertFalse(worker.is_alive());self.assertTrue(any(isinstance(e,Cancelled) for e in failure));self.assertLess(time.monotonic()-started,4)
        other=Gateway(directory=self.temp.name,thread_id='thread-B')
        self.assertTrue(AnalysisTools(other,'thread-B').calculate("result=[{'v':sum([1,2,3])}]")['complete'])

    def test_local_file_import_and_raw_json_computation_have_real_source_metadata(self):
        file=Path(self.temp.name)/'input.csv';file.write_text('amount\n1.20\n2.30\n')
        with patch.dict(os.environ,{'CODEX_WEB_ANALYSIS_ROOTS':self.temp.name}):doc=self.tools.import_file(str(file))
        result=self.compute("result=[{'value':sum(Decimal(row['amount']) for row in documents[parameters['doc']])}]",document_ids=[doc['documentId']],parameters={'doc':doc['documentId']})
        self.assertEqual(self.gateway.result(result['resultId'])['rows'][0]['value'],'3.50')
        metadata=self.gateway.snapshots.metadata(result['resultId']);self.assertEqual(metadata['inputSources'][0]['path'],str(file))
        with patch.dict(os.environ,{'CODEX_WEB_ANALYSIS_ROOTS':self.temp.name}),self.assertRaisesRegex(ValueError,'目录'):self.tools.import_file('/etc/passwd','text')
        for text in ['amount,amount\n1.20,2.30\n','label,amount\nAlpha\n','label,amount\nAlpha,1.20,unexpected\n']:
            with self.subTest(text=text):
                document=self.tools.document(text,'csv',{'kind':'file','name':'invalid fixture'})
                with self.assertRaisesRegex(ValueError,'CSV'):self.compute("result=documents[parameters['doc']]",document_ids=[document['documentId']],parameters={'doc':document['documentId']})

    def test_fetch_real_http_document_redirect_errors_and_allowlist(self):
        class Fixture(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path=='/redirect':self.send_response(302);self.send_header('Location','https://unconfigured.invalid/data');self.end_headers();return
                if self.path=='/failure':self.send_response(503);self.end_headers();return
                body=b'{"amounts":[1.20,2.30]}'
                self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
            def log_message(self,*args):pass
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Fixture);threading.Thread(target=server.serve_forever,daemon=True).start();self.addCleanup(server.server_close);self.addCleanup(server.shutdown)
        origin='http://127.0.0.1:'+str(server.server_port)
        with patch.dict(os.environ,{'CODEX_WEB_DATA_ORIGINS':origin}):
            doc=self.tools.fetch(origin+'/data')
            result=self.compute("result=[{'value':sum(documents[parameters['doc']]['amounts'])}]",document_ids=[doc['documentId']],parameters={'doc':doc['documentId']})
            self.assertEqual(self.gateway.result(result['resultId'])['rows'][0]['value'],'3.50')
            for url in [origin+'/redirect',origin+'/failure',origin+'/data?api_key=test-only', 'https://query1.finance.yahoo.com/data']:
                with self.subTest(url=url),self.assertRaises(ValueError):self.tools.fetch(url)


if __name__=='__main__':unittest.main()
