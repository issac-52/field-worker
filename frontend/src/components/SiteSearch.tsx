import { Search } from 'lucide-react';
import { useWork } from '../context/WorkContext';

export function SiteSearch({ mapMode = false }: { mapMode?: boolean }) {
  const { query, setQuery, filter, setFilter, mapPhase, setMapPhase, mapFilter, setMapFilter } =
    useWork();
  return (
    <>
      <div className="search-panel">
        <label className="search-field">
          <Search size={19} />
          <input
            aria-label="수용가 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="성명, 주소, 관리번호 검색"
          />
        </label>
      </div>
      {mapMode ? (
        <div className="map-filter-bar">
          <label className="map-phase-filter">
            <select
              aria-label="처리 기준"
              value={mapPhase}
              onChange={(event) => setMapPhase(event.target.value as 'START' | 'END')}
            >
              <option value="START">2026 시작</option>
              <option value="END">2027 종료</option>
            </select>
          </label>
          <div className="filters" aria-label="지도 처리 상태">
            {(['미처리', '처리됨', '전체'] as const).map((status) => (
              <button
                key={status}
                className={mapFilter === status ? 'selected' : ''}
                aria-pressed={mapFilter === status}
                onClick={() => setMapFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="filters" aria-label="검침 상태">
          {['전체', '미처리', '시작검침완료', '완료'].map((status) => (
            <button
              key={status}
              className={filter === status ? 'selected' : ''}
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
