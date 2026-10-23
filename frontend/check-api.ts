import assert from 'node:assert/strict';
import { setupServer } from 'msw/node';
import { handlers } from './src/mocks/handlers';
import { checkLocationMaps } from './check-location-map';
import { store } from './src/mocks/store';
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
  await checkLocationMaps();
  const { data: blocks } = await call('/blocks');
  const { data: sitePage } = await call('/sites');
  const sites = sitePage.items;
  for (const [phase, completed, pending] of [
    ['START', 4, 8],
    ['END', 2, 10],
  ] as const) {
    const done = await call(
      `/sites?inspectionPhase=${phase}&inspectionStatus=COMPLETED&pageSize=2`,
    );
    const waiting = await call(`/sites?inspectionPhase=${phase}&inspectionStatus=PENDING`);
    assert.equal(done.data.total, completed);
    assert.equal(done.data.items.length, 2);
    assert.equal(waiting.data.total, pending);
    assert(done.data.items.every((site: any) => !!site.inspections[phase]));
    assert(waiting.data.items.every((site: any) => !site.inspections[phase]));
    assert.equal(
      (await call(`/site-summary?inspectionPhase=${phase}&inspectionStatus=PENDING`)).data.total,
      pending,
    );
    assert.equal((await call(`/sites?inspectionPhase=${phase}`)).data.total, 12);
  }
  const scopedMap = await call(
    `/sites?inspectionPhase=START&inspectionStatus=PENDING&smallBlockId=${sites[0].smallBlockId}`,
  );
  assert.equal(scopedMap.data.total, 1);
  assert.equal(scopedMap.data.items[0].id, 12);
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
  const workerPost = async (path: string, body: unknown) => {
    const response = await fetch('http://localhost/api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, ...(await response.json()) };
  };
  const measurement = { phase: 'START', date: '2026-11-05', reading: 12.345, workerId: 11 };
  assert.equal(
    (
      await workerPost('/sites/6/measurements', {
        ...measurement,
        phase: 'END',
        date: '2027-11-05',
      })
    ).status,
    400,
  );
  assert.equal(
    (await workerPost('/sites/6/measurements', { ...measurement, reading: -1 })).status,
    400,
  );
  assert.equal(
    (await workerPost('/sites/6/measurements', { ...measurement, date: '2026-02-30' })).status,
    400,
  );
  assert.equal(
    (await workerPost('/sites/6/measurements', { ...measurement, date: '2027-11-05' })).status,
    400,
  );
  assert.equal(
    (await workerPost('/sites/6/measurements', { ...measurement, workerId: 12 })).status,
    403,
  );
  const saved = await workerPost('/sites/6/measurements', measurement);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.inspections.START.workerId, 11);
  assert(!('fee' in saved.data.inspections.START));
  assert.equal((await workerPost('/sites/6/measurements', measurement)).status, 409);
  assert.equal(
    (
      await workerPost('/sites/6/measurements', {
        ...measurement,
        phase: 'END',
        date: '2027-11-05',
      })
    ).status,
    200,
  );
  const imageUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
  const photos = [
    { slot: 'OVERVIEW', url: imageUrl },
    { slot: 'END_CLOSEUP', url: imageUrl },
  ];
  assert.equal((await workerPost('/sites/6/photos', { photos })).status, 200);
  const remaining = await workerPost('/sites/6/photos', { photos: [photos[1]] });
  assert.deepEqual(
    remaining.data.photos.map((photo: any) => photo.slot),
    ['END_CLOSEUP'],
  );
  assert.equal(
    (await workerPost('/sites/6/photos', { photos: [photos[1], photos[1]] })).status,
    400,
  );
  assert.equal(
    (
      await workerPost('/sites/6/photos', {
        photos: [{ slot: 'OVERVIEW', url: 'https://example.com/photo' }],
      })
    ).status,
    400,
  );
  assert.equal((await workerPost('/sites/6/photos', { photos: [] })).data.photos.length, 0);
  const feeRule = (await call('/fee-rules')).data[0];
  const existingFee = (await call('/sites/5')).data.inspections.START.fee;
  const ruleChange = await fetch(`http://localhost/api/fee-rules/${feeRule.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Demo-Role': 'ADMIN' },
    body: JSON.stringify({ amount: 4100 }),
  });
  assert.equal(ruleChange.status, 200);
  assert.equal((await call('/sites/5')).data.inspections.START.fee, existingFee);
  assert.equal((await call('/sites/7/measurements', measurement)).data.inspections.START.fee, 4100);
  assert.equal(
    (
      await fetch(`http://localhost/api/fee-rules/${feeRule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1 }),
      })
    ).status,
    403,
  );
  console.log(
    'PASS: phase order/year/date/reading/identity validation, duplicate rejection, photo slot deletion and validation, future fee change preserves history',
  );
  console.log(
    'PASS: investigator create/duplicate/update/reset/status, disabled recording denied, history retained',
  );
  console.log(
    'PASS: bounded list pages, whole-result summaries, amount preview without loading all sites',
  );
  console.log('PASS: worker amount redaction, admin API denial, own worker identity only');
  console.log(
    'PASS: START/END pending/completed/all filters, bounded pages, scoped blocks and summary consistency',
  );
  console.log(
    'PASS: block hierarchy, scoped adjustment totals, unaffected blocks/phases, validation, audit history',
  );
  {
    const edit = async (id: number, phase: string, body: unknown, role = 'WORKER') => {
      const response = await fetch(`http://localhost/api/sites/${id}/measurements/${phase}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Demo-Role': role },
        body: JSON.stringify(body),
      });
      return { status: response.status, ...(await response.json()) };
    };
    const original = (await call('/sites/1')).data.inspections.START;
    const correction = {
      date: '2026-11-04',
      reading: original.reading + 5,
      expectedUpdatedAt: original.updatedAt ?? original.recordedAt,
    };
    const countBefore = store.measurementEdits.length;
    const corrected = await edit(1, 'START', correction);
    assert.equal(corrected.status, 200);
    assert.equal(corrected.data.inspections.START.reading, correction.reading);
    assert(!('fee' in corrected.data.inspections.START));
    const saved = (await call('/sites/1')).data.inspections.START;
    assert.equal(saved.fee, original.fee);
    assert.equal(saved.workerId, original.workerId);
    assert.equal(saved.recordedAt, original.recordedAt);
    assert.equal(store.measurementEdits.length, countBefore + 1);
    assert.equal((store.measurementEdits.at(-1)!.before as any).reading, original.reading);
    assert.equal((await edit(1, 'START', correction)).status, 409);
    const currentBody = { ...correction, expectedUpdatedAt: saved.updatedAt };
    assert.equal((await edit(1, 'START', currentBody)).status, 200);
    assert.equal(store.measurementEdits.length, countBefore + 1);
    assert.equal((await edit(1, 'START', { ...currentBody, date: '2026-02-30' })).status, 400);
    assert.equal((await edit(1, 'START', { ...currentBody, date: '2027-11-01' })).status, 400);
    assert.equal((await edit(1, 'START', { ...currentBody, reading: -1 })).status, 400);
    assert.equal((await edit(1, 'START', { ...currentBody, workerId: 12 })).status, 400);
    const end = (await call('/sites/1')).data.inspections.END;
    assert.notEqual(end.workerId, 11);
    const endBody = {
      date: end.date,
      reading: end.reading + 1,
      expectedUpdatedAt: end.updatedAt ?? end.recordedAt,
    };
    assert.equal((await edit(1, 'END', endBody)).status, 403);
    assert.equal((await edit(1, 'END', endBody, 'ADMIN')).status, 200);
    const concurrent = await Promise.all([
      edit(1, 'START', { ...currentBody, reading: saved.reading + 1 }),
      edit(1, 'START', { ...currentBody, reading: saved.reading + 2 }),
    ]);
    assert.deepEqual(concurrent.map((value) => value.status).sort(), [200, 409]);
    assert.equal((await edit(999999, 'START', correction)).status, 404);
    assert.equal((await edit(1, 'OTHER', correction)).status, 404);
    console.log(
      'PASS: START/END correction, own-worker/admin permissions, historical fee/worker/recordedAt preservation, audit snapshots, calendar validation, immutable ownership and concurrent-edit conflict',
    );
  }
} finally {
  server.close();
}
