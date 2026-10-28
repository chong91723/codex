#!/usr/bin/env python3
"""Install the pinned, limited CLI runtime, not the AI MCP distribution.

Requires Java 17+ and Maven. Dependency download is installation-only. Runtime
jobs neither download packages nor execute user-supplied scripts/templates.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--java', default=shutil.which('java'))
    parser.add_argument('--maven', default=shutil.which('mvn'))
    args = parser.parse_args()
    if not args.java or not args.maven:
        parser.error('请安装 Java 17+ 和 Maven，或提供 --java 和 --maven 的绝对路径。')
    java = Path(args.java).resolve()
    target = ROOT / '.toolchains/schema-explorer'
    target.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, JAVA_HOME=str(java.parents[1]))
    with tempfile.TemporaryDirectory(prefix='codex-schema-install-') as folder:
        output = Path(folder) / 'lib'
        subprocess.run([args.maven, '-B', '-q', '-f', str(ROOT / 'web/database/schema-explorer-pom.xml'),
                        'org.apache.maven.plugins:maven-dependency-plugin:3.8.1:copy-dependencies',
                        '-DincludeScope=runtime', '-DoutputDirectory=' + str(output)], env=env, check=True)
        jars = sorted(output.glob('*.jar'))
        if not jars:
            raise SystemExit('没有解析到探索依赖。')
        if any(any(part in jar.name for part in ('scripting', 'graal', 'polyglot', 'schemacrawler-ai')) for jar in jars):
            raise SystemExit('依赖包含未授权的脚本或 AI MCP 模块，未安装。')
        lib = target / 'lib'
        lib.mkdir(exist_ok=True)
        for old in lib.glob('*.jar'):
            old.unlink()
        for jar in jars:
            shutil.copy2(jar, lib / jar.name)
    (target / 'java').unlink(missing_ok=True)
    (target / 'java').symlink_to(java)
    manifest = {'tool': 'SchemaCrawler CLI', 'version': '17.16.0', 'java': str(java),
                'artifacts': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(lib.glob('*.jar'))}}
    (target / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'installed': True, 'tool': manifest['tool'], 'version': manifest['version'],
                      'jarCount': len(manifest['artifacts']), 'jarBytes': sum(p.stat().st_size for p in lib.glob('*.jar'))}))


if __name__ == '__main__':
    main()
