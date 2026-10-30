from pathlib import Path
import hashlib,json
ROOT=Path('/root/Codex');OUT=Path('/tmp/codex-audit-20261030/result-read-stage');changes={}
def edit(rel,old,new):
 p=ROOT/rel;s=p.read_text();assert s.count(old)==1,(rel,'preimage changed');target=OUT/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(s.replace(old,new));changes[rel]=hashlib.sha256(p.read_bytes()).hexdigest()
edit('web/database/service.py',"        if model and len(json.dumps({'columns':page['columns'],'rows':page['rows']},ensure_ascii=False))>5000:raise DatabaseError('本页明细超过上下文单次预算。请减少行数或字段；完整结果仍保留，可在网页查看和下载。')",'''        if model:
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
            page['nextOffset']=offset+page['returnedRows'] if page['hasMore'] else None''')
edit('web/database/charts.py',"    if any(columns[y]['type']!='number' for y in ys):raise ValueError('图表指标必须是查询结果中的数值字段。')",'''    text_metrics=[y for y in ys if columns[y]['type']!='number']
    if text_metrics:
        raise ValueError('图表指标必须是结果中的数值字段；以下字段当前是文本或其他类型：'+', '.join(text_metrics)+'。Python 计算指标请在 result 中保留 Decimal/int/float，勿先用 format/str 格式化。Decimal 可直接绘图并保留精确提示值，不必转 float；编号与分类文本不能擅自转成指标。')''')
edit('web/database/mcp_server.py',"每次 1–200 行，可选择字段。不要为了逐行扫描", "每次最多 1–200 行，可用 columns 选择必要字段；宽表会按上下文预算返回连续的较少行，以 returnedRows、hasMore、nextOffset 为准，不能用请求的 limit 推算下一页。完整结果未截断。不要为了逐行扫描")
# Reuse the staged MCP edit rather than overwrite it from the original.
p=OUT/'web/database/mcp_server.py';s=p.read_text();old='返回真实 resultId，可用 read_result/publish_answer/create_chart。';assert s.count(old)==1;s=s.replace(old,'数值指标在 result 中保留 Decimal/int/float，不要先用 format/str 变成文本；Decimal 可直接用于图表，精确表格与提示值会保留，无需额外转 float。返回真实 resultId，可用 read_result/publish_answer/create_chart。');p.write_text(s)
(OUT/'preimages.json').write_text(json.dumps(changes,indent=2));print(json.dumps(changes))
