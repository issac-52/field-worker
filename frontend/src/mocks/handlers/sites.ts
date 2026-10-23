import { http } from 'msw';
import { store } from '../store';
import { ok, err, isAdmin, publicSite, feeFor } from '../http';
import { filterSites, paginate, summarize } from '../queries';
import type { Phase, SitePhoto } from '../../types';
import { PHOTO_SLOTS } from '../../types';
import { blocks } from '../data';

export const sitesHandlers = [
  http.get('/api/blocks', () => ok(blocks)),
  http.get('/api/site-summary', ({ request }) =>
    ok(summarize(filterSites(store.sites, new URL(request.url).searchParams), isAdmin(request))),
  ),
  http.get('/api/sites', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const page = paginate(filterSites(store.sites, params), params);
    return ok({
      ...page,
      items: page.items.map((s) => {
        const { photos, note, ...item } = publicSite(s, request);
        return { ...item, photoCount: photos.length };
      }),
    });
  }),
  http.get('/api/sites/:id', ({ params, request }) => {
    const x = store.sites.find((s) => s.id === Number(params.id));
    return x ? ok(publicSite(x, request)) : err('수용가를 찾을 수 없습니다.', 404);
  }),
  http.patch('/api/sites/:id/note', async ({ params, request }) => {
    const x = store.sites.find((s) => s.id === Number(params.id));
    if (!x) return err('수용가 없음', 404);
    const b = (await request.json()) as {
      note: string;
    };
    x.note = b.note;
    return ok(publicSite(x, request));
  }),
  http.post('/api/sites/:id/measurements', async ({ params, request }) => {
    const x = store.sites.find((s) => s.id === Number(params.id));
    if (!x) return err('수용가 없음', 404);
    const b = (await request.json()) as {
      phase: Phase;
      date: string;
      reading: number;
      workerId: number;
    };
    if (
      !['START', 'END'].includes(b.phase) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
      !Number.isFinite(Date.parse(b.date)) ||
      new Date(b.date).toISOString().slice(0, 10) !== b.date ||
      !b.date.startsWith(b.phase === 'START' ? '2026-' : '2027-') ||
      !Number.isFinite(b.reading) ||
      b.reading < 0
    )
      return err('입력값을 확인하세요. START는 2026년, END는 2027년 검침입니다.');
    if (x.inspections[b.phase])
      return err('이미 등록된 단계입니다. 검침 수정 기능을 이용하세요.', 409);
    if (b.phase === 'END' && !x.inspections.START) return err('시작 검침을 먼저 완료하세요');
    if (b.phase === 'END' && x.inspections.START && b.date < x.inspections.START.date)
      return err('종료일은 시작일보다 빠를 수 없습니다');
    if (!isAdmin(request) && b.workerId !== 11) return err('본인 검침만 등록할 수 있습니다.', 403);
    const worker = store.users.find((u) => u.id === b.workerId && u.role === 'WORKER' && u.active);
    if (!worker) return err('작업자를 찾을 수 없습니다');
    x.inspections[b.phase] = {
      date: b.date,
      reading: b.reading,
      workerId: b.workerId,
      workerName: worker.name,
      fee: feeFor(b.phase, b.date),
      recordedAt: new Date().toISOString(),
    };
    return ok(publicSite(x, request));
  }),
  http.patch('/api/sites/:id/measurements/:phase', async ({ params, request }) => {
    const site = store.sites.find((value) => value.id === Number(params.id));
    const phase = params.phase as Phase;
    if (!site || !['START', 'END'].includes(phase)) return err('검침을 찾을 수 없습니다.', 404);
    const before = site.inspections[phase];
    if (!before) return err('등록된 검침이 없습니다.', 404);
    const actor = store.users.find((user) =>
      isAdmin(request) ? user.role === 'ADMIN' : user.id === 11,
    );
    if (!actor?.active || (!isAdmin(request) && before.workerId !== actor.id))
      return err('본인이 등록한 검침만 수정할 수 있습니다.', 403);
    let body: { date: string; reading: number; expectedUpdatedAt: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return err('입력값을 확인하세요.');
    }
    if (
      !body ||
      typeof body.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
      !Number.isFinite(Date.parse(body.date)) ||
      new Date(body.date).toISOString().slice(0, 10) !== body.date ||
      !body.date.startsWith(phase === 'START' ? '2026-' : '2027-') ||
      typeof body.reading !== 'number' ||
      !Number.isFinite(body.reading) ||
      body.reading < 0 ||
      Object.keys(body).some((key) => !['date', 'reading', 'expectedUpdatedAt'].includes(key))
    )
      return err('검침일자와 0 이상의 계량지침을 확인하세요.');
    const latest = site.inspections[phase]!;
    if (body.expectedUpdatedAt !== (latest.updatedAt ?? latest.recordedAt))
      return err('다른 수정이 반영되었습니다. 수정을 취소한 뒤 다시 열어주세요.', 409);
    if (
      (phase === 'START' && site.inspections.END && body.date > site.inspections.END.date) ||
      (phase === 'END' && (!site.inspections.START || body.date < site.inspections.START.date))
    )
      return err('시작·종료 검침일 순서를 확인하세요.');
    if (body.date === before.date && body.reading === before.reading)
      return ok(publicSite(site, request));
    const changedAt = new Date(
      Math.max(Date.now(), (before.updatedAt ? Date.parse(before.updatedAt) : 0) + 1),
    ).toISOString();
    const after = { ...before, date: body.date, reading: body.reading, updatedAt: changedAt };
    site.inspections[phase] = after;
    store.measurementEdits.push({
      siteId: site.id,
      phase,
      actorId: actor.id,
      changedAt,
      before: structuredClone(before),
      after: structuredClone(after),
    });
    return ok(publicSite(site, request));
  }),
  http.post('/api/sites/:id/photos', async ({ params, request }) => {
    const x = store.sites.find((s) => s.id === Number(params.id));
    if (!x) return err('수용가 없음', 404);
    const b = (await request.json()) as {
      photos: SitePhoto[];
    };
    if (!Array.isArray(b.photos) || b.photos.length > 3)
      return err('현장 사진은 최대 3개 영역입니다. 위치도는 자동 생성 API를 사용하세요.');
    if (
      b.photos.some(
        (photo) =>
          !photo ||
          !PHOTO_SLOTS.includes(photo.slot) ||
          typeof photo.url !== 'string' ||
          photo.url.length > 1500000 ||
          !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.url),
      ) ||
      new Set(b.photos.map((photo) => photo.slot)).size !== b.photos.length
    )
      return err('이미지 형식 또는 영역을 확인하세요. 같은 영역에 중복 등록할 수 없습니다.');
    x.photos = b.photos;
    return ok(publicSite(x, request));
  }),
];
