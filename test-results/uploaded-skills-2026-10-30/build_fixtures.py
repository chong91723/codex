from pathlib import Path
import io,zipfile,json,hashlib
B=Path('/tmp/codex-uploaded-skills-20261030');F=B/'fixtures';F.mkdir(exist_ok=True)
md='''---
name: uploaded-skill-proof
description: Verify an explicitly selected uploaded local skill package by reading its reference and running its supplied local Python proof script. Use only when the user asks for this acceptance proof.
---
# Local uploaded skill proof
Read `references/format.md` before executing. Run `scripts/proof.py` with the exact user-supplied text and workspace output path. Use the requested hold window only for acceptance, not business computation. Do not download packages or use the network. Do not alter the skill package. Report only the actual marker and output path after the command completes. No memory writes.
'''
script='''import argparse,hashlib,json,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--text',required=True);p.add_argument('--output',required=True);p.add_argument('--hold',type=int,default=0);a=p.parse_args()
assert 0<=a.hold<=20
time.sleep(a.hold)
r={'marker':'UPLOAD_SKILL_OK','text':a.text,'sha256':hashlib.sha256(a.text.encode()).hexdigest(),'character_count':len(a.text)}
target=Path(a.output);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(r,ensure_ascii=False));print(json.dumps(r,ensure_ascii=False))
'''
content={'uploaded-skill-proof/SKILL.md':md.encode(),'uploaded-skill-proof/references/format.md':b'The successful marker is UPLOAD_SKILL_OK. The proof file is real Python output, not simulated tool success.','uploaded-skill-proof/scripts/proof.py':script.encode(),'uploaded-skill-proof/assets/README.txt':b'This auxiliary asset must remain available after import.'}
def zip_(name,files):
 with zipfile.ZipFile(F/name,'w',zipfile.ZIP_DEFLATED) as z:
  for k,v in files.items():z.writestr(k,v)
zip_('uploaded-skill-proof.zip',content)
zip_('traversal.zip',{'../escape.txt':b'invalid','SKILL.md':md.encode()})
zip_('multiple-skills.zip',{'one/SKILL.md':md.encode(),'two/SKILL.md':md.encode()})
(F/'SKILL.md').write_text('---\nname: uploaded-single-proof\ndescription: A local single Markdown skill for upload acceptance only.\n---\nRead the user request and respond with the literal text SINGLE_UPLOAD_OK. Do not use tools or write memory.\n')
(F/'invalid-SKILL.md').write_text('This document intentionally has no native skill frontmatter.\n')
(F/'ordinary.csv').write_text('not,a,skill\n')
r={'fixtureFiles':[{'name':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(F.iterdir())],'actualBusinessDataIncluded':False,'scriptsExecuteOnlyAfterExplicitNativeTask':True};(B/'fixture-provenance.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
