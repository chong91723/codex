"""Database management API and model tools share one read-only gateway."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
import json
import time
import urllib.error
from cancellation import Cancellation,Cancelled
from adapters import connect,DatabaseError
from charts import build_chart
from snapshots import Snapshots
from pathlib import Path
import secrets,os,csv
from sql_guard import validate_queries,physical_tables,MAX_ROWS,ReadOnlyError
from store import Store,public
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from data_freshness import receipt,acquisitions,check_freshness
from file_inputs import check_files
from metric_rules import metric_dependencies

class Gateway:
    def __init__(self,directory=None,cancellation=None,thread_id=None,turn_id=None,parent_thread_id=None):self.turn_id=turn_id;self.parent_thread_id=parent_thread_id;self.thread_id=thread_id;self.cancel=cancellation or Cancellation();self.store=Store(directory);self.snapshots=Snapshots(self.store.directory,self.cancel)
    @property
    def learning(self):
        if not hasattr(self, '_learning'):
            from learning import Learning
            self._learning = Learning(self)
        return self._learning
    @property
    def metric_rules(self):
        if not hasattr(self,'_metric_rules'):
            from metric_rules import MetricRules
            self._metric_rules=MetricRules(self)
        return self._metric_rules
    def probe(self,record):
        adapter=None
        try:
            adapter=connect(record,self.cancel)
            if record['engine']=='elasticsearch':pass
            else:
                with self.cancel.watch(adapter.cancel):adapter.execute('SELECT 1 AS connected')
            return self.store.status(record,'connected')
        except Cancelled:raise
        except Exception as error:
            self.cancel.check()
            message=str(error).replace(record['password'],'[已隐藏]') if record['password'] else str(error)
            return self.store.status(record,'failed',message[:700])
        finally:
            if adapter:adapter.close()
    def require(self,identifier):
        record=self.store.get(identifier)
        if not record['enabled'] or record['status']!='connected':raise DatabaseError('此数据库未启用或尚未通过只读连接验证，请在数据库页面配置并测试。')
        return record
    def available(self):
        records=[record for record in self.store.all() if record['enabled'] and record['status']=='connected']
        with ThreadPoolExecutor(max_workers=4) as pool:checked=list(pool.map(self.probe,records))
        return [{'id':r['id'],'name':r['name'],'engine':r['engine'],'database':r['database'],'schema':r['schema'] if r['engine']=='postgresql' else None,'maxAgeMinutes':r.get('maxAgeMinutes'),'readOnly':True} for r in checked if r['status']=='connected']
    def schema(self,identifier,table=None):
        record=self.require(identifier);adapter=None
        try:
            adapter=connect(record,self.cancel)
            with self.cancel.watch(adapter.cancel):columns,rows=adapter.schema(table)
            self.cancel.check()
            return {'connectionId':identifier,'name':record['name'],'engine':record['engine'],'columns':columns,'rows':rows,'truncated':len(rows)>MAX_ROWS}
        except Exception as error:
            if adapter is None:self.store.status(record,'failed',str(error))
            raise
        finally:
            if adapter:adapter.close()
    def query(self,identifier,query):
        record=self.require(identifier);scope=[record];table_scopes={identifier:set()}
        if record['engine']!='elasticsearch':
            for other in self.store.all():
                if other['id']!=identifier and other['engine']==record['engine'] and other['host'].lower()==record['host'].lower() and other['port']==record['port'] and other['enabled'] and other['status']=='connected' and (record['engine']!='postgresql' or other['database']==record['database']):scope.append(other)
            namespaces=[r['schema'] if r['engine']=='postgresql' else r['database'] for r in scope]
            config=dict(record,allowedNamespaces=namespaces);queries=validate_queries(query,config)
            import sqlglot
            if self.thread_id:
                for sql in queries:
                    tree=sqlglot.parse_one(sql,read={'mysql':'mysql','postgresql':'postgres','clickhouse':'clickhouse'}[record['engine']])
                    if not physical_tables(tree):
                        raise DatabaseError('该查询没有读取实际数据表；外部数据或纯计算请使用 fetch_data/import_data_file 与 run_python，不能借数据库生成结果编号。')
            referenced={table.db for sql in queries for table in physical_tables(sqlglot.parse_one(sql,read={'mysql':'mysql','postgresql':'postgres','clickhouse':'clickhouse'}[record['engine']])) if table.db}
            for other in scope[1:]:
                name=other['schema'] if other['engine']=='postgresql' else other['database']
                if name in referenced and self.probe(other)['status']!='connected':raise DatabaseError('跨库查询所需的数据库已断开连接。')
            scope=[record,*[other for other in scope[1:] if (other['schema'] if other['engine']=='postgresql' else other['database']) in referenced]]
            for dependency in scope:
                namespace=dependency['schema'] if dependency['engine']=='postgresql' else dependency['database']
                names=set()
                for sql in queries:
                    tree=sqlglot.parse_one(sql,read={'mysql':'mysql','postgresql':'postgres','clickhouse':'clickhouse'}[record['engine']])
                    for table in physical_tables(tree):
                        if table.db and table.db.casefold()!=namespace.casefold():continue
                        if not table.db and dependency['id']!=identifier:continue
                        names.update((table.name,namespace+'.'+table.name))
                table_scopes[dependency['id']]=names
        else:
            queries=[query];table_scopes[identifier]={record['database']}
        knowledge_stamps=[self.learning.before_query(dependency['id'],table_scopes[dependency['id']]) for dependency in scope]
        started=time.monotonic();adapter=None;results=[]
        try:
            adapter=connect(record,self.cancel)
            for statement in queries:
                if time.monotonic()-started>20:raise DatabaseError('批量查询耗时过长，请分批查询。')
                self.cancel.check()
                with self.cancel.watch(adapter.cancel):value=self.snapshots.write({'connectionId':identifier,'connectionName':record['name'],'engine':record['engine'],'connectionVersion':record['version'],'connectionDependencies':[{'id':dependency['id'],'version':dependency['version']} for dependency in scope],'knowledgeDependencies':knowledge_stamps,'query':query if len(queries)==1 else statement,'executedQuery':statement,'acquisition':[receipt('database',self.thread_id,self.turn_id,dependency['id']) for dependency in scope]},adapter.stream(statement))
                if getattr(adapter,'native_response',None):
                    raw_path=self.snapshots.path(value['resultId']).with_suffix('.raw.json');raw_path.write_text(json.dumps(adapter.native_response,ensure_ascii=False));raw_path.chmod(0o600)
                    value['nativeResponseAvailable']=True
                    self.snapshots.path(value['resultId']).with_suffix('.json').write_text(json.dumps(value,ensure_ascii=False))
                for dependency in scope:
                    current=self.store.get(dependency['id'])
                    if current['version']!=dependency['version']:raise DatabaseError('查询期间连接配置已变更，结果未返回。请核对并测试当前连接后重新查询。')
                    self.require(dependency['id'])
                if self.learning.check(knowledge_stamps):raise DatabaseError('查询期间业务知识发生变化，请重新读取知识并查询；旧结果未用于回答。')
                results.append(value)
        except Exception as error:
            self.cancel.check()
            if adapter is None or isinstance(error,(ConnectionError,TimeoutError,urllib.error.URLError)) or str(getattr(error,'sqlstate','')).startswith('08') or isinstance(getattr(error,'args',[None])[0],int) and error.args[0]>=2000:self.store.status(record,'failed',str(error)[:700])
            raise DatabaseError(str(error)) from None
        finally:
            if adapter:adapter.close()
        return results[0] if len(results)==1 else {'results':results,'readOnly':True}
    def result(self,result_id,offset=0,limit=100,columns=None,model=False):
        metadata=self.snapshots.metadata(result_id)
        if model:self.result_owner(metadata)
        if model and self.thread_id:
            from analysis_tools import AnalysisTools
            AnalysisTools(self,self.thread_id).remember(metadata)
        page=self.snapshots.page(result_id,offset,limit,columns)
        if model:
            def size(count):
                return len(json.dumps({'columns':page['columns'],'rows':page['rows'][:count]},ensure_ascii=False))
            if size(len(page['rows']))>5000:
                # Page the immutable result within the model context budget.
                # Never coerce cells, omit fields, or imply a complete scan.
                if not page['rows'] or size(1)>5000:
                    raise DatabaseError('所选字段或单行内容超过上下文单次预算。请用 columns 选择必要字段，或用 analyze_result/run_python 对完整结果聚合；完整结果仍可在网页查看和下载。')
                low,high=1,len(page['rows'])
                while low<high:
                    middle=(low+high+1)//2
                    if size(middle)<=5000:low=middle
                    else:high=middle-1
                page.update(rows=page['rows'][:low],returnedRows=low,hasMore=offset+low<page['rowCount'],requestedLimit=limit,pageLimitedByContext=True,
                            contextNotice='本页按模型上下文预算返回连续的部分明细，完整结果未截断。必要时按 nextOffset 继续读取；全量计算直接使用完整 resultId。')
            page['nextOffset']=offset+page['returnedRows'] if page['hasMore'] else None
        return page
    def result_owner(self,metadata,checked=None):
        check_files([metadata])
        if self.thread_id:self.learning.check_result(metadata)
        for dependency in metric_dependencies([metadata],self.snapshots):
            self.metric_rules.assert_current(dependency['ruleId'],dependency['version'],dependency['definitionHash'])
        def connected(record):
            key=(record['id'],record['version'])
            if checked is not None and key in checked:return True
            ok=self.probe(record)['status']=='connected'
            if ok and checked is not None:checked.add(key)
            return ok
        if metadata.get('sourceKind')=='python':
            if self.thread_id and self.thread_id not in (metadata.get('ownerThreadId'),metadata.get('parentThreadId')) and self.parent_thread_id!=metadata.get('ownerThreadId'):raise DatabaseError('计算结果不属于当前会话。')
            for dependency in metadata.get('connectionDependencies',[]):
                record=self.require(dependency['id'])
                if record['version']!=dependency['version'] or not connected(record):raise DatabaseError('计算结果依赖的数据源已变化或断开，请重新查询计算。')
            if self.thread_id:check_freshness([metadata],self.store.get,self.thread_id,self.turn_id)
            return None
        primary=self.require(metadata['connectionId'])
        dependencies=metadata.get('connectionDependencies') or [{'id':primary['id'],'version':metadata.get('connectionVersion',primary['version'])}]
        for dependency in dependencies:
            record=self.require(dependency['id'])
            if record['version']!=dependency['version']:raise DatabaseError('结果依赖的连接配置或启用状态已变更。旧结果可在网页历史查看；Agent 请重新查询。')
            if not connected(record):raise DatabaseError('结果依赖的数据库已断开连接，请先重新测试。')
        if self.thread_id:check_freshness([metadata],self.store.get,self.thread_id,self.turn_id)
        return primary
    def analyze(self,result_id,query):
        metadata=self.snapshots.metadata(result_id);checked=set();self.result_owner(metadata,checked)
        result=self.snapshots.write({key:metadata[key] for key in ('connectionId','connectionName','engine','connectionVersion','connectionDependencies','knowledgeDependencies','fileDependencies') if key in metadata}|{'metricDependencies':metric_dependencies([metadata],self.snapshots),'acquisition':acquisitions(metadata),'sourceKind':'python','sourceName':'本地快照 SQL 计算','ownerThreadId':self.thread_id or metadata.get('ownerThreadId'),'inputResultIds':[result_id],'inputSources':[{'kind':'dataset','resultId':result_id,'sha256':metadata['sha256']}],'pythonCode':'# Python Snapshots.analyze executes this read-only DuckDB query\n'+query,'query':query,'parentResultId':result_id},self.snapshots.analyze(result_id,query))
        try:self.result_owner(metadata,checked)
        except Exception:
            for suffix in ('.json','.parquet'):self.snapshots.path(result['resultId']).with_suffix(suffix).unlink(missing_ok=True)
            raise
        return result
    def chart(self,result_id,kind,x,ys,title=None):
        metadata=self.snapshots.metadata(result_id);checked=set();self.result_owner(metadata,checked)
        if metadata['rowCount']>20000:raise DatabaseError('完整数据已保留，但图表点数过多。请显式使用 analyze_result 对完整结果进行分组或筛选，再生成图表；不会自动抽样或丢弃明细。')
        pages=[self.snapshots.page(result_id,offset,min(200,metadata['rowCount']-offset)) for offset in range(0,metadata['rowCount'],200)]
        data=dict(metadata,rows=[row for page in pages for row in page['rows']])
        if len(json.dumps(data['rows'],ensure_ascii=False).encode())>4*1024*1024:raise DatabaseError('完整图表数据超过页面预算，请显式聚合或选择更小的查询范围。')
        self.cancel.check();value=build_chart(data,kind,x,ys,title,self.cancel);self.cancel.check();identifier=secrets.token_hex(16);directory=self.store.directory/'charts';directory.mkdir(mode=0o700,exist_ok=True);path=directory/(identifier+'.json')
        try:
            path.write_text(json.dumps(value,ensure_ascii=False));path.chmod(0o600)
            self.result_owner(metadata,checked)
        except Exception:
            path.unlink(missing_ok=True)
            raise
        return {'version':2,'chartId':identifier,'resultId':result_id,'title':value['title'],'rowCount':metadata['rowCount'],'complete':True}
    def read_chart(self,identifier):
        self.snapshots.path(identifier);path=self.store.directory/'charts'/(identifier+'.json')
        if not path.is_file():raise DatabaseError('图表不存在或已清理。')
        return json.loads(path.read_text())
    def export(self,identifier,kind):
        meta=self.snapshots.metadata(identifier)
        if kind=='json':
            path=self.snapshots.path(identifier).with_suffix('.raw.json')
            if not path.is_file():raise DatabaseError('此查询没有独立的原生 JSON 响应。')
            return {'path':str(path),'mime':'application/json','filename':'result-'+identifier+'.json'}
        if kind=='parquet':return {'path':str(self.snapshots.path(identifier)),'mime':'application/vnd.apache.parquet','filename':'result-'+identifier+'.parquet'}
        if kind!='csv':raise DatabaseError('不支持的导出格式。')
        path=self.snapshots.path(identifier).with_suffix('.csv');temp=path.with_suffix('.csv.'+secrets.token_hex(6)+'.partial')
        with temp.open('w',encoding='utf-8-sig',newline='') as output:
            writer=csv.writer(output);writer.writerow([d['name'] for d in meta['columns']])
            for batch in __import__('pyarrow.parquet',fromlist=['ParquetFile']).ParquetFile(self.snapshots.path(identifier)).iter_batches(batch_size=1000):
                for row in batch.to_pylist():writer.writerow([row.get(d['name']) for d in meta['columns']])
        temp.chmod(0o600);temp.replace(path)
        return {'path':str(path),'mime':'text/csv; charset=utf-8','filename':'result-'+identifier+'.csv'}
    def manifest(self,value):
        if self.thread_id:
            from analysis_tools import AnalysisTools
            AnalysisTools(self,self.thread_id).remember(value)
        result={key:item for key,item in value.items() if key not in ('query','executedQuery','pythonCode','parameters')}
        if len(result.get('columns',[]))>100 or len(json.dumps(result,ensure_ascii=False))>5000:result['columnCount']=len(result['columns']);result.pop('columns');result['schemaResource']='Use describe_result to page through the complete schema.'
        return result
    def manage(self,action,payload):
        if action=='results':
            values=[json.loads(path.read_text()) for path in self.snapshots.directory.glob('*.json') if len(path.stem)==32];values.sort(key=lambda r:r['createdAt'],reverse=True)
            return {'results':[self.manifest(r) for r in values[:100]]}
        if action=='clear_result':
            identifier=payload['resultId'];self.snapshots.metadata(identifier)
            for suffix in ('.parquet','.json','.csv','.raw.json'):self.snapshots.path(identifier).with_suffix(suffix).unlink(missing_ok=True)
            return {'removed':True}
        if action=='list':return {'connections':[public(r) for r in self.store.all()],'readOnly':True}
        if action=='save':return {'connection':public(self.store.save(payload))}
        if action=='freshness':
            if 'maxAgeMinutes' not in payload:raise ValueError('请提供复用时长，清除规则须显式传入空值。')
            return {'connection':public(self.store.set_freshness(payload['id'],payload['maxAgeMinutes'],payload.get('expectedRevision')))}
        if action=='test':
            record=self.store.get(payload['id']);value=self.probe(record)
            return {'connection':public(value),'success':value['status']=='connected'}
        if action=='toggle':
            if not isinstance(payload.get('enabled'),bool):raise ValueError('请提供启用状态。')
            record=self.store.toggle(payload['id'],payload['enabled'],payload.get('expectedVersion'));record=self.probe(record) if record['enabled'] else record
            return {'connection':public(record),'success':not record['enabled'] or record['status']=='connected'}
        if action=='remove':self.store.remove(payload['id'],payload.get('expectedVersion'));return {'removed':True}
        if action=='schema':return self.schema(payload['id'],payload.get('table'))
        if action=='query':return self.query(payload['id'],payload['query'])
        if action=='result':return self.result(payload['resultId'],int(payload.get('offset',0)),int(payload.get('limit',100)),payload.get('columns'))
        if action=='read_chart':return self.read_chart(payload['chartId'])
        if action=='export':return self.export(payload['resultId'],payload['format'])
        if action=='analyze':return self.analyze(payload['resultId'],payload['query'])
        if action=='chart':return {'codexWebChart':self.chart(payload['resultId'],payload['kind'],payload['x'],payload['ys'],payload.get('title'))}
        raise ValueError('未知数据库操作。')
