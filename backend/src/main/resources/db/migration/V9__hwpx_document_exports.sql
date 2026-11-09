CREATE TABLE document_artifacts (
 object_key TEXT PRIMARY KEY,
 expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);
CREATE TABLE document_cache (
 site_id BIGINT NOT NULL REFERENCES worksites(id), fingerprint TEXT NOT NULL,
 object_key TEXT NOT NULL REFERENCES document_artifacts(object_key),
 PRIMARY KEY(site_id,fingerprint)
);
CREATE TABLE document_jobs (
 id UUID PRIMARY KEY, created_by BIGINT NOT NULL REFERENCES users(id),
 title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','READY','FAILED')),
 total INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
 error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);
CREATE TABLE document_job_items (
 job_id UUID NOT NULL REFERENCES document_jobs(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, site_id BIGINT NOT NULL REFERENCES worksites(id), fingerprint TEXT,
 PRIMARY KEY(job_id,ordinal)
);
CREATE TABLE document_parts (
 job_id UUID NOT NULL REFERENCES document_jobs(id) ON DELETE CASCADE,
 part INTEGER NOT NULL, object_key TEXT NOT NULL REFERENCES document_artifacts(object_key),
 first_ordinal INTEGER NOT NULL,last_ordinal INTEGER NOT NULL,
 PRIMARY KEY(job_id,part)
);
CREATE INDEX document_jobs_pending ON document_jobs(status,created_at);
CREATE INDEX document_artifacts_expiry ON document_artifacts(expires_at);
