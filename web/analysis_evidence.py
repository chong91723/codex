"""Versioned answer evidence, independent of model reasoning or Codex internals."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import unicodedata

POLICY_VERSION = 'numeric-evidence-v1'
REFERENCE = re.compile(r'\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}')
CHINESE_NUMBER = re.compile(r'(?:(?:为|是|：|:)\s*[零〇一二三四五六七八九十百千万亿两]+|百分之[零〇一二三四五六七八九十百千万亿两]+|第[零〇一二三四五六七八九十百千万亿两]+|[零〇一二三四五六七八九十百千万亿两]+(?:个|条|笔|天|日|月|年|元|万|亿|倍|成|位|次|项|组|类|种|页|行|列|份|点|步|轮|名|户|家|只|支|股|%|％))')

ENGLISH_NUMBER = re.compile(r'(?<![A-Za-z_])(?:zero|nought|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|half|quarter|once|twice)(?![A-Za-z_])',re.I)
BARE_CHINESE_NUMBER = re.compile(r'(?:总计|合计|数量|总额|金额|平均值|平均额|结果|答案|记录数|最大值|最小值|等于|达到)\s*[负零〇一二三四五六七八九十百千万亿两]+(?![\u4e00-\u9fffA-Za-z])|(?:^|[\s，。；：、（(])[负零〇一二三四五六七八九十百千万亿两]+(?=[\s，。；、）)]|$)')


def has_number(text):
    # A format term names punctuation, rather than asserting a data quantity.
    text = text.replace('千位分隔符', '')
    return any(unicodedata.category(c) in ('Nd', 'Nl', 'No') for c in text) or bool(CHINESE_NUMBER.search(text) or ENGLISH_NUMBER.search(text) or BARE_CHINESE_NUMBER.search(text))


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
        for kind in ('turns','datasets','documents','answers'):
            path=self.root/kind/thread
            try:shutil.rmtree(path)
            except FileNotFoundError:pass

    def observe(self, message):
        if message.get('method')=='thread/deleted':
            self.remove_thread((message.get('params') or {}).get('threadId'))
            return
        if message.get('method') != 'turn/started':
            return
        params = message.get('params') or {}
        thread, turn = params.get('threadId'), (params.get('turn') or {}).get('id')
        if thread and turn:
            self.write(self.path('turns', thread, turn), {'version': POLICY_VERSION, 'threadId': thread, 'turnId': turn})

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

    def publish(self, thread, template, references, resolve, turn=None):
        self.identity(thread)
        self.identity(turn)
        if not isinstance(template, str) or not template.strip() or len(template) > 80000:
            raise ValueError('回答模板为空或过长。')
        if not isinstance(references, dict) or len(references) > 400:
            raise ValueError('请提供数值或字段引用对象。')
        names = REFERENCE.findall(template)
        skeleton = REFERENCE.sub('', template)
        if '{{' in skeleton or '}}' in skeleton or has_number(skeleton) or re.search(r'!\[[^\]]*\]\(|<(?:img|svg|iframe)\b', skeleton, re.I):
            raise ValueError('回答含未引用的数字；数值、日期和编号须使用 {{字段名}} 引用真实查询或 Python 结果。序号请使用无数字的项目符号。')
        if set(names) != set(references):
            raise ValueError('模板占位符与引用名称不一致。')
        values, evidence, sources = {}, [], {}
        for name in dict.fromkeys(names):
            value, proof = resolve(references[name])
            # A field is text, never executable Markdown/HTML from an external source.
            text = '—' if value is None else str(value)
            values[name] = re.sub(r'([\\`*_{}\[\]<>!|])', r'\\\1', text.replace('\n', ' '))
            sources[proof['resultId']] = {key: proof.pop(key) for key in ('query','pythonCode','inputSources') if key in proof}
            evidence.append(dict(name=name, value=value, **proof))
        text = REFERENCE.sub(lambda match: values[match[1]], template)
        digest = hashlib.sha256(canonical(text).encode()).hexdigest()
        record = {'version': POLICY_VERSION, 'answerId': digest, 'threadId': thread, 'turnId': turn,
                  'text': text, 'template': template, 'evidence': evidence, 'sources': sources,
                  'createdAt': datetime.now(timezone.utc).isoformat()}
        self.write(self.path('answers', thread, digest).parent/self.identity(turn)/(digest+'.json'), record)
        return record

    def verify(self, thread, turn, text, require_evidence=False):
        if not isinstance(text, str) or len(text) > 100000:
            raise ValueError('待核验回答过长或格式无效。')
        self.identity(thread)
        strict = require_evidence or bool(turn and self.path('turns', thread, turn).is_file())
        if not has_number(text) and not re.search(r'!\[[^\]]*\]\(|<(?:img|svg|iframe)\b', text, re.I):
            return {'status': 'notRequired', 'strict': strict, 'version': POLICY_VERSION}
        digest = hashlib.sha256(canonical(text).encode()).hexdigest()
        path = self.path('answers', thread, digest).parent/self.identity(turn or 'unknown-turn')/(digest+'.json')
        if path.is_file():
            record = json.loads(path.read_text())
            if record.get('version') != POLICY_VERSION or has_number(REFERENCE.sub('',record.get('template',''))):
                raise ValueError('保存的回答模板不符合当前数值依据规则，请重新发布。')
            if record.get('threadId') != thread or record.get('turnId') != turn or hashlib.sha256(canonical(record['text']).encode()).hexdigest() != digest:
                raise ValueError('回答证据记录不一致。')
            return {'status': 'verified', 'strict': strict, 'answerId': digest,
                    'evidence': record['evidence'], 'sources': record.get('sources',{}), 'version': POLICY_VERSION}
        return {'status': 'rejected' if strict else 'legacy', 'strict': strict,
                'reason': '回答中的数字没有匹配的查询或 Python 执行证据。请要求 Codex 补充查询或 Python 计算后重新回答；不会自动重发任务。',
                'version': POLICY_VERSION}
