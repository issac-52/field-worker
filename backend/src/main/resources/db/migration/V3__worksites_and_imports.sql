CREATE TABLE import_jobs (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by BIGINT REFERENCES users(id),
    result JSONB
);
CREATE TABLE worksites (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    consumer_number TEXT NOT NULL UNIQUE CHECK (length(consumer_number)>0),
    middle_block TEXT, small_block TEXT, name TEXT, address TEXT, old_address TEXT,
    meter_number TEXT, meter_presence_raw TEXT, industry TEXT, management_number TEXT,
    latitude NUMERIC(10,7), longitude NUMERIC(10,7),
    source_cells JSONB NOT NULL,
    source_sheet TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    import_job_id UUID NOT NULL REFERENCES import_jobs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX worksites_blocks ON worksites(middle_block,small_block,id);
CREATE INDEX worksites_management ON worksites(management_number,id);
CREATE TABLE source_monthly_values (
    site_id BIGINT NOT NULL REFERENCES worksites(id),
    month DATE NOT NULL,
    group_a TEXT, group_b TEXT, group_c TEXT,
    PRIMARY KEY(site_id,month)
);
COMMENT ON TABLE source_monthly_values IS 'Original M:U / Y:AG / AK:AS groups; business meaning unconfirmed. Separate from new START/END inspections.';
