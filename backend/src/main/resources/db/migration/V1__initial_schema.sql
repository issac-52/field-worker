-- 초안: 요구사항/실제 엑셀 항목 확정 전 DB 설계의 출발점입니다.
-- 모든 기록 시간은 timestamptz를 사용합니다. 업무상 월 단위 집계는 Asia/Seoul로 계산하세요.
CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  login_id VARCHAR(80) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN','WORKER')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE import_batches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_name TEXT NOT NULL,
  uploaded_by BIGINT REFERENCES users(id),
  total_count INT NOT NULL DEFAULT 0,
  valid_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','DONE','FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE work_sites (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_batch_id BIGINT REFERENCES import_batches(id),
  source_row_no INT,
  source_key VARCHAR(200),
  address TEXT NOT NULL,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  geocode_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK(geocode_status IN ('PENDING','SUCCESS','FAILED','MANUAL')),
  geocode_error TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','IN_PROGRESS','COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (import_batch_id, source_row_no)
);
CREATE INDEX idx_work_sites_status ON work_sites (status);
CREATE INDEX idx_work_sites_coordinates ON work_sites (latitude, longitude);

CREATE TABLE work_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_site_id BIGINT NOT NULL UNIQUE REFERENCES work_sites(id),
  worker_id BIGINT REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','COMPLETED')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_by BIGINT REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_work_records_worker ON work_records (worker_id);
CREATE INDEX idx_work_records_completed_at ON work_records (completed_at);

CREATE TABLE work_photos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_record_id BIGINT NOT NULL REFERENCES work_records(id),
  slot SMALLINT NOT NULL CHECK(slot BETWEEN 1 AND 4),
  r2_object_key TEXT NOT NULL UNIQUE,
  content_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK(file_size_bytes > 0),
  uploaded_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (work_record_id, slot)
);

CREATE TABLE payment_rates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  worker_id BIGINT REFERENCES users(id), -- NULL이면 공통 단가
  amount_krw BIGINT NOT NULL CHECK(amount_krw >= 0),
  valid_from DATE NOT NULL,
  valid_to DATE,
  CHECK(valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE settlement_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_record_id BIGINT NOT NULL UNIQUE REFERENCES work_records(id),
  worker_id BIGINT NOT NULL REFERENCES users(id),
  amount_krw BIGINT NOT NULL CHECK(amount_krw >= 0), -- 지급 당시 단가 snapshot
  status VARCHAR(20) NOT NULL DEFAULT 'UNPAID'
    CHECK(status IN ('UNPAID','PAID','CANCELLED')),
  earned_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_settlement_worker_earned ON settlement_entries(worker_id, earned_at);

CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id),
  entity_type VARCHAR(50) NOT NULL,
  entity_id BIGINT NOT NULL,
  action VARCHAR(30) NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id, created_at);
CREATE INDEX idx_audit_actor_created ON audit_logs (actor_id, created_at);
