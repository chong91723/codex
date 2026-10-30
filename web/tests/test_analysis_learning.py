"""Real registry/snapshots; collector and network probes explicitly mocked."""
from pathlib import Path
import json
import sys
import unittest
from unittest.mock import patch
sys.path[:0]=[str(Path(__file__).resolve().parents[1]/'database'),str(Path(__file__).resolve().parents[1])]
import test_database_knowledge as base
from service import Gateway
from mcp_server import knowledge_tool
from analysis_tools import AnalysisTools
from analysis_evidence import Evidence


class AnalysisLearning(unittest.TestCase):
    setUp=base.DatabaseKnowledgeTests.setUp
    scan=base.DatabaseKnowledgeTests.scan
    state=base.DatabaseKnowledgeTests.state
    mutation=base.DatabaseKnowledgeTests.mutation
    decide=base.DatabaseKnowledgeTests.decide
    def business(self,text):
        return self.knowledge.save_business(self.source['id'],self.state()['businessContext']['revision'],text)
    def read(self,gateway=None):
        return knowledge_tool(gateway or self.gateway,'read_database_context',{'connection_id':self.source['id']})
    def correction(self,text='Corrected rule'):
        state=self.state()
        result=self.knowledge.correct(self.source['id'],state['snapshot']['id'],{'kind':'business','revision':state['businessContext']['revision']},text,origin='agent')
        return next(n for n in result['notes'] if n['content']==text and n['status']=='pending')
    def snapshot(self,stamp):
        meta=self.gateway.snapshots.write({'connectionId':self.source['id'],'connectionName':'fixture','connectionVersion':self.source['version'],
            'connectionDependencies':[{'id':self.source['id'],'version':self.source['version']}], 'knowledgeDependencies':[stamp]},
            iter([([{'name':'amount','type':'integer','nativeType':'int'}],[{'amount':125}])]))
        AnalysisTools(self.gateway,self.gateway.thread_id).remember(meta)
        return meta
    def test_prepared_source_requires_current_turn_context(self):
        self.scan();self.business('Original')
        with self.assertRaisesRegex(ValueError,'本轮'):self.gateway.learning.before_query(self.source['id'])
        value=self.read();self.assertEqual(value['knowledgeReceipt']['token'],self.gateway.learning.before_query(self.source['id'])['token'])
        next_task=Gateway(self.temp.name,thread_id='another',turn_id='next')
        with self.assertRaisesRegex(ValueError,'本轮'):next_task.learning.before_query(self.source['id'])
        with patch.object(next_task,'probe',side_effect=lambda r:dict(r,status='connected')):
            context=self.read(next_task)
        self.assertEqual('Original',context['requiredBusinessContext']['content'])
        next_task.learning.before_query(self.source['id'])
    def test_business_definition_is_present_even_on_later_note_pages(self):
        self.scan();self.business('Source-wide required rule')
        page=knowledge_tool(self.gateway,'read_database_context',{'connection_id':self.source['id'],'offset':99,'limit':1})
        self.assertEqual([],page['notes'])
        self.assertEqual('Source-wide required rule',page['requiredBusinessContext']['content'])
        self.gateway.learning.before_query(self.source['id'])

    def test_unrelated_empty_page_cannot_attest_relevant_table_knowledge(self):
        state=self.scan()
        note=next(note for note in state['notes'] if note['target']=={'table':'orders','column':'amount'})
        self.decide(note['id'])
        page=knowledge_tool(self.gateway,'read_database_context',{'connection_id':self.source['id'],'table':'accounts','limit':1})
        self.assertEqual(page['notes'],[])
        with self.assertRaisesRegex(ValueError,'适用'):self.gateway.learning.before_query(self.source['id'],{'orders'})
        with patch('service.connect') as connector:
            with self.assertRaisesRegex(ValueError,'适用'):self.gateway.query(self.source['id'],'SELECT amount FROM orders')
            connector.assert_not_called()
        knowledge_tool(self.gateway,'read_database_context',{'connection_id':self.source['id'],'table':'orders'})
        self.gateway.learning.before_query(self.source['id'],{'orders'})

    def test_delivered_pages_accumulate_and_unrelated_notes_are_not_required(self):
        self.scan()
        for content,aspect,target in [('Relevant meaning','meaning',{'table':'orders'}),('Relevant units','units',{'table':'orders'}),('Account rule','scope',{'table':'accounts'})]:
            state=base.DatabaseKnowledgeTests.save(self,content,target=target,aspect=aspect)
            note=next(note for note in state['notes'] if note['content']==content)
            self.decide(note['id'])
        first=knowledge_tool(self.gateway,'read_database_context',{'connection_id':self.source['id'],'table':'orders','limit':1})
        self.assertTrue(first['hasMore'])
        with self.assertRaisesRegex(ValueError,'适用'):self.gateway.learning.before_query(self.source['id'],{'orders'})
        knowledge_tool(self.gateway,'read_database_context',{'connection_id':self.source['id'],'table':'orders','offset':1,'limit':1})
        self.gateway.learning.before_query(self.source['id'],{'orders'})
        with self.assertRaisesRegex(ValueError,'适用'):self.gateway.learning.before_query(self.source['id'],{'accounts'})

    def test_cte_shadowing_does_not_hide_physical_table_dependencies(self):
        from sql_guard import physical_tables
        import sqlglot
        tree=sqlglot.parse_one('WITH orders AS (SELECT * FROM public.orders) SELECT * FROM orders',read='postgres')
        self.assertEqual([(table.db,table.name) for table in physical_tables(tree)],[('public','orders')])

    def test_pending_correction_blocks_and_rejection_restores_validity(self):
        self.scan();self.business('Original');stamp=self.read()['knowledgeReceipt'];meta=self.snapshot(stamp)
        note=self.correction('Incorrect proposed rule')
        with self.assertRaisesRegex(ValueError,'冲突'):self.gateway.learning.before_query(self.source['id'])
        with self.assertRaisesRegex(ValueError,'业务知识'):self.gateway.learning.check_result(meta)
        self.mutation('reject',id=note['id'],reason='User rejects unsupported change')
        self.assertEqual([],self.gateway.learning.check([stamp]));self.gateway.learning.check_result(meta)
    def test_approved_correction_invalidates_original_and_derivatives(self):
        self.scan();self.business('Original');stamp=self.read()['knowledgeReceipt'];meta=self.snapshot(stamp)
        derived=self.gateway.analyze(meta['resultId'],'SELECT amount FROM result')
        self.assertEqual([stamp],derived['knowledgeDependencies'])
        note=self.correction();self.decide(note['id'],'Confirmed against business policy')
        for value in (meta,derived):
            with self.assertRaisesRegex(ValueError,'业务知识'):self.gateway.result_owner(value)
        with self.assertRaisesRegex(ValueError,'本轮'):self.gateway.learning.before_query(self.source['id'])
        self.assertEqual('Corrected rule',self.read()['requiredBusinessContext']['content'])
        self.gateway.learning.before_query(self.source['id'])
    def test_same_schema_refresh_keeps_semantic_token(self):
        self.scan();self.business('Original');stamp=self.read()['knowledgeReceipt'];self.scan()
        self.assertEqual([],self.gateway.learning.check([stamp]))
    def test_legacy_snapshot_cannot_bypass_knowledge_receipt(self):
        self.scan();self.business('Original')
        with self.assertRaisesRegex(ValueError,'版本记录'):
            self.gateway.learning.check_result({'connectionDependencies':[{'id':self.source['id']} ]})
    def test_history_explains_before_after_and_user_reason(self):
        self.scan();self.business('Original');note=self.correction();self.decide(note['id'],'User verified exact policy')
        history=knowledge_tool(self.gateway,'read_knowledge_history',{'connection_id':self.source['id'],'limit':20})
        self.assertTrue(any(e.get('before')=='Original' and e.get('after')=='Corrected rule' and e.get('reason')=='User verified exact policy' for e in history['records']))
        self.assertFalse(history['hasMore']);self.assertEqual(len(history['records']),history['total'])
        queue=self.gateway.learning.queue();self.assertEqual([],queue['sources'])
    def test_pending_queue_is_outside_chat_and_source_scoped(self):
        self.scan();self.business('Original');self.correction()
        value=self.gateway.learning.queue();self.assertEqual(self.source['id'],value['sources'][0]['sourceId']);self.assertEqual(1,value['sources'][0]['conflicts'])
        with self.assertRaises(ValueError):self.gateway.learning.history('another-source')
    def test_empty_reference_publication_still_checks_read_knowledge(self):
        self.scan();self.business('Original');self.read()
        tools=AnalysisTools(self.gateway,self.gateway.thread_id)
        answer=tools.publish('Qualitative plan',{},purpose='plan')
        self.assertTrue(answer['publicationChecks']['knowledge'])
        note=self.correction();self.decide(note['id'])
        with self.assertRaisesRegex(ValueError,'业务知识'):tools.publish('Another plan',{},purpose='plan')

    def test_permanent_thread_cleanup_keeps_source_knowledge(self):
        self.scan();self.business('Original');self.read()
        self.assertTrue(self.gateway.learning.current_reads())
        Evidence(self.temp.name).remove_thread(self.gateway.thread_id)
        self.assertEqual([],self.gateway.learning.current_reads())
        self.assertEqual('Original',self.state()['businessContext']['content'])

    def test_report_impact_keeps_immutable_original_and_blocks_republication(self):
        self.scan();self.business('Original');stamp=self.read()['knowledgeReceipt'];meta=self.snapshot(stamp)
        tools=AnalysisTools(self.gateway,self.gateway.thread_id)
        published=tools.publish('Amount is {{value}}',{'value':{'result_id':meta['resultId'],'row':0,'column':'amount'}})
        request={'operation':'report_status','threadId':self.gateway.thread_id,'turnId':self.gateway.turn_id,'answerId':published['answerId']}
        self.assertEqual('current',self.gateway.learning.manage(request)['status'])
        note=self.correction();self.decide(note['id'],'Changed policy')
        self.assertEqual('affected',self.gateway.learning.manage(request)['status'])
        proof=Evidence(self.temp.name).verify(self.gateway.thread_id,self.gateway.turn_id,published['text'])
        self.assertEqual('verified',proof['status']) # historical numeric proof is still true
        with self.assertRaisesRegex(ValueError,'业务知识'):tools.publish('Amount is {{value}}',{'value':{'result_id':meta['resultId'],'row':0,'column':'amount'}})

if __name__=='__main__':unittest.main()
