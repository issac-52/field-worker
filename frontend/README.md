# 프론트엔드 개발·시연

업데이트: 2026-10-23. React/Vite/TypeScript + React Query + MSW. shadcn/ui 방식의 Button/Input/Badge/Card 소스와 Tailwind v4를 사용하며 기존 CSS와 함께 관리한다.

## 실행과 환경

frontend 디렉터리에서 실행한다.

```powershell
npm ci
npm run dev
# 관리자/작업자 전환이 있는 시연
npm run dev:demo
```

실제 환경파일은 Git 제외다. .env.example을 참고해 .env.local 또는 .env.demo를 만든다. Client ID/Secret 등 실제 값을 문서나 Git에 넣지 않는다. Client Secret은 브라우저에 전달하지 않는다.

| 실행 | 환경 설정 | 산출물 / 주소 | Mock·역할 전환 |
| --- | --- | --- | --- |
| npm run dev | .env.local | localhost:5173 | Mock 기본 활성(명시적 false로 해제), 작업자 |
| npm run dev:demo | .env.demo 또는 실행 환경변수 | localhost:5176 | Mock, 작업자/관리자 선택 |
| npm run build:demo | .env.demo 또는 실행 환경변수 | dist-demo | Mock, 역할 선택 |
| npm run build | 실행 환경변수만 | dist | Mock·역할 전환 없음 |

시연에는 VITE_APP_ENV=demo, VITE_USE_MOCKS=true, VITE_DEMO_SWITCH=true 세 값이 모두 필요하다. 일반 모드에 시연 설정이 섞이거나 일반 빌드에 Mock을 켜면 실패한다. production은 envDir=false로 로컬 .env 파일을 읽지 않는다. NODE_ENV로 우회하지 않는다.

역할/저장은 메모리 상태이며 새로고침 시 작업자와 초기 데이터로 돌아간다. 전환 시 진행 조회 취소·캐시 제거·홈 이동을 수행한다. X-Demo-Role은 Mock 전용이며 실제 권한 인증이 아니다. 미정의 동일 출처 /api/ 요청은 시연에서 오류로 처리한다.

## Cloudflare Pages 배포 설정

| 항목 | 시연 전용 프로젝트 | 운영 프로젝트 |
| --- | --- | --- |
| Root directory | frontend | frontend |
| Build command | npm run build:demo | npm run build |
| Output | dist-demo | dist |
| VITE_APP_ENV | demo | production |
| VITE_USE_MOCKS / VITE_DEMO_SWITCH | true / true | false / false |

시연과 운영은 별도 프로젝트/호스트를 사용한다. Variables에 필요한 설정을 주입하며 운영용 환경파일은 만들지 않는다. 로컬 정적 시연은 build:demo 후 npm run preview:demo로 localhost:4174에서 확인한다. 실제 배포·서버 인증 통합 검증은 별도다.

## 현재 동작

- 중/소블록·검색 조건 공유. 수용가/지도 상태 필터는 전체/미처리/시작검침완료/검침완료.
- 목록·조사자 관리·검침별 상세는 20건 페이지, 홈은 4건. 화살표 이동과 번호 입력을 제공한다.
- 수용가 행은 상태 아이콘·이름·관리번호·소블록·주소 한 줄이다. 작은 화면은 목록 내부 가로 스크롤이며 앞쪽 아이콘으로 상태를 알 수 있다.
- 지도 마커와 목록은 동일 페이지 응답이다. 미처리 회색/시작완료 파랑/완료 초록. 선택하면 지도 아래에 입력을 표시한다.
- 지도 내 기본정보는 접이식 헤더다. 기본정보 다음 사진·특이사항·검침을 배치한다. 상세도 같은 우선순위이며 검침은 모달에서 입력한다.
- START는 2026년, END는 2027년. 단계 선행/중복/날짜/지침/활성 작업자 검사, 작업자 본인 기록 정정과 관리자 전체 정정을 Mock으로 제공한다.
- 사진 슬롯은 OVERVIEW/START_CLOSEUP/END_CLOSEUP/TEMPORARY. JPG/PNG/WebP 10MiB 이하를 디코딩 후 긴 변 최대 1600px JPEG, 최대 1MiB로 변환한다. 원본 영구 저장은 아니다. 임시 사진도 같은 저장/삭제/교체 경로다.
- 관리자 계정 관리·신규 단가·과거 단가 일괄 변경·정산, 조사자별 현황의 활성/비활성 체크박스 필터를 제공한다.
- Excel 다운로드는 현재 블록의 전체 페이지를 수집해 실제 XLSX 35열로 생성한다. 사진은 등록 여부만 포함한다. HWP는 준비 상태다.
- 위치도 기능과 좌표 수정 API는 제거했다. 실제 인증·Excel 업로드·R2 사진 저장·HWP/ZIP은 미구현이다.

## Mock 데이터와 지도

브라우저 기본 시드는 수용가 180건, 조사자 27명, START/END 검침 174건이다. 비활성 조사자도 포함한다. Node 회귀 테스트의 기본 12건 시드와는 별개다.

VITE_MOCK_SITE_COUNT를 13~50,000 범위로 지정하면 브라우저 Mock 수용가 수를 조정할 수 있다. 예: PowerShell에서 `$env:VITE_MOCK_SITE_COUNT='12050'` 후 개발/시연 서버 실행. 수용가/지도는 전체 데이터를 한 번에 조회하지 않는다.

NAVER SDK는 VITE_NAVER_MAP_CLIENT_ID와 서비스 URL 등록이 필요하다. 설정을 바꾼 뒤 서버를 재시작한다. 로더는 중복 방지·15초 타임아웃·인증/네트워크 실패와 재시도를 처리한다. 설정이 없으면 대체 목록을 제공한다.

현재 위치는 브라우저 Geolocation으로 메모리에서만 사용한다. 첫 수신에 중심 이동, 이후 위치 마커 갱신, GPS 버튼으로 재이동한다. HTTPS/localhost 환경이 필요하다. 지도 이동으로 근처 데이터를 자동 조회하지 않는다. 전체 영역/클러스터링은 [설계 제안](../docs/MAP_QUERY_DESIGN.md)이다.

## 수정 위치와 검증

| 경로 | 책임 |
| --- | --- |
| src/pages / components | 화면 구성·공통 UI·업무 입력 |
| src/components/ui / lib/utils.ts | shadcn/ui 기반 컴포넌트와 cn |
| src/hooks / context | 경로·조회 조건·페이지·저장·공유 상태 |
| src/api / types.ts | API 클라이언트와 계약 타입 |
| src/mocks | 가상 데이터·권한·필터·집계·저장 |
| src/styles | 기존 업무 CSS와 shadcn.css/refresh.css 토큰·공통 스타일 |
| config/environment.ts / vite.config.ts | 운영/시연 환경 정책 |

```powershell
npm run format:check
npm run test:api
npm run test:map
npm run test:demo
npm run test:export
npm run build
npm run build:demo
```

검증 범위·미측정 항목은 [검증 기록](../docs/FRONTEND_REVIEW.md), API 상세는 [API 계약](API_CONTRACT.md), 다음 HWP 작업은 [HWP 설계](../docs/HWP_EXPORT_DESIGN.md)를 참고한다.
