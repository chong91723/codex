from pathlib import Path
import sys,json,time,secrets
root=Path('/tmp/codex-uploaded-skills-20261030/control');name=str(int(time.time()*1000))+'-'+secrets.token_hex(3);path=root/(name+'.request.json');source=sys.stdin.read();path.write_text(json.dumps({'code':source}))
reply=root/(name+'.response.json');deadline=time.monotonic()+float(sys.argv[1] if len(sys.argv)>1 else 60)
while not reply.exists():
 if time.monotonic()>deadline:raise SystemExit('Controller still processing; request retained '+str(path))
 time.sleep(.1)
while True:
 try:
  v=json.loads(reply.read_text());break
 except (json.JSONDecodeError,FileNotFoundError):
  if time.monotonic()>deadline:raise SystemExit('Controller response incomplete; evidence retained '+str(reply))
  time.sleep(.05)
print(json.dumps(v,ensure_ascii=False));sys.exit(0 if v['ok'] else 1)
