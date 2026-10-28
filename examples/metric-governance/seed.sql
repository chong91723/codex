-- Fictional demo only. All identifiers, amounts and dates are synthetic.
CREATE TABLE demo_orders (
    order_id text PRIMARY KEY,
    booked_on date NOT NULL,
    status text NOT NULL CHECK (status IN ('completed', 'cancelled')),
    collected_amount numeric(20, 2) NOT NULL,
    refunded_amount numeric(20, 2) NOT NULL,
    fulfilment_cost numeric(20, 2) NOT NULL,
    recovered_cost numeric(20, 2) NOT NULL
);
INSERT INTO demo_orders VALUES
('A', '2026-01-03', 'completed', 120.10, 20.00, 60.00, 10.00),
('B', '2026-01-09', 'completed', 200.20,  0.00, 80.00,  0.00),
('C', '2026-01-15', 'completed',  50.00, 50.00, 20.00, 20.00),
('D', '2026-01-20', 'cancelled', 999.99,  0.00, 88.88,  0.00),
('E', '2026-02-01', 'completed',  10.00,  0.00,  5.00,  0.00),
('F', '2026-03-04', 'completed',  75.25, 75.25, 40.00, 40.00),
('G', '2026-04-06', 'completed',  90.00,  0.00, 90.00,  0.00);
COMMENT ON TABLE demo_orders IS 'Synthetic demo, not production accounting; refund and cost recovery belong to original order date.';

CREATE TABLE demo_service_cases (
    case_id text PRIMARY KEY,
    received_on date NOT NULL,
    state text NOT NULL CHECK (state IN ('closed', 'cancelled')),
    elapsed_minutes numeric(20, 2) NOT NULL,
    fulfilled_units integer NOT NULL,
    requested_units integer NOT NULL
);
INSERT INTO demo_service_cases VALUES
('S-A', '2026-01-03', 'closed', 2.50, 3, 4),
('S-B', '2026-01-08', 'closed', 5.00, 2, 2),
('S-C', '2026-01-20', 'cancelled', 999.00, 0, 9),
('S-D', '2026-02-01', 'closed', 20.00, 1, 2);

CREATE USER reader;
GRANT CONNECT ON DATABASE fixture TO reader;
GRANT USAGE ON SCHEMA public TO reader;
GRANT SELECT ON demo_orders, demo_service_cases TO reader;
ALTER ROLE reader SET default_transaction_read_only = on;
