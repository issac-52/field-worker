import { it, expect, vi, afterEach } from 'vitest';
import worker from '../worker';
afterEach(() => vi.unstubAllGlobals());
it('preserves API cookies and csrf without caching', async () => {
  const assets = { fetch: vi.fn(async () => new Response('app')) };
  const fetch = vi.fn(
    async (...args: [Request]) =>
      new Response(args[0].url, { headers: { 'Set-Cookie': 'JSESSIONID=test; HttpOnly; Secure' } }),
  );
  vi.stubGlobal('fetch', fetch);
  const env = { ASSETS: assets, BACKEND_ORIGIN: 'https://backend.example' };
  await worker.fetch(new Request('https://frontend.example/'), env);
  expect(assets.fetch).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  const response = await worker.fetch(
    new Request('https://frontend.example/api/me', {
      headers: { Cookie: 'JSESSIONID=test', 'X-CSRF-TOKEN': 'token' },
    }),
    env,
  );
  const forwarded = fetch.mock.calls[0][0];
  expect(forwarded.url).toBe('https://backend.example/api/me');
  expect(forwarded.headers.get('cookie')).toBe('JSESSIONID=test');
  expect(forwarded.headers.get('X-CSRF-TOKEN')).toBe('token');
  expect(response.headers.get('set-cookie')).toContain('JSESSIONID=test');
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it('fails closed without backend configuration', async () => {
  expect(
    (
      await worker.fetch(new Request('https://app.example/api/me'), {
        ASSETS: { fetch: vi.fn() },
        BACKEND_ORIGIN: '',
      })
    ).status,
  ).toBe(503);
});
