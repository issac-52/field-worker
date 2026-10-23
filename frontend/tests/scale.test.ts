import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SiteListItem, SettlementPage } from '../src/types';
import { setupServer } from 'msw/node';
import { seedSites, expandSeed } from '../src/mocks/data';
expandSeed(12050);
// Import after expanding the fixture so handlers clone the complete dataset.
const { handlers } = await import('../src/mocks/handlers');

const { store } = await import('../src/mocks/store');
const server = setupServer(...handlers);
const initialStore = structuredClone(store);
beforeEach(() => {
  vi.stubGlobal('location', new URL('http://localhost/'));
  Object.assign(store, structuredClone(initialStore));
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  server.close();
  Object.assign(store, structuredClone(initialStore));
  vi.unstubAllGlobals();
});
const get = async (path: string) => {
  const response = await fetch('http://localhost/api' + path, {
    headers: { 'X-Demo-Role': 'ADMIN' },
  });
  expect(response.status).toBe(200);
  return (await response.json()).data;
};
describe('scale regression', () => {
  it('preserves the existing scale workflow and validation', async () => {
    const first = await get('/sites');
    const second = await get('/sites?page=2');
    const last = await get('/sites?page=603');
    expect(first.total).toBe(12050);
    expect(first.items.length).toBe(20);
    expect(first.totalPages).toBe(603);
    expect(last.items.length).toBe(10);
    expect(new Set([...first.items, ...second.items].map((s: SiteListItem) => s.id)).size).toBe(40);
    expect(first.items.every((s: SiteListItem) => !('photos' in s) && !('note' in s))).toBeTruthy();
    expect((await get('/sites?pageSize=999999')).items.length).toBe(100);
    const scope = 'smallBlockId=' + encodeURIComponent(seedSites[0].smallBlockId);
    const scoped = await get('/sites?' + scope);
    const summary = await get('/site-summary?' + scope);
    expect(scoped.total > 500).toBeTruthy();
    expect(scoped.total).toBe(summary.total);
    expect(
      scoped.items.every((s: SiteListItem) => s.smallBlockId === seedSites[0].smallBlockId),
    ).toBeTruthy();
    const search = await get('/sites?q=T012050');
    expect(search.total).toBe(1);
    expect(search.items[0].id).toBe(12050);
    const empty = await get('/sites?q=no-such-site&page=603');
    expect(empty.total).toBe(0);
    expect(empty.page).toBe(1);
    expect(empty.items.length).toBe(0);
    const finalScope = await get('/sites?' + scope + '&page=99999');
    expect(finalScope.page).toBe(finalScope.totalPages);
    expect(finalScope.items.length > 0).toBeTruthy();
    const start = await get('/settlements?phase=START&pageSize=20');
    const nextStart = await get('/settlements?phase=START&pageSize=20&page=2');
    expect(start.total > 20).toBeTruthy();
    expect(start.summary.totalFee).toBe(nextStart.summary.totalFee);
    expect(
      start.summary.workers.reduce(
        (sum: number, w: SettlementPage['summary']['workers'][number]) => sum + w.count,
        0,
      ),
    ).toBe(start.total);
  });
});
