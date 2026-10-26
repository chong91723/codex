"""Fail-closed SQL validation. Database credentials/transactions remain read-only."""
import sqlglot
from sqlglot import exp

MAX_ROWS=500
SAFE_FUNCTIONS=set('COUNT SUM AVG MIN MAX ROUND ABS CEIL FLOOR LENGTH CHAR_LENGTH LOWER UPPER CONCAT CONCAT_WS SUBSTRING TRIM LTRIM RTRIM COALESCE IF IFNULL NULLIF DATE YEAR MONTH DAY DAY_OF_MONTH DATE_FORMAT TIME_TO_STR DATE_TRUNC TIMESTAMP_TRUNC TS_OR_DS_TO_TIMESTAMP CAST TRY_CAST EXTRACT STRFTIME TO_CHAR DATE_PART NOW CURRENT_DATE CURRENT_TIMESTAMP CURRENT_DATABASE CURRENT_SCHEMA DATABASE JSON_EXTRACT JSON_EXTRACT_SCALAR GREATEST LEAST COUNT_IF STDDEV STDDEV_POP VARIANCE ROW_NUMBER RANK DENSE_RANK LAG LEAD FIRST_VALUE LAST_VALUE PERCENTILE_CONT PERCENTILE_DISC MEDIAN REGEXP_LIKE REGEXP_REPLACE REPLACE LEFT RIGHT SPLIT_PART POSITION MOD POW POWER SQRT LOG LN EXP TO_DATE TO_TIMESTAMP TIMESTAMP_DIFF DATE_DIFF DATE_ADD DATE_SUB TIMESTAMP_ADD TIMESTAMP_SUB TO_START_OF_MONTH TO_START_OF_DAY TO_YEAR TO_MONTH TO_DATE_FORMAT TO_STRING TO_INT64 TO_FLOAT64'.split())
FORBIDDEN=set('Insert Update Delete Create Drop Alter Command Copy Into Merge Transaction Commit Rollback Set Use Execute Grant Revoke Lock Attach Detach Export Pragma LoadData Cache Uncache PropertyEQ SessionParameter Parameter'.split())

class ReadOnlyError(ValueError):
    pass

def validate_query(query,connection,enforce_limit=False):
    if not isinstance(query,str) or not query.strip() or len(query)>30000:
        raise ReadOnlyError('请输入不超过 30000 字符的只读查询。')
    if '\x00' in query or '/*!' in query:
        raise ReadOnlyError('只读查询不允许可执行注释或空字符。')
    dialect={'mysql':'mysql','postgresql':'postgres','clickhouse':'clickhouse'}[connection['engine']]
    try:
        statements=[value for value in sqlglot.parse(query,read=dialect) if value is not None]
    except sqlglot.errors.SqlglotError as error:
        raise ReadOnlyError('查询无法解析；仅接受单条 SELECT 或只读 WITH 查询。') from error
    if len(statements)!=1 or not isinstance(statements[0],(exp.Select,exp.Union,exp.Intersect,exp.Except)):
        raise ReadOnlyError('数据库只能读取：仅允许单条 SELECT 或只读 WITH 查询，禁止写入和管理语句。')
    statement=statements[0]
    nodes=list(statement.walk())
    if len(nodes)>5000:
        raise ReadOnlyError('查询结构过于复杂。')
    for node in nodes:
        if type(node).__name__ in FORBIDDEN or any(node.args.get(key) for key in ('into','locks','settings','format')):
            raise ReadOnlyError('只读查询禁止写入、锁定、导出和修改会话设置。')
        if isinstance(node,exp.Func):
            name=node.name.upper() if isinstance(node,exp.Anonymous) else node.sql_name().upper()
            if name not in SAFE_FUNCTIONS:
                raise ReadOnlyError('不允许可能产生副作用或访问外部数据的函数：'+name)
        if isinstance(node,exp.Table):
            if not isinstance(node.this,exp.Identifier):
                raise ReadOnlyError('禁止通过表函数访问未配置的数据源。')
            expected=connection.get('schema','public') if connection['engine']=='postgresql' else connection['database']
            admitted=set(connection.get('allowedNamespaces') or [expected])
            if node.db and node.db not in admitted or node.catalog and node.catalog!=connection['database']:
                raise ReadOnlyError('引用的数据库/schema 尚未配置、启用或验证连通。')
    limit=statement.args.get('limit')
    if limit:
        value=limit.expression
        if not isinstance(value,exp.Literal) or value.is_string or not str(value.this).isdigit():
            raise ReadOnlyError('LIMIT 必须是非负整数。')
        row_limit=min(int(value.this),MAX_ROWS+1)
    else:
        row_limit=MAX_ROWS+1
    return (statement.limit(row_limit) if enforce_limit else statement).sql(dialect=dialect)


def validate_queries(query,connection,enforce_limit=False):
    if not isinstance(query,str) or not query.strip() or len(query)>30000 or '\x00' in query or '/*!' in query:
        raise ReadOnlyError('请输入有效的只读 SQL，禁止可执行注释。')
    dialect={'mysql':'mysql','postgresql':'postgres','clickhouse':'clickhouse'}[connection['engine']]
    try:statements=[value for value in sqlglot.parse(query,read=dialect) if value is not None]
    except sqlglot.errors.SqlglotError as error:raise ReadOnlyError('查询无法解析。') from error
    if not 1<=len(statements)<=5:raise ReadOnlyError('一次可执行 1–5 条只读查询，更多查询请分批进行。')
    # Validate the complete batch before executing any statement.
    return [validate_query(statement.sql(dialect=dialect),connection,enforce_limit=enforce_limit) for statement in statements]
