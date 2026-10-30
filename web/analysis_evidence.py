"""Versioned answer evidence, independent of model reasoning or Codex internals."""
import sqlite3
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from contextlib import nullcontext
import re
import secrets
import shutil
from markdown_tables import validate_published_tables

POLICY_VERSION = 'data-evidence-v2'
LEGACY_VERSION = 'numeric-evidence-v1'
REFERENCE = re.compile(r'\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}')
DATA_TOOLS = frozenset(('query_database','read_result','analyze_result','run_python','execute_metric',
                        'fetch_data','import_data_file','import_mcp_result','create_chart','publish_answer'))


def field_text(value):
    text = '—' if value is None else str(value)
    return re.sub(r'([\\`*_{}\[\]<>!|])', r'\\\1', text.replace('\n', ' '))


def assurance(record):
    """Independent, field-scoped facts; never a semantic certificate for prose."""
    fields = record.get('evidence', [])
    return {'scope':'referenced-fields',
            'source':{'status':'linked' if fields else 'none','fields':[item['name'] for item in fields]},
            'execution':{'status':'recorded' if fields else 'none',
                         'kinds':sorted({item.get('sourceKind','unknown') for item in fields})},
            'metric':{'status':'confirmed-rule-executed' if any(item.get('metric') for item in fields) else 'not-applied',
                      'fields':[item['name'] for item in fields if item.get('metric')]},
            'narrative':{'status':'not-assessed','reason':'解释、比较与因果判断未作语义正确性认证；仅所列字段引用与执行记录匹配。'}}


def canonical(text):
    value = text.strip().replace('\r\n', '\n')
    if value.startswith('<proposed_plan>') and value.endswith('</proposed_plan>'):
        value = value[len('<proposed_plan>'):-len('</proposed_plan>')].strip()
    return value


