#!/usr/bin/env python3
"""Fetch the exact V8 archive/bindings pinned by upstream MODULE.bazel.

The Codex CI uses Codex-built sandbox artifacts, rather than Deno's release
artifacts. Checksums and URLs are read from pristine upstream source.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.request

ROOT=Path(__file__).resolve().parents[2]


def download(url,destination,expected):
    def valid(path):
        if not path.is_file():return False
        with path.open('rb')as file:return hashlib.file_digest(file,'sha256').hexdigest()==expected
    if valid(destination):return destination
    destination.parent.mkdir(parents=True,exist_ok=True)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(urllib.request.Request(url,method='HEAD'),timeout=12)as response:
            size=int(response.headers.get('Content-Length','0'));final_url=response.url
    except Exception:
        # Same official asset via GitHub's asset API when the web endpoint stalls.
        match=re.fullmatch(r'https://github.com/([^/]+/[^/]+)/releases/download/([^/]+)/([^/]+)',url)
        if not match:raise
        repo,tag,name=match.groups()
        with opener.open(f'https://api.github.com/repos/{repo}/releases/tags/{tag}',timeout=60)as response:release=json.load(response)
        asset=next(item for item in release['assets']if item['name']==name)
        request=urllib.request.Request(f'https://api.github.com/repos/{repo}/releases/assets/{asset["id"]}',method='HEAD',headers={'Accept':'application/octet-stream'})
        with opener.open(request,timeout=60)as response:
            size=asset['size'];final_url=response.url
    chunk_size=2*1024*1024
    def chunk(index):
        begin=index*chunk_size;end=min(size,begin+chunk_size)-1
        target=destination.with_suffix(destination.suffix+'.part'+str(index))
        if target.is_file()and target.stat().st_size==end-begin+1:return target
        request=urllib.request.Request(final_url,headers={'Range':f'bytes={begin}-{end}'})
        with opener.open(request,timeout=120)as response:
            if response.status!=206:raise RuntimeError('Server did not honor byte ranges')
            with target.open('wb')as file:
                while block:=response.read(256*1024):file.write(block)
        if target.stat().st_size!=end-begin+1:raise RuntimeError('Incomplete V8 artifact range')
        return target
    temp=destination.with_suffix(destination.suffix+'.download')
    if size>chunk_size:
        print('Downloading pinned V8 artifact '+destination.name,flush=True)
        with ThreadPoolExecutor(max_workers=8)as pool:parts=list(pool.map(chunk,range((size+chunk_size-1)//chunk_size)))
        with temp.open('wb')as file:
            for part in parts:
                with part.open('rb')as source:
                    while block:=source.read(1024*1024):file.write(block)
    else:
        with opener.open(final_url,timeout=120)as response,temp.open('wb')as file:
            while block:=response.read(256*1024):file.write(block)
        parts=[]
    if not valid(temp):raise RuntimeError('Upstream-pinned V8 checksum mismatch: '+destination.name)
    temp.replace(destination)
    for part in parts:part.unlink()
    return destination


def prepare():
    module=(ROOT/'upstream/MODULE.bazel').read_text()
    # The repository's build host is Linux x86_64; select its exact GNU target.
    paths={}
    for kind in ['archive','binding']:
        pattern=r'http_file\(\s*name = "rusty_v8_[^"]*_x86_64_unknown_linux_gnu_'+kind+r'",([\s\S]*?)\n\)'
        match=re.search(pattern,module)
        if not match:raise RuntimeError('Could not find the native V8 '+kind+' pin in upstream MODULE.bazel')
        block=match.group(1);name=re.search(r'downloaded_file_path = "([^"]+)"',block).group(1)
        digest=re.search(r'sha256 = "([a-f0-9]+)"',block).group(1);url=re.search(r'https://[^"\s]+',block).group(0)
        paths[kind]=download(url,ROOT/'.toolchains/v8'/name,digest)
    return {'RUSTY_V8_ARCHIVE':str(paths['archive']),'RUSTY_V8_SRC_BINDING_PATH':str(paths['binding'])}


if __name__=='__main__':
    for key,value in prepare().items():print(key+'='+value)
