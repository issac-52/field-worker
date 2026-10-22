import { http } from 'msw';
import { store } from '../store';
import { ok, err, isAdmin, publicSite, feeFor } from '../http';
import { filterSites, paginate, summarize } from '../queries';
import type { Phase } from '../../types';
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
      !b.date ||
      !Number.isFinite(b.reading) ||
      b.reading < 0
    )
      return err('입력값을 확인하세요');
    if (x.inspections[b.phase])
      return err('이미 등록된 단계입니다. 수정은 관리자 기능으로 별도 처리해야 합니다.', 409);
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
  http.post('/api/sites/:id/photos', async ({ params, request }) => {
    const x = store.sites.find((s) => s.id === Number(params.id));
    if (!x) return err('수용가 없음', 404);
    const b = (await request.json()) as {
      photos: string[];
    };
    if (b.photos.length > 4) return err('사진은 최대 4장입니다');
    x.photos = b.photos;
    return ok(publicSite(x, request));
  }),
];
