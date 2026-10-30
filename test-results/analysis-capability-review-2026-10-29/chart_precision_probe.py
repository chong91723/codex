import json,sys
sys.path[:0]=['/root/Codex/web/database']
from charts import build_chart
from cancellation import Cancellation
value='9007199254740993'
data={'resultId':'a'*32,'columns':[{'name':'label','type':'string','nativeType':'str'},{'name':'amount','type':'number','nativeType':'int'}],'rows':[{'label':'precision-fixture','amount':value}],'rowCount':1,'truncated':False,'createdAt':'2026-10-29T00:00:00Z'}
chart=build_chart(data,'bar','label',['amount'],'Exactness fixture',Cancellation())
rendered=chart['option']['dataset']['source'][0]['amount']
assert int(rendered)!=int(value)
print(json.dumps({'scope':'Actual local ECharts MCP option validation with synthetic data; no DB/model/network request','originalValue':value,'chartValue':rendered,'exactMatch':False,'metadataRowsKeepOriginal':chart['rows'][0]['amount']==value},ensure_ascii=False,indent=2))
