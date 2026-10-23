# 프론트 검증 기록과 한계

업데이트: 2026-10-23. CI/테스트 통합 작업에서 아래 명령을 실제 실행했다. 로컬 Node 24.18.0/Windows 검증이며 GitHub Actions의 Node 22/Linux 실행 결과는 아직 없다. 기능은 [README](../frontend/README.md), 계약은 [API_CONTRACT](../frontend/API_CONTRACT.md)를 참고한다.

## 자동 검증

| 명령 (frontend) | 결과 |
| --- | --- |
| npm ci | 통과. 실행 중인 Vite의 Windows 네이티브 파일 잠금을 해제한 뒤 재설치 |
| npm run format:check | 통과. 소스/설정/새 테스트 포함 |
| npm run lint | 통과, 경고 0 |
| npm run typecheck | 앱 및 테스트/설정 모두 통과 |
| npm run test | Vitest 5개 파일, 10개 테스트 통과 |
| npm run test:coverage | 동일 10개 통과, V8 HTML/JSON 보고서 생성 |
| npm run test -- --sequence.shuffle --sequence.seed=42 | 순서를 섞어도 10개 통과 |
| npm run build | 운영 빌드 통과 |

기존 check 스크립트 5개도 전환 전에 실행해 통과를 확인했다. 원본의 assertion 호출 193개(api 96, scale 21, map 35, export 22, demo 19)를 보존하고 구독 해제 검증 1개를 추가한 뒤 기존 파일을 삭제했다. 테스트 개수는 시나리오 묶음 수이며 assertion 호출 횟수와 다르다.

| 새 테스트 | 보존한 범위 |
| --- | --- |
| tests/api.test.ts | 권한/금액 제외, 블록/페이지/요약, 계정/단가, 검침 등록·정정·동시 충돌, 사진 4종/중복/삭제/형식 |
| tests/scale.test.ts | 12,050건/603페이지, 블록 조건·응답 제한·전체 집계·검색·빈 결과/범위 초과 |
| tests/map.test.ts | 3상태 마커, 좌표/Geolocation 정리, fake DOM SDK 중복/실패/재시도. 가상 타이머, 외부 SDK 요청 없음 |
| tests/demo.test.ts | 시연 환경 조합·운영 혼입 거부, 역할/구독/초기화, 요청별 Mock 헤더 및 운영 헤더 제외 |
| tests/export.test.ts | XLSX 12행·35열 재조회, 앞자리 0·날짜·숫자·문자열, 12,050행 수집, 취소·중복·건수 변경 거부 |

전체 src/config 기준 커버리지는 statements 31.91%, branches 29.88%, functions 24.58%, lines 31.49%다. 기존 테스트는 API/순수 로직 위주이며 React 화면 렌더링은 포함하지 않는다. 커버리지 분모에서 화면을 제외해 수치를 높이지 않았다. 보고서는 로컬 frontend/coverage/index.html이며 Git에 포함하지 않는다.

Backend는 Java 21.0.12.1, Spring Boot 3.5.6, Gradle Wrapper 9.6.0에서 `./gradlew clean test --no-daemon`과 `./gradlew assemble --no-daemon`의 Windows 동등 명령(`.\gradlew.bat`)을 통과했다. 기존 health 단위 테스트 1개이며 실제 DB/Flyway/JPA 통합 테스트는 아니다.

## 브라우저 확인 이력

- 로컬 실제 NAVER 타일/마커, 블록 필터·선택, 지도 내 입력과 저장 후 재조회. 지도 SDK의 마커 정리 오류를 수정한 뒤 표시/이동 확인.
- 검침 날짜·지침 등록/정정, 작업자 금액 비노출, 관리자 역할 전환·직접 경로 제한, 새로고침 역할 초기화.
- 테스트 PNG 사진 선택·미리보기·Mock 저장·삭제 확인. 최종 네 번째 슬롯은 공통 정의와 API 회귀로 확인했으며 실기기 촬영은 아니다.
- Excel 실제 다운로드 파일을 재조회한 이력이 있다. 당시 행/열 수와 달리 최종 35열은 자동 회귀에서 확인했다.
- 수용가 180건/9페이지, 조사자 27명/2페이지, 검침 상세 174건/9페이지와 다음 페이지 이동. 지도 미처리 목록 64건의 2페이지도 확인.
- 상태 아이콘/범례·한 줄 수용가 목록·작은 탭, 화살표 페이징, 활성/비활성 체크박스의 전체 27/비활성 4/활성 23/둘 다 해제 시 빈 상태 확인.
- 최종 지도 시작검침완료 필터에서 총 58건/현재 페이지 파란 마커 20개 확인. 연도 선택 UI 제거 및 동일 상태 목록 확인.
- 여러 작업 단계에서 360/390/430/1280px 레이아웃을 점검했다. 최종 모든 화면×모든 크기를 다시 검사한 것은 아니며 목록/표 내부 가로 스크롤은 의도된 동작이다.

## 미검증·남은 과제

- 실제 로그인/세션/CSRF/서버 권한·DB/Flyway/JPA·R2·Excel 업로드·HWP/ZIP 생성은 프론트 검증에 포함하지 않는다.
- 실제 휴대폰 카메라/갤러리/키보드/GPS 수신과 운영 도메인의 NAVER 인증은 별도 점검한다. map.test.ts는 NAVER 실인증 시험이 아니다.
- 10,000건 이상 XLSX/HWP/ZIP 전체 생성 시간·최대 메모리·2GB 서버 공존·R2 전송/디스크/운영 부하는 미측정이다.
- ExcelJS 청크가 약 940kB이며 Vite 경고가 남는다. npm ci에서 moderate 2건이 보고됐다. 강제 버전 변경은 하지 않았다.
- 화면 파일 이동/대규모 HMR 중 stale import 또는 Mock 연결 오류가 나타난 경우 새로고침 후 복구했다. 이 기록은 운영 복구 보장을 의미하지 않는다.

검증하지 않은 사항은 완료로 기록하지 않는다. 원격 GitHub Actions 실행과 실제 운영 통합 검증은 별도다.
