# 프론트엔드 구조와 개발

프로젝트 표시명은 **수도관리**다. React/Vite/TypeScript와 React Query, MSW를 유지하며 별도 UI 라이브러리는 도입하지 않았다.

## 실행

```sh
npm install
npm run dev
npm run dev:demo
npm run format:check
npm run test:api
npm run test:map
npm run test:demo
npm run build
npm run build:demo
```

로컬 작업자는 기본 개발 서버, 관리자/작업자 전환은 `npm run dev:demo`의 http://localhost:5176/ 에서 확인한다. `.env.admin`과 `dev:admin`은 제거했다. 운영 로그인/권한은 아직 백엔드 연동 전이다.

실제 환경파일은 Git에 올리지 않는다. 저장소에는 `.env.example`만 제공한다.

| 용도 | 설정 위치 |
| --- | --- |
| 로컬 개발 | `.env.local` (Git 제외) |
| 로컬 시연·시연 빌드 | `.env.demo` (Git 제외) |
| 운영 | Cloudflare Pages Variables (파일 없음) |

처음 체크아웃하면 `.env.example`을 `.env.local`로 복사한다. 시연에는 같은 예제를 `.env.demo`로 복사하고 `VITE_APP_ENV=demo`, `VITE_USE_MOCKS=true`, `VITE_DEMO_SWITCH=true`로 설정한다. 실제 값·Client ID는 Git에 추가하지 않는다.

## 배포용 시연 환경과 운영 환경 분리

| 실행 | 산출물 | Mock | 역할 화면 전환 |
| --- | --- | --- | --- |
| npm run dev | 개발 서버 | 기본 활성 | 작업자 |
| npm run dev:demo | localhost:5176 | 활성 | 작업자 ↔ 관리자 |
| npm run build:demo | dist-demo | 활성 | 작업자 ↔ 관리자 |
| npm run build | dist | 비활성 | 없음 |

배포용 시연은 `vite build --mode demo`와 `.env.demo`를 사용한다. `VITE_APP_ENV=demo`, `VITE_USE_MOCKS=true`, `VITE_DEMO_SWITCH=true`가 모두 필요하다. 일반 모드에 demo 설정이 섞이거나 일반 빌드에 Mock/시연 관리자 설정이 있으면 빌드를 실패시킨다. 일반 산출물에서는 MSW 부트스트랩과 전환 UI가 제거되고 `X-Demo-Role` 헤더도 전송하지 않는다.

시연 화면의 노란 안내문에는 **실제 권한 인증 아님**을 표시한다. 역할은 탭의 메모리에만 저장하며 URL·localStorage·쿠키로 관리자 역할을 활성화하지 않는다. 전환 시 진행 중 조회를 취소하고 React Query 캐시를 비운 뒤 홈으로 이동한다. 새로고침하면 작업자와 초기 Mock 데이터로 돌아간다. 데이터는 기존 가상 시드만 사용한다. MSW에 없는 동일 출처 `/api/` 요청은 오류로 차단하며 실제 API로 넘기지 않는다.

정적 시연 확인:

```sh
npm run build:demo
npm run preview:demo
# http://localhost:4174/ → 상단 '시연 화면' 선택
```

### Cloudflare Pages 설정

운영과 **다른 Pages 프로젝트·호스트명**으로 시연 사이트를 배포한다. 운영 프로젝트의 산출물을 시연 파일로 덮어쓰지 않는다. 아래 경로는 Pages Root directory가 frontend일 때 기준이다.

| 설정 | 시연 전용 프로젝트 | 운영 프로젝트 |
| --- | --- | --- |
| Root directory | frontend | frontend |
| Build command | npm run build:demo | npm run build |
| Build output directory | dist-demo | dist |
| 역할 선택기 / 가상 데이터 | 제공 | 제공하지 않음 |

Cloudflare에서는 파일 대신 프로젝트별 Variables에 직접 설정한다. 시연 프로젝트는 `VITE_APP_ENV=demo`, `VITE_USE_MOCKS=true`, `VITE_DEMO_SWITCH=true`, 운영 프로젝트는 각각 `production`, `false`, `false`다. `VITE_DEMO_ROLE`은 더 이상 사용하지 않으므로 제거한다. 지도 Client ID도 해당 프로젝트 Variables에 설정한다. `NODE_ENV=development`로 우회하지 않는다.

