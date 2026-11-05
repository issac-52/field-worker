# 백엔드 MVP 작업 기록

기준: develop `30e7ec39603e2637bab98f3c5d81139df96b0645`. 작업 브랜치: `codex/backend-mvp`.
커밋/푸시/운영 배포는 수행하지 않는다. 원본 Excel은 저장소 밖에서만 읽는다.

## 원본 Excel 분석 (2026-11-05)

실제 파일을 읽어 확인한 집계이며 개인정보 값은 기록하지 않는다.

- Sheet1 1개, 57열, 1행 공백, 2행 헤더, 데이터 3~19821행: 19,819행.
- 수용가번호 C열: 문자열 19,798건, 모두 앞자리 0 포함. 고유 19,795건.
- 중복 3행: 19753(최초 19752), 19757(최초 8682), 19776(최초 2304).
- 수용가번호 누락 21행. 빈 수용가번호를 생성하거나 다른 번호로 대체하지 않는다.
- D 수용가명 및 F 구주소: 각각 75행 누락. 이름/주소 누락만으로 유효한 번호를 폐기하지 않는다.
- G 계량기번호: 문자열/숫자 혼재. H 계량기 유무, L '하'는 Boolean으로 해석하지 않는다.
- M:U, Y:AG, AK:AS에 2026.01~09 헤더가 세 번 반복된다. 파일 내부에 이 세 그룹의 의미를 명시하는 추가 제목/그림은 확인되지 않았다. 검침/사용량/요금으로 단정하지 않고 A/B/C 원문 그룹으로 보존한다.
- AX 상호는 데이터가 없고 AZ 수전번호는 숫자/문자 혼재, 19,414행 누락. 고유키로 사용하지 않는다.
- BB 소블럭 87행 누락. BC 검침담당/BD 정례검침일/BE 관리번호는 각각 75행 누락.
- 월별 결측은 0으로 바꾸지 않는다. 신규 START/END와 원본 월별 데이터는 별도 모델이다.

## 계약 차이

최신 요청을 우선한다: 사진 총 6장, END 독립 등록, 특이사항 코드, HWP 제외.
현재 프론트는 사진 4슬롯과 START 선행 검증이 있으므로 후속 연동 수정이 필요하다.
실제 로그인/CSRF/최초 비밀번호 변경 UI는 현재 없다. MSW 역할 헤더를 인증에 사용하지 않는다.

## 환경 확인

기본 Java는 21 JRE였으며 javac가 없어 최초 빌드는 테스트 실행 전에 실패했다.
작업 폴더에 Temurin JDK 21.0.13을 준비하고 Gradle 9.6.0으로 실제 컴파일했다.
Docker 29의 최소 API 버전과 Testcontainers 1.21.3의 기본 버전 차이를 테스트 설정으로 보완했다.
PostgreSQL 17 Testcontainers에서 Flyway V1 적용과 기존 health 테스트를 실제 실행했다.
운영 DB/AWS에는 접근하지 않았다.

## TDD 기록

- Phase 1: PostgreSQL 연결/마이그레이션 smoke 테스트 통과. 인증 시나리오 8개는 구현 전 모두 실패했다.
- 인증 구현 후 인증 8개 통과. DB smoke 테스트의 '사용자가 0명' 가정은 공유 DB의 다른 테스트 데이터와 충돌했다. 테스트 목적에 맞게 V1의 users.login_id 스키마 존재를 직접 검증하도록 수정했다.
- Phase 2: 중복/최초행/재업로드/번호 누락/권한/잘못된 파일에 대한 API 통합 테스트 작성.

## 최종 구현 및 검증

- Phase 1: 서버 세션·BCrypt·최초 변경 강제·관리자 초기화·계정 발급/비활성화/초기화. V2 인증 버전과 대소문자 무시 UNIQUE. 실제 CSRF 토큰, 세션 ID 교체, 로그아웃까지 검증.
- Phase 2: V3 수용가/원본 월별값/Import 결과, SAX 파싱과 500행 배치, 최초행 유지, ON CONFLICT, 재업로드·동시 업로드·후반 오류 롤백 검증.
- Phase 3: V4 특이사항/비고와 전후 이력, 목록/검색/블록/페이징/상세/집계. 검침 없이 특이사항 저장 검증.
- Phase 4: V5 START/END 독립 기록, BigDecimal 사용량, END<START 거부, 본인/ADMIN 정정, expectedUpdatedAt 충돌, 영구 이력과 조회. 검침 정정은 단가를 재계산하지 않는다.
- Phase 5: V6 사진 총6장, 실제 JPEG/PNG 디코딩 검사, 비공개 조회/교체/삭제, 로컬 스토리지와 R2 어댑터, 삭제 outbox. 실제 R2 계정 연결은 미검증.
- Phase 6: V7 기간 중첩 방지 단가, 검침 단가 스냅샷, 정산 확정/지급 스냅샷, OPEN만 소급 조정, 이력. SXSSF 실제 XLSX Export와 기존 페이지 Export.
- Phase 7: 신규 기능의 Red→Green 기록, 전체 회귀, 합성 20,000건, 원본 전체 Import/재업로드, 독립 JAR 초기화와 실제 HTTP 흐름 검증.

