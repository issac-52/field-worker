import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';
import { MapPage } from './pages/MapPage';
import { WorkDetailPage } from './pages/WorkDetailPage';

export default function App() {
  const { pathname } = useLocation();
  return (
    <div className="app-shell">
      <header className="topbar">
        <strong>현장 작업 관리</strong>
        <span className="env-tag">MVP 구조 미리보기</span>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/work" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/work" element={<MapPage />} />
          <Route path="/work/:id" element={<WorkDetailPage />} />
          <Route path="/admin/*" element={<AdminPage />} />
          <Route path="*" element={<div>페이지를 찾을 수 없습니다.</div>} />
        </Routes>
      </main>
      {pathname !== '/login' && (
        <nav className="bottom-nav" aria-label="샘플 페이지 메뉴">
          <Link to="/work">작업 지도</Link>
          <Link to="/admin">관리자</Link>
          <Link to="/login">로그인</Link>
        </nav>
      )}
    </div>
  );
}
