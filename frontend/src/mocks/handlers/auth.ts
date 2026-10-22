import { http } from 'msw';
import { store } from '../store';
import { ok, err, isAdmin } from '../http';

export const authHandlers = [
  http.all('/api/*', ({ request }) => {
    const path = new URL(request.url).pathname;
    if (!isAdmin(request) && !store.users.find((u) => u.id === 11)?.active)
      return err('비활성 계정입니다.', 403);
    if (
      !isAdmin(request) &&
      (path.startsWith('/api/admin/') ||
        path.startsWith('/api/fee-rules') ||
        path === '/api/settlements')
    )
      return err('관리자 전용 API입니다.', 403);
  }),
  http.get('/api/me', () => ok(store.users[0])),
  http.get('/api/users', ({ request }) => ok(isAdmin(request) ? store.users : [store.users[0]])),
];
