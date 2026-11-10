# 프론트엔드 Mock API 계약

업데이트: 2026-10-23. **아래는 MSW 계약이며 실제 Spring 업무 API가 아니다.** 응답은 ApiResult<T>, 타입은 src/types.ts, 호출은 src/api, 구현은 src/mocks/handlers에 있다. 새로고침 시 저장 내용이 초기화된다.

## 조회·페이지·권한

| API | 응답 / 조건 |
| --- | --- |
| GET /api/me | Mock 본인. 실제 세션 조회가 아님 |
| GET /api/users | 관리자 전체, 작업자 본인만 |
| GET /api/blocks | Block[]. 중블록은 parentId 없음, 소블록은 중블록 parentId |
| GET /api/sites | PageResponse<SiteListItem>. middleBlockId/smallBlockId/q/status/page/pageSize |
| GET /api/site-summary | 같은 필터 전체 집계. 관리자만 workers 포함 |
| GET /api/sites/:id | Site. 기본정보·검침·특이사항·사진 |
| GET /api/settlements | 관리자 전용 SettlementPage. 블록/workerId/phase/startDate/endDate/page/pageSize |
| GET /api/exports/sites | 관리자 전용 PageResponse<SiteExportItem>. 블록/page/pageSize |

- PageResponse: items/page/pageSize/total/totalPages. 기본 20건, 최대 100건. 빈 결과는 page=1, 초과 페이지는 마지막으로 조정한다.
- 수용가는 관리번호/ID 순 정렬. 목록은 photos/note를 제외하고 photoCount만 포함한다.
- status는 TODO/IN_PROGRESS/DONE이며 표시명은 미처리/시작검침완료/검침완료다. 수용가와 지도 모두 같은 조건을 보낸다. 전체는 status 생략이다.
- inspectionPhase=START|END, inspectionStatus=PENDING|COMPLETED 지원은 Mock에 남아 있으나 현재 지도 UI는 사용하지 않는다.
- 요약/정산 금액은 현재 페이지가 아닌 전체 조회 범위다. 정산 날짜 범위는 양끝을 포함한다.
- 작업자 응답의 검침 fee는 제외한다. 관리자 API/단가/정산은 작업자에게 403. 비활성 Mock 작업자는 요청을 거부한다.
- X-Demo-Role은 시연에서만 사용한다. 운영 서버는 이를 신뢰하지 않고 서버 인증으로 권한을 결정해야 한다.

## 검침·특이사항·사진

| API | 요청 / 동작 |
| --- | --- |
| POST /api/sites/:id/measurements | phase/date/reading/workerId. 역할별 Site 반환 |
| PATCH /api/sites/:id/measurements/:phase | date/reading/expectedUpdatedAt. 본인 기록 또는 관리자 전체 수정 |
| PATCH /api/sites/:id/note | note 문자열 → Site |
| POST /api/sites/:id/photos | photos: SitePhoto[] → Site. 전달한 배열로 사진 전체 교체 |

START는 2026년, END는 2027년의 유효 달력 날짜다. 0 이상 유한 지침·활성 조사자·선행 START·단계 중복을 검사한다. 작업자 ID는 Mock 11이며 다른 사람 명의 등록을 거부한다.

수정 버전은 updatedAt ?? recordedAt을 기준으로 하며 충돌은 409. 작업자·과거 단가·최초 등록시각은 유지하고 변경 전후 감사 기록은 Mock 메모리에 남긴다. 정산 확정 후 수정 정책과 서버 트랜잭션/영구 감사는 미구현이다.

SitePhoto는 slot/url이다. slot은 OVERVIEW/START_CLOSEUP/END_CLOSEUP/TEMPORARY, 최대 4개·영역별 1개다. 빈 배열은 사진 전체 삭제다. 미지원 슬롯·중복·잘못된 이미지는 거부한다. 위치도/좌표 수정 API는 제거했다.

Mock url은 JPEG/PNG/WebP base64 data URL만 허용하며 최대 1,500,000자다. 클라이언트 변환/미리보기 정책은 [README](README.md)에 있다. 실제 서버 업로드 시에는 이 data URL 계약을 R2 업로드/확정/비공개 조회 계약으로 교체해야 한다.

