"""MCP boundary behavior with explicit mocked Gateway and knowledge storage.

No metadata collection, model, real database, network, or registry is involved.
"""
from pathlib import Path
from copy import deepcopy
import json
import sys
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'web'), str(ROOT / 'web/database')]
from cancellation import Cancelled
from mcp_server import TOOLS, knowledge_tool, KNOWLEDGE_RESULT_MAX_CHARS


class DatabaseExplorationToolTests(unittest.TestCase):
    def setUp(self):
        self.gateway = Mock(spec=['require','learning'])
        self.gateway.learning.record_read.return_value={'sourceId':'source-a','token':'explicit-boundary-fixture'}
        self.gateway.require.return_value = {'id': 'source-a', 'version': 3}
        self.knowledge = Mock(spec=['state', 'scan', 'catalog', 'context', 'propose'])
        self.knowledge.state.return_value = {'sourceId': 'source-a', 'sourceVersion': 3, 'revision': 7, 'snapshot': {'id': 'snapshot-a', 'sourceVersion': 3}, 'stale': False}
        self.knowledge.catalog.return_value = {'tables': [{'name': 'orders', 'columnCount': 4}], 'snapshot': {'id': 'snapshot-a'}}
        self.knowledge.context.return_value = {'notes': [], 'blockedConflicts': [], 'requiresScan': False}
        self.knowledge.propose.return_value = {'decision': 'pendingUserReview', 'proposedIds': ['note-a']}
        factory = patch('database_knowledge.DatabaseKnowledge', return_value=self.knowledge)
        self.factory = factory.start()
        self.addCleanup(factory.stop)

    def call(self, name='explore_database', **extra):
        return knowledge_tool(self.gateway, name, {'connection_id': 'source-a', **extra})

    def test_unprepared_source_requires_user_preparation_without_scan_or_catalog(self):
        self.knowledge.state.return_value.update(snapshot=None)
        result = self.call()
        self.assertIs(result['requiresPreparation'], True)
        self.gateway.require.assert_called_once_with('source-a')
        self.knowledge.scan.assert_not_called()
        self.knowledge.catalog.assert_not_called()
        self.knowledge.propose.assert_not_called()

    def test_changed_connection_requires_preparation_without_automatic_replacement(self):
        self.knowledge.state.return_value.update(stale=True)
        result = self.call()
        self.assertIs(result['requiresPreparation'], True)
        self.knowledge.scan.assert_not_called()
        self.knowledge.catalog.assert_not_called()

    def test_prepared_exploration_reads_only_requested_page(self):
        result = self.call(table='orders', search=' amount ', offset=20, limit=10)
        self.assertEqual(result, self.knowledge.catalog.return_value)
        self.knowledge.catalog.assert_called_once_with('source-a', table='orders', search=' amount ', offset=20, limit=10)
        self.knowledge.scan.assert_not_called()
        self.knowledge.propose.assert_not_called()

    def test_refresh_and_management_parameters_are_rejected_before_storage_access(self):
        for values in ({'refresh': True}, {'refresh': False}, {'operation': 'scan'}, {'operation': 'decide'}, {'status': 'accepted'}, {'snapshot_id': 'override'}):
            with self.subTest(values=values), self.assertRaises(ValueError):
                self.call(**values)
        self.factory.assert_not_called()
        self.knowledge.scan.assert_not_called()

    def test_proposal_has_no_user_decision_or_scope_override_arguments(self):
        item = {'target': {'table': 'orders'}, 'aspect': 'grain', 'content': 'Candidate interpretation'}
        result = self.call('propose_database_knowledge', snapshot_id='snapshot-a', items=[item])
        self.assertEqual('pendingUserReview', result['decision'])
        self.knowledge.propose.assert_called_once_with('source-a', 'snapshot-a', [item])
        self.knowledge.scan.assert_not_called()
        for extra in ({'operation': 'decide'}, {'status': 'accepted'}, {'expectedRevision': 7}, {'source_id': 'source-b'}, {'refresh': True}):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                self.call('propose_database_knowledge', snapshot_id='snapshot-a', items=[item], **extra)
        self.assertEqual(1, self.knowledge.propose.call_count)

    def test_context_read_does_not_explore_or_propose(self):
        result = self.call('read_database_context', table='orders', offset=0, limit=5)
        self.assertEqual({k:v for k,v in result.items() if k!='knowledgeReceipt'}, self.knowledge.context.return_value)
        self.gateway.learning.record_read.assert_called_once()
        self.knowledge.context.assert_called_once_with('source-a', table='orders', offset=0, limit=5)
        self.knowledge.scan.assert_not_called()
        self.knowledge.catalog.assert_not_called()
        self.knowledge.propose.assert_not_called()
        self.knowledge.state.assert_not_called()
        with self.assertRaises(ValueError):
            self.call('read_database_context', refresh=True)

    def test_unavailable_source_stops_all_tools_before_storage_access(self):
        self.gateway.require.side_effect = ValueError('source disabled')
        for name, extra in [('explore_database', {}), ('read_database_context', {}), ('propose_database_knowledge', {'snapshot_id': 'snapshot-a', 'items': []})]:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'disabled'):
                self.call(name, **extra)
        self.factory.assert_not_called()

    def test_cancellation_remains_error_instead_of_empty_success(self):
        self.knowledge.catalog.side_effect = Cancelled()
        with self.assertRaises(Cancelled):
            self.call()
        self.knowledge.context.side_effect = Cancelled()
        with self.assertRaises(Cancelled):
            self.call('read_database_context')
        self.knowledge.scan.assert_not_called()

    def test_confirmed_context_omits_history_but_preserves_complete_long_content_and_binding(self):
        content='已确认业务定义，完整保留。' * 500
        note={'id':'note-a','key':'redundant-topic-hash','target':{'table':'orders','column':'amount'},'aspect':'meaning',
              'content':content,'origin':'user','sourceVersion':3,'schemaHash':'actual-hash','snapshotId':'snapshot-a',
              'decision':'accepted','reason':'User reviewed the entire definition','status':'accepted','sourceId':'source-a',
              'history':[{'reason':'Historical content should not use model context.'*2000}],
              'evidence':[{'table':'orders','column':'amount'}],'createdAt':'observation-time','trust':'untrusted_data'}
        self.knowledge.context.return_value={'sourceId':'source-a','notes':[note],'blockedConflicts':[],'total':1,'hasMore':False}
        original=deepcopy(self.knowledge.context.return_value)
        result=self.call('read_database_context',limit=1)
        actual=result['notes'][0]
        self.assertEqual(content,actual['content'])
        self.assertEqual({'id','target','aspect','content','origin','sourceVersion','schemaHash','snapshotId','decision','reason'},set(actual))
        self.assertEqual('actual-hash',actual['schemaHash'])
        self.assertEqual('User reviewed the entire definition',actual['reason'])
        self.assertEqual(original,self.knowledge.context.return_value)
        self.assertLessEqual(len(json.dumps(result,ensure_ascii=False)),KNOWLEDGE_RESULT_MAX_CHARS)

    def test_large_conflict_returns_bounded_explicit_previews_without_mutating_full_records(self):
        candidates=[{'id':'note-'+str(index),'origin':'agent','status':'pending','content':str(index)+':'+'候选资料'*1900,
                     'evidence':[{'table':'orders','column':'amount'}]} for index in range(500)]
        conflict={'key':'topic-hash','target':{'table':'orders','column':'amount'},'aspect':'meaning',
                  'noteIds':[item['id'] for item in candidates],'reason':'different_content','candidates':candidates}
        self.knowledge.context.return_value={'notes':[],'blockedConflicts':[conflict],'conflictsTotal':1,'conflictsHasMore':False}
        result=self.call('read_database_context',limit=1)
        compact=result['blockedConflicts'][0]
        self.assertEqual(500,compact['candidateCount'])
        self.assertEqual([item['id'] for item in candidates[:10]],compact['candidateIds'])
        self.assertEqual(3,len(compact['previews']))
        self.assertTrue(compact['preview'])
        self.assertTrue(compact['truncated'])
        self.assertTrue(compact['candidateIdsTruncated'])
        self.assertTrue(all(item['preview'] and item['truncated'] and len(item['content'])==300 for item in compact['previews']))
        self.assertNotIn('candidates',compact)
        self.assertNotIn('noteIds',compact)
        self.assertIn('查看全部原文',compact['resolution'])
        self.assertEqual(500,len(conflict['candidates']))
        self.assertEqual(candidates[0]['content'],conflict['candidates'][0]['content'])
        self.assertGreater(len(conflict['candidates'][0]['content']),300)
        self.assertLessEqual(len(json.dumps(result,ensure_ascii=False)),KNOWLEDGE_RESULT_MAX_CHARS)

    def test_short_conflict_preview_explicitly_states_when_text_is_complete(self):
        self.knowledge.context.return_value={'notes':[],'blockedConflicts':[{'key':'topic','target':{'table':'orders'},'aspect':'meaning',
            'noteIds':['a','b'],'candidates':[{'id':'a','origin':'user','status':'accepted','content':'Tax inclusive'},
                                          {'id':'b','origin':'agent','status':'pending','content':'Tax exclusive'}]}]}
        compact=self.call('read_database_context')['blockedConflicts'][0]
        self.assertTrue(compact['preview'])
        self.assertFalse(compact['truncated'])
        self.assertFalse(compact['candidateIdsTruncated'])
        self.assertEqual(['Tax inclusive','Tax exclusive'],[item['content'] for item in compact['previews']])
        self.assertTrue(all(item['preview'] and not item['truncated'] for item in compact['previews']))

    def test_over_budget_confirmed_page_errors_instead_of_truncating_prose(self):
        notes=[{'id':'note-'+str(index),'target':{'table':'orders'},'aspect':'meaning','content':'原'*8000} for index in range(2)]
        self.knowledge.context.return_value={'notes':notes,'blockedConflicts':[]}
        with self.assertRaisesRegex(ValueError,'未返回截断内容.*limit.*table/search'):
            self.call('read_database_context',limit=2)
        self.assertEqual([8000,8000],[len(note['content']) for note in notes])

    def test_over_budget_physical_catalog_errors_without_shortening_metadata(self):
        self.knowledge.catalog.return_value={'tables':[{'name':'orders','comment':'physical comment '*2000}],'snapshot':{'id':'snapshot-a'}}
        original=deepcopy(self.knowledge.catalog.return_value)
        with self.assertRaisesRegex(ValueError,'单次上下文预算'):
            self.call(limit=1)
        self.assertEqual(original,self.knowledge.catalog.return_value)
        self.knowledge.scan.assert_not_called()

    def test_tool_catalog_has_no_scan_or_approval_entry_and_no_refresh_parameter(self):
        tools = {tool['name']: tool for tool in TOOLS}
        explore = tools['explore_database']
        self.assertNotIn('refresh', explore['inputSchema']['properties'])
        self.assertFalse(explore['inputSchema']['additionalProperties'])
        self.assertTrue(explore['annotations']['readOnlyHint'])
        self.assertTrue(tools['read_database_context']['annotations']['readOnlyHint'])
        self.assertFalse(tools['propose_database_knowledge']['annotations']['readOnlyHint'])
        proposal = tools['propose_database_knowledge']['inputSchema']
        self.assertEqual({'connection_id', 'snapshot_id', 'items'}, set(proposal['properties']))
        self.assertFalse(proposal['additionalProperties'])
        self.assertFalse(proposal['properties']['items']['items']['additionalProperties'])
        self.assertEqual({'target', 'aspect', 'content', 'evidence'}, set(proposal['properties']['items']['items']['properties']))
        self.assertFalse(any(name.startswith(('confirm_database', 'approve_database', 'scan_database', 'decide_database', 'merge_database', 'reject_database')) for name in tools))


if __name__ == '__main__':
    unittest.main()
