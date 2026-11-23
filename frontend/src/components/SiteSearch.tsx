import { Button } from './ui/button';
import { Input } from './ui/input';
import { Search, X } from 'lucide-react';
import { useRef } from 'react';
import { useWork } from '../context/work';

export function SiteSearch() {
  const {
    query,
    setQuery,
    filter,
    setFilter,
    ownWork,
    setOwnWork,
    missingStartPhotos,
    setMissingStartPhotos,
  } = useWork();
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
      <div className="site-work-filters">
        <label>
          검침 담당
          <select
            value={ownWork ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              setOwnWork(
                value === 'ANY' || value === 'START' || value === 'END' ? value : undefined,
              );
            }}
          >
            <option value="">전체 조사자</option>
            <option value="ANY">내가 작업한 수용가</option>
            <option value="START">내가 시작검침한 수용가</option>
            <option value="END">내가 종료검침한 수용가</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={missingStartPhotos}
            onChange={(e) => setMissingStartPhotos(e.target.checked)}
          />
          시작검침 사진 누락 (원경 또는 시작 근경)
        </label>
      </div>
    </>
  );
}
