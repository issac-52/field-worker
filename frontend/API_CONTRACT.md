# 프론트엔드 Mock API 계약

응답은 `ApiResult<T>`이며 타입은 `src/types.ts`, 호출은 `src/api/`, 구현은 `src/mocks/handlers/`에 둔다. MSW 메모리 상태는 페이지 새로고침 시 초기화된다.

## 조회 및 페이지 처리

- `GET /api/blocks`: `Block[]`; 중블록 parentId 없음, 소블록 parentId는 중블록 ID. UI에서 실제 블록명을 하드코딩하지 않는다. 현재 시드 분류는 임시이며 실제 블록 체계와 대조해야 한다.
- `GET /api/sites`: `PageResponse<SiteListItem>`. 중/소블록 ID, q, status, page, pageSize 조건. 기본 20건, 최대 100건. 관리번호/ID로 안정 정렬. 이미지와 특이사항은 제외하고 photoCount만 반환한다.
- `GET /api/site-summary`: 동일 수용가 필터의 전체 `SiteSummary`. 페이지 조건에 영향받지 않는다. workers 집계는 관리자에게만 제공한다.
- `GET /api/sites/:id`: `Site`. 검침 등록, 특이사항 및 사진 저장은 각각 `/measurements`, `/note`, `/photos`를 사용한다. 기본정보 수정 API는 제공하지 않는다.
- `GET /api/settlements`: `SettlementPage`. 중/소블록, 작업자, 단계, 검침일 양끝 포함 기간, 페이지 조건. summary는 현재 페이지가 아닌 전체 조회 범위 금액과 작업자 집계다.

`PageResponse`는 items/page/pageSize/total/totalPages다. 빈 결과의 페이지는 1이며 초과 페이지는 마지막 페이지로 조정한다. 지도도 현재 페이지 수용가의 유효 좌표만 표시한다.

지도는 `inspectionPhase=START|END`, `inspectionStatus=PENDING|COMPLETED`를 목록과 요약에 동일하게 전달한다. 해당 단계의 검침 존재 여부로 필터링하고, 상태 생략 시 전체다. 기본 지도 조건은 START/PENDING이다. 기존 `status=TODO|IN_PROGRESS|DONE`은 전체 검침 상태이며 목록 화면에서 사용한다. IN_PROGRESS의 화면 명칭은 `시작검침완료`다. 이 계약은 현재 MSW에 구현되어 있으며 실제 백엔드 연동 시 구현해야 한다.

## 작업비

- `GET/POST /api/fee-rules`: 향후 검침 등록에 적용하는 기간별 단계 단가. 기존 검침에는 소급하지 않는다.
- `PATCH /api/fee-rules/:id`: `{ amount: number }` → `FeeRule`. 기존 규칙의 신규 검침용 정수 단가만 변경하며 단계·기간과 과거 검침 금액은 유지한다. 관리자 전용.
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

작업자 응답에서 검침 fee를 제외하며 users는 본인만 반환한다. 관리자 API/단가/정산은 403. 작업자 ID는 Mock의 11이며 다른 사람 명의 등록을 거부한다. 화면에서도 관리자 경로와 메뉴를 제한한다. `X-Demo-Role`은 Mock 전용으로 실제 보안 경계가 아니다. 운영은 서버 세션으로 사용자/권한을 결정해야 한다.

전용 `demo` 모드는 가상 데이터만 사용하는 역할 선택기를 제공한다. ADMIN/WORKER는 메모리 상태이며 새로고침 시 WORKER다. 전환 시 조회 취소·캐시 비우기·홈 이동으로 이전 관리자 화면을 정리한다. 운영 모드는 전환·MSW·Mock 역할 헤더를 포함하지 않는다. `.env.admin`/dev:admin과 고정 관리자 역할은 제거했다. 실제 `.env.local`/`.env.demo`는 Git 제외이며 운영은 파일을 로딩하지 않고 Pages Variables만 사용한다. 이전 `VITE_DEMO_ROLE=ADMIN` 설정이 운영 빌드에 남으면 거부한다. MSW에 없는 같은 출처 `/api/` 요청은 실제 API로 전달하지 않는다. 배포 시연과 운영은 별도 Pages 프로젝트·호스트명을 사용한다. 명령과 설정은 README.md를 참조한다.

## 지도와 출력

`lib/naverMaps.ts`가 `VITE_NAVER_MAP_CLIENT_ID`를 읽는 지도 컴포넌트의 요청으로 NAVER JavaScript API v3을 로드한다. 공식 문서의 `ncpKeyId`와 비동기 callback을 사용한다. 공유 Promise, 15초 타임아웃, 네트워크 오류와 `navermap_authFailure`, 재시도를 처리한다. callback 선행 시 Map 준비를 같은 제한 시간 안에서 확인한다. 키가 없으면 SDK 요청을 하지 않는다. 2026-10-23 로컬 Client ID 설정으로 실제 타일/마커, 블록 변경, 카드 선택과 상세 이동을 검증했다. 운영/모바일 접속 주소 인증은 별도다.

지도와 목록은 같은 `sites` 페이지 응답을 사용하며 현재 조회 범위/최대 20건을 표시한다. 유한한 위도·경도 범위 밖 또는 (0,0)은 건너뛰고 누락 건수를 안내한다. 좌표를 새로 생성하지 않는다. 지도 인스턴스·마커·이벤트·ResizeObserver는 페이지 변경/언마운트 시 정리한다. 대량 bounds 조회 계약은 `docs/MAP_QUERY_DESIGN.md`의 제안이며 구현된 API가 아니다.

