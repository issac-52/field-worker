import { Link } from 'react-router-dom';

export function MapPage() {
  return <section className="stack">
    <h1>현장 작업 지도</h1>
    <div className="stats">
      <div><small>전체</small><strong>—</strong></div>
      <div><small>완료</small><strong>—</strong></div>
      <div><small>미완료</small><strong>—</strong></div>
    </div>
    <div className="panel" aria-label="지도 예정 영역">
      <h2>지도 연결 예정</h2>
      <p>NAVER Maps SDK, 클러스터링, 완료/미완료 필터는 다음 단계에서 연결합니다.</p>
    </div>
    <Link to="/work/demo" className="link-card">작업 상세 예시 화면 →</Link>
  </section>;
}
