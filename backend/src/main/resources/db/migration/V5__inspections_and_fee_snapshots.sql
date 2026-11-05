CREATE TABLE fee_rules (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 phase TEXT NOT NULL CHECK(phase IN ('START','END')),
 start_date DATE NOT NULL, end_date DATE NOT NULL CHECK(end_date>=start_date),
 amount BIGINT NOT NULL CHECK(amount>=0), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE inspections (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 site_id BIGINT NOT NULL REFERENCES worksites(id),
 phase TEXT NOT NULL CHECK(phase IN ('START','END')),
 inspection_date DATE NOT NULL, reading NUMERIC NOT NULL CHECK(reading>=0),
 worker_id BIGINT NOT NULL REFERENCES users(id),
 fee BIGINT NOT NULL CHECK(fee>=0),
 settlement_status TEXT NOT NULL DEFAULT 'OPEN' CHECK(settlement_status IN ('OPEN','CONFIRMED','PAID')),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(site_id,phase)
);
CREATE INDEX inspections_worker_date ON inspections(worker_id,inspection_date);
CREATE INDEX inspections_date ON inspections(inspection_date,phase);
CREATE TABLE inspection_edits (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 site_id BIGINT NOT NULL REFERENCES worksites(id),
 phase TEXT NOT NULL,
 actor_id BIGINT NOT NULL REFERENCES users(id),
 changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 before_value JSONB, after_value JSONB NOT NULL
);
