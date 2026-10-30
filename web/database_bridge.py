"""Authenticated web management transport for the optional read-only extension."""
import json
import os
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parent.parent
PYTHON=ROOT/'.toolchains/databases/bin/python'
SERVER=ROOT/'web/database/mcp_server.py'

def database_status(workspace=None):
    ready=PYTHON.is_file() and SERVER.is_file()
    chart_ready=(ROOT/'.toolchains/chart-mcp/node_modules/mcp-echarts/build/index.js').is_file() and (ROOT/'.toolchains/chart-mcp/node').is_file()
    state=Path(os.environ.get('CODEX_WEB_DB_STATE',Path(os.environ.get('CODEX_HOME',Path.home()/'.codex'))/'web-databases')).resolve()
    return {'learningVersion':'analysis-publications-v7','ready':ready,'chartReady':chart_ready,'readOnly':True,'mcpName':'codex_web_databases','mcpConfig':{'command':str(PYTHON),'args':[str(SERVER)],'env':{'CODEX_WEB_ANALYSIS_CONTRACT':'analysis-publications-v7','CODEX_WEB_MEMORY_HOME':str(Path(os.environ.get('CODEX_HOME',Path.home()/'.codex')).resolve()),'CODEX_WEB_DB_STATE':str(state),'CODEX_WEB_ANALYSIS_ROOTS':os.environ.get('CODEX_WEB_ANALYSIS_ROOTS',str(workspace or Path.cwd())),'CODEX_WEB_DATA_ORIGINS':os.environ.get('CODEX_WEB_DATA_ORIGINS','https://push2his.eastmoney.com,https://web.ifzq.gtimg.cn')},'enabled':True,'startup_timeout_sec':20,'tool_timeout_sec':90}}

def manage_database(action,payload):
    if not database_status()['ready']:raise ValueError('数据库组件尚未安装，请先运行 web/scripts/install_databases.py。')
    process=subprocess.run([str(PYTHON),str(ROOT/'web/database/worker.py')],input=json.dumps({'action':action,'payload':payload}),text=True,capture_output=True,timeout=100)
    try:result=json.loads(process.stdout)
    except json.JSONDecodeError:raise ValueError('数据库组件未返回有效结果，请检查本机安装。') from None
    if result.get('error'):raise ValueError(result['error'])
    return result['result']
