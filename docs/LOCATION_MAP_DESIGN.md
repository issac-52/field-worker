# 자동 위치도 계약과 서버 연동 설계

> **철회된 과거 설계 (2026-10-23):** 요청자가 위치도 불필요를 확정하여 관련 기능을 제거했다. 이 문서는 구현 대상이 아닌 과거 결정 기록이다. 현장 지도 기능은 유지한다.

2026-10-23. **구현됨:** 프론트엔드·MSW 메타데이터 시연. **제안:** 아래 Spring/DB/R2/HWP 설계. 실제 Java, Flyway, DB, Static Map 호출, R2 파일 저장, HWP 생성은 구현하지 않았다. 현재 V1에는 users만 있으므로 수용가/이미지 테이블이 이미 존재한다고 가정하지 않는다.

## 범위와 정책

- 대상 10,000건 이상, 수용가별 2026 START/2027 END 각 1회. 위치도는 단계별 중복 생성하지 않고 수용가에 연결한다. HWP 영역은 LOCATION_MAP + OVERVIEW + START_CLOSEUP + END_CLOSEUP이다.
- 위치도는 자동 생성 전용 컴포넌트로 분리했다. 업로드 API는 현장 사진 3종만 허용하며 LOCATION_MAP 업로드를 거부한다. 향후 수동 대체는 별도 관리자 명령/감사/사유 및 source=MANUAL_OVERRIDE로 확장하는 제안이며 이번 시연에는 없다.
- 기본 생성 정책: 중심=DB 수용가 좌표, 단일 기본 마커, zoom=16, 640×400, PNG, basic, EPSG:4326, scale=1, lang=ko, generationVersion=naver-static-v1. 고정 옵션은 서버 소유다. 프론트 지도 이동/확대 상태를 생성 옵션으로 보내지 않는다.
- 미리보기는 동적 SDK를 공유하되 자체 지도·단일 마커만 만든다. 현재 위치/다른 수용가 마커는 추가하지 않는다. 이동/확대 입력을 막아 고정 생성 구도를 보여준다. 동적 타일과 정적 이미지의 완전한 픽셀 일치를 보장하지 않는다.
- DB 좌표/옵션이 변경되면 기존 자산은 stale이다. 자동 덮어쓰기·자동 Static 호출 없이 명시적 재생성을 요구한다. 기존 버전은 보존하지만 기본 상세/HWP의 유효 위치도로 취급하지 않는다.

## 이용 조건: 실제 저장 활성화 차단