## 단가·정산

- GET/POST /api/fee-rules: 기간별 단계 단가. 신규 검침용이며 기존 금액에 소급하지 않는다.
- PATCH /api/fee-rules/:id: amount 정수 → FeeRule. 단계·기간·과거 검침 금액 보존.
- POST /api/admin/fee-adjustments/preview: FeeAdjustmentRequest → targetCount/beforeTotal/afterTotal.
- POST /api/admin/fee-adjustments: 단계·날짜·amount·선택 블록·reason → FeeAdjustmentResult.
- GET /api/admin/fee-adjustments: Mock 메모리 요청/결과 이력.

실제 서버의 미리보기 버전·멱등성·정산 마감·변경자별 영구 감사는 후속 설계다. 검침 정정의 버전 검사와 달리 단가 일괄 변경에는 현재 동시 수정 보호가 없다.

## 조사자 관리 (관리자 전용)

- GET /api/admin/investigators: q/status(active|inactive)/page/pageSize → PageResponse<User>.
- POST /api/admin/investigators: username/name/temporaryPassword → User. WORKER 고정. username은 영문/숫자/밑줄/점/하이픈 3~32자, name 1~40자, temporaryPassword 8~64자. 아이디 대소문자 중복 409.
- PATCH /api/admin/investigators/:id: name 또는 active. 비활성화 시 과거 검침 보존.
- POST /api/admin/investigators/:id/reset-password: temporaryPassword → userId/mustChangePassword/resetAt.

비밀번호는 Mock에서 형식만 검사한 후 폐기한다. 실제 해시·로그인·세션 폐기·최초 변경 강제는 미구현이다.

## 지도와 출력

지도는 GET /api/sites의 현재 페이지 최대 20건과 실제 NAVER SDK를 사용한다. 유효하지 않은 좌표는 마커에서 제외한다. 위치 수정·위치도 API는 없으며 대량 영역 조회는 [미구현 제안](../docs/MAP_QUERY_DESIGN.md)이다.

exports 응답은 기본정보·검침·특이사항·photoSlots를 포함하고 사진 바이너리/URL은 제외한다. 클라이언트는 전 페이지를 수집해 35열 XLSX를 생성한다. 중복/전체 건수 변경은 거부하나 같은 건수 내 데이터 변경의 일관된 스냅샷은 보장하지 않는다.

HWP 생성/작업 상태/ZIP 다운로드 API는 아직 없다. [HWP 사전 생성 설계](../docs/HWP_EXPORT_DESIGN.md)에 따라 개발자가 실제 계약을 정한다. 프론트의 HWP 버튼은 비활성이다.

## 주소 좌표 자동 변환 및 원본 상세 필드 (2026-11-06)

실제 백엔드 연결 모드의 관리자 지도 화면에서 `POST /api/admin/geocoding`을 사용한다. 요청은 `{afterId, throughId?, region, middleBlock?, registeredFrom?, registeredTo?}`이며 응답 data는 `{nextId, throughId, done, rows:[{id,consumerNumber,status}]}`다. 중블록 또는 최초 등록일 조건이 필수이며 함께 입력하면 AND로 적용한다. 등록일은 한국 시간 기준 양 끝 날짜를 포함한다. 선택 조건의 미등록 좌표 중 최대 100건을 처리하고 기존 좌표는 보존한다. 느린 공급자 응답에서는 100건 미만으로 반환할 수 있다. 상태는 UPDATED/EMPTY_ADDRESS/NO_MATCH/CHANGED_OR_ALREADY_SET다. 인증·ADMIN·CSRF가 필요하며 API 호출 오류는 반복을 중단한다. 클라이언트는 반환한 상한과 커서 및 같은 필터를 후속 요청에 전달한다. 여러 검색 결과 중 NAVER의 첫 번째 결과를 사용한다. 같은 서버의 중복 배치는 GEOCODING_BUSY(409)로 거절한다.

