# Backend MVP 실행 및 API 안내

기준 브랜치 develop에서 만든 `codex/backend-mvp`의 미커밋 변경이다. Java 21 **JDK**(`javac` 포함), Gradle Wrapper 9.6.0, Docker 25 이상과 PostgreSQL 17을 사용한다. 운영 DB/AWS 변경이나 배포는 수행하지 않았다.

## 로컬 실행

```bash
# 저장소 루트. 기존 운영 Compose와 별개인 로컬 DB만 실행한다.
docker compose up -d postgres
cd backend
cp .env.example .env
set -a
. ./.env
set +a
bash gradlew test bootJar --no-daemon
```

Spring은 `.env`를 자동으로 읽지 않는다. Windows는 같은 값을 PowerShell `$env:...`로 설정한다. 기본 local DB는 localhost:5432/fieldwork, 사용자 fieldwork_app이며 `.env.example` 비밀번호는 기존 로컬 Compose와 맞춘 개발용 값이다.

최초 ADMIN은 HTTP 회원가입 대신 별도 명령으로 만든다. 아래 세 값을 환경변수로 주입한 상태에서 실행한다. 실제 비밀번호를 명령행 인자·Git·로그에 기록하지 않는다.

- `BOOTSTRAP_ADMIN_USERNAME` (영문/숫자/밑줄/점/하이픈 3~32자)
- `BOOTSTRAP_ADMIN_NAME` (1~40자)
- `BOOTSTRAP_ADMIN_PASSWORD` (8~64자, BCrypt 제한상 UTF-8 72바이트 이하)

```bash
java -jar build/libs/fieldwork-backend-0.1.0-SNAPSHOT.jar \
  --spring.main.web-application-type=none --app.bootstrap-admin=true
# ADMIN이 이미 있으면 실패하며 기존 계정을 덮어쓰지 않는다.
# 초기화 전용 환경변수는 일반 서버 실행 전에 제거한다.
unset BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_NAME BOOTSTRAP_ADMIN_PASSWORD
java -jar build/libs/fieldwork-backend-0.1.0-SNAPSHOT.jar
```

기본 API 포트는 8080. `PORT`, `DB_PASSWORD`, `ALLOWED_ORIGINS`는 환경변수로 변경할 수 있다. 실제 운영은 `prod` 프로필과 `DB_URL`, `DB_USER`, `DB_PASSWORD`, R2 변수를 사용한다. local 사진은 `LOCAL_PHOTO_ROOT` 아래 비공개 파일로 저장하며 URL로 디렉터리를 직접 공개하지 않는다.

## 로그인과 CSRF

JSON 응답은 `success/code/message/data`다. 로그인만 form-urlencoded를 사용한다.

1. `GET /api/auth/csrf` → `data.headerName`과 `data.token`; 세션 쿠키를 보존한다.
2. `POST /api/auth/login`, `Content-Type: application/x-www-form-urlencoded`, `username=...&password=...`, CSRF 헤더 포함.
3. 로그인 시 세션 ID와 CSRF 토큰이 교체된다. 다시 `/api/auth/csrf`를 조회한다.
4. `GET /api/me`의 `mustChangePassword=true`면 일반 업무 API는 403 `PASSWORD_CHANGE_REQUIRED`.
5. `PATCH /api/auth/password` JSON `{"currentPassword":"...","newPassword":"..."}` + CSRF 헤더.
6. 비밀번호 변경은 모든 이전 세션을 무효화하므로 새 비밀번호로 다시 로그인한다.
7. 모든 POST/PUT/PATCH/DELETE에 현재 CSRF 토큰을 보낸다. 로그아웃은 `POST /api/auth/logout`.

쿠키는 HttpOnly, SameSite=Lax, 30분 유휴 만료이며 prod는 Secure다. `X-Demo-Role`은 인증 수단이 아니다. 비활성화·비밀번호 초기화·본인 변경은 DB 인증 버전을 올리며 이전 세션은 다음 요청에서 차단된다. 이미 진행 중인 요청을 소급 취소하는 방식은 아니다.

## API 목록

