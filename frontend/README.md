# 프론트엔드 구조와 개발

프로젝트 표시명은 **수도관리**다. React/Vite/TypeScript와 React Query, MSW를 유지하며 별도 UI 라이브러리는 도입하지 않았다.

## 실행

```sh
npm install
npm run dev
npm run dev:admin
npm run format:check
npm run test:api
npm run build
```

작업자는 기본 개발 서버, 관리자 시연은 http://localhost:5175/#admin 에서 확인한다. `.env.admin`은 비밀값 없는 개발 전용 역할 설정이다. 기존 5175 서버가 있으면 재사용하거나 종료 후 실행한다. 운영 로그인/권한은 아직 백엔드 연동 전이다.

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

실제 NAVER SDK 로드/인증, HWP·ZIP 생성, 엑셀 업로드, 실제 로그인과 비밀번호 저장/변경, 사진 영구 저장은 후속 작업이다. MSW 계정 관리의 임시 비밀번호는 형식만 검증하고 저장하지 않는다.
