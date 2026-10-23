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