Site는 `oldAddress`, `meterDiameter`, `householdCount`, `sewerRaw`, `businessName`, `sourceReader`, `regularReadingDay`, `meterPresenceRaw`를 제공한다. 상세 조회에는 `sourceMonthlyValues:[{month,groupA,groupB,groupC}]`가 추가된다. 원본 월별 값은 문자열/null이고 신규 START/END와 분리한다. 빈 이름/정보는 원본 미기재로 표시한다.

## 빈 기본정보 보완 (2026-11-07)

`POST /api/admin/imports/repair` multipart file: 기존 수용가번호의 빈 기본정보만 보완한다. 신규 등록은 하지 않으며 기존 값과 업무 데이터는 유지한다. ADMIN/CSRF 필수. 응답 data: `{jobId,totalRows,updated,unchanged,duplicateInFile,notFound,invalid,rows:[{sheet,rowNumber,consumerNumber,reason,fields}]}`. reason은 UPDATED/UNCHANGED/DUPLICATE_IN_FILE/NOT_FOUND/INVALID_CONSUMER_NUMBER이며 fields는 실제 보완된 기본 필드/원본 셀이다. 일반 `/api/admin/imports`의 신규 등록 동작은 변경하지 않는다.

## 원본 월별 자료 제거 (2026-11-08)

위 과거 sourceMonthlyValues 계약은 폐기한다. 상세 API는 해당 필드를 반환하지 않으며 화면과 타입에서도 제거한다. 신규/보완 Excel 업로드는 M:AW 월별 값·합계 및 월별 헤더를 무시한다. 기본정보 열 위치는 기존 양식대로 유지한다. 신규 START/END와 그 변경 이력은 유지한다.


## 지도 영역 조회 (2026-11-09)

`GET /api/map-sites?south=35.81&north=35.83&west=128.73&east=128.75&zoom=16` — 인증 필요. 목록 검색·블록 필터·페이지와 독립적으로 전체 수용가 중 영역 안 좌표를 조회한다. 확대 수준 15~22 및 각 축 범위 0.1도 이하만 허용하고 잘못된 범위는 400이다. 응답 data는 `{items:[{id,latitude,longitude,status}],truncated}`이며 status는 TODO/IN_PROGRESS/DONE이다. 이름·주소·사진·전체 검침 상세는 포함하지 않는다. 500건 이하는 전체 반환하며 500건 초과면 items를 비우고 truncated=true로 더 확대하도록 안내한다. 경계는 포함하며 좌표 미등록/0,0은 제외한다. 지도 이동 종료 후 조회하며 검색 목록의 페이지 변경과 좌표 변환 배치 완료마다 갱신하지 않는다.

## HWPX 검침카드 (2026-11-09)

ADMIN + CSRF POST `/api/exports/cards`에 `{siteId?,middleBlock?,smallBlock?,title}`로 생성 요청. `{id}`를 받아 GET `/api/exports/cards/{id}`를 진행 중 2초마다 조회한다. 상태 및 ZIP 목록, 만료/변경 검사와 다운로드는 `docs/HWPX_EXPORT.md` 참고. GET `/api/exports/cards`는 본인 최근 20개 작업이다. 위치도는 생성하지 않고 원경·START·END 근경만 넣는다. Excel 다운로드와 별도 기능이다.

### 전체 HWPX ZIP 다운로드

READY 작업에서 GET `/api/exports/cards/{id}/download-check`로 완료·만료·원본 변경 검사 후, `/api/exports/cards/{id}/download`를 브라우저 기본 다운로드로 연다. 결과는 전체 HWPX 파일이 직접 포함된 ZIP 하나다. 화면에 50건 묶음 버튼을 노출하지 않으며 전체 ZIP을 fetch/blob으로 메모리에 담지 않는다. 이전 생성 완료 작업도 지원한다.

### 지오코딩 부분 실패

Geocoding Result/Row에 optional errorCode/errorMessage 추가. 공급자 오류 행은 SERVICE_ERROR이며 NO_MATCH와 구분한다. 최상위 errorCode가 있으면 결과 행을 먼저 반영한 뒤 반복을 멈춘다. Cloudflare HTML 502/503/504 및 BACKEND_UNAVAILABLE에 한해 같은 요청으로 최대 두 번 재시도하며 다른 애플리케이션 오류는 반복하지 않는다.