## 검침과 시연 이미지 (2026-10-23 보완)

- `POST /api/sites/:id/measurements`: `{ phase, date, reading, workerId }` → 역할별 `Site`. START는 2026년, END는 2027년 날짜다. 실제 달력 날짜·유한한 0 이상 숫자·활성 작업자를 검사한다. END 선등록, 동일 단계 중복, 다른 작업자 명의 등록은 거부한다. 완료 시 React Query 조회를 무효화한다. 연도별 반복 회차 모델은 추가하지 않았다.
- `PATCH /api/sites/:id/note`: `{ note: string }` → `Site`.
- `POST /api/sites/:id/photos`: `{ photos: SitePhoto[] }` → `Site`. `SitePhoto`는 `{ slot, url }`, slot은 OVERVIEW/START_CLOSEUP/END_CLOSEUP이다. 최대 3개, 영역별 최대 1개이며 빈 배열로 현장 사진만 삭제할 수 있다. LOCATION_MAP 업로드는 거부하며 전용 자동 생성 계약으로 분리한다. 이전 DISTANT/START_CLOSE/END_CLOSE 별칭은 이번 가상 시드 계약에서 교체했다. 실제 영구 데이터는 없으며 향후 기존 데이터가 있으면 별도 변환이 필요하다.
- MSW 이미지 url은 JPEG/PNG/WebP base64 data URL만 허용하며 개당 문자열 길이는 최대 1,500,000자다. 클라이언트는 10MB 이하 파일의 실제 디코딩 성공을 확인하고 긴 변 최대 1600px JPEG로 축소한다. 축소 결과는 최대 1MiB다. 투명 배경은 흰색으로 합성하며 시연 품질을 위한 변환이다. 최종 보고서 원본 보관 정책은 별도다.
- 편집 중 미리보기는 Blob URL을 사용하고 교체·삭제·닫기 시 해제한다. 시연 저장 직전에만 축소본을 data URL로 변환한다. 이미지/비밀번호/검침은 운영 서버나 R2에 저장하지 않는다. 새로고침 시 초기화된다.

HWP 화면은 블록 조건과 전체 대상 건수만 표시하며 파일명을 나열하지 않는다. 생성 버튼은 비활성이다. 백엔드 생성 식별 기준은 경산시-소블록-관리번호이고 1만 건 이상 비동기 생성/ZIP 전달은 후속 작업이다.

검증 재현: `npm run test:api`, `npm run test:map`, `npm run format:check`, `npm run build`. `test:map`은 fake DOM에서만 SDK 로딩 오류/재시도를 검증하며 NAVER 실인증 테스트가 아니다. 폴더 및 실행 안내는 README.md를 참조한다.

## 자동 위치도 (2026-10-23)

- `GET /api/sites/:id/location-map`: `LocationMapState { image, stale, imageUrl }`. 미저장 image=null. 생성 호출 없음.
- `POST /api/sites/:id/location-map`: `{ regenerate: false }` 또는 `{ regenerate: true, expectedGenerationId }`, 필수 `Idempotency-Key`. `LocationMapResult { image, stale, imageUrl, reused }` 반환. 좌표/옵션은 서버 소유이며 요청에서 거부한다. 동일 좌표/옵션이면 재사용하고 stale이면 409/명시적 재생성이 필요하다.
- 메타데이터 타입은 `src/lib/locationMap.ts`, Mock 구현은 `mocks/handlers/locationMaps.ts`다. storageMode=MOCK, mock-only 객체 키, fileSize=null, imageUrl=null로 실제 파일 없음을 명시한다. 동일 키/다른 본문 409, 생성 중 다른 키 409, 좌표 오류 422, 수용가 없음 404. 실패 시 기존 상태 유지.
- ADMIN/WORKER는 기존 수용가 접근 범위를 유지한다. 실제 권한 검사는 아직 서버 연동 전이다. X-Demo-Location-Map-Failure 헤더는 Mock 테스트 전용이며 작업자 화면의 실패 조작은 제거했다.
- 운영 UI의 실제 저장은 비활성이다. Spring/DB/R2/HWP 설계, 사설 객체 접근, 멱등 키 보관, 실패 복구, 이용 조건 차단은 [자동 위치도 설계](../docs/LOCATION_MAP_DESIGN.md)를 참조한다. 실제 Static 호출/R2 저장/HWP 출력은 구현하지 않았다.

### 수용가 위치 수정

`PATCH /api/sites/:id/coordinates`: `{ latitude, longitude, expectedLatitude, expectedLongitude }` → 역할별 `Site`. ADMIN/WORKER의 수용가 접근 범위를 유지한다. 지도 클릭은 임시 선택일 뿐이며 위치 저장에서만 호출한다. 취소는 요청하지 않는다. 좌표 범위/유한값/(0,0) 검증 실패는 422, 조회 당시 좌표와 달라진 동시 변경은 409, 이미 같은 목표 좌표라면 응답 유실 재시도로 보고 기존 Site를 반환한다. 좌표 누락의 이전 값은 null이다.

수정은 사진/검침/기존 위치도 파일을 건드리지 않는다. 기존 위치도는 새 좌표와 다르면 stale이 되고 사용자가 `위치도 다시 생성`을 누르기 전에는 Static 호출을 하지 않는다. 단건 Site·목록·위치도 조회를 갱신해 지도 마커도 새 위치를 반영한다. 실제 서버는 숫자 비교 대신 coordinate_revision/버전 조건부 갱신과 변경자·전후 좌표·시각 감사 이력을 적용하도록 설계한다. 이번에는 MSW만 구현했으며 실제 DB 수정은 하지 않는다.
