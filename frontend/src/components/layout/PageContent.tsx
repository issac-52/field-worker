import { Button } from '../ui/button';
import { useWork } from '../../context/work';
import { BlockFilters } from '../BlockFilters';
import { HomePage } from '../../pages/HomePage';
import { SitesPage } from '../../pages/SitesPage';
import { MapPage } from '../../pages/MapPage';
import { SiteDetailPage } from '../../pages/SiteDetailPage';
import { AdminPage } from '../../pages/AdminPage';
import { FeesPage } from '../../pages/FeesPage';
import { SettlementsPage } from '../../pages/SettlementsPage';
import { ReportsPage } from '../../pages/ReportsPage';
import { InvestigatorPage } from '../../pages/InvestigatorPage';

function CurrentPage() {
  const { page, siteId, navigate } = useWork();
  switch (page) {
    case 'home':
      return <HomePage />;
    case 'sites':
      return <SitesPage />;
    case 'map':
      return <MapPage />;
    case 'detail':
      return <SiteDetailPage key={siteId} />;
    case 'admin':
      return <AdminPage />;
    case 'fees':
      return <FeesPage />;
    case 'settlements':
      return <SettlementsPage />;
    case 'reports':
      return <ReportsPage />;
    case 'investigators':
      return <InvestigatorPage onBack={() => navigate('admin')} />;
  }
}

export function PageContent() {
  const { role, page, adminOnly, error, loading, refresh, navigate } = useWork();
  if (role === 'WORKER' && adminOnly)
    return (
      <section className="panel admin-pad">
        <h1>관리자 전용 화면</h1>
        <p>조사자 계정으로 접근할 수 없습니다.</p>
        <Button variant="default" className="primary-btn" onClick={() => navigate('home')}>
          홈으로 이동
        </Button>
      </section>
    );
  return (
    <>
      {!['detail', 'investigators'].includes(page) && <BlockFilters />}
      {error ? (
        <section className="panel admin-pad" role="alert">
          <p>{error.message}</p>
          <Button variant="outline" className="outline-btn" onClick={() => void refresh()}>
            다시 불러오기
          </Button>
        </section>
      ) : (
        <>
          {loading && !['sites', 'map', 'detail', 'investigators'].includes(page) && (
            <p className="loading" role="status">
              불러오는 중...
            </p>
          )}
          <CurrentPage />
        </>
      )}
    </>
  );
}