### 축소 지도 집계 마커

인증 GET `/api/map-clusters?south&north&west&east&zoom`는 zoom 1~22에서 `{clusters:[{x,y,count,latitude,longitude}],total}`을 반환한다. 현재 화면을 6×6 격자로 집계하며 경계 포함 최대 49개 묶음이다. 대표 위치는 해당 묶음 좌표 평균이며 좌표 없는 수용가는 제외한다. 목록 필터/페이지와 무관하다. 프론트는 축소/넓은 화면 또는 개별 조회 500건 초과일 때 집계를 사용하고, 클릭 시 건수 및 확대 버튼을 표시한다.

### 개별 주소 오류 후 계속 진행

Row.errorCode가 있는 SERVICE_ERROR 한 건은 실패 목록에 표시하고 다음 묶음을 진행할 수 있다. 전체 중단 여부는 최상위 Result.errorCode로만 결정한다. 키/권한/할당량 및 한 묶음 전부 실패에서만 최상위 오류를 반환한다. 단건 오류 때문에 같은 초기 커서에서 반복 재시작하지 않는다.

### HWPX 작업 취소·삭제

ADMIN + 요청자 소유권 + CSRF POST `/api/exports/cards/{id}/cancel`, DELETE `/api/exports/cards/{id}`. 취소는 CANCELLED, 삭제 요청은 DELETING 상태로 보인다. DELETING은 처리 완료 후 목록에서 사라지며 조회는 404다. 화면에서 기존 요청별 취소·삭제와 상태/진행률을 제공한다. 삭제된 작업의 404는 반복 polling하지 않는다. 공유 캐시·원본 데이터 보존 및 실제 저장소 정리는 docs/HWPX_EXPORT.md 참고.

### Excel 보이는 행과 DB 정리

기존 등록/보완 multipart에 visibleOnly(boolean, 기본 false) 추가. true면 저장된 hidden 행을 HIDDEN_ROW로 제외하고 hiddenRows를 보고한다. 삭제는 별도 `/api/admin/imports/prune/preview` 및 `/{planId}/execute`로만 수행한다. 보이는 수용가 외 기존 전체 DB가 대상이며 사진/미확정 검침도 삭제하되 확정/지급 정산 대상이 있으면 전체 차단한다. 미리보기/유효기간/입력 확인/권한/상태 변경 검사 및 상세 API는 docs/VISIBLE_EXCEL_AND_PRUNE.md 참고.

### 숨김 행만 삭제 및 제외 행 간소화

prune/preview는 이제 숨김 행의 번호와 일치하는 DB 수용가만 대상으로 한다. 파일 밖 DB와 보이는 행에도 존재하는 번호는 유지한다. 보이는 번호 누락은 차단하지 않으며 hiddenRowsWithoutNumber/visibleRowsWithoutNumber/visibleDuplicateNumbers/unmatchedHiddenNumbers 및 scope=HIDDEN_ROWS를 보고한다. 기존 넓은 범위 계획은 PRUNE_SCOPE_CHANGED로 재확인한다. 신규 등록 제외 행 UI에는 오류·파일 중복만 표시하고 ALREADY_EXISTS/HIDDEN_ROW는 숨기며 서버 원본 보고서는 유지한다.

## 특이사항 입력·표시 통일 (2026-11-10)

`PATCH /api/sites/:id/special-condition` → `{code,description}` → Site. 운영은 인증·CSRF 필수이며 변경 이력을 기록한다. 운영/시연 모두 같은 선택 UI와 요청을 사용한다.

