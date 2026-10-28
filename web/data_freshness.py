"""User-set per-source reuse limits; acquisition time is not source event time."""
from datetime import datetime, timezone
import json

CHECKS_VERSION = 'analysis-publication-v2'

def receipt(kind, thread, turn, connection_id=None):
    value = {'kind': kind, 'threadId': thread, 'turnId': turn,
             'retrievedAt': datetime.now(timezone.utc).isoformat()}
    if connection_id:value['connectionId'] = connection_id
    return value

def acquisitions(metadata):
    if metadata.get('acquisition'):return metadata['acquisition']
    # A legacy derived result's creation time cannot date its source inputs.
    dependencies = metadata.get('connectionDependencies') or ([{'id':metadata['connectionId']}] if metadata.get('connectionId') else [])
    return [{'kind': metadata.get('sourceKind', 'database'), 'connectionId': item['id'],
             'threadId': None, 'turnId': None,
             'retrievedAt': None if metadata.get('sourceKind') == 'python' else metadata.get('createdAt')}
            for item in dependencies] or [{'kind':metadata.get('sourceKind','unknown'),
             'threadId':None,'turnId':None,'retrievedAt':metadata.get('createdAt')}]

def merge_acquisitions(values):
    unique = {}
    for value in values:
        for item in acquisitions(value):unique[json.dumps(item, sort_keys=True)] = item
    return list(unique.values())

def check_freshness(values, get_connection, thread, turn, enforce=True, now=None):
    now = now or datetime.now(timezone.utc)
    records, states = {}, []
    for source in merge_acquisitions(values):
        identifier = source.get('connectionId')
        if identifier not in records:records[identifier] = get_connection(identifier) if identifier else {}
        record = records[identifier];limit = record.get('maxAgeMinutes')
        current = bool(turn) and source.get('threadId') == thread and source.get('turnId') == turn
        status = 'notConfigured'
        acquired = None
        try:
            acquired = datetime.fromisoformat(source.get('retrievedAt') or '')
            if acquired.tzinfo is None:acquired = None
        except (ValueError,TypeError):pass
        if limit is not None:
            if limit == 0:status = 'currentTask' if current else 'expired'
            elif acquired is None or acquired > now:status = 'unknown'
            else:status = 'withinLimit' if (now-acquired).total_seconds() <= limit*60 else 'expired'
        value = dict(source, sourceName=record.get('name'), maxAgeMinutes=limit, status=status)
        states.append(value)
        if enforce and status in ('expired','unknown'):
            raise ValueError('数据源“'+record.get('name',identifier or '未知')+'”的快照已超过用户设置的复用时长，或缺少可确认的来源读取时间。请重新查询数据源；重新读取结果或运行 Python 不会刷新来源时间。历史结果仍可在网页查看和下载。')
    return states

def publication_checks(values, get_connection, thread, turn):
    checked = datetime.now(timezone.utc)
    states = check_freshness(values,get_connection,thread,turn,now=checked)
    return {'version':CHECKS_VERSION, 'checkedAt':checked.isoformat(), 'freshness':states,
            'scope':'execution-record-match-only',
            'note':'读取时间不等于源数据更新时间；未设置时效规则的来源不自动判定为最新。'}
