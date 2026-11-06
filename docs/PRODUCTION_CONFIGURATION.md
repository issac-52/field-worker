# master 운영 배포 설정

EC2를 켜고 SSH 키만 입력해도 앱이 배포되는 구조는 아니다. 현재 저장소 CI는 develop/main 테스트·빌드이며 EC2 배포 작업이 없다. master도 현재 CI 트리거에 없다. Cloudflare Git 연동의 production branch는 별도로 master로 지정해야 한다.

## Cloudflare Workers 빌드 환경

frontend 디렉터리에서 `npm ci && npm run build`를 실행한다.

```dotenv
VITE_APP_ENV=production
VITE_USE_MOCKS=false
VITE_DEMO_SWITCH=false
# 지도 사용 시 NAVER에 프론트 도메인을 등록하고 공개 Client ID 설정
VITE_NAVER_MAP_CLIENT_ID=YOUR_PUBLIC_CLIENT_ID
```

Workers 런타임 변수:

```dotenv
BACKEND_ORIGIN=https://api.example.com
```

BACKEND_ORIGIN은 EC2 앞의 HTTPS origin이다. /api 경로를 붙이지 않는다. frontend/wrangler.jsonc의 worker/index.ts와 dist assets를 함께 배포해야 한다. dist만 정적 배포하면 /api 프록시가 생기지 않는다. CLI 배포를 선택하면 frontend에서 `npx wrangler deploy`를 사용하되, Workers runtime 변수도 설정한다. 이 작업에서는 배포하지 않았다.

## EC2 Spring Boot 런타임

```dotenv
SPRING_PROFILES_ACTIVE=prod
DB_URL=jdbc:postgresql://127.0.0.1:5432/fieldwork
DB_USER=fieldwork
DB_PASSWORD=YOUR_DATABASE_PASSWORD
PORT=8080
ALLOWED_ORIGINS=https://app.example.com
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=YOUR_PRIVATE_BUCKET
R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY
R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_KEY
```

DB_URL의 host는 실행 위치에 맞춘다. JAR가 EC2 호스트에서 실행되면 로컬 DB 포트, 앱과 DB가 Compose 컨테이너이면 DB 서비스 이름을 사용한다. prod는 Secure 세션 쿠키와 R2 저장소를 사용한다. `.env` 파일은 Spring이 자동으로 읽지 않으므로 systemd EnvironmentFile 또는 Docker 환경 주입을 설정한다. 실제 값은 Git에 넣지 않는다.

JDK21에서 `bash gradlew clean test bootJar --no-daemon`로 생성한 backend/build/libs/fieldwork-backend-0.1.0-SNAPSHOT.jar를 EC2에 전달하고 `java -jar ...`로 실행한다. 지속 실행/재시작은 systemd 또는 기존 Docker 배포 구성으로 관리한다. PostgreSQL17과 DB/사용자가 먼저 준비되어야 한다. Flyway는 앱 시작 시 실행되므로 운영 DB 백업·기존 적용 이력·V2~V7 적용 가능 여부를 먼저 검토한다. V1을 수정하거나 DB를 초기화하지 않는다.

## 최초 ADMIN 초기화

일회성 환경변수 BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PASSWORD를 주입하고 동일 JAR를 `--spring.main.web-application-type=none --app.bootstrap-admin=true`로 실행한다. 관리자 생성 후 이 변수는 제거하고 일반 서버를 실행한다. 계정이 이미 있으면 초기화 명령은 실패한다. 첫 로그인에서 비밀번호 변경을 요구한다.

## 네트워크와 키 구분

- EC2 SSH PEM 키: 서버 접속/배포 파일 전송용. 프론트 환경변수나 R2 변수에 넣지 않는다.
- R2 access/secret 키: 백엔드가 사진을 읽고 쓰는 용도. AWS IAM 키와 다르다.
- Cloudflare 배포 API 토큰: CI/CLI로 Workers를 배포할 때 사용. 앱의 VITE 변수에 넣지 않는다.
- AWS access key: 현재 애플리케이션 코드 실행에는 필요하지 않다. 별도 AWS 자동화 배포를 만들 때 사용하는 자격 증명과 구분한다.

EC2에서 HTTPS 인증서와 Nginx/Caddy/ALB 등 TLS 종단을 구성하고 api.example.com을 연결한다. 공개 접근은 HTTPS 443, 인증서 방식에 따라 80을 사용하고 SSH는 관리 주소로 제한한다. DB5432와 앱8080을 인터넷 전체에 공개할 필요는 없다. 앱을 켜는 것만으로 도메인/HTTPS/DB/프록시가 자동 구성되지 않는다.

마지막으로 실제 프론트 도메인에서 로그인/CSRF/쿠키, 원본 아닌 합성 Excel 업로드, 검침, 사진, 정산, XLSX 다운로드를 확인한다. R2 실계정·운영 프록시·EC2 부하/복원은 로컬 테스트와 별도 검증이다.
