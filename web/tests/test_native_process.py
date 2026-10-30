"""Actual Linux subprocess ownership, no Codex/model/data calls."""
from pathlib import Path
import json,os,signal,subprocess,sys,tempfile,threading,time,unittest
ROOT=Path('/root/Codex');sys.path.insert(0,str(ROOT/'web'))
from native_process import spawn_owned_native

def alive(pid):
 try:return Path('/proc',str(pid),'stat').read_text().rsplit(')',1)[1].split()[0] not in ('Z','X')
 except OSError:return False

@unittest.skipUnless(sys.platform.startswith('linux'),'Linux parent-death boundary')
class NativeProcessTests(unittest.TestCase):
 def test_request_thread_can_end_without_killing_native_child(self):
  result=[]
  def request():result.append(spawn_owned_native([sys.executable,'-c','import time;print("ready",flush=True);time.sleep(60)'],stdout=subprocess.PIPE,text=True))
  request_thread=threading.Thread(target=request);request_thread.start();request_thread.join(timeout=5);self.assertFalse(request_thread.is_alive());self.assertEqual(len(result),1);process=result[0]
  try:self.assertEqual(process.stdout.readline().strip(),'ready');self.assertIsNone(process.poll());self.assertTrue(alive(process.pid))
  finally:process.terminate();process.wait(timeout=5);process.stdout.close()
 def test_owner_crash_kills_actual_execed_child(self):
  with tempfile.TemporaryDirectory() as tmp:
   marker=Path(tmp)/'ready';child='from pathlib import Path;import time;Path('+repr(str(marker))+').write_text("ready");time.sleep(60)'
   parent='import sys,time;sys.path.insert(0,'+repr(str(ROOT/'web'))+');from native_process import spawn_owned_native;p=spawn_owned_native([sys.executable,"-c",'+repr(child)+']);print(p.pid,flush=True);time.sleep(60)'
   owner=subprocess.Popen([sys.executable,'-c',parent],stdout=subprocess.PIPE,text=True);pid=int(owner.stdout.readline())
   try:
    deadline=time.monotonic()+5
    while not marker.exists() and time.monotonic()<deadline:time.sleep(.01)
    self.assertTrue(marker.exists());self.assertTrue(alive(pid));owner.kill();owner.wait(timeout=5);deadline=time.monotonic()+3
    while alive(pid) and time.monotonic()<deadline:time.sleep(.01)
    self.assertFalse(alive(pid),'Owner crash left an executing child')
   finally:
    if owner.poll() is None:owner.kill();owner.wait(timeout=5)
    if alive(pid):os.kill(pid,signal.SIGKILL)
    owner.stdout.close()
 def test_parent_already_gone_never_execs_command(self):
  with tempfile.TemporaryDirectory() as tmp:
   marker=Path(tmp)/'must-not-exist';code='from pathlib import Path;Path('+repr(str(marker))+').write_text("wrong")'
   r=subprocess.run([sys.executable,'-I',str(ROOT/'web/native_process.py'),'2147483647',sys.executable,'-c',code],capture_output=True,text=True,timeout=5);self.assertNotEqual(r.returncode,0);self.assertFalse(marker.exists());self.assertIn('所有者已退出',r.stderr)
 def test_exec_failure_is_visible_without_replacement_process(self):
  p=spawn_owned_native(['/codex-test-does-not-exist'],stderr=subprocess.PIPE,text=True)
  try:self.assertEqual(p.wait(timeout=5),70);self.assertIn('No such file',p.stderr.read())
  finally:p.stderr.close()
if __name__=='__main__':unittest.main()
