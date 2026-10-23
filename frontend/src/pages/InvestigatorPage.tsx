import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Search } from 'lucide-react';
import { api } from '../api';
import { Pagination } from '../components/Pagination';
import { InvestigatorEditor } from '../components/investigators/InvestigatorEditor';
import type { InvestigatorAction } from '../components/investigators/InvestigatorEditor';
import { usePagePosition } from '../hooks/usePagePosition';

export function InvestigatorPage({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [action, setAction] = useState<InvestigatorAction>();
  const position = usePagePosition(JSON.stringify([search, status]));
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const list = useQuery({
    queryKey: ['investigators', search, status, position.page],
    queryFn: ({ signal }) =>
      api.investigators({ q: search, status, page: position.page, pageSize: 20 }, signal),
  });
  return (
    <>
      <Button variant="ghost" className="back" onClick={onBack}>
        <ArrowLeft size={17} />
        관리자 메뉴
      </Button>
      <section className="pagehead">
        <h1 className="sr-only">조사자 관리</h1>
        <Button
          variant="default"
          className="primary-btn"
          onClick={() => setAction({ mode: 'create' })}
        >
          <Plus size={16} />
          계정 생성
        </Button>
      </section>
      <div className="search-panel">
        <label className="search-field">
          <Search size={19} />
          <Input
            aria-label="조사자 검색"
            placeholder="이름 또는 아이디 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="account-status-filter">
          상태
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">전체</option>
            <option value="active">활성</option>
            <option value="inactive">비활성</option>
          </select>
        </label>
      </div>
      {list.error ? (
        <p className="adjust-result" role="alert">
          {list.error.message}
          <Button variant="ghost" className="text-btn" onClick={() => void list.refetch()}>
            다시 불러오기
          </Button>
        </p>
      ) : list.isPending ? (
        <p className="loading">불러오는 중...</p>
      ) : (
        <>
          <div className="account-list">
            {list.data.items.map((user) => (
              <article className="panel account-card" key={user.id}>
                <div className="account-heading">
                  <div>
                    <h3>{user.name}</h3>
                    <small>{user.username}</small>
                  </div>
                  <span className={`status ${user.active ? 'done' : 'todo'}`}>
                    {user.active ? '활성' : '비활성'}
                  </span>
                </div>
                <div className="account-actions">
                  <Button
                    variant="outline"
                    className="outline-btn"
                    onClick={() => setAction({ mode: 'edit', user })}
                  >
                    이름 수정
                  </Button>
                  <Button
                    variant="outline"
                    className="outline-btn"
                    onClick={() => setAction({ mode: 'password', user })}
                  >
                    비밀번호 재설정
                  </Button>
                  <Button
                    variant="outline"
                    className="outline-btn"
                    onClick={() => setAction({ mode: 'status', user })}
                  >
                    {user.active ? '비활성화' : '활성화'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!list.data.total && <p className="empty">검색 결과가 없습니다.</p>}
          <Pagination data={list.data} onChange={position.setPage} />
        </>
      )}
      {action && <InvestigatorEditor action={action} onClose={() => setAction(undefined)} />}
    </>
  );
}
