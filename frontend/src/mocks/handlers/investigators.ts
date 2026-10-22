import { http } from 'msw';
import { store } from '../store';
import { ok, err, validPassword } from '../http';
import { paginate } from '../queries';

export const investigatorsHandlers = [
  http.get('/api/admin/investigators', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const status = params.get('status');
    return ok(
      paginate(
        store.users
          .filter(
            (u) =>
              u.role === 'WORKER' &&
              (!q || [u.name, u.username].some((v) => v.toLowerCase().includes(q))) &&
              (!status || (status === 'active' ? u.active : !u.active)),
          )
          .sort((a, b) => a.id - b.id),
        params,
      ),
    );
  }),
  http.post('/api/admin/investigators', async ({ request }) => {
    const b = (await request.json()) as import('../../types').CreateInvestigator;
    const username = typeof b.username === 'string' ? b.username.trim() : '';
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (
      !/^[A-Za-z0-9_.-]{3,32}$/.test(username) ||
      !name ||
      name.length > 40 ||
      !validPassword(b.temporaryPassword)
    )
      return err('아이디, 이름, 임시 비밀번호를 확인하세요.');
    if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase()))
      return err('이미 사용 중인 아이디입니다.', 409);
    const user: import('../../types').User = {
      id: Math.max(...store.users.map((u) => u.id)) + 1,
      name,
      username,
      role: 'WORKER',
      active: true,
      mustChangePassword: true,
    };
    store.users.push(user);
    return ok(user);
  }),
  http.patch('/api/admin/investigators/:id', async ({ params, request }) => {
    const user = store.users.find((u) => u.id === Number(params.id) && u.role === 'WORKER');
    if (!user) return err('조사자를 찾을 수 없습니다.', 404);
    const b = (await request.json()) as {
      name?: string;
      active?: boolean;
    };
    if (
      b.name !== undefined &&
      (typeof b.name !== 'string' || !b.name.trim() || b.name.trim().length > 40)
    )
      return err('이름을 확인하세요.');
    if (b.active !== undefined && typeof b.active !== 'boolean')
      return err('계정 상태를 확인하세요.');
    if (b.name !== undefined) user.name = b.name.trim();
    if (b.active !== undefined) user.active = b.active;
    return ok(user);
  }),
  http.post('/api/admin/investigators/:id/reset-password', async ({ params, request }) => {
    const user = store.users.find((u) => u.id === Number(params.id) && u.role === 'WORKER');
    if (!user) return err('조사자를 찾을 수 없습니다.', 404);
    const b = (await request.json()) as {
      temporaryPassword: string;
    };
    if (!validPassword(b.temporaryPassword)) return err('임시 비밀번호는 8~64자로 입력하세요.');
    user.mustChangePassword = true;
    return ok({
      userId: user.id,
      mustChangePassword: true,
      resetAt: new Date().toISOString(),
    });
  }),
];
