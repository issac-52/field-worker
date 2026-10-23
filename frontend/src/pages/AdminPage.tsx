import { useState } from 'react';
import { Button } from '../components/ui/button';
import { ArrowRight, Coins, FileText, Users, Wallet } from 'lucide-react';
import { useWork } from '../context/WorkContext';

const CARDS = [
  {
    page: 'investigators',
    label: '조사자 관리',
    description: '계정 생성 · 활성 상태 관리',
    color: 'blue',
    Icon: Users,
  },
  {
    page: 'fees',
    label: '작업비 관리',
    description: '기본 단가 · 기존 검침 일괄 변경',
    color: 'amber',
    Icon: Coins,
  },
  {
    page: 'settlements',
    label: '정산 내역',
    description: '조사자별 건수 · 작업비',
    color: 'mint',
    Icon: Wallet,
  },
  {
    page: 'reports',
    label: '문서 출력',
    description: '출력 대상 조회 · HWP 준비 중',
    color: 'blue',
    Icon: FileText,
  },
] as const;

export function AdminPage() {
  const { navigate, users, summary } = useWork();
  const [showActive, setShowActive] = useState(true);
  const [showInactive, setShowInactive] = useState(true);
  const workers = users.filter(
    (user) => user.role === 'WORKER' && (user.active ? showActive : showInactive),
  );
  return (
    <>
      <h1 className="sr-only">관리자 메뉴</h1>
      <div className="admin-grid">
        {CARDS.map(({ page, label, description, color, Icon }) => (
          <Button variant="ghost" className="admin-card" key={page} onClick={() => navigate(page)}>
            <span className={`quick-icon ${color}`}>
              <Icon size={24} />
            </span>
            <b>{label}</b>
            <small>{description}</small>
            <ArrowRight size={19} />
          </Button>
        ))}
      </div>
      <section className="panel info-panel spaced">
        <div className="panel-title">
          <h3>조사자별 검침 현황</h3>
          <div className="worker-status-filters">
            <label>
              <input
                type="checkbox"
                checked={showActive}
                onChange={(e) => setShowActive(e.target.checked)}
              />
              활성 계정
            </label>
            <label>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              비활성 계정
            </label>
          </div>
        </div>
        {workers.map((user) => {
          const counts = summary.workers.find((worker) => worker.workerId === user.id);
          return (
            <div className="worker-row" key={user.id}>
              <strong>{user.name}</strong>
              <span className={`status ${user.active ? 'done' : 'todo'}`}>
                {user.active ? '활성' : '비활성'}
              </span>
              <span>시작 {counts?.startCount ?? 0}</span>
              <span>종료 {counts?.endCount ?? 0}</span>
            </div>
          );
        })}
        {!workers.length && <p className="empty">선택한 계정 상태의 조사자가 없습니다.</p>}
      </section>
    </>
  );
}
