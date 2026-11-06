# 프론트 실제 백엔드 연결

브랜치: codex/frontend-backend-integration. 일반 dev/build는 MSW를 기본 사용하지 않는다. demo는 기존 명시적 세 플래그로 별도 실행한다.

## 실행

1. BACKEND_RUNBOOK.md에 따라 PostgreSQL, 관리자 초기화, local Spring Boot(8080)를 실행한다.
2. 브라우저 주소는 백엔드 기본 CORS 허용 주소인 `http://localhost:5173`을 사용한다. `127.0.0.1`을 사용할 경우 백엔드 ALLOWED_ORIGINS에도 해당 origin을 추가해야 한다. frontend에서 `npm ci`, `npm run dev` 실행. Vite의 `/api` 프록시는 http://127.0.0.1:8080을 사용하며 `BACKEND_ORIGIN` 환경변수로 변경 가능하다.
3. 관리자 로그인 후 최초 비밀번호 변경, 새 비밀번호로 다시 로그인한다.

실계정 역할/ID, 세션 만료, CSRF, 로그아웃, 비밀번호 변경을 연결했다. 관리자 Excel Import 결과, 실제 XLSX 다운로드, 특이사항 선택, 사진 6장 multipart 추가/교체/삭제, 정산 확정/지급을 연결했다. 사진 여러 장 저장은 여러 요청이며 일부 성공 후 오류가 나면 서버 현황을 다시 읽는다.

## Cloudflare Workers

frontend/worker/index.ts와 wrangler.jsonc는 정적 assets와 `/api/*` 프록시 구성이다. Workers 설정에 `BACKEND_ORIGIN=https://백엔드호스트`를 주입한다. backend prod의 ALLOWED_ORIGINS에는 프론트 HTTPS origin을 지정한다. Cookie/CSRF/Set-Cookie를 전달하며 API 캐시를 금지한다. 자격 증명을 프론트 번들에 넣지 않는다. 이 작업에서는 배포하지 않았다.

## 검증

타입 검사, ESLint, Vitest 16개, 운영 빌드를 실행했다. 기존 데모 회귀와 신규 CSRF/multipart/409/프록시 테스트를 포함한다. 실제 R2·Cloudflare·AWS 운영 검증은 별도다. 구현은 미커밋 상태로 검토할 수 있다.

실제 Chromium + 로컬 Spring/PostgreSQL에서 로그인, 최초 비밀번호 변경, 재로그인, 새로고침 세션 복원, 관리자 Import 화면 진입을 확인했다. 파일 업로드·사진·정산 UI 전체의 브라우저 종단 검증과 운영 배포는 별도이며 완료로 주장하지 않는다.
