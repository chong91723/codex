#!/usr/bin/env python3
"""Native Codex connects to these read-only database tools over MCP stdio."""
from concurrent.futures import ThreadPoolExecutor
import json
import sys
import threading
from service import Gateway
from cancellation import Cancellation

ANNOTATIONS={'readOnlyHint':True,'destructiveHint':False,'idempotentHint':True,'openWorldHint':True}

def schema(properties,required):return {'type':'object','properties':properties,'required':required,'additionalProperties':False}
ID={'type':'string','description':'list_databases 返回的已配置且验证连通的数据库 ID。'}
TOOLS=[
 {'name':'list_databases','description':'列出用户已配置、启用、连接通过且账号为只读的数据库。不会返回密码。查询前请先使用此工具确认可用连接。','inputSchema':schema({},[])},
 {'name':'describe_database','description':'读取指定可用数据库的表和字段结构。仅接受已配置且连通的数据库 ID；Elasticsearch 返回索引字段。','inputSchema':schema({'connection_id':ID,'table':{'type':'string','description':'可选表名，省略时列出可见字段。'}},['connection_id'])},
 {'name':'query_database','description':'执行 1–5 条只读 SELECT/CTE 或一条 Elasticsearch Query DSL。跨库查询仅限用户已配置、启用且连通的同服务器数据库/schema。禁止写入、DDL、存储过程、锁定、文件导出及外部文件函数。写入没有授权例外。完整结果流式保存为不可变快照，不截断数据，也不把所有行塞入上下文。返回结果编号、精确行数和字段；使用 read_result 按需读取明细，或 analyze_result 对完整结果精确计算。先查看表结构，不要猜列名。返回 resultId 可供 create_chart 使用。','inputSchema':schema({'connection_id':ID,'query':{'type':'string','description':'MySQL/PostgreSQL/ClickHouse 的 1–5 条只读 SQL；Elasticsearch 为 Query DSL JSON 字符串。'}},['connection_id','query'])},
 {'name':'create_chart','description':'基于 query_database 的真实结果 ID 生成交互图表。数据由服务器直接读取查询缓存，禁止重新编造数据。由本机 mcp-echarts 校验，网页直接显示。适合在回答中展示统计、趋势与占比。','inputSchema':schema({'result_id':{'type':'string'},'kind':{'type':'string','enum':['bar','line','area','pie','scatter']},'x':{'type':'string','description':'查询结果中的横轴/分类字段。'},'ys':{'type':'array','items':{'type':'string'},'minItems':1,'maxItems':6,'description':'查询结果中的数值指标字段。饼图/散点图仅一个。'},'title':{'type':'string','description':'简短中文图表标题。'}},['result_id','kind','x','ys'])}
]
TOOLS.extend([
 {'name':'read_result','description':'按结果 ID 读取原始查询结果的精确明细页；未读取的行仍完整保留。每次 1–200 行，可选择字段。不要为了逐行扫描而把所有页面依次打印到上下文；需要全量计算时用 analyze_result。','inputSchema':schema({'result_id':{'type':'string'},'offset':{'type':'integer','minimum':0},'limit':{'type':'integer','minimum':1,'maximum':200},'columns':{'type':'array','items':{'type':'string'}}},['result_id'])},
 {'name':'describe_result','description':'读取结果的完整字段定义，可用 offset/limit 分页查看字段。数据和字段不会因上下文预算被丢弃。','inputSchema':schema({'result_id':{'type':'string'},'offset':{'type':'integer','minimum':0},'limit':{'type':'integer','minimum':1,'maximum':100}},['result_id'])},
 {'name':'analyze_result','description':'在服务器上对完整查询结果进行精确 SQL 分析。唯一表名为 result，可分组、排序、筛选、窗口计算，不调用模型逐行计算。只接受 SELECT；禁止文件读取、网络、扩展、写入、其他表。返回新的完整结果 ID，可继续读取或绘图。计算不是对原数据的摘要替换，原始每行每列仍保留。','inputSchema':schema({'result_id':{'type':'string'},'query':{'type':'string'}},['result_id','query'])}
])
for tool in TOOLS:tool['annotations']=ANNOTATIONS

def main():
    lock=threading.Lock();pending_lock=threading.Lock();pending={};pool=ThreadPoolExecutor(max_workers=4)
    def respond(message):
        with lock:sys.stdout.write(json.dumps(message,ensure_ascii=False)+'\n');sys.stdout.flush()
    def handle(request,token):
        gateway=Gateway(cancellation=token)
        identifier=request.get('id');method=request.get('method');params=request.get('params') or {}
        if identifier is None:return
        try:
            if method=='initialize':result={'protocolVersion':params.get('protocolVersion','2025-06-18'),'capabilities':{'tools':{}},'serverInfo':{'name':'codex-web-readonly-databases','version':'1.0.0'},'instructions':'所有数据库仅可读取，禁止写入且无授权例外。先 list_databases，再 describe_database，再 query_database。完整数据保存在服务器，query_database 只返回结果引用。使用 read_result 读取必要明细，使用 analyze_result 对全量数据精确计算。需要图表时用结果 ID 调用 create_chart。不要编造数据，不要把全量明细逐页打印进上下文。'}
            elif method=='tools/list':result={'tools':TOOLS}
            elif method=='ping':result={}
            elif method in ('resources/list','resources/templates/list'):result={'resources':[]} if method=='resources/list' else {'resourceTemplates':[]}
            elif method=='tools/call':
                name=params.get('name');args=params.get('arguments') or {}
                if name=='list_databases':data={'connections':gateway.available(),'readOnly':True}
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
                elif name=='create_chart':data={'codexWebChart':gateway.chart(args['result_id'],args['kind'],args['x'],args['ys'],args.get('title'))}
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
