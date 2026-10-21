# API 초안 (미구현)

Auth
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- PATCH /api/auth/password

Import/admin
- POST /api/admin/imports
- GET /api/admin/imports/{id}
- POST /api/admin/imports/{id}/retry-geocoding
- GET /api/admin/workers
- POST /api/admin/workers

Work
- GET /api/sites?status=COMPLETED|PENDING|ALL&bbox=...
- GET /api/sites/{id}
- PUT /api/sites/{id}/record (저장/수정, expectedVersion 필수)
- POST /api/sites/{id}/complete (사진 4개 및 필수 항목, 중복 방지)
- POST /api/sites/{id}/photos/upload-url (단기 presigned PUT)
- POST /api/sites/{id}/photos/confirm (R2 HEAD 검증 후 등록)
- GET /api/sites/{id}/photos/{slot}/view-url (단기 presigned GET)

Admin/audit
- GET /api/admin/audit-logs
- GET /api/admin/settlements?from=...&to=...
- PATCH /api/admin/settlements/{id}/pay
- GET /api/admin/exports/excel?status=...
- GET /api/admin/exports/hwpx?siteId=...

로그인/권한 방식, 중복업로드, 정산 트리거, 감사 로그 스키마 및 양식 검토 후 API를 확정해야 합니다.
