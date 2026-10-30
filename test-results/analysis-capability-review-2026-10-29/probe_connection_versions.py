"""Real temporary SQLite writes; network probe explicitly stubbed. No model calls."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import sys
import tempfile
import threading
from unittest.mock import patch

sys.path[:0] = ['/root/Codex/web/database', '/root/Codex/web']
from service import Gateway

out = Path('/tmp/codex-cross-feature-review-20261029')
with tempfile.TemporaryDirectory(prefix='codex-source-version-review-') as directory:
    gateway = Gateway(directory, thread_id='audit-thread', turn_id='audit-turn')
    store = gateway.store
    initial = store.save(dict(name='Synthetic audit source', engine='mysql',
                              host='fixture-original.invalid', database='fixture',
                              username='readonly', password='', port=3306))
    original_get = store.get
    gate = threading.Barrier(2)

    def simultaneous_read(identifier):
        value = original_get(identifier)
        gate.wait(timeout=10)
        return value

    def edit(host):
        return store.save(dict(id=initial['id'], name='Synthetic audit source',
                               engine='mysql', host=host, database='fixture',
                               username='readonly', password='', port=3306))

    with patch.object(store, 'get', side_effect=simultaneous_read):
        with ThreadPoolExecutor(max_workers=2) as pool:
            edits = list(pool.map(edit, ['fixture-a.invalid', 'fixture-b.invalid']))

    current = store.get(initial['id'])
    older = next(record for record in edits if record['host'] != current['host'])
    assert edits[0]['version'] == edits[1]['version'] == current['version'] == 2
    store.status(current, 'connected')
    metadata = dict(connectionId=initial['id'], connectionVersion=older['version'],
                    connectionDependencies=[dict(id=initial['id'], version=older['version'])],
                    knowledgeDependencies=[], sourceKind='database')
    with patch.object(gateway, 'probe', side_effect=lambda record: dict(record, status='connected')):
        accepted = gateway.result_owner(metadata)
    assert accepted['host'] != older['host']
    result = dict(
        reproduced=True,
        scope='Temporary SQLite; simultaneous source saves; mocked connectivity only; no real database/model/browser',
        originalVersion=initial['version'],
        returnedVersions=[record['version'] for record in edits],
        currentVersion=current['version'],
        supersededHost=older['host'], currentHost=current['host'],
        oldResultVersionGuardAccepted=True,
        expected='Reject a stale edit or atomically advance to a distinct newer connection version',
        impact='A version-only result guard cannot distinguish two different connection configurations with the same version',
    )
    (out / 'connection-version.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
