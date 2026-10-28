"""Bounded, fixed-command SchemaCrawler integration; no arbitrary MCP/shell API."""
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import signal
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
VERSION = '17.16.0'
MAX_REPORT_BYTES = 8 * 1024 * 1024
LINTERS = ('LinterColumnTypes', 'LinterForeignKeyMismatch', 'LinterForeignKeyWithNoIndexes',
           'LinterNullColumnsInIndex', 'LinterNullIntendedColumns', 'LinterRedundantIndexes',
           'LinterTableWithNoPrimaryKey', 'LinterTableWithNoRemarks')


def runtime():
    home = Path(os.environ.get('CODEX_WEB_SCHEMACRAWLER_HOME', ROOT / '.toolchains/schema-explorer')).resolve()
    if not (home / 'java').is_file() or not (home / 'manifest.json').is_file():
        raise ValueError('SchemaCrawler 尚未安装，请维护人员运行 web/scripts/install_schema_explorer.py；已有资料仍保留。')
    manifest = json.loads((home / 'manifest.json').read_text())
    if manifest.get('version') != VERSION or not isinstance(manifest.get('artifacts'), dict):
        raise ValueError('探索工具版本不匹配，请重新安装固定版本。')
    jars = {p.name: p for p in (home / 'lib').glob('*.jar')}
    if set(jars) != set(manifest['artifacts']) or any(hashlib.sha256(jars[name].read_bytes()).hexdigest() != value for name, value in manifest['artifacts'].items()):
        raise ValueError('探索工具依赖校验失败，未执行不匹配的组件。')
    return home


def stop(process):
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=3)
        except ProcessLookupError:
            pass


def run_command(args, folder, env, name, cancellation):
    output, log = folder / (name + ('.json' if name == 'lint' else '.txt')), folder / (name + '.log')
    started = time.monotonic()
    with log.open('wb') as stream:
        log.chmod(0o600)
        process = subprocess.Popen(args + ['--command=' + name, '--output-format=' + ('json' if name == 'lint' else 'text'),
                                          '--output-file=' + output.name], cwd=folder, env=env,
                                   stdin=subprocess.DEVNULL, stdout=stream, stderr=stream, start_new_session=True)
        try:
            with cancellation.watch(lambda: stop(process)):
                while process.poll() is None:
                    cancellation.check()
                    if time.monotonic() - started > 45:
                        raise ValueError('探索工具执行超时，未覆盖已有资料。')
                    if any(p.exists() and p.stat().st_size > MAX_REPORT_BYTES for p in (output, log)):
                        raise ValueError('探索报告超过预算，请缩小数据源配置范围。')
                    try:
                        process.wait(timeout=.1)
                    except subprocess.TimeoutExpired:
                        pass
                cancellation.check()
                if process.returncode:
                    detail = log.read_text(errors='replace')[-1800:]
                    password = env.get('CODEX_DB_PASSWORD')
                    if password:
                        detail = detail.replace(password, '[已隐藏]')
                    raise ValueError('SchemaCrawler 执行失败：' + detail)
        finally:
            stop(process)
    if not output.is_file() or output.stat().st_size > MAX_REPORT_BYTES:
        raise ValueError('探索工具未生成完整、预算内的报告。')
    output.chmod(0o600)
    return output


def normalize_lints(value, catalog):
    if not isinstance(value, dict) or not isinstance(value.get('lints'), list):
        raise ValueError('SchemaCrawler 检查报告格式不匹配。')
    names = {table['name'] for table in catalog['tables']}
    findings = []
    for item in value['lints']:
        if not isinstance(item, dict) or not all(k in item for k in ('linter-id', 'object-key', 'message', 'severity')):
            raise ValueError('探索检查项字段不完整。')
        key = item['object-key'].get('key', [])
        table = key[2] if len(key) >= 3 else None
        if table is not None and table not in names:
            raise ValueError('探索工具返回了配置范围以外的表。')
        findings.append(dict(kind='structural_check', table=table, severity=item['severity'],
                             rule=item['linter-id'].rsplit('.', 1)[-1], message=item['message'],
                             detail=item.get('value'), interpretation='工具检查建议，不表示业务错误或已确认口径。'))
    return findings


def table_labels(catalog):
    labels = {}
    def forms(value):
        return (value, '"' + value.replace('"', '""') + '"', '`' + value.replace('`', '``') + '`')
    for table in catalog['tables']:
        namespaces = [str(table.get('namespace') or '')]
        if catalog.get('database') and catalog.get('namespace'):
            namespaces.append(str(catalog['database']) + '.' + str(catalog['namespace']))
        for prefix in namespaces:
            for prefix_form in forms(prefix):
                for name in forms(table['name']):
                    labels[prefix_form + '.' + name] = table['name']
    return labels


