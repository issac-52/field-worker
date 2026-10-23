import { http } from 'msw';
import { isAdmin, ok, err } from '../http';
import { store } from '../store';
import { filterSites, paginate } from '../queries';

export const exportHandlers = [
  http.get('/api/exports/sites', ({ request }) => {
    if (!isAdmin(request)) return err('관리자만 엑셀을 다운로드할 수 있습니다.', 403);
    const params = new URL(request.url).searchParams;
    const page = paginate(filterSites(store.sites, params), params);
    return ok({
      ...page,
      items: page.items.map((site) => {
        const { photos, ...values } = site;
        return {
          ...values,
          photoSlots: photos.map((photo) => photo.slot),
        };
      }),
    });
  }),
];