공식 [Maps 서비스 이용약관](https://xv-ncloud.pstatic.net/images/provision/%5B%EB%AF%BC%EA%B0%84%5DMaps%EC%84%9C%EB%B9%84%EC%8A%A4%EC%9D%B4%EC%9A%A9%EC%95%BD%EA%B4%80_v0.4_(CLEAN)_1742433558704.pdf) 제7조 9~11항은 허용 범위를 넘는 복제·저장·배포와 결과의 별도 저장·DB화·재사용을 제한한다. 장기 R2 보관과 HWP 삽입·배포를 허용한다고 해석하지 않는다. 실제 도입 전에 현행 약관 및 공식 지원의 서면 답변으로 저장 기간, 사내/발주처 배포, 출력물, 출처 표시, 삭제 의무를 확인하고 증빙을 기록해야 한다.

서버 구현 시 `LOCATION_MAP_PERSISTENCE_ENABLED=false`를 기본으로 두고 권한 검토 승인 전에는 생성 명령을 503으로 차단하는 방안을 제안한다. 지금은 해당 서버 기능 자체가 없다. 프론트 VITE 변수로 이 차단을 우회하지 않는다. Mock 성공은 권리 확인이나 실제 파일 저장의 증거가 아니다. NAVER 로고·저작권 표시를 자르거나 이미지 위에 덮지 않는다.

## 공통 HTTP 계약 (MSW 구현 / 서버 구현 예정)

인증·수용가 접근 범위는 기존 조회·사진 등록 권한과 같게 ADMIN/WORKER에 허용한다. 실제 서버는 활성 사용자 세션 및 수용가 접근 권한을 GET/POST/이미지 조회마다 검사하고 CSRF 정책을 적용한다. Mock 역할 헤더는 보안 경계가 아니다.

`GET /api/sites/{siteId}/location-map` → `ApiResult<LocationMapState>`:

```json
{
  "image": null,
  "stale": false,
  "imageUrl": null
}
```

없으면 200/image=null, 수용가가 없으면 404. GET은 메타데이터만 읽으며 생성/업로드를 수행하지 않는다. 저장돼 있으면 image에 아래 메타데이터를 반환한다. 실제 R2 모드에서만 권한 검사 후 짧은 만료의 imageUrl을 반환하며 URL은 DB에 영구 보관하지 않는다. 만료되면 GET 재조회한다. Mock은 imageUrl=null이다.

`POST /api/sites/{siteId}/location-map`, 필수 `Idempotency-Key: <UUID>`:

```json
{ "regenerate": false }
```

명시적 재생성:

```json
{ "regenerate": true, "expectedGenerationId": "현재 GET에서 받은 generationId" }
```

좌표·객체 키·URL·옵션을 요청으로 받지 않는다. 모르는 필드는 400으로 거부한다. 응답은 `{ image, stale, imageUrl, reused }`. 정상 응답 HTTP 200, code=200, success=true의 기존 envelope를 유지한다.

| 조건 | 동작 |
| --- | --- |
| 기존 없음 + 일반 저장 | DB 좌표/고정 옵션으로 한 번 생성 |
| 기존 유효 + 일반 저장 | 기존 메타데이터 반환, reused=true, 외부 생성 호출 없음 |
| 기존 stale + 일반 저장 | 409, 명시적 재생성 필요 |
| 명시적 재생성 | expectedGenerationId 일치 때만 새 불변 버전 생성 |
| 같은 사용자/수용가/멱등 키 + 같은 요청 | 같은 결과 반환, 진행 중이면 동일 결과 대기 |
| 같은 키 + 다른 요청 | 409 |
| 다른 키로 같은 수용가 생성 중 | 409, 상태 조회 후 사용자 재시도 |
| 좌표 null/비유한/범위 밖/(0,0) | 422, 생성 호출 없음 |
| 요청 실패 | 기존 자산 유지, 버튼 재시도 가능 |

클라이언트는 요청 시작 시 ref로 동기 잠금 후 버튼 비활성화/스피너를 표시한다. 실패한 동일 동작의 재시도에는 키를 유지하고, 성공 후 새로운 명시적 동작에는 새 키를 만든다. 실패 후 상태 GET도 다시 조회해 결과 유실을 복구한다. 좌표/옵션 변경 중 저장은 409로 실패하며 현재 자산을 바꾸지 않는다.

### 메타데이터

| 필드 | 계약 |
| --- | --- |
| generationId | UUID, 불변 버전 식별자 |
| siteId / imageType | 수용가 ID / LOCATION_MAP |
| storageMode | MOCK 또는 R2; 실제 저장 여부를 명시 |
| storageKey | 비공개 객체 키; 이름/주소/계량기번호 포함 금지 |
| contentType / fileSize | image/png / 실파일 bytes, Mock은 null |
| source | NAVER_STATIC_MAP; Mock에서는 계획한 원천이며 호출 증거가 아님 |
| generatedAt | ISO-8601 UTC; Mock은 가상 상태 생성 시각 |
| centerLatitude / centerLongitude | 서버 조회 좌표의 스냅샷 |
| zoomLevel / imageWidth / imageHeight | 사용한 생성 옵션 |
| generationVersion | 생성 알고리즘·전체 고정 옵션 버전 |

Mock storageKey는 `mock-only/sites/{siteId}/location-map/{generationId}.png`. 이 키에 해당하는 객체는 존재하지 않는다. 정상 저장 상태와 재생성 이전 상태는 새로고침 전 MSW 메모리에만 남는다. 동적 지도 미리보기를 이미지 파일인 것처럼 표시하지 않는다.

실패 검증은 테스트에서 `X-Demo-Location-Map-Failure:true`로 503을 요청한다. 작업자 화면의 실패 조작과 메타데이터 UI는 제거했다. 성공 캐시를 변조하지 않는다. 서버 운영 계약에는 이 테스트 헤더가 없으며 운영 클라이언트는 보내지 않는다.

## 사용자 화면과 지도 위치 수정 (2026-10-23 보완)

- 기본 화면은 하나의 위치도만 보여준다. 미저장 시 저장 버튼, 저장 완료 시 상태만, 좌표 변경 시 다시 생성 버튼을 제공한다. 현재 좌표/저장 기준 비교 탭과 재사용 버튼은 제거했다. 유효 자산 재사용은 자동이며 조회만으로 POST하지 않는다.
- `위치 수정` → 지도 이동/확대 후 지점 클릭 → 단일 마커 임시 이동 → `위치 저장`으로 확정한다. 취소는 원래 좌표로 복귀하고 API를 호출하지 않는다. 미등록 좌표는 `위치 지정`에서 업무 지역 지도만 제공하며 사용자가 클릭하기 전 수용가 마커를 임의로 표시하지 않는다.
- PATCH /api/sites/:id/coordinates는 목표 좌표와 expectedLatitude/expectedLongitude를 받는다. Mock은 조건부 갱신과 유효 좌표를 검사하고 같은 목표 재시도를 허용한다. 실제 서버는 기존 접근 권한과 활성 계정·CSRF 검사, coordinate_revision 조건부 UPDATE, 변경자/전후 값/시각 감사 로그를 적용할 것을 제안한다. 실제 구현은 아직 없다.
- 좌표 변경은 기존 파일을 덮어쓰거나 즉시 Static을 호출하지 않는다. 메타데이터를 보존하고 stale로 전환한다. 이후 명시적인 다시 생성 요청이 서버에 새로 저장된 좌표를 읽게 한다. 일반 페이지 이동이나 지도 클릭만으로 좌표를 저장하지 않는다.

## 서버 저장 절차와 멱등성 제안

1. 세션/권한/정책 활성화/입력 검증. DB 수용가 좌표와 version 읽기. generation fingerprint는 좌표 정규화 규칙 + 모든 생성 옵션 + generationVersion + 선택한 데이터 버전의 SHA-256으로 계산한다.
2. 짧은 트랜잭션에서 요청 레코드/수용가 생성 lease 확보. 유효 자산이면 재사용. 같은 키의 요청 본문 fingerprint가 다르면 409. 서버 다중 인스턴스에서도 DB unique 제약/lease로 직렬화한다. 프론트 잠금만 신뢰하지 않는다.
3. DB 트랜잭션을 열어 둔 채 외부 호출하지 않는다. lease 소유 요청이 Static Map을 호출하고 응답 이미지의 MIME/크기/디코딩/상한을 검사한다.
4. 비공개 R2에 `sites/{siteId}/location-map/{generationId}.png`로 업로드한다. 같은 키를 서로 다른 바이트로 덮어쓰지 않는다. generationId/요청 레코드에 키와 체크섬을 연결한다. URL은 메타데이터 식별자가 아니다.
5. 짧은 DB 트랜잭션에서 수용가 좌표/version 및 이전 active generation을 재확인하고 메타데이터 삽입 + active pointer 변경 + 요청 성공을 원자적으로 커밋한다. 갱신 충돌이면 409/자산 미활성으로 남긴다. 원래 유효 버전은 실패 시 유지한다.
6. 커밋 후 응답을 저장해 동일 키 재시도에 재생하지 않고 반환한다. 성공 응답 멱등 레코드는 최소 24시간 보관 제안. 실패한 요청은 재시도 가능한 상태로 두되 외부 단계 진행 기록으로 중복 유료 호출을 줄인다. 키 만료 후 일반 저장도 유효 자산 재사용 규칙이 적용된다.

### 제안 테이블 (아직 SQL/Flyway 미작성)

- `site_location_map_assets`: generation_id PK, site_id FK, 위 메타데이터, fingerprint, sha256, object_etag, created_by, coordinate_revision, state(READY/SUPERSEDED/ORPHAN). 실파일 size > 0, 중심 범위, 줌/크기 체크 제약. UNIQUE(storage_key). Mock 행은 운영 DB에 저장하지 않는다.
- 수용가의 active_location_map_id 및 coordinate_revision: 현재 버전 포인터. 좌표 변경 시 revision 증가. 상세 JSON에 image 본문을 섞지 않고 전용 GET으로 조회한다.
- `location_map_requests`: actor/site/idempotency_key UNIQUE, request_digest, target_fingerprint, generation_id, 단계/시각, lease 만료, 오류, 결과. 단일 프로세스 메모리 락 대신 재시작 복구 가능하게 한다. 별도 메시지 브로커는 도입하지 않고 작은 작업/재시도 프로세스로 시작한다.
- 구버전은 감사·이미 진행 중인 출력 작업 참조에 사용한다. 삭제 정책은 이용 허용 범위 확인 후 정하고 출력 작업이 참조하는 동안 GC에서 제외한다. 재생성했다고 즉시 이전 객체를 지우지 않는다.

### R2/DB 정합성 실패와 복구

| 실패 지점 | 제안 처리 |
| --- | --- |
| Static 실패 | DB 활성 자산 유지, 업로드 안 함, 오류·시도 기록 |
| R2 PUT 타임아웃 | 결과 불명으로 기록. 동일 예정 키 HEAD/메타데이터·체크섬 확인 후 다음 단계 재개. 무조건 Static 재호출하지 않음 |
| 업로드 성공/DB 커밋 실패 | ORPHAN/요청 기록으로 재연결 재시도. 현재 좌표·버전 불일치면 유예 후 미참조 객체만 정리 |
| DB 성공/클라이언트 응답 유실 | 같은 멱등 키로 성공 결과 반환 |
| DB 기록 존재/R2 객체 누락 | 무결성 오류로 사용자·출력 실패 목록에 표시. 자동 일괄 Static 재생성 금지, 명시적 복구 작업 |
| 프로세스 중단/lease 만료 | 요청 단계와 예정 객체 키를 조사해 복구. 삭제 전 active/출력 작업 참조 검사 |

업로드 전/후 정리 로그를 남기고 정리 재시도도 멱등하게 한다. 객체 없는 메타데이터를 READY로 활성화하거나 클라이언트에 파일 저장 성공을 반환하지 않는다. DB/R2 분산 트랜잭션을 가정하지 않는다.

## NAVER 요청 및 비용 운영 제안

공식 [Static Map API](https://api.ncloud-docs.com/docs/ko/application-maps-static) 기준: 서버에서 GET `https://maps.apigw.ntruss.com/map-static/v2/raster`를 사용한다. `center=경도,위도`, `level=16`, `w=640`, `h=400`, `crs=EPSG:4326`, `format=png`, `maptype=basic`, `scale=1`, `lang=ko`, `markers=type:d|size:small|pos:경도 위도`를 URL 인코딩한다. 중심과 마커는 같은 DB 좌표이며 markers 항목은 하나다. API 허용 크기는 각 1~1024, level은 0~20이다. 비밀 인증은 서버 환경변수에서 `x-ncp-apigw-api-key-id`/`x-ncp-apigw-api-key` 헤더에만 넣고 브라우저 URL·VITE·응답·로그에 넣지 않는다.

[Maps 공통 응답](https://api.ncloud-docs.com/docs/application-maps-overview)을 기준으로 400/401은 설정·입력 수정 대상으로 자동 재시도하지 않는다. 429는 API 활성 설정/할당량/속도 제한을 구분한다. 5xx/타임아웃은 제한된 지수 backoff·jitter를 제안하며 최대 시도 수/시간 예산을 설정한다. 시도 자체가 과금될 수 있어 timeout을 미호출로 단정하지 않는다. 사용자에게 원본 비밀 헤더나 업스트림 전체 오류를 노출하지 않는다.

Dynamic 미리보기 호출, Static 생성 시도/재시도/재사용 적중, R2 PUT/GET을 별도로 집계한다. 최초 10,000건 저장은 최대 10,000건의 캐시 미스 생성 요청과 재시도 비용을 고려해야 하며 END 검침/상세/HWP를 열 때마다 재생성하지 않는다. 자동 재생성 배치도 이번 범위에 없다. 월 비용은 Static 유료 요청 수×계정 적용 단가 + 별도 R2 저장/요청 비용으로 추산하고 승인 전에 콘솔에서 무료량/단가·일/월 한도를 확인한다. 대표 계정 조건이 있으므로 무료를 전제하지 않는다. [공식 요금 안내](https://m.ncloud.com/charge/price/ko), [Maps 신청/한도 안내](https://guide.ncloud-docs.com/docs/application-maps-app-vpc).

## HWP/ZIP 연동 제안

1. 출력 요청의 수용가 목록과 데이터/자산 버전을 스냅샷으로 고정한다.
2. 해당 수용가의 유효 READY 위치도 메타데이터를 조회한다. 없거나 stale이면 항목 실패/보완 대상으로 기록한다. HWP 작업에서 Static 생성은 호출하지 않는다.
3. 허가 확인 후 비공개 R2에서 저장 객체를 읽고 LOCATION_MAP 영역에 출처 표시를 보존해 삽입한다. 클라이언트 presigned URL 대신 서버 storageKey를 사용한다.
4. OVERVIEW/START_CLOSEUP/END_CLOSEUP의 별도 사진 자산을 읽어 각 영역에 삽입한다. 단계별 1회 기록과 연결한다.
5. 개별 HWP를 생성하고 ZIP으로 순차 스트리밍한다. 전 이미지/1만 개 HWP를 메모리에 모으지 않는다. 항목별 누락/복구 대상과 진행 결과를 남긴다.
6. 작업 중 재생성이 발생해도 해당 출력 작업은 고정한 자산 버전을 유지한다. 좌표 변경으로 stale인 자산은 새로운 출력 요청에서 사용하지 않는다. 출력 캐시 키에 자료/템플릿/자산 버전을 포함한다.

실제 HWP 삽입 품질, ZIP 처리량, 이미지 품질/용량은 미측정이다. 실제 출력·백엔드 부하 검증이 완료되었다고 간주하지 않는다.
