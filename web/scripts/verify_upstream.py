#!/usr/bin/env python3
"""Verify source integrity and compare native methods with upstream exports."""
import argparse
import ctypes
import ctypes.util
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[2]


def source_exports():
    lib=ctypes.CDLL(ctypes.util.find_library('zstd') or 'libzstd.so.1')
    lib.ZSTD_decompress.argtypes=[ctypes.c_void_p,ctypes.c_size_t,ctypes.c_void_p,ctypes.c_size_t]
    lib.ZSTD_decompress.restype=ctypes.c_size_t
    compressed=(ROOT/'upstream/codex-rs/app-server-protocol/schema/precomputed/app-server-exports-experimental.json.zst').read_bytes()
    output=ctypes.create_string_buffer(64*1024*1024)
    length=lib.ZSTD_decompress(output,len(output),compressed,len(compressed))
    if length>=len(output):
        raise RuntimeError('Could not decompress source protocol exports')
    return json.loads(output.raw[:length])['json_schema']


def methods(schema):
    return {entry['properties']['method']['enum'][0] for entry in schema['oneOf']}


def verify(codex=None):
    upstream=ROOT/'upstream'
    lock=json.loads((ROOT/'upstream-lock.json').read_text())
    commit=subprocess.check_output(['git','-C',str(upstream),'rev-parse','HEAD'],text=True).strip()
    dirty=subprocess.check_output(['git','-C',str(upstream),'status','--porcelain','--untracked-files=all'],text=True).strip()
    if dirty or commit!=lock['sourceCommit']:
        raise RuntimeError('Upstream source differs from the locked pristine commit')
    result={'sourceCommit':commit,'pristine':True}
    if codex:
        provenance=json.loads((ROOT/'native/provenance.json').read_text())
        if provenance['sourceCommit']!=commit:
            raise RuntimeError('Native binary was built from another commit')
        for name,digest in provenance['sha256'].items():
            with (ROOT/'native/bin'/name).open('rb') as file:
                if hashlib.file_digest(file,'sha256').hexdigest()!=digest:
                    raise RuntimeError('Native binary hash mismatch: '+name)
        with tempfile.TemporaryDirectory(prefix='codex-web-verify-')as output:
            subprocess.run([str(codex),'app-server','generate-json-schema','--experimental','--out',output],check=True)
            native=json.loads((Path(output)/'ClientRequest.json').read_text())
        source=json.loads(source_exports()['ClientRequest.json'])
        missing=sorted(methods(source)-methods(native));extra=sorted(methods(native)-methods(source))
        result.update(sourceMethodCount=len(methods(source)),nativeMethodCount=len(methods(native)),missing=missing,extra=extra)
        if missing or extra:
            raise RuntimeError('Native/source protocol mismatch: '+json.dumps(result))
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--native',action='store_true');args=parser.parse_args()
    print(json.dumps(verify(ROOT/'native/bin/codex'if args.native else None),indent=2))
