# Requirements — confirmed vs pending

_Last updated: 2026-10-22._

## Confirmed / agreed direction
| Area | Requirement |
|---|---|
| Users | ~20 workers/admins; admin-issued accounts, `ADMIN` / `WORKER`; disabled account retains history. |
| Interface | Mobile-first field-work UI; PC used mainly for admin reports, correction, and statistics. |
| Import | Target scale is 10,000+ sites (confirmed 2026-10-23); final Excel mapping remains pending. Sample workbook is reference only. |
| Map | NAVER Maps coordinates/markers; filters for progress including completion and outstanding work. |
| Inspections | Two dated stages: A around Nov 2026, B around Nov 2027; persist worker and timestamp per stage; B−A derived. |
| Photos | Confirmed 2026-10-23: one automatic LOCATION_MAP plus OVERVIEW/START_CLOSEUP/END_CLOSEUP field photos. Location map is separate from file upload. Actual Static/R2 persistence is disabled pending usage-rights confirmation and backend implementation. |
| Admin | View worker completion/edit/deletion history and stage counts; calculate per-worker monthly and overall compensation. |
| Reports | Export data to Excel. Populate supplied HWP card template; **one HWP per customer, ~1,800 HWP files per ZIP**. |
| Operations | AWS EC2 Docker/PG, React/Vite/Cloudflare Pages, R2. Minimize recurring cost, retain data long enough for B stage. |
| Development | Developer designs/implements core code; AI reviews actual code and updates decision log with verified facts. |

## Pending client confirmation — do not implement as facts
- Actual final Excel file, column mapping, ~1,800 cases selection rule, unique import identity, refresh/reimport/upsert behavior.
- Whether a physical site/address can contain multiple accounts or meters, whether meter is replaced between A/B, and how to handle negative B−A.
- Permission to retain NAVER Static Map images in R2 and reuse/distribute them in HWP, acceptable image quality and retention policy. The four image roles themselves are confirmed above.
- Completed-entry date/reading correction requested and implemented in frontend/MSW (2026-10-23): worker own records/admin all. Production approval, settled-record correction and exception policies remain pending.
- Assignment by geographic area, ownership rules, duplicate/concurrent work policies.
- Whether A/B stages are paid separately, which event counts for settlement, unit-price exceptions, approval/reversal/payment status.
- Whether `.hwpx` is acceptable or native `.hwp` strictly required; final document formatting acceptance criteria; output of incomplete A cards.
- Whether full batch HWP export belongs to initial 2026-11-14 delivery or a subsequent phase; whether service is paused between A and B; termination/data retention policy.
- Offline work necessity, actual working connectivity, privacy/access controls, backups and file retention.

## Implementation milestones (not confirmed complete)
1. Verify source code, Flyway migration and JPA `User` entity against selected SQL.
2. User repository, service, admin account provisioning and auth/security, then frontend login.
3. Actual import file → mapping design, import validation/duplicate handling, target and status modeling.
4. Map/geocoding, A-stage inspection, photos/R2.
5. Admin audit, settlement and Excel download.
6. HWP **single-template proof of concept**; then sequential/streamed ZIP background export with progress, failure list, temporary R2 retention.
7. Integration testing, backup restore test, staging/production deployment and mobile validation.

## Nonfunctional guardrails
- Never expose PostgreSQL port 5432 publicly; HTTPS APIs; restrict access to inspection data and private photos.
- DB is authoritative; generated HWP/ZIP are derived artifacts. Reuse cached exports only if source-data and template version match.
- Do not process ~4GB of report content in heap simultaneously on a 2GiB VM; stream and measure throughput before committing to ETAs.
- Keep original customer spreadsheet/photos out of source control, screenshots, public issues, and portfolio materials.
