# 프론트엔드 Mock API 계약

응답은 `ApiResult<T>`이며 타입은 `src/types.ts`, 호출은 `src/api/`, 구현은 `src/mocks/handlers/`에 둔다. MSW 메모리 상태는 페이지 새로고침 시 초기화된다.

## 조회 및 페이지 처리

- `GET /api/blocks`: `Block[]`; 중블록 parentId 없음, 소블록 parentId는 중블록 ID. UI에서 실제 블록명을 하드코딩하지 않는다. 현재 시드 분류는 임시이며 실제 블록 체계와 대조해야 한다.
- `GET /api/sites`: `PageResponse<SiteListItem>`. 중/소블록 ID, q, status, page, pageSize 조건. 기본 20건, 최대 100건. 관리번호/ID로 안정 정렬. 이미지와 특이사항은 제외하고 photoCount만 반환한다.
- `GET /api/site-summary`: 동일 수용가 필터의 전체 `SiteSummary`. 페이지 조건에 영향받지 않는다. workers 집계는 관리자에게만 제공한다.
- `GET /api/sites/:id`: `Site`. 검침 등록, 특이사항 및 사진 저장은 각각 `/measurements`, `/note`, `/photos`를 사용한다. 기본정보 수정 API는 제공하지 않는다.
- `GET /api/settlements`: `SettlementPage`. 중/소블록, 작업자, 단계, 검침일 양끝 포함 기간, 페이지 조건. summary는 현재 페이지가 아닌 전체 조회 범위 금액과 작업자 집계다.

`PageResponse`는 items/page/pageSize/total/totalPages다. 빈 결과의 페이지는 1이며 초과 페이지는 마지막 페이지로 조정한다. 지도도 현재 페이지 수용가의 유효 좌표만 표시한다.

## 작업비

- `GET/POST /api/fee-rules`: 향후 검침 등록에 적용하는 기간별 단계 단가. 기존 검침에는 소급하지 않는다.
- `POST /api/admin/fee-adjustments/preview`: `FeeAdjustmentRequest` → `FeeAdjustmentPreview` (targetCount/beforeTotal/afterTotal). 전체 조회 대상에 대해 MSW에서 계산한다.
- `POST /api/admin/fee-adjustments`: `FeeAdjustmentRequest` → `FeeAdjustmentResult`. 단계, 날짜 범위, 정수 단가, 선택 블록, 변경 사유. 기존 검침 단가만 변경한다.
- `GET /api/admin/fee-adjustments`: 요청과 결과의 Mock 메모리 감사 이력.

실제 서버는 세션 변경자, 대상별 변경 전후 값, 시각, 사유를 트랜잭션 감사 로그에 기록해야 한다. 미리보기 토큰/버전, 멱등성 및 정산 확정 건 정책은 후속 계약이다. 동시 수정 보호는 현재 없다.

## 조사자 계정 (관리자 전용)

- `GET /api/admin/investigators`: q/status(active 또는 inactive)/page/pageSize → `PageResponse<User>`.
- `POST /api/admin/investigators`: username/name/temporaryPassword → User. 역할은 WORKER로 고정. 아이디는 영문·숫자·밑줄·하이픈 3~32자, 이름 1~40자, 임시 비밀번호 8~64자. 아이디 대소문자 중복은 409.
- `PATCH /api/admin/investigators/:id`: name 또는 active. 비활성 계정은 신규 검침 작업자로 선택할 수 없다. 과거 실적은 보존한다.
- `POST /api/admin/investigators/:id/reset-password`: temporaryPassword → userId/mustChangePassword/resetAt.

현재 비밀번호는 검증 후 폐기하며 응답이나 Mock 저장소에 보존하지 않는다. 생성/초기화 화면과 계약만 구현한 상태다. 실제 인증, 해시 저장, 첫 로그인 변경 강제, 계정 잠금과 세션 폐기는 백엔드 연동이 필요하다.

## 권한

작업자 응답에서 검침 fee를 제외하며 users는 본인만 반환한다. 관리자 API/단가/정산은 403. 작업자 ID는 Mock의 11이며 다른 사람 명의 등록을 거부한다. 화면에서도 관리자 경로와 메뉴를 제한한다. `X-Demo-Role`과 DEV 전용 `VITE_DEMO_ROLE`은 시연용이며 보안 경계가 아니다. 운영은 서버 세션으로 사용자/권한을 결정해야 한다.

## 지도와 출력

`components/map/FieldMap.tsx`는 사전 주입 `window.naver.maps` 어댑터다. 자동 로더, 키/도메인 인증, 실제 지도 검증은 미완료다. SDK 없으면 안내와 페이지 목록을 표시한다. 임의 키와 외부 지도 이미지는 사용하지 않는다.

HWP 화면은 블록 조건과 전체 대상 건수만 표시하며 파일명을 나열하지 않는다. 생성 버튼은 비활성이다. 백엔드 생성 식별 기준은 경산시-소블록-관리번호이고 1만 건 이상 비동기 생성/ZIP 전달은 후속 작업이다.

검증 재현: `npm run test:api`, `npm run format:check`, `npm run build`. 폴더 및 실행 안내는 README.md를 참조한다.
