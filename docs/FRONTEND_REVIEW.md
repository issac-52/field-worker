# 프론트엔드 점검 결과 (2026-10-23)

## 구현
- 수도관리 명칭, 모바일 하단 메뉴, 관리자 전용 진입과 작업자 금액 비공개.
- 중블록/소블록 API 연동 필터와 초기화, 페이지 목록/진행 집계/관리자/정산/출력 조건 공유.
- 기본 단가와 기존 검침 단가 일괄 변경 분리, 서버 방식 Mock 미리보기와 결과/이력.
- 조사자 계정 생성, 이름 수정, 활성/비활성, 임시 비밀번호 초기화 Mock 계약.
- 수용가 20건 페이지 조회, 별도 전체 집계, 지도 현재 페이지 표시와 SDK 미연결 대체 목록.
- HWP 파일명 열거 제거, 대상 건수만 표시, 미구현 생성 버튼 비활성.
- App 조립/페이지/업무 입력창/공통 UI/hooks/API/MSW/CSS 분리 및 Prettier 적용.

## 실제 검증
- npm run format:check 통과.
- npm run test:api 통과: 권한 및 금액 제외, 블록, 소급 단가 미리보기/적용, 조사자 계정 처리와 기존 이력 보존.
- 12,050건/603페이지와 소블록 4,018건 API 시험 통과. 브라우저 페이지 전환 확인.
- npm run build 통과 (TypeScript + Vite).
- 360/390/430/1280px × 9개 화면 iframe 렌더링 및 가로 넘침 검사 통과. 관리자 메뉴·조사자 연결 및 작업자 경로 접근 차단 확인.
- 소스 파일 이동 중 기존 탭의 오래된 HMR import 오류가 있었으나 새로고침 후 정상 렌더링 확인.

## 한계
- 현재 모든 저장은 MSW 메모리이며 새로고침하면 초기화된다. 실제 비밀번호 저장/로그인/세션 권한은 미구현.
- 실제 NAVER 지도 SDK 로더/키 인증/실지도 검증, 엑셀 업로드, HWP/ZIP 생성, 사진 영구 저장 미구현.
- 모바일 실제 장치 촬영/키보드와 운영 서버 부하 시험은 수행하지 않았다.
- 지도는 현재 페이지 마커만 표시한다. 전체 범위 클러스터링은 별도 작업이다.

