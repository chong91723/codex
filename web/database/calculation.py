"""Preinstalled Python calculations; no host home, credentials or network access."""
import ast
from decimal import Decimal
import json
import os
from pathlib import Path
import resource
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
BWRAP = ROOT/'native/codex-resources/bwrap'
RUNNER = Path(__file__).with_name('python_runner.py')


def run_python(code, datasets, documents, parameters, snapshots, cancellation, timeout=30, thread_id=None):
    cancellation.check()
    if not isinstance(code, str) or not code.strip() or len(code) > 50000:
        raise ValueError('请输入有效的 Python 计算代码。')
    tree = ast.parse(code)
    forbidden = {'matplotlib', 'seaborn', 'plotly', 'bokeh', 'altair', 'pip', 'subprocess', 'ctypes'}
    for node in ast.walk(tree):
        modules = [alias.name for alias in node.names] if isinstance(node, ast.Import) else [node.module or ''] if isinstance(node, ast.ImportFrom) else []
        if any(name.split('.')[0] in forbidden for name in modules):
            raise ValueError('计算环境仅用于数据处理；绘图统一调用 create_chart（ECharts），不能安装依赖或调用其他绘图库。')
    if not BWRAP.is_file():
        raise ValueError('隔离计算组件不可用；未退回宿主机执行 Python。')
    payload = {'code': code, 'datasets': datasets, 'documents': documents, 'parameters': parameters or {}}
    if len(json.dumps(payload, ensure_ascii=False)) > 8*1024*1024:
        raise ValueError('输入文档过大，请分批处理或使用数据库聚合。')
    with tempfile.TemporaryDirectory(prefix='codex-analysis-python-') as scratch:
        task = Path(scratch)
        command = [str(BWRAP), '--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL',
                   '--ro-bind', '/usr', '/usr', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
                   '--ro-bind', str(Path(sys.prefix).resolve()), '/runtime', '--ro-bind', str(RUNNER), '/runner.py',
                   '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--bind', scratch, '/work', '--dir', '/inputs',
                   '--chdir', '/work', '--clearenv', '--setenv', 'HOME', '/work', '--setenv', 'PATH', '/runtime/bin:/usr/bin',
                   '--setenv', 'CODEX_ANALYSIS_THREAD', thread_id or 'independent-test',
                   '--setenv', 'OPENBLAS_NUM_THREADS', '1', '--setenv', 'OMP_NUM_THREADS', '1']
        for identifier in datasets:
            command += ['--ro-bind', str(snapshots.path(identifier)), '/inputs/'+identifier+'.parquet']
        command += ['/runtime/bin/python', '-I', '-B', '/runner.py']
        def limits():
            resource.setrlimit(resource.RLIMIT_CPU, (timeout, timeout+1))
            resource.setrlimit(resource.RLIMIT_AS, (4*1024**3, 4*1024**3))
            resource.setrlimit(resource.RLIMIT_FSIZE, (40*1024**2, 40*1024**2))
            resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
        diagnostics = (task/'stderr.log').open('wb')
        try:
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=diagnostics,
                                       env={'PATH': '/usr/bin:/bin'}, start_new_session=True, preexec_fn=limits)
        except BaseException:
            diagnostics.close()
            raise
        def terminate():
            try:os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:pass
        started = time.monotonic()
        try:
            with cancellation.watch(terminate):
                try:_, error = process.communicate(json.dumps(payload, ensure_ascii=False).encode(), timeout=timeout)
                except subprocess.TimeoutExpired:
                    terminate(); process.communicate()
                    raise ValueError('Python 计算超时，执行进程已终止，未发布结果。') from None
            cancellation.check()
            if process.returncode:
                diagnostics.flush()
                with (task/'stderr.log').open('rb') as source:
                    source.seek(max(0,(task/'stderr.log').stat().st_size-3000))
                    detail = source.read(3000).decode(errors='replace')
                raise ValueError('Python 计算失败，未发布结果：'+detail)
            path = task/'result.json'
            if not path.is_file() or path.is_symlink() or path.stat().st_size > 32*1024*1024:
                raise ValueError('Python 没有返回有效的完整结果。')
            result = json.loads(path.read_text())
            for row in result['rows']:
                for column in result['columns']:
                    if column.get('nativeType') == 'Decimal' and row[column['name']] is not None:
                        row[column['name']] = Decimal(row[column['name']])
            result['elapsedMs'] = round((time.monotonic()-started)*1000)
            return result
        finally:
            if process.poll() is None:terminate()
            process.wait()
            if process.stdin and not process.stdin.closed:process.stdin.close()
            diagnostics.close()
