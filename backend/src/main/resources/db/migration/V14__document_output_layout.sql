ALTER TABLE document_jobs ADD COLUMN grouped_by_block boolean NOT NULL DEFAULT false;
ALTER TABLE document_job_items ADD COLUMN block_file text;
