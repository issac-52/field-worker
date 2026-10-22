import { Search } from 'lucide-react';
import { useWork } from '../context/WorkContext';

export function SiteSearch() {
  const { query, setQuery, filter, setFilter } = useWork();
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
      <div className="filters" aria-label="검침 상태">
        {['전체', '미시작', '진행중', '완료'].map((status) => (
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
    </>
  );
}
