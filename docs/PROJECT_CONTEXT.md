# Field Work Manager — Project context

_Last context consolidation: 2026-10-22. This is a handoff, not a claim that code is already implemented._

2026-10-23 확정 요구 보완: 대상은 **10,000건 이상**이며 HWP 이미지는 자동 위치도 1개 + 현장 원경/START 근경/END 근경 각 1개다. 아래 이전 1,800건 규모 설명보다 최신 요구를 우선한다. 위치도 프론트/MSW 시연과 서버 저장 계약은 `LOCATION_MAP_DESIGN.md`를 참조한다. 실제 Static/R2 저장은 이용 조건 확인 및 백엔드 구현 전으로 비활성이다.

## Project and goals
Mobile-first private fieldwork system for ~20 part-time workers and admins. Friendly paid commission (~KRW 1,000,000); initial delivery target **2026-11-14**. Secondary developer goal: hands-on Spring/backend, transaction, security, and operations experience documented for job interviews. Developer implements core functionality; Codex primarily reviews and debugs real code.

## Business flow
1. Admin imports a future Excel file with ~1,800–2,000 target records; provided spreadsheet dated 10/13 is **format/reference only**, not the actual import dataset. Do not load its ~19,700 reference rows into production.
2. Normalize baseline customer/meter/address data. Geocode once and persist coordinates. Display work items in NAVER map with appropriate stage/status filters; account for multiple meters/consumers at one address.
3. **A (start-stage) inspection begins Nov 2026.** Record meter reading, inspection date, worker and photos.
4. **B (end-stage) inspection occurs roughly one year later (around Nov 2027)** on the same inspection subject; potentially different worker. A and B are distinct stage completion states. Calculate final volume as B−A at read/export time, not a constantly updated derived column. Exceptions like replacement/resetting a meter remain to be clarified.
5. Administrators inspect changes/worker activity, track completion, monthly/overall per-item compensation, export Excel, and create reports.
6. HWP template provided: customer name, address, customer connection number, industry, meter number, seal, water district, notes, A/B dates and readings, B−A, and **4 image slots: location map, distant scene, A close-up, B close-up** (3 field photos + 1 location map, pending business confirmation).
7. Final output: **1,800 individual HWP files bundled as one ZIP**, not one merged HWP. Intended generation on demand; for bulk output run background job, stream per-file ZIP, upload to private R2, temporarily cache by data/template version, and expire output cache (proposed 3 days). Do not permanently generate one HWP for every edit. Feasibility of faithful HWP template/image manipulation is **not yet validated**; run a one-document PoC.

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
