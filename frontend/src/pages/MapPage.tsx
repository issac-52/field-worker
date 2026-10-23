import { useWork } from '../context/WorkContext';
import { FieldMap } from '../components/map/FieldMap';
import { Pagination } from '../components/Pagination';
import { SiteList } from '../components/SiteList';
import { SiteSearch } from '../components/SiteSearch';

export function MapPage() {
  const { sites, sitePage, openSite, changeListPage, loading } = useWork();
  return (
    <>
      <section className="pagehead">
        <h1>현장 지도</h1>
        <span className="head-count">{(sitePage?.total ?? 0).toLocaleString()}건</span>
      </section>
      <SiteSearch />
      <p className="map-range">
        현재 조회 범위:{' '}
        {sitePage?.total
          ? `${(sitePage.page - 1) * sitePage.pageSize + 1}–${Math.min(sitePage.page * sitePage.pageSize, sitePage.total)}`
          : '0'}{' '}
        / {(sitePage?.total ?? 0).toLocaleString()}건 · 페이지당 최대 20건
      </p>
      <FieldMap sites={sites} onSelect={openSite} />
      <section id="results" className="section-heading spaced">
        <h3>수용가 목록</h3>
        <span>페이지당 20건</span>
      </section>
      <SiteList sites={sites} onSelect={openSite} loading={loading} />
      <Pagination data={sitePage} onChange={changeListPage} />
    </>
  );
}