class Evidence:
    def __init__(self, directory=None):
        default = Path(os.environ.get('CODEX_HOME', Path.home()/'.codex'))/'web-databases'
        self.root = Path(directory or os.environ.get('CODEX_WEB_DB_STATE', default))/'analysis'

    @staticmethod
    def identity(value):
        if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,128}', value):
            raise ValueError('缺少有效的原生会话或任务标识。')
        return value

    def path(self, kind, thread, name):
        return self.root/kind/self.identity(thread)/(self.identity(name)+'.json')

    @staticmethod
    def write(path, value):
        path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        temporary = path.with_suffix('.'+secrets.token_hex(8)+'.partial')
        try:
            with temporary.open('x', encoding='utf-8') as target:
                temporary.chmod(0o600)
                json.dump(value, target, ensure_ascii=False, allow_nan=False)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)

    def remove_thread(self, thread):
        thread=self.identity(thread)
        for kind in ('turns','datasets','documents','answers','tool_outputs','activities'):
            path=self.root/kind/thread
            try:shutil.rmtree(path)
            except FileNotFoundError:pass

        registry=self.root.parent/'registry.sqlite3'
        if registry.exists():
            with sqlite3.connect(registry,timeout=15) as database:
                if database.execute("SELECT count(*) FROM sqlite_master WHERE name='analysis_knowledge_reads'").fetchone()[0]:
                    database.execute('DELETE FROM analysis_knowledge_reads WHERE thread_id=?',(thread,))

    def observe(self, message):
        if message.get('method')=='thread/deleted':
            self.remove_thread((message.get('params') or {}).get('threadId'))
            return
        if message.get('method')=='item/completed':
            self.record_activity(message.get('params') or {})
            self.capture_tool_output(message.get('params') or {})
            return
        if message.get('method') != 'turn/started':
            return
        params = message.get('params') or {}
        thread, turn = params.get('threadId'), (params.get('turn') or {}).get('id')
        if thread and turn:
            path=self.path('turns', thread, turn)
            if not path.exists():self.write(path, {'version': POLICY_VERSION, 'threadId': thread, 'turnId': turn})

    def record_activity(self, params):
        item=params.get('item') or {}
        if item.get('type')!='mcpToolCall' or not params.get('threadId') or not params.get('turnId') or not item.get('id'):return
        if item.get('server')=='codex_web_databases' and item.get('tool') not in DATA_TOOLS:return
        thread,turn=self.identity(params['threadId']),self.identity(params['turnId'])
        identity=hashlib.sha256(str(item['id']).encode()).hexdigest()
        path=self.path('activities',thread,turn).with_suffix('')/(identity+'.json')
        self.write(path,{'tool':item.get('tool'),'server':item.get('server'),'status':item.get('status'),
                         'successful':item.get('status')=='completed' and not (item.get('result') or {}).get('isError')})

    def context(self, thread, turn):
        path=self.path('turns',thread,turn or 'unknown-turn')
        version=json.loads(path.read_text()).get('version') if path.is_file() else None
        activity=self.path('activities',thread,turn or 'unknown-turn').with_suffix('')
        return {'version':version,'dataActivity':activity.is_dir() and any(json.loads(item.read_text()).get('successful') for item in activity.glob('*.json'))}

    def capture_tool_output(self,params):
        item=params.get('item') or {};result=item.get('result')
        if item.get('type')!='mcpToolCall' or item.get('status')!='completed' or item.get('server') in (None,'codex_web_databases') or not isinstance(result,dict) or result.get('isError'):return
        if not params.get('threadId') or not params.get('turnId') or not item.get('id'):return
        thread,turn=self.identity(params.get('threadId')),self.identity(params.get('turnId'))
        output=hashlib.sha256(json.dumps([thread,turn,item.get('id'),item['server'],item.get('tool')]).encode()).hexdigest()[:32]
        text=json.dumps(result,ensure_ascii=False,allow_nan=False);created=datetime.now(timezone.utc).isoformat()
        info={'outputId':output,'threadId':thread,'turnId':turn,'server':item['server'],'tool':item.get('tool'),'createdAt':created,'bytes':len(text.encode())}
        if info['bytes']>4*1024*1024:
            self.write(self.path('tool_outputs',thread,output),dict(info,available=False,reason='工具输出超过文档预算，请在原服务分页或缩小范围。'));return
        digest=hashlib.sha256(text.encode()).hexdigest();path=self.path('documents',thread,output)
        if path.exists():
            if json.loads(path.read_text()).get('sha256')!=digest:raise ValueError('相同原生工具调用返回了不一致内容，未覆盖原文。')
            return
        record={'documentId':output,'threadId':thread,'format':'json','text':text,'sha256':digest,
                'source':{'kind':'mcp','server':item['server'],'tool':item.get('tool'),'outputId':output},
                'acquisition':[{'kind':'mcp','threadId':thread,'turnId':turn,'retrievedAt':created}]}
        self.write(path,record);self.write(self.path('tool_outputs',thread,output),dict(info,available=True,documentId=output,sha256=digest))

    def remember(self, thread, metadata):
        self.write(self.path('datasets', thread, metadata['resultId']), {
            'resultId': metadata['resultId'], 'sha256': metadata['sha256'],
            'sourceKind': metadata.get('sourceKind', 'database'),
        })

    def permitted(self, thread, metadata):
        path = self.path('datasets', thread, metadata['resultId'])
        if not path.is_file():
            raise ValueError('该数据集尚未在当前会话中查询、读取或计算，不能作为本次回答依据。')
        record = json.loads(path.read_text())
        if record['sha256'] != metadata['sha256']:
            raise ValueError('数据集指纹不匹配，不能发布数值。')

    def publish(self, thread, template, references, resolve, turn=None, check_sources=None, commit_guard=None, purpose='answer'):
        self.identity(thread)
        self.identity(turn)
        if not isinstance(template, str) or not template.strip() or len(template) > 80000:
            raise ValueError('回答模板为空或过长。')
        if not isinstance(references, dict) or len(references) > 400:
            raise ValueError('请提供数值或字段引用对象。')
        prose=''.join(re.split(r'(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`]*`)',template)[::2])
        if r'\n\n' in prose or r'\n|' in prose:
            raise ValueError('模板含字面反斜杠换行。请在 template 字符串中使用实际换行；保留代码块与路径的真实转义，不要输出 JSON 转义后的正文。')
        names = REFERENCE.findall(template)
        skeleton = REFERENCE.sub('', template)
        if '{{' in skeleton or '}}' in skeleton or re.search(r'!\[[^\]]*\]\(|<(?:img|svg|iframe)\b', skeleton, re.I):
            raise ValueError('字段占位符或正文格式无效；图表须通过 ECharts 展示。')
        if purpose=='answer' and not references:
            raise ValueError('正式数据结果必须关联实际字段引用；普通说明、用户参数和计划无需调用发布工具。')
        if set(names) != set(references):
            raise ValueError('模板占位符与引用名称不一致。')
        values, evidence, sources = {}, [], {}
        for name in dict.fromkeys(names):
            value, proof = resolve(references[name])
            # A field is text, never executable Markdown/HTML from an external source.
            values[name] = field_text(value)
            sources.setdefault(proof['resultId'], {}).update({key: proof.pop(key) for key in ('query','pythonCode','inputSources','metricContext') if key in proof})
            evidence.append(dict(name=name, value=value, **proof))
        with commit_guard() if commit_guard else nullcontext():
            checks = check_sources() if check_sources else {'version':'legacy'}
            text = REFERENCE.sub(lambda match: values[match[1]], template)
            validate_published_tables(text)
            digest = hashlib.sha256(canonical(text).encode()).hexdigest()
            record = {'version': POLICY_VERSION, 'answerId': digest, 'threadId': thread, 'turnId': turn,
                      'text': text, 'template': template, 'evidence': evidence, 'sources': sources, 'publicationChecks':checks,
                      'createdAt': datetime.now(timezone.utc).isoformat(), 'purpose':purpose}
            record['assurance']=assurance(record)
            self.write(self.path('answers', thread, digest).parent/self.identity(turn)/(digest+'.json'), record)
        return record

    def published_answer(self,thread,turn):
        """Return an explicit published report, never certify a different text."""
        thread,turn=self.identity(thread),self.identity(turn)
        folder=self.path('answers',thread,'placeholder').parent/turn
        records=[json.loads(path.read_text()) for path in folder.glob('*.json')]
        records=[record for record in records if record.get('purpose')=='answer' and record.get('evidence') and record.get('threadId')==thread and record.get('turnId')==turn]
        if not records:return {'status':'unavailable'}
        record=max(records,key=lambda item:item['createdAt'])
        checked=self.verify(thread,turn,record['text'],True)
        if checked['status']!='verified':raise ValueError('已发布报告的正文校验失败。')
        return dict(checked,text=record['text'],delivery='published-report',nativeMessageMatched=False)

    def verify(self, thread, turn, text, require_evidence=False):
        if not isinstance(text, str) or len(text) > 100000:
            raise ValueError('待核对内容过长或格式无效。')
        self.identity(thread)
        context=self.context(thread,turn)
        digest=hashlib.sha256(canonical(text).encode()).hexdigest()
        directory=self.path('answers',thread,digest).parent/self.identity(turn or 'unknown-turn')
        path=directory/(digest+'.json')
        if path.is_file():
            record=json.loads(path.read_text())
            if record.get('version') not in (POLICY_VERSION,LEGACY_VERSION):raise ValueError('保存的依据记录版本不受支持。')
            fields=record.get('evidence',[])
            values={item['name']:field_text(item['value']) for item in fields}
            template=record.get('template','')
            if set(REFERENCE.findall(template))!=set(values):raise ValueError('保存的字段引用与正文不一致。')
            reconstructed=REFERENCE.sub(lambda match:values[match[1]],template)
            if (record.get('threadId')!=thread or record.get('turnId')!=turn
                    or canonical(reconstructed)!=canonical(record.get('text',''))
                    or hashlib.sha256(canonical(record.get('text','')).encode()).hexdigest()!=digest):
                raise ValueError('保存的正文或字段依据不一致。')
            return {'status':'verified' if fields else 'notRequired','strict':True,'answerId':digest,
                    'version':record['version'],'verificationScope':'referenced-fields' if fields else 'conversation',
                    'assurance':assurance(record),'evidence':fields,'sources':record.get('sources',{}),
                    'publicationChecks':record.get('publicationChecks',{'version':'legacy'})}
        published=directory.is_dir() and any(json.loads(item.read_text()).get('evidence') for item in directory.glob('*.json'))
        required=context['dataActivity'] or published or require_evidence
        if required:
            return {'status':'rejected','strict':True,'version':POLICY_VERSION,'verificationScope':'none',
                    'reason':'内容未关联可匹配的执行字段。可阅读原文，但不能视为已核验数据结果；请补充实际来源。'}
        return {'status':'notRequired' if context['version']==POLICY_VERSION else 'legacy',
                'strict':False,'version':POLICY_VERSION,'verificationScope':'conversation',
                'reason':'对话内容未作数据事实认证；是否包含数字不决定校验。'}
