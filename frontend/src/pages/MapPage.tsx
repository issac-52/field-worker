import { useWork } from '../context/WorkContext';
import { FieldMap } from '../components/map/FieldMap';
import { Pagination } from '../components/Pagination';
import { SiteList } from '../components/SiteList';
import { SiteSearch } from '../components/SiteSearch';
import { useState } from 'react';
import { MapInspection } from '../components/map/MapInspection';

export function MapPage() {
  const { sites, sitePage, changeListPage, loading } = useWork();
  const [selected, setSelected] = useState<number>();
  return (
    <>
      <h1 className="sr-only">현장 지도</h1>
      <SiteSearch />
      <FieldMap sites={sites} onSelect={setSelected} />
      {selected !== undefined && (
        <MapInspection
          key={selected}
          id={selected}
          initialPhase="START"
          onClose={() => setSelected(undefined)}
        />
      )}
      <section id="results" className="section-heading spaced">
        <h3>수용가 목록</h3>
        <span>현재 조회 페이지</span>
      </section>
      <SiteList sites={sites} onSelect={setSelected} loading={loading} />
      <Pagination data={sitePage} onChange={changeListPage} />
    </>
  );
}
