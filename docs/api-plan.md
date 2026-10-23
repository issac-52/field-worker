# 백엔드 구현 계획

업데이트: 2026-10-23. **설계 후보이며 실제 구현된 API는 GET /api/health뿐이다.** 현재 프론트가 호출하는 MSW 계약은 [API_CONTRACT.md](../frontend/API_CONTRACT.md)에 별도로 둔다.

## 현재 출발점

- Java 21/Spring Boot 3.5.6/Gradle/JPA/Flyway, PostgreSQL 17 방향.
- users V1, User/UserRole, UserRepository가 존재한다. UserService는 비어 있다.
- SecurityConfig는 health 외 요청을 거부한다. 실제 인증·업무 서비스·R2·출력 작업은 없다.
- 먼저 User의 Lombok/매핑과 Gradle 컴파일, DB 적용 이력 및 JPA 검증부터 확인한다. 마이그레이션 적용 여부 확인 없이 V1을 수정하지 않는다.

## 권장 구현 순서

1. 사용자·인증: 서버 세션 우선 검토, 로그인/로그아웃/본인/비밀번호 변경, 관리자 계정 발급/비활성화. CSRF·쿠키·CORS/도메인·세션 폐기 검증.
2. 수용가·입력: 실제 Excel 매핑/식별자 확정, 블록·페이지·전체 집계, START/END 등록과 정정·권한·동시 수정·영구 감사.
3. 사진: 비공개 R2 단기 업로드 URL → 서버 업로드 결과 검증/확정 → 권한 있는 조회. 4슬롯·원본/출력용 이미지·크기·고아 파일 정리 정책 결정.
4. 단가·정산: 과거 단가 보존, 소급 조정의 버전/대상 확인·감사, 확정/지급/취소 정책 확정.
5. 문서: 다음 작업인 HWP 한 건 PoC는 별도로 먼저 진행 가능하다. 업무 저장 연동·R2 사전 생성·ZIP은 실제 데이터 모델과 함께 구현한다.

## 후보 계약과 보류

- 인증 후보: POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me, PATCH /api/auth/password. CSRF 취득/응답 형식은 실제 인증 설계에서 확정한다.
- 업무 경로는 현재 Mock 계약을 출발점으로 삼되 Mock data URL·역할 헤더·사용자 ID 하드코딩은 운영 계약으로 사용하지 않는다.
- import 및 HWP/ZIP 작업은 생성 요청 → 작업 ID → 상태/진행률/실패 조회 → 완료 파일 다운로드 흐름으로 설계한다. 경로·DB 스키마는 아직 정하지 않았다.
- 전체 지도 조회는 [MAP_QUERY_DESIGN.md](MAP_QUERY_DESIGN.md), 출력은 [HWP_EXPORT_DESIGN.md](HWP_EXPORT_DESIGN.md)를 따른다. 지금은 메시지 브로커/별도 마이크로서비스를 추가하지 않는다.

개발자가 도메인/DB/핵심 로직을 주도하며, 코드 변경과 검증은 명시적 요청 범위에서 진행한다.
