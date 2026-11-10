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
it('shows null identifiers in API and assigns a number without replacing the site or its data', async () => {
  const site = store.sites[0];
  site.consumerNumber = null;
  const before = structuredClone(site);
  const detail = await (await fetch(`http://localhost/api/sites/${site.id}`)).json();
  expect(detail.data.consumerNumber).toBeNull();
  const response = await fetch(`http://localhost/api/admin/sites/${site.id}/consumer-number`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Demo-Role': 'ADMIN' },
    body: JSON.stringify({ consumerNumber: '  NEW-001  ' }),
  });
  expect(response.status).toBe(200);
  const saved = (await response.json()).data;
  expect(saved.id).toBe(before.id);
  expect(saved.consumerNumber).toBe('NEW-001');
  expect(saved.photos).toEqual(before.photos);
  expect(saved.inspections).toEqual(before.inspections);
});
it('rejects worker assignments, blank numbers, duplicates and overwriting existing numbers', async () => {
  const site = store.sites[0];
  site.consumerNumber = null;
  store.sites[1].consumerNumber = 'DUPLICATE';
  const patch = (consumerNumber: string, role = 'ADMIN') =>
    fetch(`http://localhost/api/admin/sites/${site.id}/consumer-number`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Demo-Role': role },
      body: JSON.stringify({ consumerNumber }),
    });
  expect((await patch('NEW', 'WORKER')).status).toBe(403);
  expect((await patch('  ')).status).toBe(400);
  expect((await patch('DUPLICATE')).status).toBe(409);
  expect(site.consumerNumber).toBeNull();
  expect((await patch('NEW')).status).toBe(200);
  expect((await patch('OVERWRITE')).status).toBe(409);
});
