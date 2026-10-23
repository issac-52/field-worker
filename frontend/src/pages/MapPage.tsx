import { useWork } from '../context/WorkContext';
import { FieldMap } from '../components/map/FieldMap';
import { Pagination } from '../components/Pagination';
import { SiteList } from '../components/SiteList';
import { SiteSearch } from '../components/SiteSearch';
import { useState } from 'react';
import { MapInspection } from '../components/map/MapInspection';

export function MapPage() {
  const { sites, sitePage, changeListPage, loading, mapPhase } = useWork();
  const [selected, setSelected] = useState<number>();
  return (
    <>
      <section className="pagehead">
        <h1>현장 지도</h1>
        <span className="head-count">{(sitePage?.total ?? 0).toLocaleString()}건</span>
      </section>
      <SiteSearch mapMode />
      <FieldMap sites={sites} onSelect={setSelected} phase={mapPhase} />
      {selected !== undefined && (
        <MapInspection
          key={selected}
          id={selected}
          initialPhase={mapPhase}
          onClose={() => setSelected(undefined)}
        />
      )}
      <section id="results" className="section-heading spaced">
        <h3>수용가 목록</h3>
        <span>현재 조회 페이지</span>
      </section>
      <SiteList sites={sites} onSelect={setSelected} loading={loading} phase={mapPhase} />
      <Pagination data={sitePage} onChange={changeListPage} />
    </>
  );
}
