"""Independent fixed SQL for the public read-only analyst fixture, not Agent SQL."""
import json,sys
from pathlib import Path
import pymysql
fixture=json.loads(Path(sys.argv[1]).read_text());out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
connection=pymysql.connect(host=fixture['host'],port=fixture['port'],user=fixture['username'],password=fixture['password'],database=fixture['database'],cursorclass=pymysql.cursors.DictCursor,connect_timeout=5,read_timeout=20)
try:
 with connection.cursor() as cursor:
  cursor.execute('SELECT DISTINCT YEAR(OrderDate) AS year FROM salesorderheader ORDER BY year')
  years=[r['year'] for r in cursor.fetchall()][-3:-1]
  assert len(years)==2
  params=(str(years[0])+'-01-01',str(years[1]+1)+'-01-01')
  scope='h.Status=5 AND h.OnlineOrderFlag=1 AND h.OrderDate>=%s AND h.OrderDate<%s'
  queries={
   'annual':f'SELECT YEAR(h.OrderDate) AS year,COUNT(*) AS order_count,SUM(h.SubTotal) AS revenue,SUM(h.SubTotal)/COUNT(*) AS average_order_value FROM salesorderheader h WHERE {scope} GROUP BY YEAR(h.OrderDate) ORDER BY year',
   'region':f"SELECT YEAR(h.OrderDate) AS year,COALESCE(t.Name,'未知区域') AS region,COUNT(*) AS order_count,SUM(h.SubTotal) AS revenue FROM salesorderheader h LEFT JOIN salesterritory t ON t.TerritoryID=h.TerritoryID WHERE {scope} GROUP BY YEAR(h.OrderDate),COALESCE(t.Name,'未知区域') ORDER BY year,region",
   'category':f"SELECT YEAR(h.OrderDate) AS year,COALESCE(c.Name,'未分类') AS category,SUM(d.LineTotal) AS revenue,COUNT(*) AS detail_rows FROM salesorderheader h JOIN salesorderdetail d ON d.SalesOrderID=h.SalesOrderID LEFT JOIN product p ON p.ProductID=d.ProductID LEFT JOIN productsubcategory s ON s.ProductSubcategoryID=p.ProductSubcategoryID LEFT JOIN productcategory c ON c.ProductCategoryID=s.ProductCategoryID WHERE {scope} GROUP BY YEAR(h.OrderDate),COALESCE(c.Name,'未分类') ORDER BY year,category",
   'repeat':f'SELECT year,COUNT(*) AS active_customers,SUM(order_count>=2) AS repeat_customers,SUM(order_count>=2)/COUNT(*) AS repeat_rate FROM (SELECT YEAR(h.OrderDate) AS year,h.CustomerID,COUNT(DISTINCT h.SalesOrderID) AS order_count FROM salesorderheader h WHERE {scope} GROUP BY YEAR(h.OrderDate),h.CustomerID) x GROUP BY year ORDER BY year',
   'grain_check':f'SELECT YEAR(h.OrderDate) AS year,COUNT(*) AS joined_rows,COUNT(DISTINCT h.SalesOrderID) AS distinct_orders,SUM(d.LineTotal) AS detail_revenue,SUM(h.SubTotal) AS incorrectly_repeated_header_revenue FROM salesorderheader h JOIN salesorderdetail d ON d.SalesOrderID=h.SalesOrderID WHERE {scope} GROUP BY YEAR(h.OrderDate) ORDER BY year',
  }
  answers={}
  for label,sql in queries.items():
   cursor.execute(sql,params);answers[label]=cursor.fetchall()
  cursor.execute('SELECT COUNT(*) AS row_count,COUNT(DISTINCT SalesOrderDetailID) AS distinct_detail_ids FROM salesorderdetail');answers['detail_identity_observation']=cursor.fetchall()
  report={'scope':'Independent fixed SQL on own readonly MySQL AdventureWorks; FLOAT source tolerance is documented, no currency or governed financial precision certification. A current uniqueness observation is not a unique constraint.','years':years,'parameters':params,'queries':queries,'answers':answers}
  (out/'independent-oracles.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str)+'\n')
  print(json.dumps({'oracleGroups':list(answers),'years':years,'allReadOnly':True}))
finally:connection.close()