| 영역 | 엔드포인트 | 권한/설명 |
| --- | --- | --- |
| 상태 | GET `/api/health` | 공개; 애플리케이션 고정 응답 |
| 인증 | GET `/api/auth/csrf`, POST `/api/auth/login`, POST `/api/auth/logout` | 세션/CSRF |
| 본인 | GET `/api/me`, `/api/auth/me`; PATCH `/api/auth/password` | 비밀번호 변경 전에도 허용 |
| 사용자 | GET `/api/users` | ADMIN 전체, WORKER 본인 |
| 계정 | GET/POST `/api/admin/investigators`; PATCH `/{id}`; POST `/{id}/reset-password` | ADMIN; 기존 프론트 계약 |
| Import | POST `/api/admin/imports`; GET `/api/admin/imports/{jobId}` | ADMIN; multipart `file`; 결과 영구 보존 |
| 현장 | GET `/api/blocks`, `/api/sites`, `/api/sites/{id}`, `/api/site-summary` | 인증; 목록 기본20/최대100 |
| 특이사항 | PATCH `/api/sites/{id}/special-condition` | `code`, `description` |
| 비고 | PATCH `/api/sites/{id}/note` | 기존 `{note}` 계약 |
| 검침 | POST `/api/sites/{id}/measurements`; PATCH `/{phase}` | 생성 `phase/date/reading/workerId`; 수정 `date/reading/expectedUpdatedAt` |
| 검침 이력 | GET `/api/sites/{id}/measurements/{phase}/history?beforeId=...` | 본인 기록 또는 ADMIN; 최대100, nextCursor |
| 사진 | POST `/api/sites/{id}/photos` | multipart `file`, `slot` |
| 사진 교체/삭제 | PUT/DELETE `/api/sites/{id}/photos/{photoId}` | 업로더 또는 ADMIN; PUT은 multipart `file` |
| 사진 조회 | GET `/api/sites/{id}/photos/{photoId}/content` | 인증; 비공개 원본 프록시 |
| 단가 | GET/POST `/api/fee-rules`, PATCH `/api/fee-rules/{id}` | ADMIN |
| 정산 | GET `/api/settlements` | ADMIN; 전체 필터 범위 집계 |
| 본인 실적 | GET `/api/my-settlements` | 본인만, 금액 제외 |
| 소급 조정 | POST `/api/admin/fee-adjustments/preview`, POST/GET `/api/admin/fee-adjustments` | ADMIN; OPEN 건만, 사유/전후금액 영구 기록 |
| 정산 확정/지급 | POST `/api/admin/settlements/confirm`, `/pay` | ADMIN; `{inspectionIds:[...]}`, 최대1000건 |
| Excel | GET `/api/exports/sites.xlsx` | ADMIN; 실제 XLSX 스트리밍 |
| 기존 Export 계약 | GET `/api/exports/sites` | ADMIN; 기존 PageResponse와 photoSlots |

목록/요약 필터는 `middleBlockId`, `smallBlockId`, `q`, `status=TODO|IN_PROGRESS|DONE`. END 단독 등록도 기존 프론트 상태 규칙에 따라 DONE이다. 지도는 같은 페이지의 nullable 좌표를 사용한다. 전체 2만 건 무조건 반환이나 좌표 임의 생성은 하지 않는다. 별도 bounds/클러스터 API와 외부 지오코딩은 미구현이다.

정산 필터는 중/소블록, workerId, phase, startDate/endDate(양끝 포함), page/pageSize. 확정 시 날짜·금액을 별도 스냅샷으로 보존하므로 이후 검침 정정으로 정산 기간/금액이 바뀌지 않는다. 검침 내용 정정과 단가 설정은 분리된다. 취소·재개방은 제공하지 않는다.

## Excel Import

```bash
# 로그인 쿠키 파일과 로그인 이후 발급받은 CSRF 토큰을 사용한다.
curl -b cookies.txt -H "X-CSRF-TOKEN: $CSRF_TOKEN" \
  -F 'file=@/private/path/input.xlsx' http://localhost:8080/api/admin/imports
```

