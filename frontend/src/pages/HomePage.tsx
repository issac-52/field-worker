import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPin,
  Search,
  Wallet,
} from 'lucide-react';
import { useWork } from '../context/WorkContext';
import { SiteList } from '../components/SiteList';

export function HomePage() {
  const { role, summary, sites, navigate, openSite, loading } = useWork();
  const cards = [
    { label: '전체 수용가', value: summary.total, Icon: ClipboardList },
    { label: '검침 완료', value: summary.done, Icon: CheckCircle2 },
    { label: '시작검침완료', value: summary.progress, Icon: Clock3 },
    { label: '미처리', value: summary.todo, Icon: Activity },
  ];
  return (
    <>
      <h3 className="sr-only">바로가기</h3>
      <div className="quick-grid">
        <Button variant="ghost" className="quick-card" onClick={() => navigate('sites')}>
          <span className="quick-icon mint">
            <Search size={22} />
          </span>
          <b>수용가 찾기</b>
          <small>성명·주소·관리번호</small>
          <ArrowRight size={17} />
        </Button>
        <Button variant="ghost" className="quick-card" onClick={() => navigate('map')}>
          <span className="quick-icon blue">
            <MapPin size={22} />
          </span>
          <b>현장 지도</b>
          <small>블록별 위치</small>
          <ArrowRight size={17} />
        </Button>
        {role === 'ADMIN' && (
          <Button variant="ghost" className="quick-card" onClick={() => navigate('settlements')}>
            <span className="quick-icon amber">
              <Wallet size={22} />
            </span>
            <b>정산 내역</b>
            <small>조사자별 건수·작업비</small>
            <ArrowRight size={17} />
          </Button>
        )}
      </div>
      <h1 className="sr-only">검침 현황</h1>
      {role === 'WORKER' && (
        <section className="panel own-count spaced">
          <h3>내 검침 건수</h3>
          <div>
            <span>
              시작
              <strong>
                {summary.ownStartCount.toLocaleString()}
                <small>건</small>
              </strong>
            </span>
            <span>
              종료
              <strong>
                {summary.ownEndCount.toLocaleString()}
                <small>건</small>
              </strong>
            </span>
          </div>
        </section>
      )}
      <div className="stats-grid spaced">
        {cards.map(({ label, value, Icon }) => (
          <Card className="stat-card" key={label}>
            <span className="iconbox">
              <Icon size={20} />
            </span>
            <small>{label}</small>
            <strong>
              {value.toLocaleString()}
              <em>건</em>
            </strong>
          </Card>
        ))}
      </div>
      <section className="section-heading spaced">
        <h3 className="sr-only">검침 대상</h3>
        <Button variant="ghost" className="text-btn" onClick={() => navigate('sites')}>
          전체보기
          <ArrowRight size={15} />
        </Button>
      </section>
      <SiteList sites={sites} onSelect={openSite} loading={loading} />
    </>
  );
}
