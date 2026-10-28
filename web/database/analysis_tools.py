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
from analysis_evidence import Evidence,has_number
from calculation import run_python
from data_freshness import receipt, acquisitions, merge_acquisitions, publication_checks

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
        if kind not in ('json', 'csv', 'text') or len(text.encode()) > 4*1024*1024:
            raise ValueError('文档格式不支持或超出读取预算。')
        if kind == 'json':json.loads(text)
        identifier = secrets.token_hex(16)
        record = {'documentId': identifier, 'format': kind, 'text': text, 'source': source,
                  'sha256': hashlib.sha256(text.encode()).hexdigest(), 'threadId': self.thread,
                  'acquisition': [receipt(source['kind'], self.thread, self.gateway.turn_id)]}
        with self.gateway.cancel.commit():
            self.evidence.write(self.evidence.path('documents', self.thread, identifier), record)
        return {'documentId': identifier, 'format': kind, 'source': source, 'bytes': len(text.encode()),
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
        if not file.is_file() or file.stat().st_size > 4*1024*1024:raise ValueError('文件不存在或超出读取预算。')
        with file.open('rb') as source:data=source.read(4*1024*1024+1)
        if len(data)>4*1024*1024:raise ValueError('读取期间文件变大，未导入部分内容。')
        return self.document(data.decode('utf-8-sig'), kind, {'kind':'file','path':str(file),'name':file.name})

    def calculate(self, code, result_ids=None, document_ids=None, parameters=None, title='Python 计算结果'):
        if has_number(str(title)):raise ValueError('计算标题请使用无数字的描述；具体数值、日期和精度放入 result 字段，回答时引用。')
        result_ids, document_ids = result_ids or [], document_ids or []
        if len(result_ids)+len(document_ids)>12:raise ValueError('本次计算引用的数据集或文档过多。')
        datasets, documents, sources, dependencies, inputs = {}, {}, [], {}, []
        for identifier in result_ids:
            metadata = self.gateway.snapshots.metadata(identifier)
            self.evidence.permitted(self.thread, metadata)
            self.gateway.result_owner(metadata)
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
        output = run_python(code, datasets, documents, parameters, self.gateway.snapshots, self.gateway.cancel, thread_id=self.thread)
        metadata = {'sourceKind':'python','sourceName':str(title)[:160], 'engine':'python', 'ownerThreadId':self.thread,'parentThreadId':self.gateway.parent_thread_id,
                    'pythonCode':code,'parameters':parameters or {},'inputSources':sources,'inputResultIds':result_ids,
                    'connectionDependencies':list(dependencies.values()),'calculationElapsedMs':output['elapsedMs'],
                    'acquisition':merge_acquisitions(inputs) if inputs else [receipt('calculation',self.thread,self.gateway.turn_id)]}
        result = self.gateway.snapshots.write(metadata, iter([(output['columns'],output['rows'])]))
        self.remember(result)
        return self.gateway.manifest(result)

    def check_chart_title(self, title):
        if title and has_number(title):
            status=self.evidence.verify(self.thread,self.gateway.turn_id,title,True)
            if status['status']!='verified':raise ValueError('图表标题中的数字未核验；请使用无数字标题，或先 publish_answer 发布该标题再原样传入。')

    def publish(self, template, references):
        # Request-scoped only: never reuse connection success across publications.
        metadata_cache, page_cache, checked_connections, selected_columns = {}, {}, set(), {}
        metric_cache, metric_rules = {}, None
        if isinstance(references,dict):
            for ref in references.values():
                if isinstance(ref,dict) and isinstance(ref.get('result_id'),str) and type(ref.get('row')) is int and isinstance(ref.get('column'),str):
                    selected_columns.setdefault((ref['result_id'],ref['row']),set()).add(ref['column'])
        def resolve(reference):
            nonlocal metric_rules
            if not isinstance(reference, dict) or set(reference) != {'result_id','row','column'}:
                raise ValueError('引用须包含 result_id、从零开始的 row 和 column。')
            identifier, row, column = reference['result_id'], reference['row'], reference['column']
            if identifier not in metadata_cache:
                metadata_cache[identifier] = self.gateway.snapshots.metadata(identifier)
                self.evidence.permitted(self.thread, metadata_cache[identifier])
                self.gateway.result_owner(metadata_cache[identifier], checked_connections)
                if metadata_cache[identifier].get('metricProof'):
                    from metric_rules import MetricRules
                    if metric_rules is None:metric_rules=MetricRules(self.gateway)
                    metric_cache[identifier]=metric_rules.verify(metadata_cache[identifier], checked_connections) or {}
            metadata = metadata_cache[identifier]
            if isinstance(row, bool) or not isinstance(row,int) or not 0<=row<metadata['rowCount']:
                raise ValueError('引用的结果行不存在。')
            if column not in [field['name'] for field in metadata['columns']]:raise ValueError('字段不存在。')
            if (identifier,row) not in page_cache:page_cache[identifier,row] = self.gateway.snapshots.page(identifier,row,1,sorted(selected_columns[identifier,row]))
            value = page_cache[identifier,row]['rows'][0][column]
            proof = {'resultId':identifier,'row':row,'column':column,'sha256':metadata['sha256'],
                     'sourceKind':metadata.get('sourceKind','database'),'sourceName':metadata.get('sourceName',metadata.get('connectionName')),
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
        def check_sources():
            for metadata in metadata_cache.values():
                self.gateway.result_owner(metadata,checked_connections)
                if metadata.get('metricProof') and metric_rules:
                    stamp=metadata['metricProof']
                    metric_rules.assert_current(stamp['ruleId'],stamp['version'],stamp['definitionHash'])
            return publication_checks(list(metadata_cache.values()),self.gateway.store.get,self.thread,self.gateway.turn_id)
        @contextmanager
        def commit_guard():
            # References have already been read/probed. Hold the registry writer
            # lock through final rule checks and answer write so a concurrent
            # confirmation/revocation has a definite order against publication.
            with self.gateway.cancel.commit():
                if metric_rules is None:
                    yield
                else:
                    with self.gateway.store.connect() as database:
                        database.execute('BEGIN IMMEDIATE')
                        yield
        record = self.evidence.publish(self.thread,template,references,resolve,self.gateway.turn_id,check_sources,commit_guard)
        return {'answerId':record['answerId'],'text':record['text'],'verifiedValues':len(record['evidence']),'publicationChecks':record['publicationChecks'],
                'instruction':'将 text 原样作为本次最终回答。不要自行改数字、加日期、列表数字或附加带数字的来源链接；修改文案后需重新 publish_answer。'}
