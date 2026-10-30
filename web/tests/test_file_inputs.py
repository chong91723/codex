"""Actual temporary files, immutable documents and isolated Python, no model/DB."""
from pathlib import Path
import os
import sys
import unittest
from unittest.mock import patch
sys.path[:0]=[str(Path(__file__).resolve().parents[1]/'database'),str(Path(__file__).resolve().parents[1])]
import test_analysis_evidence as base
import analysis_tools

class FileInputs(unittest.TestCase):
    setUp=base.EvidenceTests.setUp
    compute=base.EvidenceTests.compute
    ref=staticmethod(base.EvidenceTests.ref)
    def imported(self):
        self.file=Path(self.temp.name)/'input.csv';self.file.write_text('label,amount\nAlpha,1.20\nBeta,2.30\n')
        with patch.dict(os.environ,{'CODEX_WEB_ANALYSIS_ROOTS':self.temp.name}):return self.tools.import_file(str(self.file))

    def from_document(self,document):
        return self.compute("result=[{'value':sum(Decimal(row['amount']) for row in documents[parameters['document']])}]",document_ids=[document['documentId']],parameters={'document':document['documentId']})

    def test_original_edit_requires_new_import_and_keeps_historical_result_readable(self):
        doc=self.imported();result=self.from_document(doc)
        publication=self.tools.publish('合计 {{v}}',{'v':self.ref(result)})
        status={'operation':'report_status','threadId':'thread-A','turnId':'turn-A','answerId':publication['answerId']}
        self.assertEqual(self.gateway.learning.manage(status)['status'],'current')
        self.file.write_text('label,amount\nAlpha,10.00\nBeta,20.00\n')
        self.assertEqual(self.gateway.learning.manage(status)['status'],'affected')
        with self.assertRaisesRegex(ValueError,'依赖文件'):self.from_document(doc)
        with self.assertRaisesRegex(ValueError,'依赖文件'):self.tools.publish('合计 {{v}}',{'v':self.ref(result)})
        self.assertEqual(self.gateway.result(result['resultId'])['rows'][0]['value'],'3.50')
        with patch.dict(os.environ,{'CODEX_WEB_ANALYSIS_ROOTS':self.temp.name}):new=self.tools.import_file(str(self.file))
        self.assertNotEqual(doc['documentId'],new['documentId'])
        result=self.from_document(new)
        self.assertEqual(self.tools.publish('合计 {{v}}',{'v':self.ref(result)})['text'],'合计 30.00')

    def test_edit_during_calculation_is_checked_before_snapshot_commit(self):
        doc=self.imported();real=analysis_tools.run_python
        def execute_then_edit(*args,**kwargs):
            result=real(*args,**kwargs);self.file.write_text('label,amount\nAlpha,99.00\n');return result
        before=set(self.gateway.snapshots.directory.glob('*.parquet'))
        with patch.object(analysis_tools,'run_python',side_effect=execute_then_edit):
            with self.assertRaisesRegex(ValueError,'依赖文件'):self.from_document(doc)
        self.assertEqual(before,set(self.gateway.snapshots.directory.glob('*.parquet')))

    def test_edit_during_final_snapshot_write_discards_only_new_output(self):
        document=self.imported();historical=self.from_document(document)
        publication=self.tools.publish('合计 {{v}}',{'v':self.ref(historical)})
        before={path:path.read_bytes() for path in self.gateway.snapshots.directory.iterdir() if path.is_file()}
        documents=self.evidence.root/'documents'/'thread-A'
        previous_documents={path:path.read_bytes() for path in documents.glob('*.json')}
        write=self.gateway.snapshots.write
        def write_then_edit(*args,**kwargs):
            result=write(*args,**kwargs)
            self.file.write_text('label,amount\nAlpha,99.00\n')
            return result
        with patch.object(self.gateway.snapshots,'write',side_effect=write_then_edit):
            with self.assertRaisesRegex(ValueError,'依赖文件'):self.from_document(document)
        self.assertEqual(before,{path:path.read_bytes() for path in self.gateway.snapshots.directory.iterdir() if path.is_file()})
        self.assertEqual(previous_documents,{path:path.read_bytes() for path in documents.glob('*.json')})
        self.assertEqual('3.50',self.gateway.result(historical['resultId'])['rows'][0]['value'])
        self.assertEqual('合计 3.50',publication['text'])
        with self.assertRaisesRegex(ValueError,'依赖文件'):self.tools.publish('合计 {{v}}',{'v':self.ref(historical)})
        status=self.gateway.learning.manage({'operation':'report_status','threadId':'thread-A','turnId':'turn-A','answerId':publication['answerId']})
        self.assertEqual('affected',status['status'])

    def test_file_dependency_from_derived_input_is_rechecked_after_final_write(self):
        document=self.imported();source=self.from_document(document)
        before=set(self.gateway.snapshots.directory.iterdir());write=self.gateway.snapshots.write
        def write_then_replace(*args,**kwargs):
            result=write(*args,**kwargs)
            replacement=self.file.with_suffix('.replacement');replacement.write_text('label,amount\nAlpha,99.00\n');replacement.replace(self.file)
            return result
        with patch.object(self.gateway.snapshots,'write',side_effect=write_then_replace):
            with self.assertRaisesRegex(ValueError,'依赖文件'):
                self.compute("result=[{'value':sum(row['value'] for row in datasets[parameters['source']])}]",result_ids=[source['resultId']],parameters={'source':source['resultId']})
        self.assertEqual(before,set(self.gateway.snapshots.directory.iterdir()))
        self.assertEqual('3.50',self.gateway.result(source['resultId'])['rows'][0]['value'])

    def test_final_write_touch_with_same_content_is_allowed(self):
        document=self.imported();write=self.gateway.snapshots.write
        def write_then_touch(*args,**kwargs):
            result=write(*args,**kwargs);os.utime(self.file,None);return result
        with patch.object(self.gateway.snapshots,'write',side_effect=write_then_touch):result=self.from_document(document)
        self.assertEqual('合计 3.50',self.tools.publish('合计 {{v}}',{'v':self.ref(result)})['text'])

    def test_edit_during_snapshot_sql_write_discards_only_new_output(self):
        document=self.imported();source=self.from_document(document)
        before={path:path.read_bytes() for path in self.gateway.snapshots.directory.iterdir() if path.is_file()};write=self.gateway.snapshots.write
        def write_then_edit(*args,**kwargs):
            result=write(*args,**kwargs);self.file.write_text('label,amount\nAlpha,99.00\n');return result
        with patch.object(self.gateway.snapshots,'write',side_effect=write_then_edit):
            with self.assertRaisesRegex(ValueError,'依赖文件'):self.gateway.analyze(source['resultId'],'SELECT value FROM result')
        self.assertEqual(before,{path:path.read_bytes() for path in self.gateway.snapshots.directory.iterdir() if path.is_file()})
        self.assertEqual('3.50',self.gateway.result(source['resultId'])['rows'][0]['value'])

    def test_edit_during_chart_save_removes_only_new_chart(self):
        document=self.imported();source=self.from_document(document)
        historical=self.gateway.chart(source['resultId'],'bar','value',['value'])
        folder=self.gateway.store.directory/'charts';before={path:path.read_bytes() for path in folder.glob('*.json')}
        original=Path.write_text
        def write_then_edit(path,*args,**kwargs):
            value=original(path,*args,**kwargs)
            if path.parent==folder:original(self.file,'label,amount\nAlpha,99.00\n')
            return value
        with patch.object(Path,'write_text',write_then_edit):
            with self.assertRaisesRegex(ValueError,'依赖文件'):self.gateway.chart(source['resultId'],'bar','value',['value'])
        self.assertEqual(before,{path:path.read_bytes() for path in folder.glob('*.json')})
        self.assertEqual('3.50',self.gateway.read_chart(historical['chartId'])['rows'][0]['value'])
        self.assertEqual('3.50',self.gateway.result(source['resultId'])['rows'][0]['value'])

    def test_touch_same_content_is_allowed_but_delete_blocks_derivatives(self):
        doc=self.imported();result=self.from_document(doc)
        derived=self.gateway.analyze(result['resultId'],'SELECT value FROM result')
        os.utime(self.file,None);self.from_document(doc)
        self.file.unlink()
        for item in (result,derived):
            with self.assertRaisesRegex(ValueError,'依赖文件'):self.gateway.result_owner(self.gateway.snapshots.metadata(item['resultId']))

    def test_file_changed_while_reading_does_not_create_a_document(self):
        self.imported();target=self.file;real=os.fstat;calls=[]
        def changed(fd):
            calls.append(fd)
            if len(calls)==2:
                replacement=target.with_suffix('.replacement');replacement.write_text('label,amount\nAlpha,9.99\n');replacement.replace(target)
            return real(fd)
        with patch('file_inputs.os.fstat',side_effect=changed),patch.dict(os.environ,{'CODEX_WEB_ANALYSIS_ROOTS':self.temp.name}):
            with self.assertRaisesRegex(ValueError,'读取期间'):self.tools.import_file(str(target))

    def test_special_file_never_blocks_and_unversioned_legacy_input_is_rejected(self):
        fifo=Path(self.temp.name)/'input.csv';os.mkfifo(fifo)
        with patch.dict(os.environ,{'CODEX_WEB_ANALYSIS_ROOTS':self.temp.name}):
            with self.assertRaisesRegex(ValueError,'普通文件'):self.tools.import_file(str(fifo))
        from file_inputs import check_files
        with self.assertRaisesRegex(ValueError,'缺少源文件版本'):check_files([{'inputSources':[{'kind':'file','path':str(fifo)}]}])
