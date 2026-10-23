# Field Work Manager — 개발 초기 뼈대

현장 작업 관리: React/Vite + Java 21/Spring Boot + PostgreSQL 17 + Flyway. **현재 인증/업무 기능은 미구현**입니다.

## 현재 구현 및 검증 상태
- 사용자 확인: AWS EC2 SSH, Docker, PostgreSQL 컨테이너 기동과 `psql` 접속.
- 코드 존재: Gradle 설정과 Wrapper, local/prod DB 설정, Flyway V1의 `users` 테이블, `User`/`UserRole` 엔티티 초안, Health API와 단위테스트.
- 인증: GET `/api/health`만 공개하고 나머지 요청은 거부합니다. 사용자 Repository/Service/API와 로그인·계정 관리는 미구현입니다.
- 프론트엔드: 로그인·지도·상세·관리자 안내 화면과 라우팅만 있습니다. 엑셀, 검침, 사진, 정산, 감사 로그, 보고서 기능은 미구현입니다.
- **검증:** 2026-10-22 `gradlew.bat test --no-daemon`은 실행 환경에서 Java를 찾지 못해 테스트에 진입하지 못했습니다. DB 연결, Flyway/JPA 통합 실행, 프론트엔드 빌드도 미검증입니다.

## 로컬 실행 (EC2에서 실행하는 게 아님)

필수: JDK 21, Docker Compose, Node.js/npm.

Gradle은 별도 설치 없이 `backend`의 Wrapper를 사용합니다. 현재 `backend/gradle/wrapper/gradle-wrapper.properties`에 지정된 버전은 **9.6.0**입니다. 이 값은 현재 설정을 나타내며 빌드 호환성 검증 완료를 뜻하지 않습니다. 최초 실행에는 지정된 Gradle과 의존성을 다운로드할 네트워크 연결이 필요합니다.

JDK 설치 후 `JAVA_HOME`을 JDK 설치 경로로 설정하고 `PATH`에 `%JAVA_HOME%\bin`을 추가합니다. 터미널을 새로 열어 다음 명령으로 확인하세요.

```powershell
java -version
# 저장소 루트에서 실행
cd backend
.\gradlew.bat --version
```

### 백엔드 (Windows PowerShell)

아래 명령은 저장소 루트에서 시작합니다. DB 비밀번호는 저장소의 로컬 개발용 Compose 설정에 맞춘 값입니다.

```powershell
docker compose up -d
cd backend
$env:SPRING_PROFILES_ACTIVE="local"
$env:DB_PASSWORD="fieldwork_dev_only"
.\gradlew.bat bootRun
```

`local` 프로파일은 `localhost:5432/fieldwork`, 사용자 `fieldwork`를 사용하며 비밀번호만 `DB_PASSWORD`로 받습니다. `prod` 프로파일은 `DB_URL`, `DB_USER`, `DB_PASSWORD`가 필요합니다. 실행할 프로파일을 명시하세요.

앱 시작 시 Flyway가 미적용 마이그레이션을 실행한 뒤 JPA의 `ddl-auto: validate`가 매핑과 스키마를 검사합니다. 현재 V1은 `users` 테이블만 생성합니다. **실제 EC2 데이터베이스에 개발용 값을 사용하면 안 됩니다.**

정상 기동 후 다른 터미널에서 `GET http://localhost:8080/api/health`를 확인합니다. 예상 응답은 `{"status":"ok"}`입니다. 이 API는 고정 응답이며 별도의 DB 상태 진단은 하지 않습니다.

### FE (별도 터미널)
```bash
cd frontend
npm install
npm run dev
```

## EC2 연동 주의

- 현재 `/opt/field-work/compose.yml`은 사용자가 이미 기동한 별도 파일. **이 저장소 루트 compose.yml로 덮어쓰지 마세요.**
- 운영 DB에 접근하려고 포트 5432를 인터넷에 열지 마세요. 다음 단계에서 Spring Boot 컨테이너를 동일한 EC2 Compose 네트워크에 배치하여 `jdbc:postgresql://postgres:5432/fieldwork` 로 연결합니다.
- 운영 PostgreSQL의 사용자명은 `fieldwork_app`일 수 있습니다(실제 EC2 `.env` 확인). 운영 비밀번호는 채팅이나 Git에 올리지 마세요.
- Flyway V1은 현재 `users` 테이블만 포함합니다. 변경 전 로컬·운영 DB의 `flyway_schema_history`에서 적용 여부를 확인하세요. 적용된 V1 변경은 체크섬 불일치를 일으킬 수 있으므로 스키마 변경은 `V2__...sql` 등 후속 마이그레이션으로 진행하세요.
- 프론트엔드 배포는 Cloudflare Pages. 운영 API HTTPS/CORS/인증 쿠키 구성은 이후 단계.

## 확인 명령
```powershell
# 저장소 루트에서 실행
cd backend
.\gradlew.bat test --no-daemon
# 백엔드 정상 기동 후 별도 PowerShell에서 실행
Invoke-RestMethod http://localhost:8080/api/health
```

Linux/macOS에서는 `./gradlew`를 사용합니다. 현재 테스트는 HealthController를 직접 호출하는 단위테스트 1개이며, HTTP 보안 필터·DB·Flyway·JPA 저장 동작은 검증하지 않습니다.

## 면접/포트폴리오 기록

`docs/DECISIONS_AND_PORTFOLIO.md`를 작업마다 업데이트. 결정/코드작성/실제검증을 구분합니다.

## 검침 수정과 Excel 다운로드

상세/지도에서 기존 검침의 **검침 수정**으로 날짜·지침을 정정할 수 있습니다. 작업자는 본인 기록, 관리자는 전체 기록을 수정합니다. 저장 충돌 검사와 감사 이력은 현재 MSW 시연 구현입니다.

관리자의 **문서 출력 → Excel 다운로드 (.xlsx)**는 선택 블록의 전체 데이터를 내려받습니다. 기본정보, START/END 날짜·지침·작업자·금액, 사용량, 특이사항, 사진 등록 여부, 위치도 메타데이터 총 44열입니다. 사진 이미지 자체는 제외합니다. 진행·취소·실패 안내를 제공하며 HWP/ZIP은 준비 중입니다. 파일은 실제 XLSX이지만 현재 내용은 가상 시연 데이터입니다.

frontend에서 `npm run test:export`로 XLSX 검증을 실행합니다. 실제 브라우저 다운로드는 12건으로 확인했습니다. 12,050건 페이지 수집은 테스트했으나 대량 XLSX 생성 성능은 측정하지 않았습니다.
