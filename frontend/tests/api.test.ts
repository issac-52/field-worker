import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Site, Block, User, SitePhoto } from '../src/types';
import { setupServer } from 'msw/node';
import { handlers } from '../src/mocks/handlers';
import { store } from '../src/mocks/store';

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
const call = async (path: string, body?: unknown) => {
  const response = await fetch('http://localhost/api' + path, {
    headers: { 'Content-Type': 'application/json', 'X-Demo-Role': 'ADMIN' },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, ...(await response.json()) };
};
describe('api regression', () => {
  it('preserves the existing api workflow and validation', async () => {
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
      expect(done.data.total).toBe(completed);
      expect(done.data.items.length).toBe(2);
      expect(waiting.data.total).toBe(pending);
      expect(done.data.items.every((site: Site) => !!site.inspections[phase])).toBeTruthy();
      expect(waiting.data.items.every((site: Site) => !site.inspections[phase])).toBeTruthy();
      expect(
        (await call(`/site-summary?inspectionPhase=${phase}&inspectionStatus=PENDING`)).data.total,
      ).toBe(pending);
      expect((await call(`/sites?inspectionPhase=${phase}`)).data.total).toBe(12);
    }
    const scopedMap = await call(
      `/sites?inspectionPhase=START&inspectionStatus=PENDING&smallBlockId=${sites[0].smallBlockId}`,
    );
    expect(scopedMap.data.total).toBe(1);
    expect(scopedMap.data.items[0].id).toBe(12);
    for (const s of sites) {
      expect(
        blocks.some((b: Block) => b.id === s.smallBlockId && b.parentId === s.middleBlockId),
      ).toBeTruthy();
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
    expect(preview.data.targetCount).toBe(3);
    expect(preview.data.beforeTotal).toBe(9000);
    expect(preview.data.afterTotal).toBe(9600);
    const result = await call('/admin/fee-adjustments', body);
    expect(result.data.updatedCount).toBe(3);
    expect(result.data.beforeTotal).toBe(9000);
    expect(result.data.afterTotal).toBe(9600);
    const { data: afterPage } = await call('/sites');
    const after = afterPage.items;
    expect(after[3].inspections.START.fee).toBe(3000);
    expect(after[0].inspections.END.fee).toBe(3500);
    expect((await call('/admin/fee-adjustments', { ...body, amount: -1 })).status).toBe(400);
    expect((await call('/admin/fee-adjustments', { ...body, phase: 'BAD' })).status).toBe(400);
    expect((await call('/admin/fee-adjustments')).data.length).toBe(1);
    const workerSites = await (await fetch('http://localhost/api/sites')).json();
    for (const s of workerSites.data.items) {
      expect(!('photos' in s)).toBeTruthy();
      for (const m of Object.values(s.inspections)) expect(!('fee' in (m as object))).toBeTruthy();
    }
    expect((await fetch('http://localhost/api/settlements')).status).toBe(403);
    expect((await fetch('http://localhost/api/fee-rules')).status).toBe(403);
    expect((await fetch('http://localhost/api/admin/fee-adjustments')).status).toBe(403);
    const workerUsers = await (await fetch('http://localhost/api/users')).json();
    expect(workerUsers.data.map((u: User) => u.id)).toStrictEqual([11]);
    const firstPage = await call('/sites?page=1&pageSize=2');
    const secondPage = await call('/sites?page=2&pageSize=2');
    expect(firstPage.data.items.length).toBe(2);
    expect(firstPage.data.total).toBe(12);
    expect(firstPage.data.items[0].id).not.toBe(secondPage.data.items[0].id);
    const summary = await call('/site-summary');
    expect(summary.data.total).toBe(12);
    expect(summary.data.startCount).toBe(4);
    expect(summary.data.ownEndCount).toBe(0);
    const settlement = await call('/settlements?pageSize=1');
    expect(settlement.data.items.length).toBe(1);
    expect(settlement.data.total).toBe(6);
    expect(settlement.data.summary.totalFee).toBe(19600);
    const workerSummary = await (await fetch('http://localhost/api/site-summary')).json();
    expect(workerSummary.data.workers).toStrictEqual([]);
    expect(!JSON.stringify(workerSummary).includes('fee')).toBeTruthy();
  });
  it('validates investigator lifecycle, measurements, photos and historical fees', async () => {
    expect((await fetch('http://localhost/api/admin/investigators')).status).toBe(403);
    expect(
      (
        await fetch('http://localhost/api/admin/investigators', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(403);
    const created = await call('/admin/investigators', {
      username: 'test.worker',
      name: '테스트 조사자',
      temporaryPassword: 'test-only-123',
    });
    expect(created.status).toBe(200);
    expect(created.data.active).toBe(true);
    expect(created.data.role).toBe('WORKER');
    expect(!JSON.stringify(created).includes('test-only-123')).toBeTruthy();
    expect(
      (
        await call('/admin/investigators', {
          username: 'TEST.WORKER',
          name: '중복',
          temporaryPassword: 'test-only-123',
        })
      ).status,
    ).toBe(409);
    const id = created.data.id;
    const update = async (body: unknown) =>
      fetch(`http://localhost/api/admin/investigators/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Demo-Role': 'ADMIN' },
        body: JSON.stringify(body),
      });
    expect((await update({ name: '수정 조사자', active: false })).status).toBe(200);
    expect(
      (
        await call('/sites/5/measurements', {
          phase: 'START',
          date: '2026-11-04',
          reading: 100,
          workerId: id,
        })
      ).status,
    ).toBe(400);
    expect((await call('/sites/5')).data.inspections.START).toBe(undefined);
    const reset = await call(`/admin/investigators/${id}/reset-password`, {
      temporaryPassword: 'new-test-only-123',
    });
    expect(reset.data.mustChangePassword).toBe(true);
    expect(!JSON.stringify(reset).includes('new-test-only-123')).toBeTruthy();
    expect(
      (
        await call(`/admin/investigators/${id}/reset-password`, {
          temporaryPassword: 'short',
        })
      ).status,
    ).toBe(400);
    await update({ active: true });
    const recorded = await call('/sites/5/measurements', {
      phase: 'START',
      date: '2026-11-04',
      reading: 100,
      workerId: id,
    });
    expect(recorded.data.inspections.START.workerName).toBe('수정 조사자');
    await update({ active: false });
    expect((await call('/sites/5')).data.inspections.START.workerId).toBe(id);
    const workerPost = async (path: string, body: unknown) => {
      const response = await fetch('http://localhost/api' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: response.status, ...(await response.json()) };
    };
    const measurement = { phase: 'START', date: '2026-11-05', reading: 12.345, workerId: 11 };
    expect(
      (
        await workerPost('/sites/6/measurements', {
          ...measurement,
          phase: 'END',
          date: '2027-11-05',
        })
      ).status,
    ).toBe(400);
    expect(
      (await workerPost('/sites/6/measurements', { ...measurement, reading: -1 })).status,
    ).toBe(400);
    expect(
      (await workerPost('/sites/6/measurements', { ...measurement, date: '2026-02-30' })).status,
    ).toBe(400);
    expect(
      (await workerPost('/sites/6/measurements', { ...measurement, date: '2027-11-05' })).status,
    ).toBe(400);
    expect(
      (await workerPost('/sites/6/measurements', { ...measurement, workerId: 12 })).status,
    ).toBe(403);
    const saved = await workerPost('/sites/6/measurements', measurement);
    expect(saved.status).toBe(200);
    expect(saved.data.inspections.START.workerId).toBe(11);
    expect(!('fee' in saved.data.inspections.START)).toBeTruthy();
    expect((await workerPost('/sites/6/measurements', measurement)).status).toBe(409);
    expect(
      (
        await workerPost('/sites/6/measurements', {
          ...measurement,
          phase: 'END',
          date: '2027-11-05',
        })
      ).status,
    ).toBe(200);
    const imageUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
    const fourPhotos = ['OVERVIEW', 'START_CLOSEUP', 'END_CLOSEUP', 'TEMPORARY'].map((slot) => ({
      slot,
      url: imageUrl,
    }));
    const savedFour = await workerPost('/sites/6/photos', { photos: fourPhotos });
    expect(savedFour.status).toBe(200);
    expect(savedFour.data.photos.length).toBe(4);
    expect(
      (await workerPost('/sites/6/photos', { photos: [...fourPhotos, fourPhotos[0]] })).status,
    ).toBe(400);
    const photos = [
      { slot: 'OVERVIEW', url: imageUrl },
      { slot: 'END_CLOSEUP', url: imageUrl },
    ];
    expect((await workerPost('/sites/6/photos', { photos })).status).toBe(200);
    const remaining = await workerPost('/sites/6/photos', { photos: [photos[1]] });
    expect(remaining.data.photos.map((photo: SitePhoto) => photo.slot)).toStrictEqual([
      'END_CLOSEUP',
    ]);
    expect((await workerPost('/sites/6/photos', { photos: [photos[1], photos[1]] })).status).toBe(
      400,
    );
    expect(
      (
        await workerPost('/sites/6/photos', {
          photos: [{ slot: 'OVERVIEW', url: 'https://example.com/photo' }],
        })
      ).status,
    ).toBe(400);
    expect((await workerPost('/sites/6/photos', { photos: [] })).data.photos.length).toBe(0);
    const feeRule = (await call('/fee-rules')).data[0];
    const existingFee = (await call('/sites/5')).data.inspections.START.fee;
    const ruleChange = await fetch(`http://localhost/api/fee-rules/${feeRule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Demo-Role': 'ADMIN' },
      body: JSON.stringify({ amount: 4100 }),
    });
    expect(ruleChange.status).toBe(200);
    expect((await call('/sites/5')).data.inspections.START.fee).toBe(existingFee);
    expect((await call('/sites/7/measurements', measurement)).data.inspections.START.fee).toBe(
      4100,
    );
    expect(
      (
        await fetch(`http://localhost/api/fee-rules/${feeRule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: 1 }),
        })
      ).status,
    ).toBe(403);
  });
  it('preserves corrections, ownership, audit and concurrent conflicts', async () => {
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
      expect(corrected.status).toBe(200);
      expect(corrected.data.inspections.START.reading).toBe(correction.reading);
      expect(!('fee' in corrected.data.inspections.START)).toBeTruthy();
      const saved = (await call('/sites/1')).data.inspections.START;
      expect(saved.fee).toBe(original.fee);
      expect(saved.workerId).toBe(original.workerId);
      expect(saved.recordedAt).toBe(original.recordedAt);
      expect(store.measurementEdits.length).toBe(countBefore + 1);
      expect((store.measurementEdits.at(-1)!.before as { reading: number }).reading).toBe(
        original.reading,
      );
      expect((await edit(1, 'START', correction)).status).toBe(409);
      const currentBody = { ...correction, expectedUpdatedAt: saved.updatedAt };
      expect((await edit(1, 'START', currentBody)).status).toBe(200);
      expect(store.measurementEdits.length).toBe(countBefore + 1);
      expect((await edit(1, 'START', { ...currentBody, date: '2026-02-30' })).status).toBe(400);
      expect((await edit(1, 'START', { ...currentBody, date: '2027-11-01' })).status).toBe(400);
      expect((await edit(1, 'START', { ...currentBody, reading: -1 })).status).toBe(400);
      expect((await edit(1, 'START', { ...currentBody, workerId: 12 })).status).toBe(400);
      const end = (await call('/sites/1')).data.inspections.END;
      expect(end.workerId).not.toBe(11);
      const endBody = {
        date: end.date,
        reading: end.reading + 1,
        expectedUpdatedAt: end.updatedAt ?? end.recordedAt,
      };
      expect((await edit(1, 'END', endBody)).status).toBe(403);
      expect((await edit(1, 'END', endBody, 'ADMIN')).status).toBe(200);
      const concurrent = await Promise.all([
        edit(1, 'START', { ...currentBody, reading: saved.reading + 1 }),
        edit(1, 'START', { ...currentBody, reading: saved.reading + 2 }),
      ]);
      expect(concurrent.map((value) => value.status).sort()).toStrictEqual([200, 409]);
      expect((await edit(999999, 'START', correction)).status).toBe(404);
      expect((await edit(1, 'OTHER', correction)).status).toBe(404);
    }
  });
});
