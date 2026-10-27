"""Bind immutable query datasets to locally validated ECharts MCP options."""
import json
import math
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import tempfile

ROOT=Path(__file__).resolve().parents[2]
COLORS=['#6366f1','#06b6d4','#10b981','#f59e0b','#f43f5e','#8b5cf6']

def node_binary():
    local=ROOT/'.toolchains/chart-mcp/node'
    return os.environ.get('CODEX_WEB_CHART_NODE') or (str(local) if local.is_file() else shutil.which('node')) or str(local)

def validate_with_mcp(option,cancellation):
    entry=ROOT/'.toolchains/chart-mcp/node_modules/mcp-echarts/build/index.js'
    if not entry.is_file():raise ValueError('图表组件尚未安装，请先完成数据库组件安装。')
    environment={**os.environ,'DOTENV_CONFIG_QUIET':'true'}
    for key in list(environment):
        if key.startswith('MINIO_'):environment.pop(key)
    scratch=tempfile.TemporaryDirectory(prefix='codex-chart-')
    process=subprocess.Popen([node_binary(),str(entry)],cwd=scratch.name,env=environment,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
    watcher=cancellation.watch(process.terminate);watching=False
    messages=queue.Queue()
    def receive():
        for line in process.stdout:
            try:messages.put(json.loads(line))
            except json.JSONDecodeError:continue
        messages.put(None)
    threading.Thread(target=receive,daemon=True).start()
    def send(message):process.stdin.write(json.dumps(message)+'\n');process.stdin.flush()
    def response(identifier):
        while True:
            message=messages.get(timeout=20)
            if message is None:raise ValueError('ECharts MCP 已退出，请检查本机图表组件。')
            if message.get('id')==identifier:
                if message.get('error'):raise ValueError('ECharts MCP 校验失败。')
                return message.get('result',{})
    try:
        watcher.__enter__();watching=True
        send({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-06-18','capabilities':{},'clientInfo':{'name':'codex-web-datasets','version':'1.0.0'}}});response(1);send({'jsonrpc':'2.0','method':'notifications/initialized'})
        send({'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'generate_echarts','arguments':{'echartsOption':json.dumps(option,ensure_ascii=False),'outputType':'option','width':900,'height':440,'theme':'default'}}})
        result=response(2)
        if result.get('isError'):raise ValueError('ECharts MCP 拒绝了图表配置。')
        for item in result.get('content',[]):
            if item.get('type')=='text':
                text=item.get('text','')
                try:value=json.loads(text)
                except json.JSONDecodeError:continue
                if isinstance(value,dict) and value.get('series'):
                    if value.get('dataset')!=option['dataset']:raise ValueError('图表数据与查询结果不一致。')
                    return value
        raise ValueError('ECharts MCP 没有返回有效的 option 配置。')
    except queue.Empty:raise ValueError('本机 ECharts MCP 校验超时。') from None
    finally:
        if watching:watcher.__exit__(None,None,None)
        process.terminate()
        try:process.wait(timeout=3)
        except subprocess.TimeoutExpired:process.kill();process.wait()
        process.stdin.close();process.stdout.close();scratch.cleanup()

def build_chart(data,kind,x,ys,title,cancellation):
    columns={column['name']:column for column in data['columns']}
    if kind not in ('bar','line','area','pie','scatter'):raise ValueError('支持柱状图、折线图、面积图、饼图和散点图。')
    if x not in columns or not isinstance(ys,list) or not 1<=len(ys)<=6 or len(set(ys))!=len(ys) or any(y not in columns for y in ys):raise ValueError('请选择查询结果中实际存在的横轴和 1–6 个指标。')
    if any(columns[y]['type']!='number' for y in ys):raise ValueError('图表指标必须是查询结果中的数值字段。')
    if kind in ('pie','scatter') and len(ys)!=1:raise ValueError('饼图和散点图只接受一个数值指标。')
    if kind=='scatter' and columns[x]['type']!='number':raise ValueError('散点图横轴必须是数值字段。')
    if not data['rows']:raise ValueError('查询结果为空，无法生成图表。')
    numeric=set(ys)|({x} if kind=='scatter' else set());rows=[]
    for original in data['rows']:
        row={key:original.get(key) for key in [x,*ys]}
        for key in numeric:
            if row[key] is not None:
                number=float(row[key])
                if not math.isfinite(number):raise ValueError('图表包含无效数值。')
                row[key]=number
        rows.append(row)
    if kind=='pie' and (any((row[ys[0]] or 0)<0 for row in rows) or sum(row[ys[0]] or 0 for row in rows)<=0):raise ValueError('饼图数据须为非负数，且合计大于 0。')
    dimensions=list(dict.fromkeys([x,*ys]));option={'color':COLORS,'animationDuration':350,'textStyle':{'fontFamily':'sans-serif'},'dataset':{'dimensions':dimensions,'source':rows},'tooltip':{'trigger':'item' if kind in ('pie','scatter') else 'axis','renderMode':'richText','confine':True},'legend':{'top':0,'type':'scroll'},'aria':{'enabled':True}}
    if kind=='pie':option['series']=[{'type':'pie','name':ys[0],'radius':['43%','72%'],'center':['50%','54%'],'avoidLabelOverlap':True,'itemStyle':{'borderColor':'#fff','borderWidth':3,'borderRadius':5},'encode':{'itemName':x,'value':ys[0]},'label':{'overflow':'truncate','width':130}}]
    else:
        option.update(grid={'left':28,'right':28,'top':52,'bottom':60,'containLabel':True},xAxis={'type':'value' if kind=='scatter' else 'category','name':x,'nameLocation':'middle','nameGap':38,'axisTick':{'show':False},'axisLine':{'show':False},'axisLabel':{'hideOverlap':True}},yAxis={'type':'value','splitLine':{'lineStyle':{'type':'dashed','color':'#e5e7eb'}}})
        option['series']=[{'name':y,'type':'line' if kind=='area' else kind,'encode':{'x':x,'y':y},**({'smooth':True,'showSymbol':len(rows)<20,'lineStyle':{'width':3}} if kind in ('line','area') else {}),**({'areaStyle':{'opacity':0.13}} if kind=='area' else {}),**({'barMaxWidth':56,'itemStyle':{'borderRadius':[5,5,0,0]}} if kind=='bar' else {})} for y in ys]
        if len(rows)>20 and kind!='scatter':option['dataZoom']=[{'type':'inside'},{'type':'slider','height':14,'bottom':0}]
    option=validate_with_mcp(option,cancellation)
    return {'version':1,'resultId':data['resultId'],'connectionId':data.get('connectionId'),'connectionName':data.get('sourceName') or data.get('connectionName','分析数据'),'sourceKind':data.get('sourceKind','database'),'title':str(title or '查询结果图表')[:160],'kind':kind,'x':x,'ys':ys,'option':option,'query':data.get('query',''),'pythonCode':data.get('pythonCode'),'inputSources':data.get('inputSources',[]),'columns':data['columns'],'rows':data['rows'],'rowCount':data['rowCount'],'truncated':data['truncated'],'createdAt':data['createdAt'],'renderer':'mcp-echarts@0.7.1 + Apache ECharts'}
