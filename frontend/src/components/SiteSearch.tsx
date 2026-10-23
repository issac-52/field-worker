import { Button } from './ui/button';
import { Input } from './ui/input';
import { Search } from 'lucide-react';
import { useWork } from '../context/work';

export function SiteSearch() {
  const { query, setQuery, filter, setFilter } = useWork();
  return (
    <>
      <div className="search-panel">
        <label className="search-field">
          <Search size={19} />
          <Input
            aria-label="수용가 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="성명, 주소, 관리번호 검색"
          />
        </label>
      </div>
      <div className="filters compact-filters" aria-label="검침 상태">
        {['전체', '미처리', '시작검침완료', '검침완료'].map((status) => (
          <Button
            variant="ghost"
            key={status}
            className={filter === status ? 'selected' : ''}
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {status}
          </Button>
        ))}
      </div>
    </>
  );
}
