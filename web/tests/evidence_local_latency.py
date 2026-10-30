"""Local provenance overhead only; not a model latency or full application A/B."""
from pathlib import Path
import os,sys,time,statistics,json,tempfile
sys.path[:0]=[str(Path(__file__).resolve().parents[1]),str(Path(__file__).resolve().parents[1]/'database')]
from analysis_tools import AnalysisTools
from service import Gateway

def measure(fn,n=30):
    for _ in range(3):fn()
    times=[]
    for _ in range(n):
        started=time.perf_counter();fn();times.append((time.perf_counter()-started)*1000)
    times.sort()
    return {'samples':n,'medianMs':round(statistics.median(times),3),'p95Ms':round(times[int(.95*(n-1))],3)}

out=Path(os.environ.get('CODEX_TEST_OUTPUT','/tmp/codex-evidence-scope-benchmark'));out.mkdir(parents=True,exist_ok=True)
result={'scope':'Actual local snapshot publication and normal-scope lookup. No model/network requests; not end-to-end wait or semantic correctness.','publication':{},'conversationLookup':{}}
with tempfile.TemporaryDirectory(prefix='codex-scope-benchmark-') as directory:
    gateway=Gateway(directory,thread_id='fixture',turn_id='task');tools=AnalysisTools(gateway,'fixture')
    tools.evidence.observe({'method':'turn/started','params':{'threadId':'fixture','turn':{'id':'task'}}})
    dataset=tools.calculate("result=[{'value':Decimal('3.50')}]")
    for count in [1,30,100]:
        refs={'v'+str(i):{'result_id':dataset['resultId'],'row':0,'column':'value'} for i in range(count)}
        template='；'.join('{{'+name+'}}' for name in refs)
        result['publication'][str(count)+'_same_row_fields']=measure(lambda:tools.publish(template,refs),20)
    tools.evidence.observe({'method':'turn/started','params':{'threadId':'fixture','turn':{'id':'discussion'}}})
    for length in [8000,80000]:
        text=('三角函数与三角形；2025年，分3步，用户阈值80。'*4000)[:length]
        def inspect():
            checked=tools.evidence.verify('fixture','discussion',text)
            assert checked['status']=='notRequired' and checked['verificationScope']=='conversation'
        result['conversationLookup'][str(length)+'_characters']=measure(inspect,50)
(out/'local-latency.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
