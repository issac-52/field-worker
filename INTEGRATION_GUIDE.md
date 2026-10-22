# field-worker 기존 저장소 통합 패치

대상: https://github.com/issac-52/field-worker (master의 기존 backend/frontend/docs 구조 확인)

## 적용
1. **기존 저장소의 루트에서** `git switch -c feat/mobile-msw-demo` 실행
2. 이 ZIP 안의 `frontend/`와 `docs/`를 기존 저장소 루트에 **병합 복사** (폴더 자체를 삭제 후 교체하지 말 것)
3. `cd frontend && npm install` — postinstall 단계에서 `public/mockServiceWorker.js` 생성
4. `npm run dev` / `npm run build`
5. 개발자 도구에서 API가 `/api/*`로 MSW에 의해 모킹되는지 확인
6. `git add frontend docs && git commit -m "feat(frontend): add mobile-first MSW demonstration"`

## 주의
- 기존 `backend/`는 변경하지 않음.
- `frontend/src/pages/`, `frontend/src/shared/`, React Router 패키지 등 기존 파일은 삭제하지 않음. 이번 시연 화면에서는 `App.tsx`를 교체하여 과거 라우트가 일시적으로 사용되지 않음.
- 이번 시연은 MSW 목 서버가 응답하는 인메모리 데이터만 사용. 새로고침하면 수정 사항 초기화.
- 브라우저 사진 선택은 시연용이며 실제 R2 저장이 아님. 네이버 지도는 미연결, 지도 탭은 데모 UI.
- 실서비스 전에 인증, 연도별 조사 구분, 검침 수정 정책, 단가 수정 이력, 백업 및 개인정보 보호 구현 필요.
- Cloudflare Pages 빌드 설정: root `frontend`, build `npm run build`, output `dist`. 서비스 워커 파일 생성은 `npm install`의 postinstall에 의존함.
- `VITE_USE_MOCKS=false`는 현재 API 클라이언트의 상대 경로 `/api`로 실제 백엔드가 프록시되는 환경에서만 사용.
- 현재 실행·빌드 검증은 완료하지 못함 (패키지 레지스트리 접속 불가).
