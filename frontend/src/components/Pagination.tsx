import { useEffect, useState } from 'react';
import type { PageResponse } from '../types';

export function Pagination({
  data,
  onChange,
}: {
  data?: Omit<PageResponse<unknown>, 'items'>;
  onChange: (page: number) => void;
}) {
  const page = data?.page ?? 1;
  const pages = data?.totalPages ?? 1;
  const [input, setInput] = useState(String(page));
  useEffect(() => setInput(String(page)), [page]);
  if (!data || data.total === 0) return null;
  const first = (page - 1) * data.pageSize + 1;
  const last = Math.min(data.total, page * data.pageSize);
  function jump() {
    const value = Number(input);
    if (Number.isInteger(value) && value >= 1 && value <= pages) onChange(value);
    else setInput(String(page));
  }
  return (
    <nav className="pagination" aria-label="목록 페이지 이동">
      <span>
        {first.toLocaleString()}–{last.toLocaleString()} / {data.total.toLocaleString()}건
      </span>
      {pages > 1 && (
        <div>
          <button className="outline-btn" disabled={page === 1} onClick={() => onChange(page - 1)}>
            이전
          </button>
          <label>
            <span className="sr-only">페이지 번호</span>
            <input
              aria-label="페이지 번호"
              type="number"
              min={1}
              max={pages}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onBlur={jump}
              onKeyDown={(e) => {
                if (e.key === 'Enter') jump();
              }}
            />
          </label>
          <span>/ {pages.toLocaleString()}</span>
          <button
            className="outline-btn"
            disabled={page === pages}
            onClick={() => onChange(page + 1)}
          >
            다음
          </button>
        </div>
      )}
    </nav>
  );
}
