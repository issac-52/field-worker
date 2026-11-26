# 프론트엔드

React, Vite, TypeScript, TanStack Query, shadcn/ui, Tailwind v4로 만든 모바일 우선 웹 앱입니다. 홈 화면에 설치할 수 있는 PWA이며, Cloudflare Workers가 정적 자산을 제공하고 `/api/*` 요청을 백엔드로 프록시합니다.

## 실행

```bash
npm ci
npm run dev        # 실제 백엔드 연결 (http://localhost:5173)
npm run dev:demo   # MSW 시연 모드, 관리자/작업자 전환 (http://localhost:5176)
```

| 명령 | 환경 설정 | 결과 | 데이터 |
| --- | --- | --- | --- |
| `npm run dev` | `.env.local` | localhost:5173 | 실제 백엔드. Vite가 `/api`를 `http://127.0.0.1:8080`(또는 `BACKEND_ORIGIN`)으로 프록시 |
| `npm run dev:demo` | `.env.demo` 또는 실행 환경변수 | localhost:5176 | MSW, 역할 전환 |
| `npm run build:demo` | `.env.demo` 또는 실행 환경변수 | `dist-demo` | MSW, 역할 전환 |
| `npm run build` | 실행 환경변수만 | `dist` | 실제 백엔드, Mock·역할 전환 없음 |

- 실제 환경파일은 Git에서 제외합니다. `.env.example`을 참고해 `.env.local`, `.env.demo`를 만듭니다.
- 시연 모드에는 `VITE_APP_ENV=demo`, `VITE_USE_MOCKS=true`, `VITE_DEMO_SWITCH=true` 세 값이 모두 필요합니다. 일반 빌드에 Mock 설정이 섞이면 빌드가 실패합니다.
- 운영 빌드는 로컬 `.env` 파일을 읽지 않고 실행 환경변수만 사용합니다.

### 로컬 백엔드와 함께 실행

1. [백엔드 실행 안내](../docs/BACKEND_RUNBOOK.md)대로 PostgreSQL, 최초 관리자, Spring Boot(8080)를 실행합니다.
2. 브라우저는 `http://localhost:5173`으로 엽니다. `127.0.0.1`을 쓰면 백엔드 `ALLOWED_ORIGINS`에도 추가해야 합니다.
3. 관리자로 로그인해 최초 비밀번호를 변경한 뒤 다시 로그인합니다.

## 배포 (Cloudflare Workers)

`worker/index.ts`와 `wrangler.jsonc`가 정적 자산과 `/api/*` 프록시를 구성합니다.

- Workers 환경에 `BACKEND_ORIGIN=https://백엔드호스트`를 설정합니다. 경로 `/api`는 붙이지 않습니다.
- 백엔드 `prod`의 `ALLOWED_ORIGINS`에는 프론트 HTTPS origin을 지정합니다.
- 프록시는 Cookie, CSRF 헤더, Set-Cookie를 전달하고 API 응답을 캐시하지 않습니다. 자격 증명은 프론트 번들에 넣지 않습니다.

빌드 변수와 운영 값은 [운영 설정](../docs/PRODUCTION_CONFIGURATION.md)을 따릅니다.

## 지도와 위치

- NAVER SDK는 `VITE_NAVER_MAP_CLIENT_ID`와 서비스 URL 등록이 필요합니다. 설정을 바꾼 뒤 개발 서버를 다시 시작합니다.
- SDK 로더는 중복 요청 방지, 15초 제한, 실패 후 재시도를 처리합니다.
- 현재 위치는 브라우저 Geolocation으로 메모리에서만 사용하며 HTTPS 또는 localhost가 필요합니다.

## 시연 데이터 (MSW)

브라우저 시연 기본 시드는 수용가 180건, 조사자 27명, 검침 174건입니다. `VITE_MOCK_SITE_COUNT`(13~50,000)로 수용가 수를 조정할 수 있습니다. 테스트용 기본 시드(12건)와는 별개입니다.

## 코드 위치

| 경로 | 책임 |
| --- | --- |
| `src/pages`, `src/components` | 화면 구성, 공통 UI, 업무 입력 |
| `src/components/ui`, `src/lib/utils.ts` | shadcn/ui 기반 컴포넌트 |
| `src/hooks`, `src/context` | 조회 조건, 페이지, 저장, 세션 등 공유 상태 |
| `src/api`, `src/types.ts` | API 클라이언트와 계약 타입 |
| `src/offline` | 기기 임시 저장(IndexedDB)과 재전송 |
| `src/mocks` | 시연·테스트용 가상 데이터와 핸들러 |
| `worker/` | Cloudflare Worker(`/api` 프록시) |
| `config/environment.ts`, `vite.config.ts` | 운영/시연 환경 정책 |

API 요청·응답 규칙은 [API 계약](API_CONTRACT.md)에 있습니다.

## 검사와 테스트

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test           # Vitest 한 번 실행 (test:watch, test:coverage도 제공)
npm run build
npm run build:demo
```

- 테스트는 MSW 저장소와 핸들러, 환경 플래그, 지도 타이머를 테스트마다 격리하며 외부 지도 SDK나 운영 서비스에 접속하지 않습니다.
- `npm run typecheck`는 앱과 테스트 설정을 각각 검사합니다.
- CI는 Node 22에서 설치 → 형식 → lint → 타입 → 테스트 → 운영 빌드를 실행합니다.
