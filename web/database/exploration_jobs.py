"""User-started preparation jobs. The existing service profile is the boundary.

This is a durable task runner, not an agent loop or a tenant authorization layer.
Only management requests can start/cancel jobs; MCP only reads saved results.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import threading
import time

from cancellation import Cancellation, Cancelled
from database_knowledge import DatabaseKnowledge, now, require
from service import Gateway

ACTIVE = ('queued', 'running', 'cancelling')
MAX_SECONDS = 120


def process_identity(pid):
    try:
        # starttime distinguishes PID reuse; a zombie cannot finish a job.
        value = Path(f'/proc/{int(pid)}/stat').read_text().rsplit(')', 1)[1].split()
        return None if value[0] == 'Z' else value[19]
    except (OSError, ValueError, IndexError, TypeError):
        return None


class ExplorationJobs:
    def __init__(self, gateway):
        self.gateway, self.store = gateway, gateway.store
        self.knowledge = DatabaseKnowledge(gateway)
        with self.store.connect() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS database_exploration_jobs
              (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, status TEXT NOT NULL, record TEXT NOT NULL);
              CREATE UNIQUE INDEX IF NOT EXISTS one_active_database_exploration
              ON database_exploration_jobs(source_id) WHERE status IN ('queued','running','cancelling');''')

    def _get(self, source_id, job_id=None):
        with self.store.connect() as db:
            row = db.execute('SELECT record FROM database_exploration_jobs WHERE source_id=?' +
                             (' AND id=?' if job_id else ' ORDER BY rowid DESC LIMIT 1'),
                             (source_id, job_id) if job_id else (source_id,)).fetchone()
        require(row is not None or job_id is None, '探索任务不属于此数据源。')
        return json.loads(row[0]) if row else None

    def update(self, job_id, **changes):
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT record FROM database_exploration_jobs WHERE id=?', (job_id,)).fetchone()
            require(row, '探索任务不存在。')
            record = json.loads(row[0])
            if record['status'] not in ACTIVE:
                return record
            record.update(changes, updatedAt=now())
            db.execute('UPDATE database_exploration_jobs SET status=?,record=? WHERE id=?',
                       (record['status'], json.dumps(record, ensure_ascii=False), job_id))
            return record

    @staticmethod
    def public(record):
        if not record:
            return None
        value = {k: v for k, v in record.items() if k not in ('pid', 'processIdentity', 'expectedRevision', 'createdEpoch')}
        if 'report' in value:
            value['report'] = {k: v for k, v in value['report'].items() if k != 'findings'}
        return value

    def status(self, source_id, job_id=None):
        # Re-check current availability on every request, including downloads.
        self.gateway.store.get(source_id)
        record = self._get(source_id, job_id)
        return self.public(self.refresh_record(record))

    def refresh_record(self, record):
        if record and record['status'] in ACTIVE:
            dead = record.get('pid') and process_identity(record['pid']) != record.get('processIdentity')
            abandoned = not record.get('pid') and time.time() - record['createdEpoch'] > 15
            if dead or abandoned:
                record = self.update(record['id'], status='failed', stage='failed',
                                     error='探索进程已退出，未完成的结果未替换已有资料。请重新探索。', completedAt=now())
        return record

    def start(self, source_id, expected_revision):
        self.gateway.require(source_id)
        state = self.knowledge.state(source_id)
        require(type(expected_revision) is int and state['revision'] == expected_revision, '资料已经更新，请刷新后重新探索。')
        # Reclaim dead jobs across this service profile before applying its
        # quota, so a crash on another source cannot permanently exhaust it.
        with self.store.connect() as db:
            active_records = [json.loads(row[0]) for row in db.execute("SELECT record FROM database_exploration_jobs WHERE status IN ('queued','running','cancelling')")]
        for active in active_records:
            self.refresh_record(active)
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            active = db.execute("SELECT record FROM database_exploration_jobs WHERE source_id=? AND status IN ('queued','running','cancelling')", (source_id,)).fetchone()
            if active:
                return self.public(json.loads(active[0]))
            count = db.execute("SELECT COUNT(*) FROM database_exploration_jobs WHERE status IN ('queued','running','cancelling')").fetchone()[0]
            require(count < 2, '当前已有探索任务运行，请稍后重试；未重复提交或启动额外进程。')
            record = dict(id=secrets.token_hex(16), sourceId=source_id, sourceVersion=state['sourceVersion'],
                          status='queued', stage='queued', message='等待执行', createdAt=now(), updatedAt=now(),
                          createdEpoch=time.time(), expectedRevision=expected_revision)
            db.execute('INSERT INTO database_exploration_jobs VALUES (?,?,?,?)',
                       (record['id'], source_id, record['status'], json.dumps(record)))
        folder = self.store.directory / 'exploration' / record['id']
        folder.mkdir(parents=True, mode=0o700)
        env = {k: os.environ[k] for k in ('PATH', 'LANG', 'LC_ALL', 'CODEX_WEB_SCHEMACRAWLER_HOME') if k in os.environ}
        env.update(CODEX_WEB_DB_STATE=str(self.store.directory), HOME=str(folder), PYTHONDONTWRITEBYTECODE='1')
        try:
            # Credentials are resolved from this profile by the child, never
            # put in argv or returned in the management response.
            with (folder / 'worker.log').open('wb') as log:
                (folder / 'worker.log').chmod(0o600)
                process = subprocess.Popen([sys.executable, '-B', str(Path(__file__).resolve()), source_id, record['id']],
                                           stdin=subprocess.DEVNULL, stdout=log, stderr=log, env=env,
                                           cwd=folder, start_new_session=True)
            identity = process_identity(process.pid)
            self.update(record['id'], pid=process.pid, processIdentity=identity)
        except Exception:
            self.update(record['id'], status='failed', stage='failed', error='无法启动探索进程，请检查运行目录和依赖。', completedAt=now())
            raise
        return self.status(source_id, record['id'])

    def cancel(self, source_id, job_id):
        self.gateway.store.get(source_id)
        record = self._get(source_id, job_id)
        if record['status'] in ACTIVE:
            record = self.update(job_id, status='cancelling', message='正在取消，等待数据库和探索工具退出')
        return self.public(record)

    def run(self, source_id, job_id):
        cancellation = self.gateway.cancel
        record = self._get(source_id, job_id)
        stop = threading.Event()
        started = time.monotonic()

        def monitor():
            while not stop.wait(.2):
                try:
                    current = self._get(source_id, job_id)
                    source = self.store.get(source_id)
                    if current['status'] == 'cancelling' or not source['enabled'] or source['version'] != record['sourceVersion'] or time.monotonic() - started > MAX_SECONDS:
                        cancellation.cancel()
                        return
                except Exception:
                    cancellation.cancel()
                    return

        thread = threading.Thread(target=monitor, daemon=True)
        thread.start()
        try:
            require(record['status'] in ACTIVE, '探索任务已结束。')
            if record['status'] == 'cancelling':
                raise Cancelled()
            require(self.gateway.require(source_id)['version'] == record['sourceVersion'], '连接已变化，请重新发起探索。')
            self.update(job_id, status='running', stage='metadata', message='读取库表、字段和声明的关系')
            from metadata_catalog import collect_metadata
            catalog = collect_metadata(self.gateway, source_id)
            require(catalog['sourceVersion'] == record['sourceVersion'], '探索期间连接已变化，未保存旧任务资料。')
            cancellation.check()
            self.update(job_id, stage='analysis', message='执行结构检查和关联分析',
                        tableCount=len(catalog['tables']), columnCount=sum(len(t['columns']) for t in catalog['tables']))
            from schema_explorer import enhance_catalog
            enhancement = enhance_catalog(self.gateway.require(source_id), catalog,
                                          self.store.directory / 'exploration' / job_id, cancellation)
            cancellation.check()
            self.update(job_id, stage='saving', message='保存资料供当前及新会话使用')
            # Commit checks the original revision/config. Failed/cancelled jobs
            # never replace the last complete catalog.
            def commit_guard(database):
                row = database.execute('SELECT status FROM database_exploration_jobs WHERE id=?', (job_id,)).fetchone()
                if not row or row[0] == 'cancelling':
                    raise Cancelled()
            state = self.knowledge.scan(source_id, record['expectedRevision'], catalog=catalog,
                                        exploration=enhancement, commit_guard=commit_guard)
            self.update(job_id, status='completed', stage='completed', message='探索完成，已可用于对话分析',
                        snapshotId=state['snapshot']['id'], report=enhancement,
                        durationSeconds=round(time.monotonic() - started, 3), completedAt=now())
        except Exception as error:
            timeout = time.monotonic() - started > MAX_SECONDS
            cancelled = isinstance(error, Cancelled) and not timeout
            message = '探索超出执行预算，未覆盖已有资料。' if timeout else str(error)
            try:
                password = self.store.get(source_id).get('password')
                if password:
                    message = message.replace(password, '[已隐藏]')
            except ValueError:
                pass
            self.update(job_id, status='cancelled' if cancelled else 'failed', stage='cancelled' if cancelled else 'failed',
                        error=message[:1000], message='已取消探索' if cancelled else '探索失败，已有资料保留', completedAt=now())
        finally:
            stop.set()
            thread.join(timeout=1)


if __name__ == '__main__':
    ExplorationJobs(Gateway()).run(sys.argv[1], sys.argv[2])