## 변경 파일
주요 변경 위치는 frontend/README.md의 구조표를 참조한다. 이번 변경의 파일 목록은 아래와 같다 (생성된 빌드 및 테스트 산출물 제외).
-  M docs/DECISIONS_AND_PORTFOLIO.md
-  M frontend/index.html
-  M frontend/package.json
-  M frontend/src/App.tsx
-  D frontend/src/api.ts
-  D frontend/src/demo.css
-  M frontend/src/main.tsx
-  M frontend/src/mocks/browser.ts
-  M frontend/src/mocks/data.ts
-  D frontend/src/mocks/handlers.ts
-  M frontend/src/pages/AdminPage.tsx
-  D frontend/src/pages/LoginPage.tsx
-  M frontend/src/pages/MapPage.tsx
-  D frontend/src/pages/WorkDetailPage.tsx
-  D frontend/src/shared/api.ts
-  D frontend/src/styles.css
-  M frontend/src/types.ts
-  M frontend/tsconfig.json
-  M frontend/vite.config.ts
- ?? docs/FRONTEND_REVIEW.md
- ?? frontend/.env.admin
- ?? frontend/.gitignore
- ?? frontend/.prettierignore
- ?? frontend/.prettierrc.json
- ?? frontend/API_CONTRACT.md
- ?? frontend/README.md
- ?? frontend/check-api.ts
- ?? frontend/check-scale.ts
- ?? frontend/package-lock.json
- ?? frontend/public/mockServiceWorker.js
- ?? frontend/src/api/client.ts
- ?? frontend/src/api/fees.ts
- ?? frontend/src/api/index.ts
- ?? frontend/src/api/investigators.ts
- ?? frontend/src/api/sites.ts
- ?? frontend/src/components/BlockFilters.tsx
- ?? frontend/src/components/Modal.tsx
- ?? frontend/src/components/Pagination.tsx
- ?? frontend/src/components/SiteList.tsx
- ?? frontend/src/components/SiteSearch.tsx
- ?? frontend/src/components/StatusBadge.tsx
- ?? frontend/src/components/fees/FeeEditor.tsx
- ?? frontend/src/components/inspection/InspectionPanel.tsx
- ?? frontend/src/components/inspection/MeasurementEditor.tsx
- ?? frontend/src/components/inspection/NoteEditor.tsx
- ?? frontend/src/components/inspection/PhotoEditor.tsx
- ?? frontend/src/components/investigators/InvestigatorEditor.tsx
- ?? frontend/src/components/layout/AppShell.tsx
- ?? frontend/src/components/layout/PageContent.tsx
- ?? frontend/src/components/map/FieldMap.tsx
- ?? frontend/src/context/NotificationContext.tsx
- ?? frontend/src/context/WorkContext.tsx
- ?? frontend/src/hooks/useHashRoute.ts
- ?? frontend/src/hooks/usePagePosition.ts
- ?? frontend/src/hooks/useSaveAction.ts
- ?? frontend/src/hooks/useWorkController.ts
- ?? frontend/src/hooks/useWorkData.ts
- ?? frontend/src/lib/auth.ts
- ?? frontend/src/lib/format.ts
- ?? frontend/src/mocks/handlers/auth.ts
- ?? frontend/src/mocks/handlers/fees.ts
- ?? frontend/src/mocks/handlers/index.ts
- ?? frontend/src/mocks/handlers/investigators.ts
- ?? frontend/src/mocks/handlers/settlements.ts
- ?? frontend/src/mocks/handlers/sites.ts
- ?? frontend/src/mocks/http.ts
- ?? frontend/src/mocks/queries.ts
- ?? frontend/src/mocks/store.ts
- ?? frontend/src/pages/FeesPage.tsx
- ?? frontend/src/pages/HomePage.tsx
- ?? frontend/src/pages/InvestigatorPage.tsx
- ?? frontend/src/pages/ReportsPage.tsx
- ?? frontend/src/pages/SettlementsPage.tsx
- ?? frontend/src/pages/SiteDetailPage.tsx
- ?? frontend/src/pages/SitesPage.tsx
- ?? frontend/src/styles/admin.css
- ?? frontend/src/styles/base.css
- ?? frontend/src/styles/detail.css
- ?? frontend/src/styles/home.css
- ?? frontend/src/styles/index.css
- ?? frontend/src/styles/layout.css
- ?? frontend/src/styles/map.css
- ?? frontend/src/styles/shared.css
- ?? frontend/src/styles/sites.css

## 2026-10-23 — 모바일 현장 검침 시연 보완 결과

기존 기록은 당시 상태로 보존한다. 아래가 이번 작업의 최종 상태다.

### 구현 완료
- NAVER v3 공유 SDK 로더: ncpKeyId, callback, 준비 대기, 중복 방지, 15초 타임아웃, 인증/네트워크 오류와 재시도. 키 미설정 시 SDK 요청 없음.
- 현재 페이지 범위 표시, 좌표 오류 건수 안내, 마커 카드의 상태/상세 이동, 같은 조회 데이터 사용, 지도/마커/리스너/ResizeObserver 정리.
- START 2026 / END 2027 구분, 날짜/숫자/본인명의/선행단계/중복 검증, 저장 중 잠금, input/change 날짜 반영, visualViewport 모달과 저장 버튼 보완.
- 위치도(선택), 원경, START 근경, END 근경의 명시적 이미지 타입. 영역별 촬영/선택/교체/삭제, 디코딩·형식·용량 검증, 축소본·Blob URL 정리, MSW 시연 저장 안내.
- 신규 검침용 기본 단가 변경 PATCH/UI와 기존 건 소급 변경의 대상 블록 표시. 기존 관리자 화면/정산/조사자 Mock 계약 유지.
- 모바일 가상 데이터 안내, 보조 문구 대비 보완. Windows Git/Prettier 줄바꿈 충돌을 frontend 전용 LF 속성으로 정리.

### 자동 검증 (frontend에서 실행)
| 명령 | 결과 |
| --- | --- |
| npm run format:check | 통과 |
| npm run test:api | 통과: 기존 계정·블록·권한·단가·정산 및 12,050건/603페이지 회귀 + 검침/사진/신규 단가 보존 검증 |
| npm run test:map | 통과: 네트워크 없는 fake DOM 로더 회귀, 콜백 선행 준비 대기 포함 |
| npm run build | 통과: TypeScript + Vite |
| git diff --check | 통과 |

