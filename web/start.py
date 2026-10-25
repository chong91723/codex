#!/usr/bin/env python3
"""Launch with existing Codex config, or an isolated native DeepSeek profile."""
import argparse
import getpass
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def deepseek_profile(state_dir):
    source = ROOT.parent / 'upstream' / 'codex-rs' / 'models-manager' / 'models.json'
    if not source.is_file():
        raise SystemExit('Missing upstream submodule. Run: git submodule update --init')
    # Derive from the Apache-licensed source catalog. No provider prompt is copied.
    catalog = json.loads(source.read_text())
    model = next((m for m in catalog['models'] if m.get('slug') == 'gpt-6-sol'), catalog['models'][0]).copy()
    model.update(slug='deepseek-flash', display_name='DeepSeek Flash', description='DeepSeek native Responses API',
                 prefer_websockets=False, tool_mode=None, use_responses_lite=False, shell_type='shell_command',
                 context_window=1048576, max_context_window=1048576, default_reasoning_level='high',
                 supports_search_tool=False, web_search_tool_type='text',
                 experimental_supported_tools=[], default_service_tier=None, service_tiers=[],
                 supported_reasoning_levels=[{'effort':v,'description':v} for v in ['low','high','max']])
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    catalog_path = state_dir / 'models.json'
    catalog_path.write_text(json.dumps({'models':[model]}, ensure_ascii=False))
    config_path = state_dir / 'config.toml'
    if not config_path.exists():
        config_path.write_text('\n'.join([
            'model = "deepseek-flash"', 'model_provider = "deepseek"', 'model_reasoning_effort = "high"',
            'web_search = "disabled"', 'sandbox_mode = "workspace-write"', 'approval_policy = "on-request"',
            'model_catalog_json = ' + json.dumps(str(catalog_path)),
            '[model_providers.deepseek]', 'name = "DeepSeek"', 'base_url = "https://api.deepseek.com/"',
            'wire_api = "responses"', 'env_key = "DEEPSEEK_API_KEY"', 'requires_openai_auth = false',
            'supports_websockets = false', 'request_max_retries = 0', 'stream_max_retries = 0', '',
        ]))
    return state_dir


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deepseek',action='store_true',help='Use an isolated native DeepSeek configuration')
    parser.add_argument('--state-dir',type=Path,default=ROOT.parent/'.local-state'/'deepseek')
    args,extra=parser.parse_known_args()
    child_env=os.environ.copy()
    native=ROOT.parent/'native'/'bin'/'codex'
    if native.is_file():
        child_env.setdefault('CODEX_BIN',str(native))
    if args.deepseek:
        profile=deepseek_profile(args.state_dir.resolve())
        key=child_env.get('DEEPSEEK_API_KEY') or getpass.getpass('DeepSeek API key (not saved): ')
        if not key:
            raise SystemExit('An API key is required')
        child_env['DEEPSEEK_API_KEY']=key
        child_env['CODEX_HOME']=str(profile)
    process=subprocess.Popen([sys.executable,str(ROOT/'server.py'),*extra],env=child_env)
    try:
        raise SystemExit(process.wait())
    except KeyboardInterrupt:
        process.send_signal(2)
        process.wait()


if __name__=='__main__':
    main()
