# 수도관리 (field-worker)

상수도 검침 현장 업무 시스템입니다. 약 2만 수용가의 Excel 등록부터 지도 조회, START/END 검침과 사진, 정산, HWPX 검침카드 출력까지 한 흐름으로 처리합니다. 실서비스로 운영 중이며 지역별로 따로 배포해 약 30명이 사용합니다.

## 주요 기능

| 영역 | 내용 |
| --- | --- |
| 계정 | 관리자 발급 계정(ADMIN / WORKER), 첫 로그인 시 비밀번호 변경, 서버 세션 + CSRF |
| 수용가 등록 | Excel 최종/이전 양식 등록, 기존 기본정보 업데이트, 빈 정보 보완, 번호 없는 수용가는 주소+이름으로 식별, 파일에 없는 수용가 삭제 미리보기 |
| 좌표·지도 | NAVER 주소 변환(관리자 배치), 지도 화면 범위 조회, 축소 시 구역별 집계 |
| 검침 | START/END 독립 저장, END가 START보다 작으면 거부, 동시 수정 버전 검사, 정산 전 단건 초기화(이력 보존) |
| 사진 | 수용가별 슬롯 저장, 비공개 R2 |
| 정산 | 묶음 처리, 확정·지급 후 수정 잠금 |
| 출력 | Excel, HWPX 검침카드(백그라운드 생성·캐시, 날짜·단계별, 소블록 합본, 전체 ZIP) |
| 현장 사용 | 모바일 웹과 PWA 설치, 연결이 끊기면 기기에 임시 저장 후 자동 전송(계정별 분리) |

## 구성

| 영역 | 기술 | 배포 |
| --- | --- | --- |
| Frontend | React, Vite, TypeScript, TanStack Query, shadcn/ui, Tailwind v4 | Cloudflare Workers (정적 자산 + `/api` 프록시) |
| Backend | Java 21, Spring Boot 3.5, Spring Security, JPA, Flyway | AWS EC2 |
| DB | PostgreSQL 17 | EC2 Docker Compose |
| 파일 | Cloudflare R2 (비공개) | 사진, HWPX, ZIP |
| 지도 | NAVER Maps, Geocoding | |
| CI/CD | GitHub Actions | `CI`: 프론트·백엔드 테스트와 빌드 / `Backend Release`: master에서 JAR 빌드 후 OIDC·SSM으로 EC2 배포 |

백엔드는 기능별 패키지(`auth`, `user`, `worksite`, `excel`, `geocoding`, `inspection`, `photo`, `settlement`, `document`, `global`)로 나눈 단일 Spring Boot 애플리케이션입니다.

```
backend/    Spring Boot API, Flyway 마이그레이션, HWPX 템플릿
frontend/   React 앱, Cloudflare Worker(/api 프록시)
docs/       운영·기능·성능·결정 기록
compose.yml 로컬 개발용 PostgreSQL
```

## 로컬 실행

JDK 21, Docker, Node.js 22가 필요합니다.

```bash
# 1. 로컬 PostgreSQL
docker compose up -d postgres

# 2. 백엔드 (환경변수는 backend/.env.example 참고)
cd backend
bash gradlew test bootJar --no-daemon
java -jar build/libs/fieldwork-backend-0.1.0-SNAPSHOT.jar

# 3. 프론트엔드 (http://localhost:5173, /api는 로컬 백엔드로 프록시)
cd frontend
npm ci
npm run dev
```

최초 관리자 생성, 로그인·CSRF 흐름과 API 목록은 [백엔드 실행 안내](docs/BACKEND_RUNBOOK.md)를 따릅니다. 백엔드 없이 화면만 볼 때는 `npm run dev:demo`로 MSW 시연 모드를 실행합니다([프론트 안내](frontend/README.md)).

## 브랜치와 배포

작업 브랜치 → `develop` PR → `master` 순서로 병합합니다. `master`에 병합되면 `Backend Release`가 테스트 후 JAR를 만들고, 배포가 켜져 있으면 EC2에 반영합니다. 배포 전 JAR를 백업하고 상태 확인에 실패하면 이전 JAR로 되돌립니다. 설정은 [EC2 자동 배포](docs/EC2_AUTOMATIC_DEPLOYMENT.md)와 [운영 설정](docs/PRODUCTION_CONFIGURATION.md)에 있습니다.

## 문서

**운영·실행**
- [백엔드 실행과 API](docs/BACKEND_RUNBOOK.md)
- [운영 설정 (Workers, EC2, R2 변수)](docs/PRODUCTION_CONFIGURATION.md)
- [EC2 자동 배포](docs/EC2_AUTOMATIC_DEPLOYMENT.md)
- [프론트 실행·빌드](frontend/README.md), [API 계약](frontend/API_CONTRACT.md)

**기능별 규칙**
- [최종 Excel 양식과 기존 정보 업데이트](docs/FINAL_EXCEL_IMPORT.md)
- [필터된 Excel 업로드와 기존 DB 정리](docs/VISIBLE_EXCEL_AND_PRUNE.md)
- [번호 없는 수용가 식별](docs/OPTIONAL_CONSUMER_NUMBER.md)
- [Excel 계량기 유무와 비고 분리](docs/EXCEL_METER_REMARKS.md)
- [주소 좌표 변환과 원본 상세정보](docs/GEOCODING_AND_SOURCE_DETAILS.md)
- [HWPX 검침카드 출력](docs/HWPX_EXPORT.md)

**성능 기록**
- [목록 조회 개선 (SQL 62→4회)](docs/performance/2026-11-10-list-optimization/REPORT.md)
- [HWPX 대량 생성 개선](docs/performance/2026-11-12-hwpx/REPORT.md)
- [가상 2만 건 기준 측정](docs/PERFORMANCE_BASELINE_2026-11-10.md), [측정 자료 모음](docs/portfolio/performance-baseline/README.md)

**맥락과 결정**
- [프로젝트 맥락 (현재 규칙 요약)](docs/PROJECT_CONTEXT.md)
- [주요 의사결정·해결 기록](docs/DECISIONS_AND_PORTFOLIO.md)
- [지난 설계·인계 문서](docs/archive/README.md)

## 데이터 보호

실제 환경파일, 인증정보, 고객 원본 Excel, 사진은 Git과 공개 자료에 넣지 않습니다. 테스트와 문서에는 가상 데이터만 사용합니다. 작업 규칙은 [AGENTS.md](AGENTS.md)를 따릅니다.
