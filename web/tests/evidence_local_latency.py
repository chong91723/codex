from pathlib import Path
import sys,subprocess,types,time,statistics,json,tempfile
sys.path[:0]=['web','web/database']
from analysis_evidence import has_number
from analysis_tools import AnalysisTools
from data_freshness import check_freshness,receipt
from service import Gateway
out=Path('test-results/evidence-followup-2026-10-28')
def measure(fn,n=30):
 for _ in range(3):fn()
 times=[]
 for _ in range(n):
  started=time.perf_counter();fn();times.append((time.perf_counter()-started)*1000)
 times.sort();return {'samples':n,'medianMs':round(statistics.median(times),3),'p95Ms':round(times[int(.95*(n-1))],3)}
old=types.ModuleType('baseline_analysis_tools');old.__file__=str(Path('web/database/analysis_tools.py').absolute());exec(subprocess.run(['git','show','90c83532f36f0888883ce105690535d8f9d614b9:web/database/analysis_tools.py'],check=True,capture_output=True,text=True).stdout,old.__dict__)
results={'scope':'Local actual Python execution, immutable snapshot and publication I/O. Alternating same-value publications using old and current resolver functions with the same CURRENT shared evidence writer; not a full old-application A/B. No model/network/SQL requests; not end-to-end user wait or model A/B.','modelRequests':0,'numericDetection':{},'publication':{}}
with tempfile.TemporaryDirectory(prefix='codex-evidence-benchmark-') as tmp:
 gateway=Gateway(tmp,thread_id='fixture',turn_id='fixture-turn');tools=AnalysisTools(gateway,'fixture');before=old.AnalysisTools(gateway,'fixture')
 result=tools.calculate("result=[{'value':Decimal('3.50'),'count':2}]")
 for count in [1,30,100]:
  refs={'v'+chr(97+i//26)+chr(97+i%26):{'result_id':result['resultId'],'row':0,'column':'value'} for i in range(count)}
  template='；'.join('{{'+key+'}}' for key in refs)
  oldtimes,newtimes=[],[]
  for _ in range(3):before.publish(template,refs);tools.publish(template,refs)
  for _ in range(20):
   for target,times in [(before,oldtimes),(tools,newtimes)]:
    started=time.perf_counter();value=target.publish(template,refs);times.append((time.perf_counter()-started)*1000);assert '3.50' in value['text']
  def stats(a):a.sort();return {'samples':len(a),'medianMs':round(statistics.median(a),3),'p95Ms':round(a[int(.95*(len(a)-1))],3)}
  results['publication'][str(count)+'_references_same_row']={'baseline':stats(oldtimes),'current':stats(newtimes)}
 record=gateway.store.save({'engine':'mysql','name':'local policy fixture','host':'127.0.0.1','database':'fixture','username':'reader'});gateway.store.set_freshness(record['id'],30)
 metadata={'acquisition':[receipt('database','fixture','fixture-turn',record['id'])]}
 results['freshnessCheckOneConfiguredSource']=measure(lambda:check_freshness([metadata],gateway.store.get,'fixture','fixture-turn'),n=200)
 for length in [8000,80000]:
  text=('请核对字段格式并说明依据。'*8000)[:length]
  assert not has_number(text);results['numericDetection'][str(length)+'_characters']=measure(lambda:has_number(text),50)
(out/'local-latency.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');print(json.dumps(results,ensure_ascii=False))
