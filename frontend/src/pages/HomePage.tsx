import { PwaInstallGuide } from '../components/PwaInstallGuide';
import { Input } from '../components/ui/input';
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
import { useWork } from '../context/work';
import { SiteList } from '../components/SiteList';

export function HomePage() {
  const { role, summary, sites, openOwnSites, navigate, openSite, loading, homeDate, setHomeDate } =
    useWork();
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
          <small>성명·주소·관리번호·기물번호</small>
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
      <section className="panel own-count spaced">
        <h3>{role === 'WORKER' ? '내 작업현황' : '전체 작업현황'}</h3>
        <label className="field">
          검침일 (비우면 전체 기간)
          <Input
            type="date"
            value={homeDate}
            onChange={(event) => setHomeDate(event.target.value)}
          />
        </label>
        <div>
          {(['START', 'END'] as const).map((phase) => {
            const label = phase === 'START' ? '시작검침' : '종료검침';
            const count =
              phase === 'START'
                ? role === 'WORKER'
                  ? summary.ownStartCount
                  : summary.startCount
                : role === 'WORKER'
                  ? summary.ownEndCount
                  : summary.endCount;
            const value = loading ? '조회 중' : count.toLocaleString() + '건';
            return role === 'WORKER' ? (
              <Button
                key={phase}
                variant="outline"
                className="outline-btn"
                disabled={loading}
                onClick={() => openOwnSites(phase)}
              >
                {label} <strong>{value}</strong>
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            ) : (
              <p key={phase}>
                {label} <strong>{value}</strong>
              </p>
            );
          })}
        </div>
      </section>
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
        <Button variant="ghost" className="text-btn" onClick={() => openOwnSites()}>
          전체보기
          <ArrowRight size={15} />
        </Button>
      </section>
      <SiteList sites={sites} onSelect={openSite} loading={loading} />
      {!__MOCKS_ENABLED__ && <PwaInstallGuide />}
    </>
  );
}
