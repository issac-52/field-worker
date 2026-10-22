import assert from 'node:assert/strict';
import { setupServer } from 'msw/node';
import { handlers } from './src/mocks/handlers';
Object.defineProperty(globalThis, 'location', {
  value: new URL('http://localhost/'),
});
const server = setupServer(...handlers);
server.listen({ onUnhandledRequest: 'error' });
const call = async (path: string, body?: unknown) => {
  const response = await fetch('http://localhost/api' + path, {
    headers: { 'Content-Type': 'application/json', 'X-Demo-Role': 'ADMIN' },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, ...(await response.json()) };
};
try {
  const { data: blocks } = await call('/blocks');
  const { data: sitePage } = await call('/sites');
  const sites = sitePage.items;
  for (const s of sites) {
    assert(blocks.some((b: any) => b.id === s.smallBlockId && b.parentId === s.middleBlockId));
  }
  const body = {
    phase: 'START',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    amount: 3200,
    reason: '검증',
    middleBlockId: sites[0].middleBlockId,
    smallBlockId: sites[0].smallBlockId,
  };
  const preview = await call('/admin/fee-adjustments/preview', body);
  assert.equal(preview.data.targetCount, 3);
  assert.equal(preview.data.beforeTotal, 9000);
  assert.equal(preview.data.afterTotal, 9600);
  const result = await call('/admin/fee-adjustments', body);
  assert.equal(result.data.updatedCount, 3);
  assert.equal(result.data.beforeTotal, 9000);
  assert.equal(result.data.afterTotal, 9600);
  const { data: afterPage } = await call('/sites');
  const after = afterPage.items;
  assert.equal(after[3].inspections.START.fee, 3000);
  assert.equal(after[0].inspections.END.fee, 3500);
  assert.equal((await call('/admin/fee-adjustments', { ...body, amount: -1 })).status, 400);
  assert.equal((await call('/admin/fee-adjustments', { ...body, phase: 'BAD' })).status, 400);
  assert.equal((await call('/admin/fee-adjustments')).data.length, 1);
  const workerSites = await (await fetch('http://localhost/api/sites')).json();
  for (const s of workerSites.data.items) {
    assert(!('photos' in s));
    for (const m of Object.values(s.inspections)) assert(!('fee' in (m as object)));
  }
  assert.equal((await fetch('http://localhost/api/settlements')).status, 403);
  assert.equal((await fetch('http://localhost/api/fee-rules')).status, 403);
  assert.equal((await fetch('http://localhost/api/admin/fee-adjustments')).status, 403);
  const workerUsers = await (await fetch('http://localhost/api/users')).json();
  assert.deepEqual(
    workerUsers.data.map((u: any) => u.id),
    [11],
  );
  const firstPage = await call('/sites?page=1&pageSize=2');
  const secondPage = await call('/sites?page=2&pageSize=2');
  assert.equal(firstPage.data.items.length, 2);
  assert.equal(firstPage.data.total, 12);
  assert.notEqual(firstPage.data.items[0].id, secondPage.data.items[0].id);
  const summary = await call('/site-summary');
  assert.equal(summary.data.total, 12);
  assert.equal(summary.data.startCount, 4);
  assert.equal(summary.data.ownEndCount, 0);
  const settlement = await call('/settlements?pageSize=1');
  assert.equal(settlement.data.items.length, 1);
  assert.equal(settlement.data.total, 6);
  assert.equal(settlement.data.summary.totalFee, 19600);
  const workerSummary = await (await fetch('http://localhost/api/site-summary')).json();
  assert.deepEqual(workerSummary.data.workers, []);
  assert(!JSON.stringify(workerSummary).includes('fee'));

  assert.equal((await fetch('http://localhost/api/admin/investigators')).status, 403);
  assert.equal(
    (
      await fetch('http://localhost/api/admin/investigators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    ).status,
    403,
  );
  const created = await call('/admin/investigators', {
    username: 'test.worker',
    name: '테스트 조사자',
    temporaryPassword: 'test-only-123',
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.active, true);
  assert.equal(created.data.role, 'WORKER');
  assert(!JSON.stringify(created).includes('test-only-123'));
  assert.equal(
    (
      await call('/admin/investigators', {
        username: 'TEST.WORKER',
        name: '중복',
        temporaryPassword: 'test-only-123',
      })
    ).status,
    409,
  );
  const id = created.data.id;
  const update = async (body: unknown) =>
    fetch(`http://localhost/api/admin/investigators/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Demo-Role': 'ADMIN' },
      body: JSON.stringify(body),
    });
  assert.equal((await update({ name: '수정 조사자', active: false })).status, 200);
  assert.equal(
    (
      await call('/sites/5/measurements', {
        phase: 'START',
        date: '2026-11-04',
        reading: 100,
        workerId: id,
      })
    ).status,
    400,
  );
  assert.equal((await call('/sites/5')).data.inspections.START, undefined);
  const reset = await call(`/admin/investigators/${id}/reset-password`, {
    temporaryPassword: 'new-test-only-123',
  });
  assert.equal(reset.data.mustChangePassword, true);
  assert(!JSON.stringify(reset).includes('new-test-only-123'));
  assert.equal(
    (
      await call(`/admin/investigators/${id}/reset-password`, {
        temporaryPassword: 'short',
      })
    ).status,
    400,
  );
  await update({ active: true });
  const recorded = await call('/sites/5/measurements', {
    phase: 'START',
    date: '2026-11-04',
    reading: 100,
    workerId: id,
  });
  assert.equal(recorded.data.inspections.START.workerName, '수정 조사자');
  await update({ active: false });
  assert.equal((await call('/sites/5')).data.inspections.START.workerId, id);
  console.log(
    'PASS: investigator create/duplicate/update/reset/status, disabled recording denied, history retained',
  );
  console.log(
    'PASS: bounded list pages, whole-result summaries, amount preview without loading all sites',
  );
  console.log('PASS: worker amount redaction, admin API denial, own worker identity only');
  console.log(
    'PASS: block hierarchy, scoped adjustment totals, unaffected blocks/phases, validation, audit history',
  );
} finally {
  server.close();
}
