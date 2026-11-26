# 실제 백엔드 전환 시 필요한 프론트 변경

프론트 소스는 이번 작업에서 수정하지 않았다. 아래 변경 없이 MSW를 끄면 로그인·사진·새 특이사항 UI가 자동으로 완성되는 것은 아니다.

## 유지한 계약

`ApiResult<T>`, 현장/블록/요약, PageResponse, 조사자 관리, START/END 생성·정정, 단가와 정산 기본 경로를 유지한다. 401/403/409 처리는 화면에서 구분해야 한다. 페이지는 기본20, 최대100이며 잘못된 범위 입력은 400, 넘친 페이지는 마지막 페이지로 조정한다. 금액은 관리자에게만 반환한다.

`code`는 기존 Mock의 숫자 문자열 대신 `OK`, `PASSWORD_CHANGE_REQUIRED`, `STALE_MEASUREMENT` 같은 코드다. 기존 클라이언트는 success/message/data를 사용하므로 성공 구조는 호환된다.

## 인증

- X-Demo-Role 대신 실제 로그인 화면과 세션 쿠키를 사용한다.
- 최초 GET `/api/auth/csrf` → form-urlencoded POST `/api/auth/login` → CSRF 재조회 → GET `/api/me`.
- 첫 비밀번호 변경과 비밀번호 초기화 후에는 일반 업무 API를 403으로 차단한다. 변경 화면으로 유도한다.
- PATCH `/api/auth/password` 성공 후 새 비밀번호로 다시 로그인한다.
- 변경 요청마다 `X-CSRF-TOKEN`을 보낸다. FormData 요청에 `Content-Type: application/json`을 강제로 넣지 않는다.
- Workers `/api/*` 프록시는 Cookie, CSRF 헤더, Set-Cookie를 보존해야 한다. 실제 배포의 HTTPS/Secure 쿠키는 별도 검증한다.

## 현장 기본정보

- 새 `consumerNumber`는 Excel C 수용가번호이다. `waterNo`는 기존 화면의 급수전번호 의미에 맞춰 AZ 원문이다. 두 번호를 합치지 않는다.
- `sealed`는 원본에서 확정할 수 없어 null이다. 기존 `sealed ? '봉인' : '미봉인'` 대신 미확인 표시가 필요하다. H 계량기 유무는 `meterPresenceRaw`로 보존한다.
- 원본에 없는 supplyArea는 빈 문자열, 좌표는 null이다. 지오코딩 전 지도에 가짜 좌표를 표시하지 않는다.
- 중/소블록은 원문 코드/표시명을 사용한다. 같은 소블록명이 여러 중블록에 있을 수 있으므로 중블록 조건과 함께 사용한다.
- 과거 월별 세 그룹의 의미는 미확정이며 신규 inspections에 섞지 않는다.

## 검침

기존 요청 예시는 유지한다.

```json
{"phase":"END","date":"2027-01-05","reading":150,"workerId":42}
```

START 선행 조건을 프론트에서도 제거한다. END 먼저 등록 가능, 두 값이 존재하면 END<START는 400이다. 서버는 `usage`를 null 또는 정확한 차이로 반환한다. END 단독의 상태는 기존 statusOf와 같이 DONE이다. START=2026, END=2027 기준은 유지했다.

정정은 서버가 보낸 `updatedAt` 문자열을 그대로 `expectedUpdatedAt`에 넣는다. 브라우저에서 밀리초로 잘라 재생성하지 않는다. 날짜/지침 정정은 기존 작업자·단가·확정 정산 스냅샷을 바꾸지 않는다.

이력 API는 `GET /api/sites/{id}/measurements/{phase}/history`, 다음 페이지는 `beforeId=nextCursor`. 본인 기록 또는 ADMIN만 가능하며 WORKER 응답에는 fee가 없다.

## 특이사항

기존 PATCH `/note`는 자유 비고로 유지한다. 새 선택 UI는 다음 요청을 사용한다.

```json
{"code":"HOPE","description":""}
```

| 코드 | 표시명 |
| --- | --- |
| NONE | 해당 없음 |
| HOPE | 호폐 |
| LOCATION_UNKNOWN | 위치불명 |
| STACKED | 적재 |
| OTHER | 기타 |

응답의 `specialCondition`은 code/label/description이다. 검침 없이 저장할 수 있고 변경자/시각/전후 값은 DB에 보존한다. 기타 설명은 선택 입력이다.

## 사진

기존 전체 배열/data URL 교체 요청:

```json
{"photos":[{"slot":"OVERVIEW","url":"data:image/png;base64,..."}]}
```

실제 서버는 POST multipart `file`, `slot`을 사용한다. 기존 이미지 교체는 PUT `/photos/{photoId}`, 삭제는 DELETE, 조회 URL은 세션 인증된 `/content`다. 응답 photos에 id가 추가된다.

기존 4슬롯에 EXTRA_1/EXTRA_2를 추가해 **총6장**으로 확장한다. JPEG/PNG, 10MB, 25MP 이하이다. WebP는 JPEG/PNG로 변환한다. 같은 슬롯을 새 POST로 덮어쓰지 말고 PUT으로 교체한다. 본인 업로드 또는 ADMIN만 교체/삭제할 수 있다.

## 관리자 Import/Export·정산

- 업로드 UI: multipart POST `/api/admin/imports`, 완료 결과와 skippedRows(시트/행/사유/최초행) 표시. GET `/api/admin/imports/{jobId}`로 다시 조회한다.
- Excel 원본을 클라이언트 번들·Git에 넣지 않는다.
- 기존 `/api/exports/sites` 페이지 계약은 유지한다. 서버의 실제 전체 XLSX는 `/api/exports/sites.xlsx`; 다운로드 응답을 JSON으로 파싱하지 않는다.
- 신규 XLSX는 22열이며 원본번호·현장·START/END·사용량·특이사항·상태·사진 수를 포함한다. 기존 클라이언트 35열 Export와 구성이 다르다.
- 정산 확인/지급 버튼은 POST `/api/admin/settlements/confirm`, `/pay`에 `{inspectionIds:[...]}`를 보낸다.
- 소급 조정 미리보기와 실행은 OPEN만 대상이다. CONFIRMED/PAID는 변경하지 않는다. 실행 결과 건수를 다시 표시한다. 미리보기 자체는 예약/잠금이 아니며 실행 시 대상이 재평가된다.
- WORKER의 `/api/my-settlements`는 본인 실적만 제공하고 금액을 제외한다.

## 남은 외부 연동

실제 프론트 전환, Workers 프록시 배포, R2 계정 통합 검증, NAVER 주소 지오코딩, EC2 성능·백업/복원 검증은 이번 백엔드 로컬 검증 범위에 포함되지 않는다. HWP/ZIP 생성은 요청대로 제외했다.
