import { useWork } from '../context/WorkContext';
import { Pagination } from '../components/Pagination';
import { SiteList } from '../components/SiteList';
import { SiteSearch } from '../components/SiteSearch';

export function SitesPage() {
  const { sites, sitePage, openSite, changeListPage, loading } = useWork();
  return (
    <>
      <h1 className="sr-only">수용가 관리</h1>
      <SiteSearch />
      <section id="results" className="list-meta">
        <b>검색 결과 {(sitePage?.total ?? 0).toLocaleString()}건</b>
        <span>관리번호 순 · 20건씩</span>
      </section>
      <SiteList sites={sites} onSelect={openSite} loading={loading} />
      <Pagination data={sitePage} onChange={changeListPage} />
    </>
  );
}
