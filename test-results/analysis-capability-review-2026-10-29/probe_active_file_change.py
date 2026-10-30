"""Actual isolated Python computation; FIFO coordination only, synthetic CSV.

No model, real database or production service. Original files are modified only
inside a temporary test directory. Product code and isolation remain unchanged.
"""
from pathlib import Path
import json
import os
import sys
import tempfile
import threading
from unittest.mock import patch

sys.path[:0] = ['/root/Codex/web/tests', '/root/Codex/web/database', '/root/Codex/web']
import calculation
from test_analysis_evidence import EvidenceTests


case = EvidenceTests('test_local_file_import_and_raw_json_computation_have_real_source_metadata')
case.setUp()
try:
    original = Path(case.temp.name) / 'input.csv'
    original.write_text('amount\n1.20\n2.30\n')
    with patch.dict(os.environ, {'CODEX_WEB_ANALYSIS_ROOTS': case.temp.name}):
        imported = case.tools.import_file(str(original))

    real_popen = calculation.subprocess.Popen
    observations = []
    failures = []
    watchers = []

    def coordinated_popen(command, *args, **kwargs):
        scratch = Path(command[command.index('--bind') + 1])
        os.mkfifo(scratch / 'ready')
        os.mkfifo(scratch / 'release')
        process = real_popen(command, *args, **kwargs)

        def edit_while_runner_is_active():
            try:
                with (scratch / 'ready').open() as ready:
                    marker = ready.read(1)
                assert marker == 'R'
                assert process.poll() is None
                original.write_text('amount\n10.00\n20.00\n')
                observations.append({'pythonProcessActiveAtEdit': True, 'sourceChangedAfterDocumentsParsed': True})
                with (scratch / 'release').open('w') as release:
                    release.write('G')
            except BaseException as error:
                failures.append(repr(error))

        watcher = threading.Thread(target=edit_while_runner_is_active, daemon=True)
        watchers.append(watcher)
        watcher.start()
        return process

    code = """with open('/work/ready', 'w') as ready:
    ready.write('R')
with open('/work/release') as release:
    release.read(1)
result=[{'value':sum(Decimal(row['amount']) for row in documents[parameters['doc']])}]
"""
    with patch.object(calculation.subprocess, 'Popen', side_effect=coordinated_popen):
        old_result = case.compute(code, document_ids=[imported['documentId']], parameters={'doc': imported['documentId']})
    for watcher in watchers:
        watcher.join(timeout=5)
        assert not watcher.is_alive()
    assert not failures, failures
    old_value = case.gateway.result(old_result['resultId'])['rows'][0]['value']
    assert old_value == '3.50'
    published = case.tools.publish('合计 {{v}}', {'v': case.ref(old_result)})
    assert published['text'] == '合计 3.50'

    with patch.dict(os.environ, {'CODEX_WEB_ANALYSIS_ROOTS': case.temp.name}):
        reimported = case.tools.import_file(str(original))
    assert reimported['documentId'] != imported['documentId']
    compute_code = "result=[{'value':sum(Decimal(row['amount']) for row in documents[parameters['doc']])}]"
    new_result = case.compute(compute_code, document_ids=[reimported['documentId']], parameters={'doc': reimported['documentId']})
    new_value = case.gateway.result(new_result['resultId'])['rows'][0]['value']
    assert new_value == '30.00'

    original.unlink()
    old_after_delete = case.compute(compute_code, document_ids=[imported['documentId']], parameters={'doc': imported['documentId']})
    old_after_delete_value = case.gateway.result(old_after_delete['resultId'])['rows'][0]['value']
    assert old_after_delete_value == '3.50'

    saved_path = case.evidence.path('documents', 'thread-A', imported['documentId'])
    saved = json.loads(saved_path.read_text())
    saved['text'] = 'amount\n999.00\n'
    saved_path.write_text(json.dumps(saved))
    try:
        case.compute(compute_code, document_ids=[imported['documentId']], parameters={'doc': imported['documentId']})
    except ValueError as error:
        assert '指纹' in str(error)
        snapshot_tamper_rejected = True
    else:
        raise AssertionError('Expected copied document integrity check to reject tampering')

    evidence = {
        'scope': 'Actual import/calculate/publish code, actual bwrap Python runner; synthetic CSV in temporary directory; FIFO only synchronizes edit timing; no model, database, browser or service restart',
        'observations': observations,
        'originalEditAllowedWhilePythonActive': True,
        'oldImportedDocumentComputation': old_value,
        'oldResultPublicationAfterOriginalChanged': published['text'],
        'reimportGeneratedNewDocumentId': True,
        'reimportedDocumentComputation': new_value,
        'oldDocumentStillUsableAfterOriginalDeleted': old_after_delete_value,
        'copiedDocumentTamperRejected': snapshot_tamper_rejected,
        'concurrentOriginalReadConsistency': 'Not tested; source code has size checks but no atomic version/mtime or file lock protocol',
        'classification': 'Snapshot isolation works after import; original-file edits are not tracked as latest-source invalidation',
    }
    output = Path('/tmp/codex-file-lifecycle-review-20261029/file-change.json')
    output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    print(output.read_text())
finally:
    case.doCleanups()
