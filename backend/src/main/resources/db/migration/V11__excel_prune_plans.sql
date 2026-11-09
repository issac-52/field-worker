CREATE TABLE excel_prune_plans (
 id UUID PRIMARY KEY, created_by BIGINT NOT NULL REFERENCES users(id),
 keep_numbers JSONB NOT NULL, fingerprint TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '15 minutes',
 executed BOOLEAN NOT NULL DEFAULT false, result JSONB
);
