ALTER TABLE fee_rules ADD CONSTRAINT fee_start_no_overlap EXCLUDE USING gist (daterange(start_date,end_date,'[]') WITH &&) WHERE(phase='START');
ALTER TABLE fee_rules ADD CONSTRAINT fee_end_no_overlap EXCLUDE USING gist (daterange(start_date,end_date,'[]') WITH &&) WHERE(phase='END');
CREATE TABLE settlement_records (
 inspection_id BIGINT PRIMARY KEY REFERENCES inspections(id),
 worker_id BIGINT NOT NULL REFERENCES users(id),
 snapshot_date DATE NOT NULL, fee BIGINT NOT NULL CHECK(fee>=0),
 confirmed_by BIGINT NOT NULL REFERENCES users(id), confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 paid_by BIGINT REFERENCES users(id), paid_at TIMESTAMPTZ
);
CREATE TABLE fee_adjustments (
 id UUID PRIMARY KEY, actor_id BIGINT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), request JSONB NOT NULL,result JSONB NOT NULL
);
CREATE TABLE fee_adjustment_items (
 adjustment_id UUID NOT NULL REFERENCES fee_adjustments(id),
 inspection_id BIGINT NOT NULL REFERENCES inspections(id),
 before_fee BIGINT NOT NULL,after_fee BIGINT NOT NULL,
 PRIMARY KEY(adjustment_id,inspection_id)
);
