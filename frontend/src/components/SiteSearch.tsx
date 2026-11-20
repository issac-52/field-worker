import { Button } from './ui/button';
import { Input } from './ui/input';
import { Search, X } from 'lucide-react';
import { useRef } from 'react';
import { useWork } from '../context/work';

export function SiteSearch() {
  const { query, setQuery, filter, setFilter } = useWork();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="search-panel">
        <div className="search-field">
          <Search size={19} aria-hidden="true" />
          <Input
            ref={input}
            type="search"
            enterKeyHint="search"
            aria-label="수용가 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="성명, 주소, 관리번호 검색"
          />
          {query && (
            <Button
              variant="ghost"
              type="button"
              size="icon"
              className="search-clear"
              aria-label="검색어 지우기"
              onClick={() => {
                setQuery('');
                input.current?.focus();
              }}
            >
              <X size={17} aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <div className="filters compact-filters" aria-label="검침 상태">
        {['전체', '미처리', '시작검침완료', '검침완료'].map((status) => (
          <Button
            variant="ghost"
            key={status}
            className={filter === status ? 'selected' : ''}
            aria-pressed={filter === status}
            aria-label={status}
            onClick={() => setFilter(status)}
          >
            {status === '시작검침완료' ? '시작 완료' : status}
          </Button>
        ))}
      </div>
    </>
  );
}
