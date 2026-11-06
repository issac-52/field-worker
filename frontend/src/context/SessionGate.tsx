import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { call, resetCsrf, ApiError } from '../api/client';
import type { User } from '../types';
import { SessionContext } from './session';
export function SessionGate({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!__MOCKS_ENABLED__);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [next, setNext] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUser(await call<User>('/me'));
      setError('');
    } catch (e) {
      setUser(null);
      if (!(e instanceof ApiError && e.status === 401))
        setError(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (__MOCKS_ENABLED__) return;
    void refresh();
    const expired = () => {
      void client.cancelQueries().then(() => {
        client.clear();
        void refresh();
      });
    };
    window.addEventListener('session-invalidated', expired);
    return () => window.removeEventListener('session-invalidated', expired);
  }, [refresh, client]);
  async function logout() {
    await call('/auth/logout', { method: 'POST' });
    resetCsrf();
    await client.cancelQueries();
    client.clear();
    setUser(null);
    setChanging(false);
    setPassword('');
    setNext('');
  }
  if (__MOCKS_ENABLED__) return children;
  if (loading)
    return (
      <main className="content">
        <p role="status">계정 확인 중…</p>
      </main>
    );
  if (!user || user.mustChangePassword || changing)
    return (
      <main className="content">
        <section className="panel" style={{ maxWidth: 440, margin: '48px auto' }}>
          <h1>{user ? '비밀번호 변경' : '수도관리 로그인'}</h1>
          {user?.mustChangePassword && <p>업무를 시작하려면 임시 비밀번호를 변경하세요.</p>}
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError('');
              try {
                if (user) {
                  await call('/auth/password', {
                    method: 'PATCH',
                    body: JSON.stringify({ currentPassword: password, newPassword: next }),
                  });
                  resetCsrf();
                  setUser(null);
                  setChanging(false);
                  await client.cancelQueries();
                  client.clear();
                  setError('변경한 비밀번호로 다시 로그인하세요.');
                } else {
                  await call('/auth/login', {
                    method: 'POST',
                    body: new URLSearchParams({ username, password }),
                  });
                  resetCsrf();
                  await refresh();
                }
                setPassword('');
                setNext('');
              } catch (e) {
                setError(e instanceof Error ? e.message : '요청 실패');
              } finally {
                setBusy(false);
              }
            }}
          >
            {!user && (
              <label className="field">
                아이디
                <input
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
            )}
            <label className="field">
              {user ? '현재 비밀번호' : '비밀번호'}
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {user && (
              <label className="field">
                새 비밀번호
                <input
                  type="password"
                  required
                  minLength={8}
                  maxLength={64}
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </label>
            )}
            {error && <p role="alert">{error}</p>}
            <button className="primary-btn" disabled={busy}>
              {busy ? '처리 중…' : user ? '비밀번호 변경' : '로그인'}
            </button>
            {user && !user.mustChangePassword && (
              <button type="button" onClick={() => setChanging(false)}>
                취소
              </button>
            )}
          </form>
        </section>
      </main>
    );
  return (
    <SessionContext.Provider value={{ user, logout, changePassword: () => setChanging(true) }}>
      {children}
    </SessionContext.Provider>
  );
}
