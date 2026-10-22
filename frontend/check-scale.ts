import assert from 'node:assert/strict';
import { setupServer } from 'msw/node';
import { seedSites, expandSeed } from './src/mocks/data';
expandSeed(12050);
// Import after expanding the fixture so handlers clone the complete dataset.
const { handlers } = await import('./src/mocks/handlers');
Object.defineProperty(globalThis, 'location', {
  value: new URL('http://localhost/'),
});
const server = setupServer(...handlers);
server.listen({ onUnhandledRequest: 'error' });
const get = async (path: string) => {
  const response = await fetch('http://localhost/api' + path, {
    headers: { 'X-Demo-Role': 'ADMIN' },
  });
  assert.equal(response.status, 200);
  return (await response.json()).data;
};
try {
  const first = await get('/sites');
  const second = await get('/sites?page=2');
  const last = await get('/sites?page=603');
  assert.equal(first.total, 12050);
  assert.equal(first.items.length, 20);
  assert.equal(first.totalPages, 603);
  assert.equal(last.items.length, 10);
  assert.equal(new Set([...first.items, ...second.items].map((s) => s.id)).size, 40);
  assert(first.items.every((s) => !('photos' in s) && !('note' in s)));
  assert.equal((await get('/sites?pageSize=999999')).items.length, 100);
  const scope = 'smallBlockId=' + encodeURIComponent(seedSites[0].smallBlockId);
  const scoped = await get('/sites?' + scope);
  const summary = await get('/site-summary?' + scope);
  assert(scoped.total > 500);
  assert.equal(scoped.total, summary.total);
  assert(scoped.items.every((s) => s.smallBlockId === seedSites[0].smallBlockId));
  const search = await get('/sites?q=T012050');
  assert.equal(search.total, 1);
  assert.equal(search.items[0].id, 12050);
  const empty = await get('/sites?q=no-such-site&page=603');
  assert.equal(empty.total, 0);
  assert.equal(empty.page, 1);
  assert.equal(empty.items.length, 0);
  const finalScope = await get('/sites?' + scope + '&page=99999');
  assert.equal(finalScope.page, finalScope.totalPages);
  assert(finalScope.items.length > 0);
  const start = await get('/settlements?phase=START&pageSize=20');
  const nextStart = await get('/settlements?phase=START&pageSize=20&page=2');
  assert(start.total > 20);
  assert.equal(start.summary.totalFee, nextStart.summary.totalFee);
  assert.equal(
    start.summary.workers.reduce((sum, w) => sum + w.count, 0),
    start.total,
  );
  console.log(
    `PASS: 12,050 sites / 603 pages; scoped block ${scoped.total} sites; bounded payloads; whole-result summaries; search and empty/out-of-range pages`,
  );
} finally {
  server.close();
}
