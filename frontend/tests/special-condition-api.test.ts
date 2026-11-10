import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from '../src/mocks/handlers';
import { store } from '../src/mocks/store';

const server = setupServer(...handlers);
const initial = structuredClone(store);
beforeEach(() => {
  vi.stubGlobal('location', new URL('http://localhost/'));
  Object.assign(store, structuredClone(initial));
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.close();
  Object.assign(store, structuredClone(initial));
  vi.unstubAllGlobals();
});
it('MSW uses the live condition rules and preserves legacy notes', async () => {
  const site = store.sites[0];
  site.note = 'Legacy memo';
  const patch = (body: unknown) =>
    fetch(`http://localhost/api/sites/${site.id}/special-condition`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const other = await patch({ code: 'OTHER', description: ' 가상 현장 상황 ' });
  expect(other.status).toBe(200);
  expect((await other.json()).data.specialCondition.description).toBe('가상 현장 상황');
  const hope = await patch({ code: 'HOPE', description: 'stale' });
  const saved = (await hope.json()).data;
  expect(saved.specialCondition).toEqual({ code: 'HOPE', label: '호폐', description: '' });
  expect(saved.note).toBe('Legacy memo');
  for (const body of [{ code: 'OTHER' }, { code: 'OTHER', description: '  ' }, { code: 'UNKNOWN' }])
    expect((await patch(body)).status).toBe(400);
});
