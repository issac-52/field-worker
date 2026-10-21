-- 초안: 요구사항/실제 엑셀 항목 확정 전 DB 설계의 출발점입니다.
-- 모든 기록 시간은 timestamptz를 사용합니다. 업무상 월 단위 집계는 Asia/Seoul로 계산하세요.
CREATE TABLE users (
     id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     login_id VARCHAR(80) NOT NULL UNIQUE,
     nickname VARCHAR(100) NOT NULL,
     password TEXT NOT NULL,
     role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN','WORKER')),
     is_active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
