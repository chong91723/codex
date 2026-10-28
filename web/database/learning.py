"""Current business knowledge outranks historical memory. No model/agent loop here.

Version receipts are captured when context is read, carried through datasets and
checked at execution/publication. Historical answers remain immutable.
"""
import json
from database_knowledge import DatabaseKnowledge, canonical, digest, now, require


class Learning:
    def __init__(self, gateway):
        self.gateway = gateway
        self.store = gateway.store
        self.knowledge = DatabaseKnowledge(gateway)
        with self.store.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS analysis_knowledge_reads (thread_id TEXT, turn_id TEXT, source_id TEXT, record TEXT NOT NULL, PRIMARY KEY(thread_id,turn_id,source_id))')

    def stamp(self, source_id):
        state = self.knowledge.state(source_id)
        business = state['businessContext']
        notes = sorted({canonical(dict(key=n['key'],content=n['content'])) for n in state['notes'] if n['status']=='accepted' and not n['stale'] and n['key'] != self.knowledge._business_key()})
        value = {'sourceId': source_id, 'sourceVersion': state['sourceVersion'],
                 'schemaHash': (state['snapshot'] or {}).get('schemaHash'), 'schemaStale': state['stale'],
                 'businessRevision': business['revision'], 'businessContent':business.get('content',''), 'businessStale': business.get('stale', False),
                 'notes': notes, 'conflicts': sorted(c['key'] for c in state['conflicts'])}
        return {'sourceId': source_id, 'token': digest(value), 'sourceVersion': state['sourceVersion'],
                'businessRevision': business['revision'], 'businessStale': business.get('stale',False), 'knowledgeRevision': state['revision'],
                'schemaHash': value['schemaHash'], 'conflicts': len(state['conflicts']),
                'requiresContext': bool(state['snapshot'] or business.get('content') or notes or state['conflicts'])}

    def record_read(self, source_id, context):
        stamp = self.stamp(source_id)
        require(stamp['sourceVersion'] == context['sourceVersion'] and stamp['businessRevision'] == context['businessContextRevision'] and stamp['knowledgeRevision'] == context['revision'],
                '读取期间业务知识已变化，请重新读取 read_database_context。')
        if self.gateway.thread_id and self.gateway.turn_id:
            record = dict(stamp, readAt=now())
            with self.store.connect() as db:
                db.execute('INSERT OR REPLACE INTO analysis_knowledge_reads VALUES (?,?,?,?)',
                           (self.gateway.thread_id, self.gateway.turn_id, source_id, canonical(record)))
        return stamp

    def before_query(self, source_id):
        stamp = self.stamp(source_id)
        if self.gateway.thread_id:
            require(not stamp['businessStale'], '数据源连接或结构已变化，业务补充需在数据源页面重新确认后才能分析；历史记忆不能代替确认。')
            require(not stamp['conflicts'], '数据源存在待裁定的业务知识冲突。请用户到数据源的数据库探索页面裁定，不能在对话中批准或沿用旧定义。')
            if stamp['requiresContext']:
                with self.store.connect() as db:
                    row = db.execute('SELECT record FROM analysis_knowledge_reads WHERE thread_id=? AND turn_id=? AND source_id=?',
                                     (self.gateway.thread_id, self.gateway.turn_id, source_id)).fetchone()
                require(row and json.loads(row[0])['token'] == stamp['token'],
                        '本轮尚未读取当前业务知识，或知识已纠正。请先 read_database_context，再按最新定义重新查询。历史记忆不能替代此检查。')
        return stamp

    def current_reads(self):
        if not self.gateway.thread_id or not self.gateway.turn_id:return []
        with self.store.connect() as db:
            records=[json.loads(r[0]) for r in db.execute('SELECT record FROM analysis_knowledge_reads WHERE thread_id=? AND turn_id=?', (self.gateway.thread_id,self.gateway.turn_id))]
        return [{k:v for k,v in r.items() if k!='readAt'} for r in records]

    def check(self, stamps):
        changes = []
        for previous in stamps:
            try:
                current = self.stamp(previous['sourceId'])
                if current['token'] != previous.get('token') or current['conflicts']:
                    changes.append({'sourceId': previous['sourceId'], 'before': previous, 'after': current, 'reason': 'knowledge_changed'})
            except ValueError:
                changes.append({'sourceId': previous['sourceId'], 'before': previous, 'reason': 'source_removed'})
        return changes

    def check_result(self, metadata):
        stamps = metadata.get('knowledgeDependencies', [])
        changes = self.check(stamps)
        stamped = {s['sourceId'] for s in stamps}
        for dependency in metadata.get('connectionDependencies', []):
            if dependency['id'] not in stamped and self.stamp(dependency['id'])['requiresContext']:
                changes.append({'sourceId': dependency['id'], 'reason': 'legacy_no_knowledge_receipt'})
        require(not changes, '结果所用的业务知识已变化或缺少版本记录，不能继续计算、绘图或发布。请重新读取当前知识并重新查询；旧报告保留为历史版本。')

    def history(self, source_id, offset=0, limit=10):
        self.knowledge._page(offset, limit)
        self.store.get(source_id)
        state = self.knowledge.state(source_id)
        notes = {n['id']: n for n in state['notes']}
        events = []
        with self.store.connect() as db:
            business = [json.loads(r[0]) for r in db.execute('SELECT record FROM database_business_context_history WHERE source_id=? ORDER BY revision', (source_id,))]
        for index, record in enumerate(business):
            events.append({'at': record.get('updatedAt'), 'action': 'business_saved', 'actor': 'user',
                           'revision': record['revision'], 'before': business[index-1]['content'] if index else '',
                           'after': record['content'], 'reason': record.get('reason', '用户主动保存业务补充'), 'status': 'accepted'})
        for note in notes.values():
            ref = note.get('correctionOf')
            before = None
            if ref:
                if ref['kind'] == 'business':
                    before = next((b['content'] for b in business if b['revision'] == ref['revision']), None)
                elif ref['kind'] == 'note':
                    before = notes.get(ref['id'], {}).get('content')
                elif ref['kind'] == 'finding':
                    with self.store.connect() as db:
                        snapshot = self.knowledge._snapshot(db, note['snapshotId'])
                    finding = next((f for f in (snapshot or {}).get('exploration', {}).get('findings', []) if digest(f) == ref['id']), {})
                    before = finding.get('message', '') + (('：' + finding['detail']) if finding.get('detail') else '')
            if ref:
                events.append({'at': note['createdAt'], 'action': 'correction_proposed', 'actor': note['origin'], 'noteId': note['id'],
                               'target': note['target'], 'reference': ref, 'before': before, 'after': note['content'], 'status': note['status']})
            for event in note.get('history', []):
                events.append(dict(event, noteId=note['id'], target=note['target'], reference=ref, before=before, after=note['content'],
                                   parentIds=note.get('parentIds', [])))
        events.sort(key=lambda e: (e.get('at') or '', e.get('noteId', '')), reverse=True)
        return {'sourceId': source_id, 'current': self.stamp(source_id), 'records': events[offset:offset+limit],
                'total': len(events), 'offset': offset, 'hasMore': offset+limit < len(events),
                'trust': 'Historical decisions explain changes; rejected/superseded content is not current business truth. No numbers in this log are query/metric evidence.'}

    def queue(self):
        result = []
        for source in self.store.all():
            state = self.knowledge.state(source['id'])
            pending = [n for n in state['notes'] if n['status'] == 'pending' and not n['stale'] and (n['origin'] != 'observed' or n.get('correctionOf'))]
            if pending or state['conflicts']:
                result.append({'sourceId': source['id'], 'name': source['name'], 'pending': len(pending), 'conflicts': len(state['conflicts'])})
        return {'sources': result, 'total': sum(s['pending'] for s in result)}

    def manage(self, payload):
        operation = payload.get('operation')
        if operation == 'queue':
            return self.queue()
        if operation == 'history':
            return self.history(payload['sourceId'], payload.get('offset', 0), payload.get('limit', 10))
        if operation == 'report_status':
            from analysis_evidence import Evidence
            evidence = Evidence(self.store.directory)
            thread, turn, answer = (evidence.identity(payload[k]) for k in ('threadId', 'turnId', 'answerId'))
            path = evidence.path('answers', thread, answer).parent / turn / (answer + '.json')
            require(path.is_file(), '报告的原始发布记录不存在，无法判断知识影响。')
            record = json.loads(path.read_text())
            stamps = record.get('publicationChecks', {}).get('knowledge', [])
            changes = self.check(stamps)
            return {'status': 'affected' if changes else 'current' if stamps else 'untracked', 'changes': changes,
                    'notice': '知识版本变化只表示报告需复核，不证明每个数值都错误；历史正文不会被静默改写。'}
        raise ValueError('未知的知识协作操作。')