production 모드는 Vite `envDir=false`로 `.env.local`을 포함한 모든 환경파일 자동 로딩을 끄고 실행 환경변수만 읽는다. 운영 Variables가 없더라도 Mock과 역할 전환은 기본 비활성이다. 로컬 `.env.local`의 Mock/지도 설정이 운영 빌드에 섞이지 않는다. `.env.production` 파일은 만들지 않는다. 시연 프로젝트의 Variables가 있으면 로컬 `.env.demo` 없이도 build:demo가 가능하다.

공식 참고: [Vite 모드와 환경변수](https://vite.dev/guide/env-and-mode), [Pages 빌드 설정](https://developers.cloudflare.com/pages/configuration/build-configuration/).

Mock 전환은 누구나 사용하는 화면 시연 기능이며 비밀번호/권한 인증이 아니다. 운영 백엔드는 `X-Demo-Role`을 신뢰하지 않고 서버 세션으로 권한을 검사해야 한다. 현재 실제 로그인·세션 연동은 미구현이며 운영 화면은 인증 연동 대기로 표시한다. 이번 작업에서는 Cloudflare 프로젝트 생성이나 원격 배포를 실행하지 않았다.

## 수정 위치

| 위치 | 책임 |
| --- | --- |
| src/App.tsx | Provider와 앱 조립만 담당 |
| src/pages/ | 화면별 구성 |
| src/components/layout/ | 메뉴, 앱 틀, 라우트별 화면 선택 및 접근 제한 |
| src/components/inspection/, fees/, investigators/, map/ | 업무별 입력창과 지도 |
| src/components/ | 블록 필터, 목록, 페이지 이동, 모달 등 공통 UI |
| src/hooks/ | hash 경로, 공유 조회 조건, 페이지 상태, React Query, 저장 흐름 |
| src/context/ | 조회 상태와 알림 공유 |
| src/api/ | 공통 HTTP 처리와 업무별 API 호출 |
| src/types.ts | API 응답 및 업무 타입 |
| src/styles/ | base/layout/shared 및 화면별 CSS; index.css에서 순서 관리 |
| src/mocks/handlers/ | 권한, 수용가, 단가, 정산, 조사자별 MSW 핸들러 |
| src/mocks/store.ts, queries.ts | Mock 상태와 필터/집계/페이지 처리 |

화면의 일시적 입력 상태는 해당 페이지/입력창에 둔다. 블록 조건은 context에서 공유한다. 서버 데이터는 React Query를 통해 조회하고 저장 성공 시 무효화한다. App에 화면 JSX나 입력 폼을 다시 모으지 않는다. 스타일은 해당 업무 CSS에 추가하고 전역 요소 선택자는 base.css로 제한한다. Prettier로 TS/TSX/CSS 형식을 통일한다.

## 대량 데이터 시연

PowerShell에서 `$env:VITE_MOCK_SITE_COUNT='12050'` 후 개발 서버를 실행하면 테스트용 수용가가 확장된다. 기본 데이터는 12건이며 운영 데이터가 아니다. 목록과 지도는 페이지당 20건, 홈은 4건만 조회한다. 통계는 페이지와 별도 API로 조회한다. 지도 마커도 현재 페이지 범위다. 전체 지도 클러스터링은 구현하지 않았다.

## NAVER 지도 설정

`frontend/.env.local`에 `VITE_NAVER_MAP_CLIENT_ID=<발급받은 Client ID>`를 설정하고 Vite 서버를 재시작한다. 실제 파일을 커밋하지 않는다. Client Secret은 브라우저 환경변수에 넣지 않는다. NAVER Cloud의 Maps 애플리케이션에서 Web Dynamic Map 사용과 시연할 Web 서비스 URL 등록이 필요하다. 로컬 작업자/관리자 URL 및 실제 배포 주소를 공식 콘솔 정책에 맞게 등록한다.

공식 SDK 문서: https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html

로더는 `ncpKeyId`, callback, 중복 요청 방지, 15초 타임아웃과 인증/네트워크 실패·재시도를 처리한다. 키가 없으면 SDK를 요청하지 않고 설정 안내 및 기존 목록을 제공한다. 키를 임의로 생성하지 않는다. 2026-10-23 로컬 설정으로 실제 타일·마커, 블록 변경, 마커 카드·상세 이동을 확인했다. 배포 URL/모바일 LAN 주소의 인증은 별도 확인해야 한다. `test:map` 자체는 네트워크 없는 로더 테스트다.

## 모바일 시연

지도는 기본 START(2026년) 미처리 조건으로 열린다. 처리 기준을 START/END로 선택하고 미처리/처리됨/전체로 조회한다. 선택한 단계의 검침 존재 여부를 기준으로 주황색/초록색 작은 점을 표시한다. 목록의 전체 상태는 미처리/시작검침완료/완료로 구분하며 내부 IN_PROGRESS 값은 유지한다.

지도 SDK가 준비되면 브라우저 위치 권한을 요청한다. 첫 위치 수신 시 본인 위치로 중심을 이동하고 파란 점과 맥동 효과를 표시한다. 이후 위치 갱신은 마커만 움직이며 지도 안의 작은 GPS 아이콘으로 다시 중심을 맞출 수 있다. SDK 공식 예제처럼 브라우저 Geolocation을 사용한 사용자 정의 표시다. 권한 거부·시간 초과·미지원은 접이식 안내로 표시한다. 위치 기능은 HTTPS 또는 localhost에서 확인한다. 위치는 화면 메모리에서만 사용하며 업무 API나 저장소에 보관하지 않는다.

내 위치로 중심을 옮겨도 근처 수용가를 자동 검색하지 않는다. 기존 블록·검색·단계 조건의 현재 페이지 최대 20건을 유지한다. 실제 기기의 위치 정확도와 권한 허용 후 내 위치 표시는 별도 확인이 필요하다. 수백 건 동시 지도 조회와 클러스터링은 아직 구현하지 않았다.

마커나 지도 아래 목록을 누르면 페이지를 이동하지 않고 지도 바로 아래에 해당 수용가의 기본정보와 검침·사진·특이사항 입력을 표시한다. 검침 저장 후 미처리 마커에서 빠져도 선택 폼은 유지한다. 각 영역은 별도로 저장하며 검침의 기존 단계/중복/권한 검증을 재사용한다. 사진 칸 클릭은 관리 모달 없이 시스템 이미지 선택기를 연다. 카메라/갤러리 메뉴 구성은 휴대폰 OS와 브라우저에 따른다. 상세 페이지의 사진 칸도 같은 방식을 사용한다.

START는 2026년, END는 2027년으로 구분한다. START 등록 전 END와 동일 단계 중복 등록을 막는다. 작업자는 본인 명의만 등록하고 금액은 표시하지 않는다. 수용가 기본정보는 읽기 전용이다.

사진·위치도 관리에서 위치도(선택), 원경, START 근경, END 근경을 구분한다. 현장사진은 촬영/갤러리, 위치도는 이미지 선택을 제공한다. JPG/PNG/WebP 10MB 이하를 최대 1600px로 축소해 미리보기하고 MSW에만 저장한다. HEIC는 JPG 변환이 필요하다. 실제 R2 업로드나 사진 원본 영구 저장은 구현하지 않았다.

신규 검침용 단가 변경은 기존 검침 금액에 영향을 주지 않는다. 기존 건 소급 변경은 별도 기간별 변경 화면에서 블록/기간/건수/변경 전후 금액과 사유를 확인한다.

HWP·ZIP 생성, 엑셀 업로드, 실제 로그인과 비밀번호 저장/변경, 사진 영구 저장은 후속 작업이다. HWP 버튼은 비활성이다. MSW 계정 관리의 임시 비밀번호는 형식만 검증하고 저장하지 않는다. 화면 상단에 가상 데이터와 새로고침 시 초기화 안내를 표시한다. 실제 휴대폰 카메라·키보드와 외부 지도 인증은 별도 확인이 필요하다.