- 첨부 최종 파일의 2행 C/D/E 기본정보 헤더를 검증한다. 월별 M:AW 영역은 헤더와 값 모두 무시한다. 다른 레이아웃은 조용히 잘못 매핑하지 않고 거부한다.
- 모든 시트를 파일 순서로 처리한다. 각 시트는 같은 헤더/레이아웃을 가져야 한다.
- 500행 배치, 최대50,000행, 파일25MB. 전체 Import는 한 트랜잭션이다.
- 수용가번호는 표시 문자열 그대로 보존한다. 파일 안 최초 행 우선, DB 기존 값 유지, UNIQUE + ON CONFLICT로 동시 중복 방어.
- 빈 번호는 INVALID_CONSUMER_NUMBER, 파일 중복은 DUPLICATE_IN_FILE, DB 중복은 ALREADY_EXISTS.
- `jobId/totalRows/inserted/duplicateInFile/alreadyExists/invalid/skippedRows`를 반환한다. 제외 행에 sheet/rowNumber/consumerNumber/reason/firstSheet/firstRowNumber 포함.
- 파일 전체 오류/DB 장애는 롤백한다. 정상 행과 행 단위 중복/누락은 함께 처리한다. 재시도해도 기존 수용가를 덮어쓰지 않는다.
- `reWriteBatchedInserts`를 켜지 않는다. 드라이버의 정확한 행별 갱신 건수를 중복 보고에 사용한다.
- 원본 Excel 월별 자료는 저장하지 않는다. M:AW를 제외한 기본정보 원본 셀과 출처 시트·행만 보존한다. Excel 열 위치는 기존 양식을 유지한다. 수식 재계산은 하지 않으며 캐시된 표시값을 읽는다.

## 사진과 R2

슬롯은 OVERVIEW/START_CLOSEUP/END_CLOSEUP/TEMPORARY/EXTRA_1/EXTRA_2, 현장당 각1장, 총6장이다. JPEG/PNG만 허용하며 파일10MB·25메가픽셀 이하, 실제 디코딩으로 검증한다. 현재 WebP는 지원하지 않으므로 프론트가 JPEG/PNG로 변환해야 한다.

```bash
curl -b cookies.txt -H "X-CSRF-TOKEN: $CSRF_TOKEN" \
  -F slot=OVERVIEW -F file=@test.png http://localhost:8080/api/sites/1/photos
```

prod는 local 저장 모드를 거부한다. 비공개 R2 버킷과 `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`를 외부에서 주입한다. 버킷을 공개하지 않는다. 원본 조회는 세션 인증된 API를 거친다.

교체/삭제 객체는 DB outbox에 기록하고 60초 간격으로 재시도한다. DB 롤백 시 새 객체는 보상 삭제한다. 프로세스가 업로드와 DB 커밋 사이에서 강제 종료되는 경우의 고아 객체 정기 대조는 아직 제공하지 않는다. 실제 R2 계정 연결은 이번 환경에서 검증하지 못했다.

## 테스트

```bash
cd backend
bash gradlew clean test assemble --no-daemon
# 원본 파일 없이도 합성 20,000건, 동시 Import, 인증/권한, 검침, 사진, 정산, XLSX 검증

# 명시적으로 실행할 때만 개인정보 원본을 일회성 PostgreSQL에 넣는다.
FIELDWORK_EXCEL_PATH=/private/path/input.xlsx bash gradlew manualExcelTest --no-daemon
```

`manualExcelTest`는 일반 test에서 제외하는 별도 수동 작업이며 파일 경로가 없으면 실패한다. 일반 테스트를 조건부 skip으로 통과시키지 않는다. 원본/개인정보 결과는 커밋하지 않는다. Testcontainers가 임시 DB를 정리한다. V1은 수정하지 않았으며 V2~V7만 추가했다.

클라우드 환경에서는 기본 JRE 대신 작업 폴더 JDK21을 사용했고, Gradle에 환경 프록시와 시스템 CA를 지정했다. 이는 환경 설정이며 저장소에 프록시/자격 증명을 고정하지 않았다. Docker 29와의 호환은 테스트 전용 `docker-java.properties`의 API 1.44로 맞췄다.

## 운영 반영 전

사용자 검토 후 별도 배포 절차를 진행한다. 실제 Flyway 이력·백업·DB 권한·세션 쿠키 HTTPS·Workers `/api/*` 프록시의 Cookie/Set-Cookie/CSRF 전달·R2 접근을 배포 환경에서 확인해야 한다. 운영 스키마 변경/EC2 부하 검증/원격 CI/실제 R2 연결/프론트 통합 배포는 이번 작업에서 실행하지 않았다.
