import type { ReactNode } from 'react';
import {
  ClipboardList,
  Coins,
  Droplets,
  FileText,
  House,
  LayoutDashboard,
  MapPinned,
  Menu,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useWork } from '../../context/WorkContext';
import { PAGE_TITLES } from '../../hooks/useHashRoute';
import type { Page } from '../../hooks/useHashRoute';

const WORK_NAV = [
  { page: 'home', label: '대시보드', Icon: LayoutDashboard },
  { page: 'sites', label: '수용가 관리', Icon: ClipboardList },
  { page: 'map', label: '현장 지도', Icon: MapPinned },
] as const;
const ADMIN_NAV = [
  { page: 'admin', label: '관리자 메뉴', Icon: Users },
  { page: 'investigators', label: '조사자 관리', Icon: Users },
  { page: 'fees', label: '작업비 관리', Icon: Coins },
  { page: 'settlements', label: '정산 내역', Icon: Wallet },
  { page: 'reports', label: '문서 출력', Icon: FileText },
] as const;

function Brand() {
  return (
    <>
      <div className="brand-mark">
        <Droplets size={22} />
      </div>
      <b>수도관리</b>
    </>
  );
}

function NavItem({
  target,
  label,
  children,
}: {
  target: Page;
  label: string;
  children: ReactNode;
}) {
  const { page, navigate } = useWork();
  const active = page === target || (target === 'sites' && page === 'detail');
  return (
    <button
      className={`navbtn ${active ? 'active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => navigate(target)}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { page, role } = useWork();
  const admin = role === 'ADMIN';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Brand />
        </div>
        <nav className="side-menu" aria-label="전체 메뉴">
          <div className="side-label">현장 업무</div>
          {WORK_NAV.map(({ page, label, Icon }) => (
            <NavItem key={page} target={page} label={label}>
              <Icon size={19} />
            </NavItem>
          ))}
          {admin && (
            <>
              <div className="side-label sub">관리</div>
              {ADMIN_NAV.map(({ page, label, Icon }) => (
                <NavItem key={page} target={page} label={label}>
                  <Icon size={19} />
                </NavItem>
              ))}
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-profile">
            <div className="avatar">{admin ? '관' : '김'}</div>
            <div>
              <b>{admin ? '관리자' : '김민수'}</b>
              <small>{admin ? '관리자' : '조사자'}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="crumb">
            수도관리 <span>/</span>
            <b>{PAGE_TITLES[page]}</b>
          </div>
          <div className="top-actions">
            {import.meta.env.VITE_USE_MOCKS !== 'false' && <span className="demo-label">MOCK</span>}
            <span className="role-switch">
              <ShieldCheck size={15} />
              {admin ? '관리자' : '조사자'}
            </span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      <nav className="bottom-nav" aria-label="주요 메뉴">
        <NavItem target="home" label="홈">
          <House size={22} />
        </NavItem>
        <NavItem target="sites" label="수용가">
          <ClipboardList size={22} />
        </NavItem>
        <NavItem target="map" label="지도">
          <MapPinned size={22} />
        </NavItem>
        {admin && (
          <NavItem target="admin" label="관리">
            <Menu size={22} />
          </NavItem>
        )}
      </nav>
    </div>
  );
}
