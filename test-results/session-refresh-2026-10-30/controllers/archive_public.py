from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,gzip,re,difflib
B=Path('/tmp/codex-refresh-20261030');O=Path('/root/Codex/test-results/session-refresh-2026-10-30');sources={p:p.relative_to(B) for p in B.iterdir() if p.is_file() and p.suffix in ('.json','.png','.log','.txt') and p.name not in ('context.json','private-service.log')}
for p in (B/'browser').glob('*'):
 if p.is_file() and p.suffix in ('.json','.png','.log'):sources[p]=Path('browser')/p.name
for n in ('baseline.mjs','setup_lab.py','run_js_units.py','js-unit-files.txt','archive_public.py'):
 p=B/n
 if p.is_file():sources[p]=Path('controllers')/n
for n in ('session_route_state.mjs','session_refresh_desktop.mjs'):
 p=Path('/root/Codex/web/tests')/n;sources[p]=Path('controllers')/n
for p in B.glob('aoci-*'):
 if p.is_file():sources[p]=Path('developer-index')/p.name
for p in B.glob('codegraph-*.txt'):sources[p]=Path('developer-index')/p.name
changes=[]
for n in ('app.js','index.html'):
 old=(B/('before-'+n)).read_text();new=(Path('/root/Codex/web/public')/n).read_text();changes.extend(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='before/web/public/'+n,tofile='after/web/public/'+n))
(B/'product-change.diff').write_text(''.join(changes));sources[B/'product-change.diff']=Path('product-change.diff')
manifest=[];redactions=0
for p,rel in sorted(sources.items(),key=lambda x:str(x[1])):
 data=p.read_bytes();original=data
 if p.suffix!='.png':
  text=data.decode();text,n=re.subn(r'\bsk-[A-Za-z0-9_-]{20,}','[REDACTED]',text);redactions+=n;text,n=re.subn(r'Bearer\s+[^\s"<>]+','Bearer [REDACTED]
 target=O/rel;target.parent.mkdir(parents=True,exist_ok=True)
 if len(data)>600000:target=target.with_name(target.name+'.gz');data=gzip.compress(data,mtime=0)
 target.write_bytes(data);manifest.append({'source':str(p),'artifact':str(target.relative_to(O)),'sourceSha256':hashlib.sha256(original).hexdigest(),'storedSha256':hashlib.sha256(data).hexdigest(),'storedBytes':len(data)})
(O/'manifest.json').write_text(json.dumps({'at':datetime.now(timezone.utc).isoformat(),'files':manifest,'redactions':redactions,'scope':'Public receipts/screenshots/tests only; no profile, context configuration, environment, cookies, key or private service logs.'},indent=2))
(O/'README.md').write_text('# 会话刷新首屏验收\n\n[问题清单](../../AUDIT_2026-10-30.md)、[分层报告](../../TEST_REPORT.md)、[产物哈希](manifest.json)。\n\n基线与修后daily首帧截图使用同一尺寸、同一app.js下载gate，不进入日常用户原生会话。隔离browser目录保留实际原生model/list/read/resume响应的有界阻塞测试，不模拟回复、不调用新模型。\n\n实际浏览器10／10，新增路由状态17／17，完整前端重跑436／436；首轮旧VM夹具未加载新增helper的15失败及重跑分别保留。控制器DCL等待条件纠正与产品错误分开记账。原测试profile和4条历史保留，临时服务已优雅关闭。\n\n新脚本位于controllers；product-change.diff仅对比本轮开始前后的两个产品文件，避免混入之前已有修改。本轮无后端改动或额外模型生成验收。\n')
assert all(hashlib.sha256((O/x['artifact']).read_bytes()).hexdigest()==x['storedSha256'] for x in manifest)
print(json.dumps({'files':len(manifest),'storedBytes':sum(x['storedBytes'] for x in manifest),'redactions':redactions,'directory':str(O)}))
