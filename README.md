# 수도관리 — Field Work Manager

현장 조사자와 관리자를 위한 모바일 검침 관리 프로젝트. 대상 수용가 10,000건 이상, 사용자 약 20명, 초기 납기 2026-11-14.

## 현재 상태 (2026-10-23)

| 영역 | 실제 상태 |
| --- | --- |
| 프론트엔드 | React/Vite/TypeScript, shadcn/ui 기반 Mock 시연 구현 |
| 현장 업무 | 블록·검색·상태 필터, 목록/지도, START·END 등록/정정, 사진 4종, 특이사항 — MSW 메모리 저장 |
| 관리자 | 조사자 계정·단가·정산·실제 XLSX 다운로드 — 데이터와 권한은 Mock |
| 지도 | 실제 NAVER 동적 SDK 연동. 현재 목록 페이지 최대 20건의 좌표 표시 |
| 백엔드 | Java 21/Spring Boot 3.5.6/Gradle/JPA/Flyway. User·Repository 초안, 빈 UserService, Health API. 실제 인증·업무 API 미구현 |
| HWP·ZIP / R2 | 설계 단계. 다음 작업은 사진 포함 HWP 한 건 생성 PoC |
| 운영 | EC2/Docker/PostgreSQL 기동은 사용자 보고. 이 문서 정리에서 원격 상태를 확인하지 않음 |

Mock 역할 전환은 실제 로그인·권한 인증이 아니다. 새로고침하면 작업자 역할과 초기 데이터로 돌아간다. 현재 프론트의 업무 API는 실제 Spring 서버에 연결되어 있지 않다.

## 문서 안내

- [프로젝트 인계·다음 작업](docs/PROJECT_CONTEXT.md)
- [확정 요구사항과 미확정 정책](docs/REQUIREMENTS.md)
- [프론트 실행·시연·배포](frontend/README.md)
- [현재 Mock API 계약](frontend/API_CONTRACT.md)
- [백엔드 구현 계획](docs/api-plan.md)
- [HWP 사전 생성·ZIP 설계](docs/HWP_EXPORT_DESIGN.md)
- [검증 기록과 한계](docs/FRONTEND_REVIEW.md)
- [주요 의사결정·해결 기록](docs/DECISIONS_AND_PORTFOLIO.md)
- [추후 지도 범위 조회 제안](docs/MAP_QUERY_DESIGN.md)

## 프론트 실행

```powershell
cd frontend
npm ci
# .env.example을 참고해 Git 제외 파일인 .env.local / .env.demo를 설정
npm run dev:demo
```

시연 주소는 http://localhost:5176/ 이다. 상세 환경 설정과 일반/시연 빌드 차이는 [프론트 README](frontend/README.md)를 따른다.

## 백엔드 로컬 실행

JDK 21과 Docker Compose가 필요하다. Wrapper는 저장소에 있으며 지정된 Gradle 버전은 9.6.0이다. 이 버전의 실제 빌드 호환성은 검증 완료로 간주하지 않는다.

```powershell
# 저장소 루트: 로컬 개발용 PostgreSQL
 docker compose up -d
cd backend
$env:SPRING_PROFILES_ACTIVE='local'
# DB_PASSWORD는 로컬 compose.yml의 개발 DB 설정에 맞춰 환경변수로 제공
.\gradlew.bat test --no-daemon
.\gradlew.bat bootRun
```

- local: localhost:5432/fieldwork, DB 사용자 fieldwork, 비밀번호는 DB_PASSWORD.
- prod: DB_URL/DB_USER/DB_PASSWORD를 외부에서 주입한다.
- GET /api/health만 공개하며 나머지는 SecurityConfig에서 거부한다. health는 고정 응답으로 DB 상태 진단이 아니다.
- Lombok import/annotationProcessor를 수정하고 Java 21 + Gradle 9.6.0에서 clean test 및 assemble을 확인했다. 현재 테스트는 health 단위 테스트 1개이며 DB/JPA 통합 검증은 별도다.
- 루트 compose.yml은 로컬 전용이다. EC2의 별도 /opt/field-work/compose.yml을 덮어쓰지 않는다.
- Flyway 변경 전 각 DB 적용 이력을 확인한다. 적용된 마이그레이션을 수정하거나 DB 볼륨을 삭제하지 않는다.

실제 환경파일·인증정보·고객 원본·사진은 Git과 공개 자료에 넣지 않는다. 작업 규칙은 [AGENTS.md](AGENTS.md)를 따른다.
