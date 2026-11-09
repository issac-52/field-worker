ALTER TABLE document_jobs DROP CONSTRAINT document_jobs_status_check;
ALTER TABLE document_jobs ADD CONSTRAINT document_jobs_status_check
 CHECK (status IN ('QUEUED','RUNNING','READY','FAILED','CANCELLED'));
ALTER TABLE document_jobs ADD COLUMN delete_requested BOOLEAN NOT NULL DEFAULT false;
