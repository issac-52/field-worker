import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { environmentPolicy } from '../config/environment';
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('__MOCKS_ENABLED__', false);
  vi.stubGlobal('__DEMO_SWITCH_ENABLED__', false);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it('uses backend by default in development', () => {
  expect(environmentPolicy('development', 'serve', {}).mocks).toBe(false);
});
it('adds CSRF and cookies without overriding multipart boundary or sending demo role', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, data: { headerName: 'X-CSRF-TOKEN', token: 'test-token' } }),
    )
    .mockResolvedValueOnce(Response.json({ success: true, data: { id: 1 } }));
  vi.stubGlobal('fetch', fetch);
  const { call } = await import('../src/api/client');
  const body = new FormData();
  body.append('file', new Blob(['synthetic']), 'test.xlsx');
  await call('/admin/imports', { method: 'POST', body });
  const init = fetch.mock.calls[1][1];
  expect(init.body).toBe(body);
  expect(init.credentials).toBe('same-origin');
  expect(init.headers.get('X-CSRF-TOKEN')).toBe('test-token');
  expect(init.headers.has('Content-Type')).toBe(false);
  expect(init.headers.has('X-Demo-Role')).toBe(false);
});
it('keeps conflict status and does not retry a mutation', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ success: true, data: { headerName: 'X-CSRF-TOKEN', token: 'token' } }),
    )
    .mockResolvedValueOnce(
      Response.json(
        { success: false, code: 'STALE_MEASUREMENT', message: '다시 조회하세요' },
        { status: 409 },
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const { call } = await import('../src/api/client');
  await expect(
    call('/sites/1/measurements/START', { method: 'PATCH', body: '{}' }),
  ).rejects.toMatchObject({ status: 409, code: 'STALE_MEASUREMENT' });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('does not create an authentication refresh loop for anonymous me', async () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', { dispatchEvent });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ success: false, code: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
  );
  const { call } = await import('../src/api/client');
  await expect(call('/me')).rejects.toMatchObject({ status: 401 });
  expect(dispatchEvent).not.toHaveBeenCalled();
});