### 브라우저에서 확인
- 작업자 홈/지도, 중블록 변경에 따른 소블록 옵션, 지도·목록 같은 조건, 화면 이동 후 블록 유지.
- START 전 END 차단, 자기 명의 START/END 저장과 상태 즉시 반영, 중복 입력 버튼 제거, 금액 비노출. 날짜 입력 후 다른 필드를 바꿔도 선택일이 저장됨을 재검증.
- 테스트용 PNG 선택 → Blob 미리보기 → MSW 저장 → 다시 열기 → 삭제 → 빈 이미지 저장 확인. 선택 도구가 오래 걸린 경우가 있었으며 최종 미리보기는 정상 확인했다. 실제 모바일 촬영 시험은 아니다.
- 관리자 진량1 START 3건 9,000원 → 9,600원 적용, 정산의 블록/작업자/단계/기간 조건과 3건·9,600원 합계 일치. 기본 단가 변경 UI와 HWP/ZIP 버튼 비활성 확인.
- 조사자 생성/이름/활성·비활성/임시 비밀번호 초기화는 API 회귀 검증으로 확인했으며 이번 브라우저에서 모든 계정 조작을 반복하지 않았다.
- 작업자의 관리자 정산 hash 직접 접근 차단과 관리자 메뉴 비노출 확인.
- 360/390/430/1280px viewport × 홈/목록/지도/관리자/작업비/정산/출력/조사자/상세 9개 화면, 총 36개 조합에서 제목 렌더링 및 문서 가로 넘침 없음. 내부 표 스크롤은 유지한다.
- 로컬 Client ID 설정 전 SDK script 0개와 대체 목록 동작을 확인했다. 설정 후 실제 NAVER 지도 타일·12개 마커 표시, 진량1 4개 마커/목록 일치, 서로 다른 마커의 카드 변경과 해당 상세 이동을 확인했다. 진량2로 변경 시 2개 마커로 교체되고 선택 카드는 사라졌다.
- 첫 로딩 준비 오류 후 재시도 정상 동작을 확인하고 SDK 준비 대기를 보완했다. 새로고침 후 실지도가 표시됐다. 수정 중 발생한 과거 HMR context 오류가 로그에 남아 있었으며 최종 새로고침 후 화면을 다시 확인했다.

### 설정·미구현·추가 확인
- 로컬 .env.local의 Client ID는 출력·수정·커밋하지 않았다. git check-ignore로 제외됨을 확인했다. 운영 배포 URL과 휴대폰 LAN 접속 URL의 NAVER 허용 도메인 설정은 사용자가 콘솔에서 확인해야 한다. Client Secret은 브라우저 설정에 넣지 않는다.
- 실제 휴대폰 카메라/갤러리 권한·키보드·고해상도 이미지, 지도 외부 인증 실패의 실제 계정별 원인과 호출 한도는 별도 확인이 필요하다. 실패 분기 자동 테스트는 fake DOM이다.
- R2/실제 업로드, HWP/ZIP, 엑셀 업로드, 실제 로그인·세션·비밀번호 저장/변경, 영구 저장 및 운영 부하 검증은 미구현이다. bounds/클러스터링은 MAP_QUERY_DESIGN.md의 설계 제안이다.
- 백엔드 Java/Flyway/DB/Docker 변경 없음. develop의 기존 미추적 파일 보존. 커밋·푸시 없음.

