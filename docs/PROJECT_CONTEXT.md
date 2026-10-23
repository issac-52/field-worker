# Field Work Manager — Project context

_Last context consolidation: 2026-10-22. This is a handoff, not a claim that code is already implemented._

2026-10-23 최신 요청자 피드백: 대상은 **10,000건 이상**이며 위치도 기능은 요구사항에서 제외했다. 현장 사진은 원경/START 근경/END 근경/임시용 각 1개, 총 4종이다. 위치도 UI·생성/저장·좌표 수정 API·Mock·Excel 전용 열을 제거했다. 현장 지도와 수용가 좌표/현재 위치 표시는 유지한다. 이전 위치도 설명과 `LOCATION_MAP_DESIGN.md`는 철회된 과거 설계다.

## Project and goals
Mobile-first private fieldwork system for ~20 part-time workers and admins. Friendly paid commission (~KRW 1,000,000); initial delivery target **2026-11-14**. Secondary developer goal: hands-on Spring/backend, transaction, security, and operations experience documented for job interviews. Developer implements core functionality; Codex primarily reviews and debugs real code.

## Business flow
1. Admin imports a future Excel file with ~1,800–2,000 target records; provided spreadsheet dated 10/13 is **format/reference only**, not the actual import dataset. Do not load its ~19,700 reference rows into production.
2. Normalize baseline customer/meter/address data. Geocode once and persist coordinates. Display work items in NAVER map with appropriate stage/status filters; account for multiple meters/consumers at one address.
3. **A (start-stage) inspection begins Nov 2026.** Record meter reading, inspection date, worker and photos.
4. **B (end-stage) inspection occurs roughly one year later (around Nov 2027)** on the same inspection subject; potentially different worker. A and B are distinct stage completion states. Calculate final volume as B−A at read/export time, not a constantly updated derived column. Exceptions like replacement/resetting a meter remain to be clarified.
5. Administrators inspect changes/worker activity, track completion, monthly/overall per-item compensation, export Excel, and create reports.
6. HWP template provided: customer name, address, customer connection number, industry, meter number, seal, water district, notes, A/B dates and readings, B−A, and **4 photo slots: distant scene, A close-up, B close-up, temporary photo** (location map removed by client feedback on 2026-10-23).
7. Final output: 10,000+ individual HWP files bundled as a ZIP for the selected scope. Latest agreed direction (2026-10-23): record output-data changes on save; a background worker regenerates only stale/missing HWP files and stores them in private R2. Downloads assemble prepared, versioned HWP objects into a ZIP in the background. Do not generate all HWP synchronously on download or block field saves on document generation. See `HWP_EXPORT_DESIGN.md`. Implementation/performance unverified; first run a one-document PoC.

## Implementation environment
- Package root **`com.meter.fieldwork`** (developer renamed from earlier starter package).
- Backend: Java 21 / Spring Boot 3.5.x / Gradle / JPA / Flyway / PostgreSQL. Local Windows IntelliJ + Docker Desktop (PostgreSQL separate local container). Spring profiles: `application.yml` common, `application-local.yml`, `application-prod.yml`; secrets externally injected; **no need for Spring to auto-read `.env.local`**.
- AWS EC2 Ubuntu t3.small ~2GiB, Docker Compose + PostgreSQL 17 has been provisioned and reached via SSH. `users` domain/entity is being developed; **verify actual repo before saying API/auth is implemented**. Earlier generated starter/auth archives are reference code and may not have been merged.
- Frontend React/Vite TypeScript, Cloudflare Pages planned, private Cloudflare R2 already owned, NAVER geocoding/maps planned.
- AWS Free-plan credits are temporary; budget alerts and service continuity beyond early 2027 require planning. Given B inspection in late 2027, **data and application restartability must be preserved until B completion** even if the server is paused.

## User schema selected by developer
```sql
CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  login_id VARCHAR(80) NOT NULL UNIQUE,
  nickname VARCHAR(100) NOT NULL,
  password TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN','WORKER')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
No `updated_at` requested. Login ID differs from immutable internal primary key; inactive workers must retain historical references. JPA `User` drafted by developer; next is actual mapping/Repository verification. Use secure one-way password hash. Avoid claiming unverified account features exist.

## Domain design decisions in progress
- Developer favors explicit A/B columns in the current inspection-card record due to only two known phases and simple report shape, while keeping baseline worksite separate and audit changes separate. A/B per-stage lifecycle/approval needs may alter this after client confirmation.
- Settlement separated; capture **historical per-item unit price and amount** so future rate changes don't revise old compensation.
- Change audit logs should preserve who/when/old/new; updating the current value is compatible with separate history.
- No speculative architecture or unnecessary queues; consider simple single-worker background jobs for 1,800 files.

## Current next steps
Inspect local source/Flyway schema against drafted User entity and fix gaps only after developer asks; confirm actual schema and migrations, implement/review UserRepository, then services/auth. Final Excel field mapping awaits actual import file. HWP document PoC can run independently when scheduled.