- code: NONE(해당 없음), HOPE(호폐), LOCATION_UNKNOWN(위치불명), STACKED(적재), OTHER(기타).
- OTHER는 공백 제거 후 내용 필수, 최대 2,000자. 다른 code는 description을 빈 문자열로 저장하며 응답에서도 설명을 비운다. 요청 description의 기존 2,000자 길이 제한은 유지한다.
- 호폐·위치불명·적재는 선택한 문구 자체가 특이사항이다. OTHER는 입력한 내용만, NONE은 특이사항 없음으로 표시한다. 과거 OTHER 설명이 비어 있는 데이터는 `기타`로 표시하고 다음 저장 시 내용을 요구한다.
- 상세 화면과 지도 현장 입력에서 별도 `현장 특이사항` 메모 입력을 제거했다. 저장은 special-condition PATCH 한 번으로 처리한다. 기존 `note` 컬럼/값과 호환 API는 보존하되 새 UI 및 출력의 특이사항으로 사용하지 않는다. 기존 메모를 자동 변환하거나 삭제하지 않는다.
- 운영 `GET /api/exports/sites.xlsx`는 코드·상세·비고 3열 대신 읽을 수 있는 `특이사항` 1열을 제공한다(총 20열). 시연 35열 XLSX의 특이사항 열도 같은 표시 규칙을 사용한다.
- HWPX 특이사항 칸은 같은 규칙을 적용한다. 생성기 버전을 card-2로 변경했으므로 이전 문서와 캐시를 새 형식으로 사용하려면 새 생성 요청이 필요하다. 기존 작업/파일을 자동 삭제하지 않는다.

## 수용가번호 미등록 지원 (2026-11-10)

`Site.consumerNumber`와 지오코딩 `Row.consumerNumber`는 string 또는 null이다. 내부 id는 계속 PK이며 상세/지도는 번호 미등록으로 표시한다. 지오코딩 결과는 번호가 없으면 내부 ID로 표시한다.

업로드/빈 기본정보 보완/숨김 삭제는 번호가 있으면 수용가번호, 번호가 없으면 번호 없는 DB 자료의 새주소(E)·수용가명(D)으로 식별한다. 주소·이름의 앞뒤 및 연속 ASCII 공백을 정리해 비교한다. 번호 없는 행의 주소·이름 부족은 `MISSING_ADDRESS_OR_NAME`이며 신규 등록 제외 표에 표시한다. 번호가 있는 자료와 없는 자료의 자동 병합은 하지 않는다.

관리자 상세 화면은 번호 없는 자료에 번호 등록 버튼을 제공한다. ADMIN+CSRF `PATCH /api/admin/sites/{id}/consumer-number` `{consumerNumber:string}` → Site. 1~100자/선행0 유지/앞뒤 공백 제거, 중복 번호와 기존 번호 덮어쓰기는409다. ID/사진/검침을 유지하고 변경 이력을 기록한다.

숨김 삭제 미리보기는 identityVersion=2, hiddenRowsWithoutIdentity/visibleRowsWithoutIdentity/visibleDuplicateIdentities/unmatchedHiddenIdentities와 sample의 id/name/address를 추가한다. 번호 없는 대상을 주소·이름으로 표시한다. 서버는 내부 ID 유지 집합으로 실행하며 기존 계획은 PRUNE_SCOPE_CHANGED로 재미리보기를 요구한다. 전체 정책 및 재업로드 주의는 `docs/OPTIONAL_CONSUMER_NUMBER.md` 참고.

## Excel 계량기 유무 → 비고 분리 (2026-11-10)

H열 원본의 앞뒤 공백을 제거한 값이 정확히 `완료`면 `meterPresenceRaw="완료"`, `importRemark=""`다. 그 외 비어 있지 않은 값은 `meterPresenceRaw=""`, `importRemark=해당 문구`로 반환한다. 빈 값은 둘 다 빈 문자열이다. 원본 컬럼이 비었으면 보존한 source_cells.H를 사용한다.

Site에 optional `importRemark:string`을 추가하고 상세/지도 기본정보에서 `비고 (엑셀)`로 표시한다. 현장 specialCondition 및 note와 구분한다. 원본 H값은 DB에 보존하므로 기존 자료도 재업로드 없이 같은 표시 규칙을 적용한다.

운영 XLSX는 기존20열 뒤에 비고1열을 추가해21열이며 계량기 유무 칸에는 완료만 표시한다. 시연 XLSX는 기존35열 뒤에 계량기 유무/비고를 추가해37열이다. 현장 특이사항의 출력 규칙은 유지한다. 자세한 원본 보존/검증은 docs/EXCEL_METER_REMARKS.md 참고.
