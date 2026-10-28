"""Run the fictional metric demo using only owned isolated services.

Real PostgreSQL, native app-server, web and MCP tools. Transcript rendering uses
explicit UI fixtures; this script never sends a model request or reads credentials.
"""
from pathlib import Path
import json
import os
import signal
import socket
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results/metric-governance-2026-10-28'
OUT.mkdir(parents=True, exist_ok=True)
NAME = 'codex-metric-demo-' + str(os.getpid())
container_started = False
process = None


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def stop_process():
    if process is not None and process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=10)


try:
    with tempfile.TemporaryDirectory(prefix='codex-metric-demo-') as directory:
        web_port, pg_port = port(), port()
        home = Path(directory) / 'home'
        home.mkdir()
        (home / 'config.toml').write_text(
            'model="deepseek-flash"\nmodel_provider="deepseek"\n'
            'cli_auth_credentials_store="ephemeral"\n'
            '[model_providers.deepseek]\nname="DeepSeek"\n'
            'base_url="https://api.deepseek.com"\nwire_api="responses"\n'
            'env_key="DEEPSEEK_API_KEY"\n'
        )
        subprocess.run([
            'docker', 'run', '--rm', '--pull=never', '-d', '--name', NAME,
            '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=fixture',
            '-p', f'127.0.0.1:{pg_port}:5432', 'postgres:17'
        ], check=True, capture_output=True)
        container_started = True
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            ready = subprocess.run([
                'docker', 'exec', NAME, 'pg_isready', '-h', '127.0.0.1',
                '-U', 'postgres', '-d', 'fixture'
            ], capture_output=True)
            if ready.returncode == 0:
                break
            time.sleep(.1)
        else:
            raise RuntimeError('Owned demo PostgreSQL did not become ready')
        seeded = subprocess.run([
            'docker', 'exec', '-i', NAME, 'psql', '-h', '127.0.0.1',
            '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'fixture'
        ], input=(ROOT / 'examples/metric-governance/seed.sql').read_text(),
            text=True, capture_output=True)
        (OUT / 'seed.log').write_text(seeded.stdout + seeded.stderr)
        seeded.check_returncode()
        env = {
            'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
            'CODEX_TEST_HOME': str(home),
            'CODEX_WEB_URL': f'http://127.0.0.1:{web_port}',
            'CODEX_METRIC_PG_PORT': str(pg_port),
            'PLAYWRIGHT_MODULE': str(ROOT / '.toolchains/playwright/node_modules/playwright/index.mjs'),
            'CHROMIUM_BIN': str(ROOT / '.toolchains/playwright-browsers/chromium-1248/chrome-linux64/chrome'),
            'REPORT_DIR': str(OUT / 'browser'),
        }
        with (OUT / 'browser-run.txt').open('w') as log:
            process = subprocess.Popen([
                str(ROOT / '.toolchains/node24/bin/node'),
                'web/tests/metric_demo_desktop.mjs'
            ], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT,
                start_new_session=True)
            try:
                process.wait(timeout=300)
            finally:
                stop_process()
        print(json.dumps({'browserExitCode': process.returncode,
                          'modelRequests': 0, 'fixtureBusinessDataOnly': True}))
        if process.returncode:
            print((OUT / 'browser-run.txt').read_text()[-6000:])
            raise SystemExit(process.returncode)
finally:
    stop_process()
    stopped = False
    if container_started:
        stopped = subprocess.run(['docker', 'stop', NAME], capture_output=True).returncode == 0
    (OUT / 'integration-cleanup.json').write_text(json.dumps({
        'ownedPostgresStarted': container_started,
        'ownedPostgresStopped': stopped,
        'temporaryRuntimeRemovedOnExit': True,
        'user8765Restarted': False,
        'modelRequests': 0,
        'businessData': 'fictional isolated fixture only'
    }, indent=2) + '\n')