### 이번 변경 파일 (생성 산출물·기존 미추적 파일 제외)
- `.gitattributes`
- `docs/DECISIONS_AND_PORTFOLIO.md`
- `docs/FRONTEND_REVIEW.md`
- `docs/MAP_QUERY_DESIGN.md`
- `frontend/.env.example`
- `frontend/API_CONTRACT.md`
- `frontend/check-api.ts`
- `frontend/check-map.ts`
- `frontend/package.json`
- `frontend/README.md`
- `frontend/src/api/fees.ts`
- `frontend/src/api/sites.ts`
- `frontend/src/components/fees/FeeEditor.tsx`
- `frontend/src/components/inspection/InspectionPanel.tsx`
- `frontend/src/components/inspection/MeasurementEditor.tsx`
- `frontend/src/components/inspection/PhotoEditor.tsx`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/map/FieldMap.tsx`
- `frontend/src/components/Modal.tsx`
- `frontend/src/hooks/useSaveAction.ts`
- `frontend/src/lib/naverMaps.ts`
- `frontend/src/lib/photos.ts`
- `frontend/src/mocks/handlers/fees.ts`
- `frontend/src/mocks/handlers/sites.ts`
- `frontend/src/pages/FeesPage.tsx`
- `frontend/src/pages/MapPage.tsx`
- `frontend/src/pages/SettlementsPage.tsx`
- `frontend/src/pages/SiteDetailPage.tsx`
- `frontend/src/styles/detail.css`
- `frontend/src/styles/map.css`
- `frontend/src/styles/shared.css`
- `frontend/src/types.ts`

## 2026-10-23 — 배포용 시연 역할 전환 QA

### 구현
- 전용 demo mode/.env.demo/dist-demo와 일반 production mode/.env.production/dist 분리.
- 실제 권한 인증 아님을 표시하는 안내·역할 선택기. ADMIN/WORKER 메모리 상태, 전환 시 조회 취소/캐시 제거/홈 이동, 새로고침 WORKER 초기화.
- 운영 빌드의 전환 UI/MSW 실행/Mock 헤더 제거. 시연 플래그가 운영 빌드에 섞이면 실패. 운영 프로필은 실제 인증 연동 대기로 표시.
- 미정의 Mock /api/ 요청 실제 서버 통과 차단. 기존 가상 데이터만 사용.

### 검증 결과
- format:check, test:demo, test:api, test:map, build, build:demo 모두 통과.
- 운영 JS의 전환 안내문 및 X-Demo-Role 없음, MSW browser 청크 없음 확인.
- VITE_DEMO_SWITCH=true인 production 빌드의 의도된 설정 오류 확인.
- 정적 시연 빌드에서 관리자 선택과 작업비 표시, 작업자 전환 후 금액/관리자 메뉴 제거·홈 이동, 관리자 직접 URL 접근 차단, 새로고침 WORKER 복귀 확인.
- 390px에서 안내/선택기 렌더링과 문서 가로 넘침 없음. 일반 정적 빌드에는 전환기·시연 안내가 없고 인증 연동 대기 표시 확인.
- 일반 preview는 실제 API 부재로 데이터 조회가 실패한다. 운영 서버 인증을 구현하거나 검증한 결과가 아니다. Cloudflare 원격 배포는 미실행이다.

### 배포 및 제한
- README의 Cloudflare 설정표에 따라 운영과 다른 Pages 프로젝트/호스트를 사용한다. 시연: frontend / npm run build:demo / dist-demo. 운영: frontend / npm run build / dist.
- Mock 역할은 누구나 바꾸는 시연 UI이며 인증 기능이 아니다. 운영 API는 헤더가 아니라 서버 세션으로 권한을 결정해야 한다.
- 실제 사용자 데이터/백엔드/DB/Docker 변경 없음. 기존 변경 보존. 커밋·푸시 없음.

### 이번 추가/수정 위치
- frontend/config/environment.ts, vite.config.ts, src/env.d.ts
- frontend/.env.demo, .env.production, .env.example, .gitignore
- frontend/src/lib/auth.ts, hooks/useWorkController.ts, api/client.ts, main.tsx
- frontend/src/components/layout/AppShell.tsx, styles/layout.css
- frontend/check-demo.ts, package.json, README.md, API_CONTRACT.md
- docs/DECISIONS_AND_PORTFOLIO.md, docs/FRONTEND_REVIEW.md

## 2026-10-23 — 환경파일 정리 후 검증
- .env.admin 삭제 및 dev:admin/고정 관리자 분기 제거. .env.production 삭제. .env.local/.env.demo는 로컬 전용으로 보존하고 모든 실제 .env.*를 Git 제외한다. 예제만 추적 대상으로 남긴다.
- 운영은 Pages Variables만 읽도록 Vite envDir=false 적용. 일반 build와 production preview의 기본 Mock/역할 전환은 비활성이다.
- npm run format:check, npm run test:demo, npm run build, npm run build:demo 통과. 로컬 지도 식별자가 production JS로 상속되지 않음 확인.
- git check-ignore로 실제 파일 제외와 .env.example 예외 확인. 기존 .env.admin은 작업 트리 삭제(D) 상태이며 커밋은 하지 않았다. .env.local 값은 수정하지 않았다.
- README/API 계약과 실행 스크립트를 최신 구성으로 수정했다. 앞선 검증 기록의 환경파일 구성 설명은 이번 기록으로 대체한다.
