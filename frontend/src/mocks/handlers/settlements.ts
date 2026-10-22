import { http } from 'msw';
import { store } from '../store';
import { ok } from '../http';
import { paginate, settlementRows } from '../queries';

export const settlementsHandlers = [
  http.get('/api/settlements', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const rows = settlementRows(store.sites, params);
    const workers = store.users
      .filter((u) => u.role === 'WORKER')
      .map((u) => {
        const own = rows.filter((row) => row.workerId === u.id);
        return {
          workerId: u.id,
          count: own.length,
          fee: own.reduce((sum, row) => sum + row.fee, 0),
        };
      });
    return ok({
      ...paginate(rows, params),
      summary: {
        totalFee: rows.reduce((sum, row) => sum + row.fee, 0),
        workers,
      },
    });
  }),
];