### 실제 실행 명령과 결과

JDK21, 로컬 Docker 소켓, 환경 프록시/CA 설정을 주입해 다음을 실행했다.

```bash
bash backend/gradlew -p backend clean test assemble manualExcelTest --no-daemon
```

수동 작업에만 FIELDWORK_EXCEL_PATH를 제공했다. 최종 실행은 **BUILD SUCCESSFUL (1m 51s)**. 일반 테스트 **30개, 실패0, skip0**, 별도 원본 수동 테스트 **1개, 실패0, skip0**. 일반 테스트 제외 태그는 수동 원본 작업 분리이며, 실패 테스트를 비활성화한 것이 아니다.

- 일반 테스트: Auth 9, Worksite/검침/사진/정산/Export 11, Import 6, 도메인 단위2, DB smoke1, 기존 Health1.
- 각 Phase의 신규 시나리오는 구현 전 4xx 응답 등으로 실패함을 확인하고 구현 후 통과했다. 추가 검토에서 수용가/급수전번호 혼동과 잘못된 연도 헤더 수용도 먼저 실패 테스트로 재현한 뒤 수정했다.
- 독립 JAR: 일회성 PostgreSQL에서 ADMIN 초기화 명령 exit0, 서버 기동, 실제 HTTP 로그인/변경/계정 발급/Import/검침/특이사항/6장 사진/인증 이미지/XLSX/권한 거부 통과. 최종 JAR에서도 수용가·급수전번호 매핑, 검침 이력, 전체 집계, 본인 정산 금액 비노출, 지급 후 금액 보존, 사진 PUT 교체·DELETE·재등록을 확인했다.
- V1 diff 없음. 커밋/푸시/원격 CI/운영 DB/AWS 변경 없음.

### 원본 업로드 결과

| 항목 | 실제 결과 |
| --- | ---: |
| 검사 행 | 19,819 |
| 신규 수용가 | 19,795 |
| 파일 중복 제외 | 3 |
| 번호 누락 제외 | 21 |
| 기존 DB 제외(첫 업로드) | 0 |
| 원본 월별 행 | 178,155 |
| 재업로드 신규 | 0 |
| 재업로드 DB 기존 제외 | 19,795 |

최종 검증의 원본 첫 Import **16.466초**, 재업로드 **8.040초**. 합성 20,000건은 최종 전체 실행에서 **26.638초**였다. 앞선 별도 실행은 원본14.937초/재업로드7.013초, 합성8.847초로 편차가 있었다. 모두 이 클라우드 개발 환경에서 측정한 벽시계 시간이며 EC2 2GB 환경의 성능 보장은 아니다. 수동 테스트 JVM heap 상한은512MB. 운영 RSS/동시 부하/백업 복구는 측정하지 않았다.

### 테이블과 관계

- users: 기존 계정 + 강제변경/인증 버전/낙관적 버전.
- import_jobs → worksites(수용가번호 UNIQUE) → source_monthly_values(현장/월 PK).
- worksites → worksite_edits; users는 변경자 FK.
- worksites → inspections(현장/단계 UNIQUE) → inspection_edits; users는 작업자/변경자 FK.
- worksites → photos(현장/슬롯 UNIQUE, 허용 슬롯6개), photo_deletions는 저장소 삭제 outbox.
- fee_rules는 START/END별 기간 중첩을 PostgreSQL exclusion 제약으로 방어.
- inspections → settlement_records(1:1 확정 날짜/금액/확정자/지급자).
- fee_adjustments → fee_adjustment_items → inspections: 소급 조정의 전후 단가와 사유.

### 주요 결정과 한계

- User는 JPA, 대량 Import/조회/정산은 JDBC를 사용한다. 핵심 검침 규칙은 별도 도메인 로직으로 분리했다. 과도한 계층/인터페이스 대신 기능별 모듈을 유지한다.
- 수용가와 과거 월별값·새 검침·사진·정산을 분리했다. 원본의 불명확한 세 월별 그룹/계량기 유무/봉인 여부를 임의 해석하지 않는다.
- 검침/정산 쓰기는 DB advisory lock으로 순서를 맞춘다. 사용자 약20명 MVP의 단순성을 택했으며 대규모 동시 쓰기 확장성은 별도 검증 대상이다.
- Import 한 작업은 원자적이다. 행 오류는 보고하며 계속하지만 파일/DB 오류는 전체 롤백한다. 처리 중 UI 진행률/비동기 작업 큐는 구현하지 않았다.
- 실제 R2 자격 증명 연결, 프론트 실제 연동, Workers 프록시 배포, AWS 운영/EC2 성능, 지오코딩·지도 bounds/클러스터 API는 미완료/미검증 범위다.
- 프론트 변경 없이 즉시 운영 전환할 수 있는 상태로 보고하지 않는다. 봉인 null 표시, consumerNumber 분리, 로그인/CSRF, 특이사항, 사진6장과 multipart, Import 결과, 정산 확정/지급 UI가 필요하다.
- 사진 고아 객체의 주기적 버킷 대조, 정산 취소/재개방은 미구현이다. HWP/ZIP은 요청에 따라 제외했다.

