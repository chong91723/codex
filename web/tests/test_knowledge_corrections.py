"""Correction approval lifecycle on SQLite; physical collection explicitly mocked."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'web/database'), str(ROOT / 'web'), str(ROOT / 'web/tests')]
import test_database_knowledge as base
from database_knowledge import DatabaseKnowledge, digest
from service import Gateway
from mcp_server import knowledge_tool, TOOLS


class KnowledgeCorrections(unittest.TestCase):
    setUp = base.DatabaseKnowledgeTests.setUp
    state = base.DatabaseKnowledgeTests.state
    scan = base.DatabaseKnowledgeTests.scan
    mutation = base.DatabaseKnowledgeTests.mutation
    decide = base.DatabaseKnowledgeTests.decide
    proposed = base.DatabaseKnowledgeTests.proposed
    context = base.DatabaseKnowledgeTests.context
    def correct(self, reference, content, origin='user'):
        state = self.state()
        return self.knowledge.correct(self.source['id'], state['snapshot']['id'], reference, content,
                                      state['revision'] if origin == 'user' else None, origin)

    def business(self, content):
        return self.knowledge.save_business(self.source['id'], self.state()['businessContext']['revision'], content)

    def test_business_conflict_blocks_original_until_user_approves(self):
        self.scan(); self.business('Original incorrect rule')
        state = self.correct({'kind': 'business', 'revision': 1}, 'Corrected complete rule', 'agent')
        self.assertEqual(1, len(state['conflicts']))
        self.assertFalse(any(n['aspect'] == 'business_context' for n in self.context()['notes']))
        self.assertEqual('Original incorrect rule', state['businessContext']['content'])
        candidate = next(n for n in state['notes'] if n['content'] == 'Corrected complete rule')
        self.assertEqual('pending', candidate['status'])
        with self.assertRaisesRegex(ValueError, '冲突'):
            self.business('Cannot bypass approval')
        self.decide(candidate['id'], 'Explicit test user approval')
        state = self.state()
        self.assertEqual('Corrected complete rule', state['businessContext']['content'])
        self.assertEqual(2, state['businessContext']['revision'])
        self.assertFalse(state['conflicts'])
        self.assertEqual(['Corrected complete rule'], [n['content'] for n in self.context()['notes'] if n['aspect'] == 'business_context'])
        history = self.knowledge.manage({'operation': 'business_history', 'sourceId': self.source['id']})
        self.assertEqual(['Corrected complete rule', 'Original incorrect rule'], [r['content'] for r in history['records']])
        other = Gateway(self.temp.name, thread_id='new-task', turn_id='new-turn')
        with patch.object(other, 'probe', side_effect=lambda r: dict(r, status='connected')):
            self.assertEqual('Corrected complete rule', DatabaseKnowledge(other).context(self.source['id'])['notes'][0]['content'])
        # A later direct edit must not expose the old adopted correction too.
        self.business('Next manually adopted full rule')
        self.assertEqual(['Next manually adopted full rule'], [n['content'] for n in self.context()['notes'] if n['aspect'] == 'business_context'])

    def test_reject_business_correction_restores_original_and_agent_cannot_reopen(self):
        self.scan(); self.business('Original')
        state = self.correct({'kind': 'business', 'revision': 1}, 'Wrong correction', 'agent')
        note = next(n for n in state['notes'] if n['content'] == 'Wrong correction')
        self.mutation('reject', id=note['id'], reason='User rejects it')
        self.assertEqual(['Original'], [n['content'] for n in self.context()['notes'] if n['aspect'] == 'business_context'])
        with self.assertRaisesRegex(ValueError, '不能重新打开'):
            self.correct({'kind': 'business', 'revision': 1}, 'Wrong correction', 'agent')
        self.assertEqual(1, self.state()['businessContext']['revision'])

    def test_existing_agent_note_can_be_corrected_and_merged_with_lineage(self):
        self.scan(); proposal = self.proposed('Wrong inferred meaning', aspect='grain')
        state = self.correct({'kind': 'note', 'id': proposal['proposedIds'][0]}, 'User correction')
        peers = [n for n in state['notes'] if n['aspect'] == 'grain']
        self.assertEqual(1, len(state['conflicts']))
        state = self.mutation('merge', ids=[n['id'] for n in peers], content='Reviewed merged meaning', reason='Compared both sources')
        adopted = next(n for n in state['notes'] if n['content'] == 'Reviewed merged meaning')
        self.assertEqual('accepted', adopted['status'])
        self.assertEqual(2, len(adopted['parentIds']))
        self.assertEqual(['Reviewed merged meaning'], [n['content'] for n in self.context()['notes'] if n['aspect'] == 'grain'])

    def test_finding_correction_keeps_physical_observation_and_survives_identical_refresh(self):
        finding = dict(kind='structural_check', table='orders', severity='low', rule='NoRemarks', message='No remarks')
        self.knowledge.scan(self.source['id'], 0, catalog=deepcopy(self.catalog_value), exploration={'findings': [finding]})
        original_catalog = deepcopy(self.knowledge.catalog(self.source['id'])['tables'])
        state = self.correct({'kind': 'finding', 'id': digest(finding)}, 'Known test convention: comments are maintained externally')
        self.assertEqual('conflict', self.knowledge.catalog(self.source['id'])['findings'][0]['review']['status'])
        note = next(n for n in state['notes'] if n['origin'] == 'user')
        self.decide(note['id'])
        reviewed = self.knowledge.catalog(self.source['id'])['findings'][0]
        self.assertEqual('reviewed', reviewed['review']['status'])
        self.assertIn('maintained externally', reviewed['review']['effectiveContent'])
        self.assertEqual(finding['message'], reviewed['message'])
        self.assertEqual(original_catalog, self.knowledge.catalog(self.source['id'])['tables'])
        self.knowledge.scan(self.source['id'], self.state()['revision'], catalog=deepcopy(self.catalog_value), exploration={'findings': [finding]})
        self.assertEqual('reviewed', self.knowledge.catalog(self.source['id'])['findings'][0]['review']['status'])

    def test_wrong_reference_stale_revision_and_agent_approval_fields_are_rejected_atomically(self):
        self.scan(); self.business('Original')
        before = self.state()
        for ref in [{'kind': 'finding', 'id': 'not-this-source'}, {'kind': 'business', 'revision': 0}, {'kind': 'note', 'id': 'foreign-note'}]:
            with self.assertRaises(ValueError): self.correct(ref, 'Revision')
            self.assertEqual(before, self.state())
        with self.assertRaisesRegex(ValueError, '更新'):
            self.knowledge.correct(self.source['id'], before['snapshot']['id'], {'kind':'business','revision':1}, 'Revision', before['revision'] - 1)
        args = dict(connection_id=self.source['id'], snapshot_id=before['snapshot']['id'], reference={'kind':'business','revision':1}, content='Revision', approved=True)
        with self.assertRaises(ValueError): knowledge_tool(self.gateway, 'propose_database_correction', args)
        self.assertEqual(before, self.state())
        self.assertEqual(1, sum(t['name'] == 'propose_database_correction' for t in TOOLS))

    def test_mcp_correction_is_pending_and_respects_source_ownership(self):
        self.scan(); self.business('Original')
        state=self.state()
        result=knowledge_tool(self.gateway, 'propose_database_correction', dict(connection_id=self.source['id'], snapshot_id=state['snapshot']['id'], reference={'kind':'business','revision':1}, content='Proposed by model'))
        self.assertEqual('pendingUserReview', result['decision'])
        self.assertEqual('Original', self.state()['businessContext']['content'])
        self.assertFalse(any(n['status']=='accepted' and n['content']=='Proposed by model' for n in self.state()['notes']))

    def test_business_reapproval_rebinds_after_actual_schema_change(self):
        self.scan(); self.business('Original')
        state = self.correct({'kind':'business','revision':1}, 'Adopted correction')
        note = next(n for n in state['notes'] if n['content']=='Adopted correction')
        self.decide(note['id'])
        self.catalog_value['tables'][0]['columns'].append({'name':'new_field','dataType':'text','nullable':True})
        self.scan()
        self.assertFalse(any(n['aspect']=='business_context' for n in self.context()['notes']))
        self.decide(note['id'], 'Reviewed after schema change')
        state = self.state()
        self.assertFalse(state['businessContext']['stale'])
        self.assertEqual(['Adopted correction'], [n['content'] for n in self.context()['notes'] if n['aspect']=='business_context'])

    def test_finding_mcp_dedup_does_not_claim_a_second_pending_approval(self):
        finding = dict(kind='structural_check',table='orders',message='Missing remarks')
        self.knowledge.scan(self.source['id'],0,catalog=deepcopy(self.catalog_value),exploration={'findings':[finding]})
        args=dict(connection_id=self.source['id'],snapshot_id=self.state()['snapshot']['id'],reference={'kind':'finding','id':digest(finding)},content='Reviewed interpretation')
        proposed=knowledge_tool(self.gateway,'propose_database_correction',args)
        self.decide(proposed['outcome']['id'])
        repeated=knowledge_tool(self.gateway,'propose_database_correction',args)
        self.assertEqual('noChange',repeated['decision'])
        self.assertEqual('accepted',repeated['outcome']['status'])

    def test_model_search_cannot_hide_source_business_rule_or_its_conflict(self):
        self.scan(); self.business('Only the confirmed effective online orders; amount excludes tax')
        query = {'table':'orders','search':'有效 订单 状态 OnlineOrderFlag'}
        self.assertEqual(1,len(self.context(**query)['notes']))
        state=self.correct({'kind':'business','revision':1},'Corrected entire source definition','agent')
        blocked=self.context(**query)
        self.assertFalse(blocked['notes'])
        self.assertEqual(1,blocked['conflictsTotal'])
        note=next(n for n in state['notes'] if n['content']=='Corrected entire source definition')
        self.decide(note['id'])
        self.assertEqual(['Corrected entire source definition'],[n['content'] for n in self.context(**query)['notes']])

    def test_legacy_table_topic_named_business_context_cannot_hide_global_definition(self):
        self.scan()
        # Reproduce a valid record from before the reserved correction topics.
        with self.gateway.store.connect() as db:
            snapshot=self.knowledge._snapshot(db,self.state()['snapshot']['id'])
            candidate=self.knowledge._candidate({'target':{'table':'orders'},'aspect':'business_context','content':'Old table-scoped context'},snapshot)
            note=self.knowledge._new_note(candidate,snapshot,'user','accepted')
            self.knowledge._write_note(db,note)
        self.business('Current source-wide rule')
        contents=[n['content'] for n in self.context(table='orders')['notes']]
        self.assertIn('Current source-wide rule',contents)
        self.assertIn('Old table-scoped context',contents)

if __name__ == '__main__': unittest.main()