def verify_schema_report(report, catalog):
    labels, seen = table_labels(catalog), set()
    for line in report.splitlines():
        if re.search(r'\[(?:table|view|materialized view|partitioned table|foreign table)\]\s*$', line):
            label = re.sub(r'\s+\[[^]]+\]\s*$', '', line).strip()
            if label not in labels:
                raise ValueError('探索工具的对象范围与当前数据源不一致，未保存不匹配的增强结果。')
            seen.add(labels[label])
    if seen != {t['name'] for t in catalog['tables']}:
        raise ValueError('探索工具未覆盖当前采集的全部对象，未将空报告或部分报告当作成功。')


def inferred_associations(report, catalog):
    """Retain upstream's labeled text, without guessing SQL identifiers/keys.

    A relation may have one observation at each end. These are table-scoped
    observations, not a count of unique relationships or business validation.
    """
    labels = table_labels(catalog)
    table, pending, findings = None, False, []
    for line in report.splitlines():
        if re.search(r'\[(?:table|view|materialized view)\]\s*$', line):
            label = re.sub(r'\s+\[[^]]+\]\s*$', '', line).strip()
            table = labels.get(label)
            pending = False
        elif '[implicit association]' in line:
            pending = True
        elif pending and '~~' in line:
            if table is not None:
                findings.append(dict(kind='inferred_association', table=table, severity='hypothesis',
                                     rule='SchemaCrawlerImplicitAssociation', message='工具推测的关联', detail=line.strip(),
                                     interpretation='由工具依据命名等规则推测，未经业务确认或数据验证，不能当作声明外键。'))
            pending = False
    return findings


def enhance_catalog(source, catalog, folder, cancellation):
    started = time.monotonic()
    if source['engine'] not in ('mysql', 'postgresql'):
        return dict(tool='native metadata adapter', version='1', mode='engine_specific', findingCount=0, findings=[],
                    note='此引擎保留现有专用结构采集；SchemaCrawler 增强尚未适配，不伪装为已执行。')
    home = runtime()
    folder = Path(folder).resolve()
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    if source['engine'] == 'mysql' and source.get('tls') and source.get('caFile'):
        raise ValueError('当前 SchemaCrawler 增强尚未适配 MySQL 自定义 CA；原有只读查询不受影响，不会降级 TLS。')
    namespace = source['database'] if source['engine'] == 'mysql' else source['schema']
    args = [str(home / 'java'), '-Xms32m', '-Xmx256m', '-cp', str(home / 'lib/*'), 'schemacrawler.Main',
            '--server=' + source['engine'], '--host=' + source['host'], '--port=' + str(source['port']),
            '--database=' + source['database'], '--user:env=CODEX_DB_USER', '--password:env=CODEX_DB_PASSWORD',
            '--schemas=^' + re.escape(namespace) + '$', '--info-level=standard', '--implicit-associations=true', '--log-level=WARNING']
    if source['engine'] == 'mysql':
        args.append('--urlx=sslMode=' + ('VERIFY_IDENTITY' if source.get('tls') and source.get('verifyTls', True) else 'REQUIRED' if source.get('tls') else 'DISABLED'))
        if not source.get('tls'):
            args.append('--urlx=allowPublicKeyRetrieval=true')
    else:
        args.append('--urlx=sslmode=' + ('verify-full' if source.get('tls') and source.get('verifyTls', True) else 'require' if source.get('tls') else 'disable'))
        if source.get('caFile'):
            args.append('--urlx=sslrootcert=' + source['caFile'])
    # Only fixed structural linters. No COUNT/table sampling or arbitrary SQL
    # linters run as part of automatic preparation.
    config = folder / 'linters.yaml'
    config.write_text('\n'.join('- id: schemacrawler.tools.linter.' + name for name in LINTERS) + '\n')
    config.chmod(0o600)
    env = {k: os.environ[k] for k in ('PATH', 'LANG', 'LC_ALL') if k in os.environ}
    env.update(HOME=str(folder), SC_LOAD_MAX_THREADS='2', SC_LOAD_TIMEOUT_SECONDS='35',
               CODEX_DB_USER=source['username'], CODEX_DB_PASSWORD=source.get('password', ''))
    schema = run_command(args, folder, env, 'schema', cancellation)
    schema_text = schema.read_text()
    verify_schema_report(schema_text, catalog)
    lint = run_command(args + ['--linter-configs=' + str(config), '--run-all-linters=false'], folder, env, 'lint', cancellation)
    findings = normalize_lints(json.loads(lint.read_text()), catalog)
    inferred = inferred_associations(schema_text, catalog)
    findings.extend(inferred)
    cancellation.check()
    return dict(tool='SchemaCrawler CLI', version=VERSION, mode='schema_and_structural_lint',
                findingCount=len(findings), inferredAssociationObservations=len(inferred),
                severityCounts=dict(Counter(item['severity'] for item in findings)), findings=findings,
                schemaReportSha256=hashlib.sha256(schema.read_bytes()).hexdigest(), lintReportSha256=hashlib.sha256(lint.read_bytes()).hexdigest(),
                durationSeconds=round(time.monotonic() - started, 3), peakChildRssKiB=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
                businessRowsSampled=False, note='结构检查属于建议；推测关联不能作为声明外键或业务事实。未执行全表画像。')