전체 API와 설정은 [실행 안내](BACKEND_RUNBOOK.md), 요청/응답 변경 예시는 [프론트 연동 문서](FRONTEND_BACKEND_INTEGRATION.md)를 참고한다.


## 전체 변경 파일

- `.gitignore`
- `README.md`
- `backend/.env.example`
- `backend/build.gradle.kts`
- `backend/src/main/java/com/meter/fieldwork/auth/AdminInitializer.java`
- `backend/src/main/java/com/meter/fieldwork/auth/AuthController.java`
- `backend/src/main/java/com/meter/fieldwork/auth/SessionGuard.java`
- `backend/src/main/java/com/meter/fieldwork/auth/SessionUser.java`
- `backend/src/main/java/com/meter/fieldwork/excel/ExcelExportController.java`
- `backend/src/main/java/com/meter/fieldwork/excel/ExcelExportService.java`
- `backend/src/main/java/com/meter/fieldwork/excel/ExcelImportController.java`
- `backend/src/main/java/com/meter/fieldwork/excel/ExcelImportService.java`
- `backend/src/main/java/com/meter/fieldwork/excel/ExcelRows.java`
- `backend/src/main/java/com/meter/fieldwork/excel/ImportResult.java`
- `backend/src/main/java/com/meter/fieldwork/global/ApiException.java`
- `backend/src/main/java/com/meter/fieldwork/global/ApiExceptionHandler.java`
- `backend/src/main/java/com/meter/fieldwork/global/ApiResult.java`
- `backend/src/main/java/com/meter/fieldwork/global/SecurityConfig.java`
- `backend/src/main/java/com/meter/fieldwork/inspection/InspectionController.java`
- `backend/src/main/java/com/meter/fieldwork/inspection/InspectionRules.java`
- `backend/src/main/java/com/meter/fieldwork/inspection/InspectionService.java`
- `backend/src/main/java/com/meter/fieldwork/photo/ObjectStorage.java`
- `backend/src/main/java/com/meter/fieldwork/photo/PhotoCleanup.java`
- `backend/src/main/java/com/meter/fieldwork/photo/PhotoController.java`
- `backend/src/main/java/com/meter/fieldwork/photo/PhotoService.java`
- `backend/src/main/java/com/meter/fieldwork/photo/StorageConfig.java`
- `backend/src/main/java/com/meter/fieldwork/settlement/SettlementController.java`
- `backend/src/main/java/com/meter/fieldwork/settlement/SettlementService.java`
- `backend/src/main/java/com/meter/fieldwork/user/UserController.java`
- `backend/src/main/java/com/meter/fieldwork/user/UserView.java`
- `backend/src/main/java/com/meter/fieldwork/user/entity/User.java`
- `backend/src/main/java/com/meter/fieldwork/user/repository/UserRepository.java`
- `backend/src/main/java/com/meter/fieldwork/user/service/UserService.java`
- `backend/src/main/java/com/meter/fieldwork/worksite/SpecialCondition.java`
- `backend/src/main/java/com/meter/fieldwork/worksite/WorksiteController.java`
- `backend/src/main/java/com/meter/fieldwork/worksite/WorksiteService.java`
- `backend/src/main/resources/application-local.yml`
- `backend/src/main/resources/application-prod.yml`
- `backend/src/main/resources/application.yml`
- `backend/src/main/resources/db/migration/V2__user_authentication.sql`
- `backend/src/main/resources/db/migration/V3__worksites_and_imports.sql`
- `backend/src/main/resources/db/migration/V4__worksite_conditions.sql`
- `backend/src/main/resources/db/migration/V5__inspections_and_fee_snapshots.sql`
- `backend/src/main/resources/db/migration/V6__private_photos.sql`
- `backend/src/main/resources/db/migration/V7__settlement_records.sql`
- `backend/src/test/java/com/meter/fieldwork/DatabaseSmokeTest.java`
- `backend/src/test/java/com/meter/fieldwork/PostgresIntegrationTest.java`
- `backend/src/test/java/com/meter/fieldwork/auth/AuthIntegrationTest.java`
- `backend/src/test/java/com/meter/fieldwork/excel/ExcelImportIntegrationTest.java`
- `backend/src/test/java/com/meter/fieldwork/excel/ManualExcelImportTest.java`
- `backend/src/test/java/com/meter/fieldwork/inspection/InspectionRulesTest.java`
- `backend/src/test/java/com/meter/fieldwork/worksite/WorksiteIntegrationTest.java`
- `backend/src/test/resources/docker-java.properties`
- `docs/BACKEND_MVP_PROGRESS.md`
- `docs/BACKEND_RUNBOOK.md`
- `docs/DECISIONS_AND_PORTFOLIO.md`
- `docs/FRONTEND_BACKEND_INTEGRATION.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/REQUIREMENTS.md`
- `docs/api-plan.md`
