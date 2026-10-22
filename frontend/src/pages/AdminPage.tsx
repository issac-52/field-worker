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
  return (
    <>
      <section className="pagehead">
        <h1>관리자 메뉴</h1>
      </section>
      <div className="admin-grid">
        {CARDS.map(({ page, label, description, color, Icon }) => (
          <button className="admin-card" key={page} onClick={() => navigate(page)}>
            <span className={`quick-icon ${color}`}>
              <Icon size={24} />
            </span>
            <b>{label}</b>
            <small>{description}</small>
            <ArrowRight size={19} />
          </button>
        ))}
      </div>
      <section className="panel info-panel spaced">
        <div className="panel-title">
          <h3>조사자별 검침 현황</h3>
        </div>
        {users
          .filter((user) => user.role === 'WORKER')
          .map((user) => {
            const counts = summary.workers.find((worker) => worker.workerId === user.id);
            return (
              <div className="worker-row" key={user.id}>
                <div className="avatar">{user.name[0]}</div>
                <div>
                  <strong>{user.name}</strong>
                  <small>{user.active ? '활성' : '비활성'}</small>
                </div>
                <span>
                  시작 {counts?.startCount ?? 0} · 종료 {counts?.endCount ?? 0}
                </span>
              </div>
            );
          })}
      </section>
    </>
  );
}
