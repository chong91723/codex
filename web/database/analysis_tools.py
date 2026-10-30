"""General datasets, isolated calculations and exact numeric answer publication."""
from decimal import Decimal
from contextlib import contextmanager
import hashlib
import http.client
import json
import os
from pathlib import Path
import secrets
import socket
import ssl
import sys
from urllib.parse import urlsplit, parse_qsl, urljoin
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from analysis_evidence import Evidence
from calculation import run_python
from data_freshness import receipt, acquisitions, merge_acquisitions, publication_checks
from file_inputs import read_stable,dependencies as file_dependencies,check_files
from metric_rules import metric_dependencies

DEFAULT_ORIGINS = 'https://push2his.eastmoney.com,https://web.ifzq.gtimg.cn'


class AnalysisTools:
    def __init__(self, gateway, thread):
        self.gateway = gateway
        self.thread = Evidence.identity(thread)
        self.evidence = Evidence(gateway.store.directory)

    def remember(self, metadata):
        self.evidence.remember(self.thread, metadata)
        return metadata

    def document(self, text, kind, source):
        if not isinstance(text,str) or kind not in ('json', 'csv', 'text') or len(text.encode()) > 4*1024*1024:
            raise ValueError('文档格式不支持或超出读取预算。')
        if '\x00' in text:
            raise ValueError('文件不是有效的 UTF-8 文本，请转换编码后重试；不接受二进制内容。')
        if kind == 'json':json.loads(text)
        identifier = secrets.token_hex(16)
        record = {'documentId': identifier, 'format': kind, 'text': text, 'source': source,
                  'sha256': hashlib.sha256(text.encode()).hexdigest(), 'threadId': self.thread,
                  'acquisition': [receipt(source['kind'], self.thread, self.gateway.turn_id)]}
        if source.get('kind')=='file' and source.get('path'):
            record['fileDependencies']=[{'path':source['path'],'sha256':source['fileSha256'],'signature':source['signature']}]
        with self.gateway.cancel.commit():
            self.evidence.write(self.evidence.path('documents', self.thread, identifier), record)
        return {'documentId': identifier, 'format': kind, 'source': source, 'sha256':record['sha256'],'bytes': len(text.encode()),
                'preview': text[:3000], 'nextStep': '使用 run_python 的 document_ids 读取完整文档并生成 result 数据集；预览不是完整数据。'}

    def fetch(self, url, kind='json'):
        allowed = {item.strip().rstrip('/') for item in os.environ.get('CODEX_WEB_DATA_ORIGINS', DEFAULT_ORIGINS).split(',') if item.strip()}
        source = url
        for _ in range(4):
            parsed = urlsplit(url)
            origin = parsed.scheme+'://'+parsed.netloc
            if parsed.username or parsed.password or parsed.fragment or origin not in allowed or parsed.scheme not in ('http', 'https'):
                raise ValueError('该数据接口不在用户配置的允许来源中；请在分析 MCP 的 CODEX_WEB_DATA_ORIGINS 配置完整 origin，不会自动切换国际行情源。')
            if any(key.lower() in ('token','key','api_key','apikey','secret','access_token') for key, _ in parse_qsl(parsed.query)):
                raise ValueError('不接受 URL 中的凭据；请使用单独配置的授权 MCP 读取该数据。')
            cls = http.client.HTTPSConnection if parsed.scheme == 'https' else http.client.HTTPConnection
            options = {'timeout': 12}
            if parsed.scheme == 'https':options['context'] = ssl.create_default_context()
            connection = cls(parsed.hostname, parsed.port, **options)
            response = None
            try:
                self.gateway.cancel.check();connection.connect();self.gateway.cancel.check()
                wire = connection.sock
                def abort():
                    try:wire.shutdown(socket.SHUT_RDWR)
                    except OSError:pass
                    wire.close()
                with self.gateway.cancel.watch(abort):
                    connection.request('GET', parsed.path+('?' + parsed.query if parsed.query else ''), headers={'Accept':'application/json,text/csv,text/plain','User-Agent':'Codex-Web-Analysis','Connection':'close'})
                    response = connection.getresponse()
                    if response.status in (301,302,303,307,308):
                        url = urljoin(url, response.getheader('Location',''));continue
                    if response.status != 200:raise ValueError('数据接口返回 HTTP '+str(response.status)+'，没有生成数据集。')
                    data = response.read(4*1024*1024+1);self.gateway.cancel.check()
                    if len(data)>4*1024*1024:raise ValueError('数据接口响应超出预算，没有发布部分结果。')
                    text = data.decode('utf-8-sig')
                    return self.document(text, kind, {'kind':'api','url':source,'resolvedUrl':url})
            finally:
                if response:response.close()
                connection.close()
        raise ValueError('数据接口重定向次数超出限制。')

    def import_file(self, path, kind='csv'):
        file = Path(path).expanduser().resolve()
        roots = [Path(root).expanduser().resolve() for root in os.environ.get('CODEX_WEB_ANALYSIS_ROOTS','').split(os.pathsep) if root]
        if not roots or not any(file.is_relative_to(root) for root in roots):
            raise ValueError('文件不在用户配置的分析目录内；请在 MCP 的 CODEX_WEB_ANALYSIS_ROOTS 配置允许目录。')
        data,stamp=read_stable(file)
        try:text=data.decode('utf-8-sig')
        except UnicodeDecodeError:raise ValueError('文件不是 UTF-8 文本；Excel 请先导出 CSV，其他编码请先转换。') from None
        return self.document(text, kind, {'kind':'file','path':str(file),'name':file.name,'fileSha256':hashlib.sha256(data).hexdigest(),'signature':stamp})

    def import_mcp_result(self,output_id=None,server=None,offset=0,limit=10):
        if type(offset) is not int or offset<0 or type(limit) is not int or not 1<=limit<=20:raise ValueError('工具输出分页参数无效。')
        folder=self.evidence.path('tool_outputs',self.thread,'placeholder').parent
        if output_id is None:
            outputs=[json.loads(path.read_text()) for path in folder.glob('*.json')]
            outputs=[item for item in outputs if (not server or item['server']==server) and item.get('turnId')==self.gateway.turn_id]
            outputs.sort(key=lambda item:item['createdAt'],reverse=True)
            return {'outputs':outputs[offset:offset+limit],'offset':offset,'total':len(outputs),'hasMore':offset+limit<len(outputs),'nextStep':'选择本次真实工具调用的 outputId，再调用 import_mcp_result 导入原始 JSON；不得转抄数据或选择无关输出。已调用服务仍为空时请检查 Web 是否已重启加载最新事件记录。'}
        output_id=self.evidence.identity(output_id)
        path=self.evidence.path('tool_outputs',self.thread,output_id)
        if not path.is_file():raise ValueError('未找到当前会话的原始 MCP 输出，请先实际调用数据服务，再列出可导入输出。')
        info=json.loads(path.read_text())
        if not info.get('available'):raise ValueError(info.get('reason','工具输出不可导入。'))
        if server and info['server']!=server:raise ValueError('工具输出与指定服务不一致。')
        document=json.loads(self.evidence.path('documents',self.thread,info['documentId']).read_text())
        if document['threadId']!=self.thread or hashlib.sha256(document['text'].encode()).hexdigest()!=info['sha256']:raise ValueError('原始工具输出指纹不一致。')
        return {'documentId':document['documentId'],'format':'json','source':document['source'],'sha256':info['sha256'],'bytes':info['bytes'],'preview':document['text'][:3000],
                'nextStep':'使用 run_python 的 document_ids 解析原始 MCP JSON，再用结果 ID 绘图或发布；这是执行来源记录，不证明第三方数据本身真实。'}

    def calculate(self, code, result_ids=None, document_ids=None, parameters=None, title='Python 计算结果'):
        result_ids, document_ids = result_ids or [], document_ids or []
        if len(result_ids)+len(document_ids)>12:raise ValueError('本次计算引用的数据集或文档过多。')
        datasets, documents, sources, dependencies, inputs = {}, {}, [], {}, []
        checked_connections=set()
        for identifier in result_ids:
            metadata = self.gateway.snapshots.metadata(identifier)
            self.evidence.permitted(self.thread, metadata)
            self.gateway.result_owner(metadata,checked_connections)
            datasets[identifier] = {'columns':metadata['columns']}
            inputs.append(metadata)
            sources.append({'kind':'dataset','resultId':identifier,'sha256':metadata['sha256'],'source':metadata.get('sourceName',metadata.get('connectionName'))})
            for dependency in metadata.get('connectionDependencies',[]):dependencies[dependency['id']]=dependency
        for identifier in document_ids:
            path = self.evidence.path('documents', self.thread, identifier)
            if not path.is_file():raise ValueError('原始文档不属于当前会话或已清理。')
            document = json.loads(path.read_text())
            if document['threadId']!=self.thread or hashlib.sha256(document['text'].encode()).hexdigest()!=document['sha256']:
                raise ValueError('原始文档指纹不一致。')
            documents[identifier] = {'format':document['format'],'text':document['text']}
            inputs.append(document)
            sources.append(dict(documentId=identifier, sha256=document['sha256'], **document['source']))
        check_files(inputs)
        output = run_python(code, datasets, documents, parameters, self.gateway.snapshots, self.gateway.cancel, thread_id=self.thread)
        check_files(inputs)
        metadata = {'sourceKind':'python','sourceName':str(title)[:160], 'engine':'python', 'ownerThreadId':self.thread,'parentThreadId':self.gateway.parent_thread_id,
                    'pythonCode':code,'parameters':parameters or {},'inputSources':sources,'inputResultIds':result_ids,'fileDependencies':file_dependencies(inputs),
                    'connectionDependencies':list(dependencies.values()),'metricDependencies':metric_dependencies(inputs,self.gateway.snapshots),'knowledgeDependencies':list({s['sourceId']:s for m in inputs for s in m.get('knowledgeDependencies',[])}.values()),'calculationElapsedMs':output['elapsedMs'],
                    'acquisition':merge_acquisitions(inputs) if inputs else [receipt('calculation',self.thread,self.gateway.turn_id)]}
        result = self.gateway.snapshots.write(metadata, iter([(output['columns'],output['rows'])]))
        try:
            # The input can change while serializing the complete result. Reject
            # before delivering or registering this newly-created snapshot; later
            # consumers/publication still recheck dependencies independently.
            self.gateway.result_owner(result,checked_connections)
        except Exception:
            for suffix in ('.json', '.parquet'):
                self.gateway.snapshots.path(result['resultId']).with_suffix(suffix).unlink(missing_ok=True)
            raise
        self.remember(result)
        return self.gateway.manifest(result)

    def publish(self, template, references, purpose='answer'):
        if purpose not in ('answer','plan','auxiliary','unclassified'):raise ValueError('发布用途无效。')
        # Request-scoped only: never reuse connection success across publications.
        metadata_cache, page_cache, checked_connections, selected_columns = {}, {}, set(), {}
        metric_cache, metric_rules = {}, None
        if isinstance(references,dict):
            for ref in references.values():
                if isinstance(ref,dict) and isinstance(ref.get('result_id'),str) and type(ref.get('row')) is int and isinstance(ref.get('column'),str):
                    selected_columns.setdefault((ref['result_id'],ref['row']),set()).add(ref['column'])
        def resolve(reference):
            nonlocal metric_rules
            if not isinstance(reference,dict):raise ValueError('字段引用格式无效。')
            is_metadata=set(reference)=={'result_id','metadata'} and reference.get('metadata') in ('rowCount','columnCount')
            if not is_metadata and set(reference)!={'result_id','row','column'}:raise ValueError('引用须指定 result_id 和 row、column，或实际结果元信息 rowCount、columnCount。')
            identifier=reference['result_id'];row=reference.get('row');column=reference.get('column')
            if identifier not in metadata_cache:
                metadata_cache[identifier] = self.gateway.snapshots.metadata(identifier)
                self.evidence.permitted(self.thread, metadata_cache[identifier])
                self.gateway.result_owner(metadata_cache[identifier], checked_connections)
                if metadata_cache[identifier].get('metricProof'):
                    from metric_rules import MetricRules
                    if metric_rules is None:metric_rules=MetricRules(self.gateway)
                    metric_cache[identifier]=metric_rules.verify(metadata_cache[identifier], checked_connections) or {}
            metadata = metadata_cache[identifier]
            if is_metadata:
                column='@'+reference['metadata']
                value=metadata['rowCount'] if reference['metadata']=='rowCount' else len(metadata['columns'])
            else:
                if isinstance(row,bool) or not isinstance(row,int) or not 0<=row<metadata['rowCount']:raise ValueError('引用的结果行不存在。')
                if column not in [field['name'] for field in metadata['columns']]:raise ValueError('字段不存在。')
                if (identifier,row) not in page_cache:page_cache[identifier,row]=self.gateway.snapshots.page(identifier,row,1,sorted(selected_columns[identifier,row]))
                value=page_cache[identifier,row]['rows'][0][column]
            proof = {'resultId':identifier,'row':row,'column':column,'sha256':metadata['sha256'],
                     'referenceKind':'metadata' if is_metadata else 'field','sourceKind':metadata.get('sourceKind','database'),'sourceName':metadata.get('sourceName',metadata.get('connectionName')),
                     'query':metadata.get('executedQuery',metadata.get('query')),'pythonCode':metadata.get('pythonCode'),'inputSources':metadata.get('inputSources',[]),
                     'acquisition':acquisitions(metadata)}
            if column in metric_cache.get(identifier,{}):
                metric=metric_cache[identifier][column]
                selected=next((step for step in metric.get('rows',[]) if step['row']==row),None)
                proof['metric']=dict({key:item for key,item in metric.items() if key not in ('rows','source','parameters')},resultId=identifier,row=row,column=column)
                proof['metricContext']={'source':metric.get('source'),'parameters':metric.get('parameters'),'proofHash':metric['proofHash']}
                if selected is not None:
                    proof['metric']['step']={key:item for key,item in selected.items() if key!='sourceRows'}
                    proof['metric']['step']['sourceRowCount']=len(selected.get('sourceRows',[]))
            return value, proof
        # Initialize before holding the registry publication lock.
        learning = self.gateway.learning
        def check_sources():
            for metadata in metadata_cache.values():
                self.gateway.result_owner(metadata,checked_connections)
                if metadata.get('metricProof') and metric_rules:
                    stamp=metadata['metricProof']
                    metric_rules.assert_current(stamp['ruleId'],stamp['version'],stamp['definitionHash'])
            checks = publication_checks(list(metadata_cache.values()),self.gateway.store.get,self.thread,self.gateway.turn_id)
            stamps={s['sourceId']:s for s in learning.current_reads()}
            stamps.update({s['sourceId']:s for m in metadata_cache.values() for s in m.get('knowledgeDependencies', [])})
            if learning.check(list(stamps.values())):raise ValueError('本轮读取的业务知识已变化，请重新读取当前定义再发布回答。')
            checks['knowledge'] = list(stamps.values())
            checks['metrics'] = metric_dependencies(list(metadata_cache.values()),self.gateway.snapshots)
            checks['metricDependenciesComplete'] = True
            checks['files'] = file_dependencies(list(metadata_cache.values()))
            return checks
        @contextmanager
        def commit_guard():
            # References have already been read/probed. Hold the registry writer
            # lock through final rule checks and answer write so a concurrent
            # confirmation/revocation has a definite order against publication.
            with self.gateway.cancel.commit():
                with self.gateway.store.connect() as database:
                    database.execute('BEGIN IMMEDIATE')
                    yield
        record = self.evidence.publish(self.thread,template,references,resolve,self.gateway.turn_id,check_sources,commit_guard,purpose=purpose)
        return {'answerId':record['answerId'],'text':record['text'],'verifiedValues':len(record['evidence']),'linkedFields':len(record['evidence']),'publicationChecks':record['publicationChecks'],'assurance':record['assurance'],
                'instruction':'逐字返回发布正文；只有 references 所列字段关联了执行记录。普通说明、用户参数和计划编号无需执行。正文解释及因果判断未认证，不得宣称整份报告正确；改写正文需重新发布。'}
