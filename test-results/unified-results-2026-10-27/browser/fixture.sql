-- Independent postgres:17 container only; never run in a business database.
-- Fixture account has SELECT grants and default_transaction_read_only=on.
CREATE USER fixture_reader WITH PASSWORD 'fixture-readonly-only';
CREATE TABLE category_rentals(category_name text PRIMARY KEY,rental_count integer NOT NULL);
INSERT INTO category_rentals VALUES ('Sports',1179),('Animation',1166),('Action',1112),('Sci-Fi',1101),('Family',1096),('Drama',1060),('Documentary',1050),('Foreign',1033),('Games',969),('Children',945);
CREATE TABLE large_results AS SELECT n AS row_id,'类别 '||n AS category_name,1000-n AS rental_count FROM generate_series(1,247) n;
GRANT CONNECT ON DATABASE analysis_fixture TO fixture_reader;
GRANT USAGE ON SCHEMA public TO fixture_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO fixture_reader;
ALTER ROLE fixture_reader SET default_transaction_read_only = on;
