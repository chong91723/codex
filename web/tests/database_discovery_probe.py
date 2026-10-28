"""Actual four-engine collector assertions on owned fictional fixtures."""
from pathlib import Path
import json
import os
import sys
import time
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'web/database'))
from service import Gateway
from metadata_catalog import collect_metadata
from database_knowledge import DatabaseKnowledge

out=Path(os.environ['REPORT_DIR']).parent/'collector';out.mkdir(parents=True,exist_ok=True)
fixtures=json.loads(Path(os.environ['CODEX_DISCOVERY_FIXTURES']).read_text())
gateway=Gateway(directory=Path(os.environ['CODEX_TEST_HOME'])/'collector-state')
results=[]
try:
 for config in fixtures['connections']:
  engine=config['engine'];started=time.perf_counter()
  try:
   record=gateway.store.save({key:value for key,value in config.items() if key!='container'})
   checked=gateway.probe(record)
   assert checked['status']=='connected',checked.get('error')
   actual=collect_metadata(gateway,record['id'])
   (out/(engine+'-catalog.json')).write_text(json.dumps(actual,ensure_ascii=False,indent=2)+'\n')
   tables={table['name']:table for table in actual['tables']}
   count=sum(len(table['columns']) for table in actual['tables'])
   assert count>501,(engine,count)
   if engine in ('postgresql','mysql'):
    orders=tables['orders'];assert orders['primaryKey']==['tenant_id','order_id'],orders['primaryKey']
    foreign=next(key for key in orders['foreignKeys'] if key['name']=='fk_orders_customer')
    assert foreign['columns']==['tenant_id','customer_id'],foreign
    assert foreign['targetColumns']==['tenant_id','customer_id'],foreign
    assert foreign['targetTable']=='customers',foreign
    assert tables['order_amounts']['kind']=='view',tables['order_amounts']['kind']
    assert 'Synthetic amount' in next(column for column in orders['columns'] if column['name']=='amount')['comment']
    assert len([name for name in tables if name.startswith('wide_')])==34
   elif engine=='clickhouse':
    events=tables['customer_events'];assert events['primaryKey']==[];assert events['foreignKeys']==[]
    assert actual['capabilities']['primaryKeys'] is False
    assert actual['capabilities']['foreignKeys'] is False
    assert 'tenant_id' in events['properties']['primaryKeyExpression']
    assert 'order_id' in events['properties']['sortingKeyExpression']
   else:
    assert set(tables)=={'demo-discovery'},list(tables)
    columns={column['name']:column for column in tables['demo-discovery']['columns']}
    assert columns['items']['kind']=='nested',columns['items']
    assert columns['customer']['kind']=='object',columns['customer']
    assert columns['title.raw']['kind']=='multi_field',columns['title.raw']
    assert columns['title.raw']['parentField']=='title'
    assert columns['amount_alias']['target']=='amount',columns['amount_alias']
    assert columns['relation']['relations']=={'parent':'child'},columns['relation']
    assert 'private-discovery' not in json.dumps(actual)
    if fixtures.get('runtimeMappingFixture'):
     assert columns['title']['kind']=='runtime',columns['title']
     assert columns['title']['dataType']=='keyword',columns['title']
     assert columns['title']['mappedField']['dataType']=='text',columns['title']
     assert columns['runtime_label']['kind']=='runtime',columns['runtime_label']
     assert len(columns['title']['runtimeDefinitionHash'])==64
     assert len(columns['runtime_label']['runtimeDefinitionHash'])==64
     knowledge=DatabaseKnowledge(gateway)
     state=knowledge.scan(record['id'],knowledge.state(record['id'])['revision'])
     assert state['snapshot']['complete']
     assert state['snapshot']['columnCount']==count
     assert len(columns)==count,'Runtime shadows must not duplicate physical column names'

   results.append({'engine':engine,'status':'passed','tableCount':len(tables),'columnCount':count,'elapsedMs':round((time.perf_counter()-started)*1000,3)})
  except Exception as error:
   results.append({'engine':engine,'status':'failed','error':type(error).__name__+': '+str(error)})
  (out/'results.json').write_text(json.dumps({'scope':'Actual collector and strict read-only accounts on owned synthetic databases; no model calls or production services.','results':results,'modelRequests':0},ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(results,ensure_ascii=False))
 if any(result['status']!='passed' for result in results):raise SystemExit(1)
finally:
 for record in gateway.store.all():gateway.store.remove(record['id'])
