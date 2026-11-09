import { it, expect, vi, afterEach, beforeEach } from 'vitest';
import { resetCsrf } from '../src/api/client';
beforeEach(() => resetCsrf());
import { geocodingBatch } from '../src/lib/geocodingBatch';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('retries Cloudflare HTML 502 with the identical cursor and preserves the next result', async () => {
  vi.stubGlobal('__MOCKS_ENABLED__', false);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ data: { headerName: 'X-CSRF-TOKEN', token: 'test' } }))
    .mockResolvedValueOnce(
      new Response('<html>trycloudflare.com | 502: Bad gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        success: true,
        data: { nextId: 100, throughId: 200, done: false, rows: [] },
      }),
    );
  vi.stubGlobal('fetch', fetch);
  const result = await geocodingBatch({ afterId: 10, throughId: 200 }, async () => {});
  expect(result.nextId).toBe(100);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[2][1].body);
});
it('does not retry authentication or NAVER errors', async () => {
  vi.stubGlobal('__MOCKS_ENABLED__', false);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ data: { headerName: 'X-CSRF-TOKEN', token: 'test' } }))
    .mockResolvedValueOnce(
      Response.json(
        { success: false, code: 'GEOCODING_RATE_LIMITED', message: 'quota' },
        { status: 429 },
      ),
    );
  vi.stubGlobal('fetch', fetch);
  await expect(geocodingBatch({ afterId: 0 }, async () => {})).rejects.toMatchObject({
    code: 'GEOCODING_RATE_LIMITED',
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('stops after two connection retries instead of looping indefinitely', async () => {
  vi.stubGlobal('__MOCKS_ENABLED__', false);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ data: { headerName: 'X-CSRF-TOKEN', token: 'test' } }))
    .mockImplementation(() =>
      Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 })),
    );
  vi.stubGlobal('fetch', fetch);
  await expect(geocodingBatch({ afterId: 0 }, async () => {})).rejects.toMatchObject({
    code: 'GEOCODING_CONNECTION_FAILED',
  });
  expect(fetch).toHaveBeenCalledTimes(4);
});
