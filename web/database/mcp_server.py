#!/usr/bin/env python3
"""Native Codex connects to these read-only database tools over MCP stdio."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import sys
import threading
from service import Gateway
from cancellation import Cancellation
from analysis_tools import DEFAULT_ORIGINS

ANNOTATIONS={'readOnlyHint':True,'destructiveHint':False,'idempotentHint':True,'openWorldHint':True}

def schema(properties,required):return {'type':'object','properties':properties,'required':required,'additionalProperties':False}
ID={'type':'string','description':'list_databases 返回的已配置且验证连通的数据库 ID。'}
TOOLS=[
 {'name':'list_databases','description':'列出用户已配置、启用、连接通过且账号为只读的数据库。不会返回密码。查询前请先使用此工具确认可用连接。','inputSchema':schema({},[])},
 {'name':'describe_database','description':'读取指定可用数据库的表和字段结构。仅接受已配置且连通的数据库 ID；Elasticsearch 返回索引字段。','inputSchema':schema({'connection_id':ID,'table':{'type':'string','description':'可选表名，省略时列出可见字段。'}},['connection_id'])},
 {'name':'query_database','description':'执行 1–5 条只读 SELECT/CTE 或一条 Elasticsearch Query DSL。跨库查询仅限用户已配置、启用且连通的同服务器数据库/schema。禁止写入、DDL、存储过程、锁定、文件导出及外部文件函数。写入没有授权例外。完整结果流式保存为不可变快照，不截断数据，也不把所有行塞入上下文。返回结果编号、精确行数和字段；使用 read_result 按需读取明细，或 analyze_result 对完整结果精确计算。先查看表结构，不要猜列名。返回 resultId 可供 create_chart 使用。','inputSchema':schema({'connection_id':ID,'query':{'type':'string','description':'MySQL/PostgreSQL/ClickHouse 的 1–5 条只读 SQL；Elasticsearch 为 Query DSL JSON 字符串。'}},['connection_id','query'])},
 {'name':'create_chart','description':'基于 query_database、analyze_result 或 run_python 的真实结果 ID 生成交互图表。API、文件和纯计算结果无需数据库。数据由服务器直接读取不可变快照，禁止重新编造数据。由本机 mcp-echarts 校验，网页直接显示。适合在回答中展示统计、趋势与占比。','inputSchema':schema({'result_id':{'type':'string'},'kind':{'type':'string','enum':['bar','line','area','pie','scatter']},'x':{'type':'string','description':'结果数据集中的横轴/分类字段。'},'ys':{'type':'array','items':{'type':'string'},'minItems':1,'maxItems':6,'description':'结果数据集中的数值指标字段。饼图/散点图仅一个。'},'title':{'type':'string','description':'简短中文图表标题。'}},['result_id','kind','x','ys'])}
]
TOOLS.extend([
 {'name':'read_result','description':'按结果 ID 读取原始查询结果的精确明细页；未读取的行仍完整保留。每次 1–200 行，可选择字段。不要为了逐行扫描而把所有页面依次打印到上下文；需要全量计算时用 analyze_result。','inputSchema':schema({'result_id':{'type':'string'},'offset':{'type':'integer','minimum':0},'limit':{'type':'integer','minimum':1,'maximum':200},'columns':{'type':'array','items':{'type':'string'}}},['result_id'])},
 {'name':'describe_result','description':'读取结果的完整字段定义，可用 offset/limit 分页查看字段。数据和字段不会因上下文预算被丢弃。','inputSchema':schema({'result_id':{'type':'string'},'offset':{'type':'integer','minimum':0},'limit':{'type':'integer','minimum':1,'maximum':100}},['result_id'])},
 {'name':'analyze_result','description':'在服务器上对完整查询结果进行精确 SQL 分析。唯一表名为 result，可分组、排序、筛选、窗口计算，不调用模型逐行计算。只接受 SELECT；禁止文件读取、网络、扩展、写入、其他表。返回新的完整结果 ID，可继续读取或绘图。计算不是对原数据的摘要替换，原始每行每列仍保留。','inputSchema':schema({'result_id':{'type':'string'},'query':{'type':'string'}},['result_id','query'])}
])
TOOLS.extend([
 {'name':'fetch_data','description':'从用户允许的 API origin 获取真实 JSON/CSV/文本原始文档，不访问业务数据库。返回 documentId；用 run_python 的 document_ids 解析完整数据。默认支持配置的国内行情入口，禁止自行切换未配置来源。当前允许的 origin：'+os.environ.get('CODEX_WEB_DATA_ORIGINS',DEFAULT_ORIGINS), 'inputSchema':schema({'url':{'type':'string'},'format':{'type':'string','enum':['json','csv','text']}},['url'])},
 {'name':'import_data_file','description':'读取用户配置分析目录中的 CSV/JSON/文本文件，返回 documentId，供 run_python 使用；不执行文件内容，不读取目录外文件。','inputSchema':schema({'path':{'type':'string'},'format':{'type':'string','enum':['json','csv','text']}},['path'])},
 {'name':'run_python','description':'在预装 NumPy/pandas/Decimal 的无网络隔离 Python 中计算，不安装包，不使用任何绘图库。datasets[resultId] 为完整记录列表，documents[documentId] 为完整 JSON 对象/CSV记录/文本，parameters为显式参数。设置 result 为平铺记录列表或 DataFrame；每行字段必须一致，单元格必须为标量，不接受嵌套列表/字典。明细与摘要可分两次计算，或将标量摘要重复到各明细行。空结果另设 columns 为字段名列表。返回真实 resultId，可用 read_result/publish_answer/create_chart。所有新计算、比率、日期推导与预测值必须实际执行，禁止模型心算。绘图只能使用 ECharts create_chart。计算标题不要包含数字；图表标题含数字时须先用 publish_answer 发布该标题。','inputSchema':schema({'code':{'type':'string'},'result_ids':{'type':'array','items':{'type':'string'}},'document_ids':{'type':'array','items':{'type':'string'}},'parameters':{'type':'object'},'title':{'type':'string'}},['code'])},
 {'name':'publish_answer','description':'发布带数值依据的最终回答。template中的每个数值/日期/编号/百分比及精度（如三位小数的三）使用 {{变量名}}，references按变量名映射 {result_id,row,column}（row从零开始）。只允许当前会话实际查询/读取或 Python 计算结果的字段；不允许模板裸写数字、心算、手抄或无依据预测。Markdown 表格必须让表头、分隔行和各数据行列数一致。数据源时效由用户在数据源页面设置，工具不能绕过；超过复用时长需重新查询，旧快照再计算不算重新读取。未设置时效规则不代表数据最新，用户询问最新状态时应重新查询。仅证明与执行记录匹配，不证明业务口径。返回 text 后原样作为最终回答；改动文案需重新发布。来源说明请用无数字文字，数据来源与计算代码自动留存。','inputSchema':schema({'template':{'type':'string'},'references':{'type':'object','additionalProperties':{'type':'object','properties':{'result_id':{'type':'string'},'row':{'type':'integer','minimum':0},'column':{'type':'string'}},'required':['result_id','row','column'],'additionalProperties':False}}},['template','references'])}
])
TOOLS.extend([
 {'name':'list_metric_rules','description':'读取用户在数据源页面确认且当前有效的指标口径及字段映射。分析业务指标时先查适用口径，按用户问题选择规则、参数和分析步骤。此工具不能创建、修改或确认口径；没有适用规则可继续普通分析，但不可宣称口径或推导已验证。','inputSchema':schema({'source_id':{'type':'string'}},[])},
 {'name':'execute_metric','description':'按指定版本的已确认指标口径执行真实只读查询、聚合和公式计算，返回可读取/绘图/发布的 resultId。系统按实际读取数据生成逐步推导记录，检查字段类型、粒度唯一性、单位、空值、零分母及舍入规则。仅提交口径 ID、版本和定义中的参数，不能替换公式或输入常量冒充业务字段。此状态只说明执行符合该口径，不保证业务定义或回答语义正确。','inputSchema':schema({'rule_id':{'type':'string'},'version':{'type':'integer','minimum':1},'parameters':{'type':'object'}},['rule_id','version','parameters'])}
])
for tool in TOOLS:tool['annotations']=ANNOTATIONS

def main():
    lock=threading.Lock();pending_lock=threading.Lock();pending={};pool=ThreadPoolExecutor(max_workers=4)
    def respond(message):
        with lock:sys.stdout.write(json.dumps(message,ensure_ascii=False)+'\n');sys.stdout.flush()
    def handle(request,token):
        context=request.get('params',{}).get('_meta') or {}
        turn=context.get('x-codex-turn-metadata') or {}
        if isinstance(turn,str):
            try:turn=json.loads(turn)
            except ValueError:turn={}
        if not isinstance(turn,dict):turn={}
        gateway=Gateway(cancellation=token,thread_id=context.get('threadId'),turn_id=turn.get('turn_id'),parent_thread_id=turn.get('parent_thread_id'))
        identifier=request.get('id');method=request.get('method');params=request.get('params') or {}
        if identifier is None:return
        try:
            if method=='initialize':result={'protocolVersion':params.get('protocolVersion','2025-06-18'),'capabilities':{'tools':{}},'serverInfo':{'name':'codex-web-readonly-databases','version':'1.1.0'},'instructions':'业务指标分析先用 list_metric_rules 查找适用的用户确认口径，由 Agent 选择规则与参数并规划分析；有适用口径用 execute_metric，不用自由 SQL/Python 冒充同等证明。没有适用规则时允许探索分析并说明口径未确认。推导证明由实际执行生成，不能用自述代替；不得自行确认规则。数据库仅可读取。仅数据库问题先 list_databases、describe_database、query_database。文件/API/纯计算不借用无关数据库，使用 fetch_data/import_data_file、run_python。绘图唯一使用 ECharts create_chart，不能下载或调用其他绘图库。所有回答数字必须来自查询或 Python 执行结果，用 publish_answer 发布后原样输出，不能心算或补数。完整数据保存在服务器，query_database 只返回结果引用。使用 read_result 读取必要明细，使用 analyze_result 对全量数据精确计算。需要图表时用结果 ID 调用 create_chart。不要编造数据，不要把全量明细逐页打印进上下文。'}
            elif method=='tools/list':result={'tools':TOOLS}
            elif method=='ping':result={}
            elif method in ('resources/list','resources/templates/list'):result={'resources':[]} if method=='resources/list' else {'resourceTemplates':[]}
            elif method=='tools/call':
                name=params.get('name');args=params.get('arguments') or {}
                if name=='list_databases':data={'connections':gateway.available(),'readOnly':True}
                elif name in ('list_metric_rules','execute_metric'):
                    from metric_rules import MetricRules
                    rules=MetricRules(gateway)
                    data=rules.available(args.get('source_id')) if name=='list_metric_rules' else gateway.manifest(rules.execute(args['rule_id'],args['version'],args['parameters']))
                elif name=='describe_database':data=gateway.schema(args['connection_id'],args.get('table'))
                elif name=='query_database':
                    value=gateway.query(args['connection_id'],args['query']);data={'results':[gateway.manifest(v) for v in value['results']],'readOnly':True} if 'results' in value else gateway.manifest(value)
                elif name=='read_result':
                    value=gateway.result(args['result_id'],args.get('offset',0),args.get('limit',100),args.get('columns'),model=True);data={key:value[key] for key in ('resultId','rowCount','columns','rows','offset','returnedRows','hasMore','complete')}
                elif name=='describe_result':
                    value=gateway.snapshots.metadata(args['result_id']);gateway.result_owner(value);offset=args.get('offset',0);limit=args.get('limit',20)
                    if not isinstance(offset,int) or offset<0 or not isinstance(limit,int) or not 1<=limit<=100:raise ValueError('字段分页参数无效。')
                    data={'resultId':value['resultId'],'rowCount':value['rowCount'],'columns':value['columns'][offset:offset+limit],'columnCount':len(value['columns']),'offset':offset,'hasMore':offset+limit<len(value['columns'])}
                    if len(json.dumps(data,ensure_ascii=False))>5000:raise ValueError('本页字段过多，请减小 limit。完整字段仍保留。')
                elif name=='analyze_result':data=gateway.manifest(gateway.analyze(args['result_id'],args['query']))
                elif name=='create_chart':
                    from analysis_tools import AnalysisTools,has_number
                    if args.get('title') and has_number(args['title']):AnalysisTools(gateway,gateway.thread_id).check_chart_title(args['title'])
                    data={'codexWebChart':gateway.chart(args['result_id'],args['kind'],args['x'],args['ys'],args.get('title'))}
                elif name in ('fetch_data','import_data_file','run_python','publish_answer'):
                    from analysis_tools import AnalysisTools
                    analysis=AnalysisTools(gateway,gateway.thread_id)
                    if name=='fetch_data':data=analysis.fetch(args['url'],args.get('format','json'))
                    elif name=='import_data_file':data=analysis.import_file(args['path'],args.get('format','csv'))
                    elif name=='run_python':data=analysis.calculate(args['code'],args.get('result_ids'),args.get('document_ids'),args.get('parameters'),args.get('title','Python 计算结果'))
                    else:data=analysis.publish(args['template'],args['references'])
                else:raise ValueError('未知工具。')
                result={'content':[{'type':'text','text':json.dumps(data,ensure_ascii=False)}],'structuredContent':data,'isError':False}
            else:respond({'jsonrpc':'2.0','id':identifier,'error':{'code':-32601,'message':'Method not found'}});return
            token.check()
            respond({'jsonrpc':'2.0','id':identifier,'result':result})
        except Exception as error:
            if token.event.is_set():return
            if method=='tools/call':respond({'jsonrpc':'2.0','id':identifier,'result':{'content':[{'type':'text','text':str(error)[:1000]}],'isError':True}})
            else:respond({'jsonrpc':'2.0','id':identifier,'error':{'code':-32602,'message':str(error)[:1000]}})
        finally:
            with pending_lock:pending.pop(identifier,None)
    for line in sys.stdin:
        try:request=json.loads(line)
        except json.JSONDecodeError:continue
        if not isinstance(request,dict):continue
        if request.get('method')=='notifications/cancelled':
            with pending_lock:token=pending.get((request.get('params') or {}).get('requestId'))
            if token:threading.Thread(target=token.cancel,daemon=True).start()
            continue
        identifier=request.get('id')
        if identifier is None:continue
        token=Cancellation()
        with pending_lock:pending[identifier]=token
        pool.submit(handle,request,token)
    with pending_lock:tokens=list(pending.values())
    for token in tokens:token.cancel()
    pool.shutdown(wait=True)
if __name__=='__main__':main()
