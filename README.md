# Field Work Manager — 개발 초기 뼈대

현장 작업 관리: React/Vite + Java 21/Spring Boot + PostgreSQL 17 + Flyway. **현재 인증/업무 기능은 미구현**입니다.

## 현재 완료 상태
- 사용자 확인: AWS EC2 SSH, Docker, PostgreSQL 컨테이너 기동과 `psql` 접속.
- 코드 작업: Maven 설정을 Gradle로 전환, DB 연결 환경변수, Flyway V1(초안), Health API와 단위테스트 추가.
- **이 환경에서는 Gradle 실행/의존성 다운로드/통합 실행 테스트를 수행하지 못했습니다.**

## 로컬 실행 (EC2에서 실행하는 게 아님)

필수: JDK 21, Docker, Gradle 8.14+ (또는 호환 Gradle), Node.js.

```bash
# 저장소 루트, 로컬 개발 전용 PostgreSQL
# NOTE: EC2 DB와 별개의 로컬 개발 DB이며 아래 비밀번호는 개발용입니다.
docker compose up -d
cd backend
# Gradle이 설치된 PC에서 최초 한 번 wrapper 생성 (wrapper 관련 파일은 git에 추가)
gradle wrapper --gradle-version 8.14.3
# Linux/macOS: ./gradlew bootRun, Windows: .\gradlew.bat bootRun
```

다른 터미널에서 `GET http://localhost:8080/api/health` 확인. 응답: `{"status":"ok"}`.

**중요:** 아래 예시는 로컬에서만 허용되는 개발용 DB 비밀번호를 사용합니다. Windows PowerShell:

```powershell
$env:DB_URL="jdbc:postgresql://localhost:5432/fieldwork"
$env:DB_USER="fieldwork"
$env:DB_PASSWORD="fieldwork_dev_only"
.\gradlew.bat bootRun
```

앱 시작 시 Flyway가 `V1__initial_schema.sql`을 실행한 뒤 JPA의 `ddl-auto: validate`가 스키마를 검사합니다. 연결 오류 발생 시 DB, URL, 계정, 비밀번호부터 확인하세요. **실제 EC2 데이터베이스에 이 개발용 값을 사용하면 안 됩니다.**

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
- 초기 Flyway V1은 **미확정 업무 테이블 초안**입니다. 실서비스 데이터에 적용하기 전 요구사항에 따라 검토하세요. 적용한 V1 파일을 나중에 덮어쓰면 Flyway 체크섬 불일치가 발생하므로 변경은 `V2__...sql`로 진행하세요.
- 프론트엔드 배포는 Cloudflare Pages. 운영 API HTTPS/CORS/인증 쿠키 구성은 이후 단계.

## 확인 명령
```bash
cd backend
./gradlew test                # Windows: .\gradlew.bat test
./gradlew bootRun
# 별도 터미널
curl http://localhost:8080/api/health
```

## 면접/포트폴리오 기록

`docs/DECISIONS_AND_PORTFOLIO.md`를 작업마다 업데이트. 결정/코드작성/실제검증을 구분합니다.
