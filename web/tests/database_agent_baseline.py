"""Independent, fixed SELECT reference for the owned Sakila workflow acceptance.

Connection secrets remain in the private task-owned registry and never enter output.
"""
from decimal import Decimal
import json
import os
from pathlib import Path
import sqlite3
import sys
import pymysql

home = Path(os.environ['CODEX_TEST_HOME']).resolve()
state = Path(os.environ.get('CODEX_TEST_DB_STATE', str(home/'web-databases'))).resolve()
assert str(home).startswith('/tmp/') and state == home/'web-databases'
identifier = os.environ['CODEX_TEST_DB_CONNECTION_ID']
registry = state/'registry.sqlite3'
with sqlite3.connect(registry.as_uri()+'?mode=ro', uri=True) as private:
    row = private.execute('SELECT record FROM connections WHERE id=?', (identifier,)).fetchone()
assert row, 'Owned test connection is missing'
record = json.loads(row[0])
assert record['engine'] == 'mysql' and record['database'] == 'sakila'
assert record['host'] in ('127.0.0.1', 'localhost') and record['enabled'] and record['status'] == 'connected'
queries = {
    'Q1': """SELECT c.name AS category_name,COUNT(r.rental_id) AS rental_count
FROM category c JOIN film_category fc ON fc.category_id=c.category_id
JOIN inventory i ON i.film_id=fc.film_id JOIN rental r ON r.inventory_id=i.inventory_id
WHERE r.rental_date>='2005-07-01' AND r.rental_date<'2005-08-01'
GROUP BY c.category_id,c.name ORDER BY rental_count DESC,c.name ASC LIMIT 3""",
    'Q2': """SELECT s.store_id,COUNT(p.payment_id) AS payment_count,SUM(p.amount) AS revenue
FROM payment p JOIN staff s ON s.staff_id=p.staff_id
WHERE p.payment_date>='2005-07-01' AND p.payment_date<'2005-08-01' AND s.store_id=1
GROUP BY s.store_id""",
    'Q3': """SELECT c.customer_id,CONCAT(c.first_name,' ',c.last_name) AS customer_name,
COUNT(p.payment_id) AS payment_count,SUM(p.amount) AS total_amount
FROM customer c JOIN payment p ON p.customer_id=c.customer_id
WHERE p.payment_date>='2005-07-01' AND p.payment_date<'2005-08-01' AND c.active=1
GROUP BY c.customer_id,c.first_name,c.last_name
ORDER BY total_amount DESC,c.customer_id ASC LIMIT 2""",
}
fingerprint_queries = {
    'film': 'SELECT COUNT(*) AS n,SUM(film_id) AS id_sum FROM film',
    'rental': 'SELECT COUNT(*) AS n,SUM(rental_id) AS id_sum FROM rental',
    'payment': 'SELECT COUNT(*) AS n,SUM(payment_id) AS id_sum,SUM(amount) AS total_amount FROM payment',
    'customer': 'SELECT COUNT(*) AS n,SUM(customer_id) AS id_sum,SUM(active) AS active_count FROM customer',
}
connection = pymysql.connect(host=record['host'], port=int(record['port']), user=record['username'], password=record['password'], database='sakila', charset='utf8mb4', autocommit=False, connect_timeout=5, read_timeout=15, write_timeout=15, local_infile=False, cursorclass=pymysql.cursors.DictCursor)
def normalize(value):
    if isinstance(value, Decimal): return format(value, 'f')
    return value
try:
    with connection.cursor() as cursor:
        cursor.execute('START TRANSACTION READ ONLY')
        cursor.execute('SHOW GRANTS')
        grants = [next(iter(item.values())) for item in cursor.fetchall()]
        assert all(' ON ' in grant.upper() and all(privilege.strip() in ('USAGE', 'SELECT', 'SHOW VIEW') for privilege in grant.upper().split(' ON ', 1)[0].removeprefix('GRANT ').split(',')) and 'WITH GRANT OPTION' not in grant.upper() for grant in grants), 'Read-only test credential required'
        answers = {}
        for question, query in queries.items():
            cursor.execute(query)
            answers[question] = [{key: normalize(value) for key, value in item.items()} for item in cursor.fetchall()]
        fingerprints = {}
        for table, query in fingerprint_queries.items():
            cursor.execute(query)
            fingerprints[table] = {key: normalize(value) for key, value in cursor.fetchone().items()}
    print(json.dumps({'connectionId': identifier, 'engine': 'mysql', 'database': 'sakila', 'readOnly': True, 'month': '2005-07', 'answers': answers, 'fixedReferenceSql': queries, 'fingerprints': fingerprints}, ensure_ascii=False))
finally:
    connection.rollback()
    connection.close()
