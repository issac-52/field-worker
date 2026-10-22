import { statusOf } from '../types';
import type { PageResponse, Site, SiteSummary, SettlementRow } from '../types';

export function filterSites(sites: Site[], params: URLSearchParams) {
  const middle = params.get('middleBlockId');
  const small = params.get('smallBlockId');
  const q = (params.get('q') ?? '').trim().toLocaleLowerCase();
  const status = params.get('status');
  return sites
    .filter(
      (s) =>
        (!middle || s.middleBlockId === middle) &&
        (!small || s.smallBlockId === small) &&
        (!status || statusOf(s) === status) &&
        (!q ||
          [s.name, s.address, s.waterNo, s.managementNo, s.zone].some((v) =>
            v.toLocaleLowerCase().includes(q),
          )),
    )
    .sort(
      (a, b) =>
        a.managementNo.localeCompare(b.managementNo, 'ko', { numeric: true }) || a.id - b.id,
    );
}

export function paginate<T>(items: T[], params: URLSearchParams): PageResponse<T> {
  const requestedSize = Number(params.get('pageSize') ?? 20);
  const pageSize = Number.isSafeInteger(requestedSize)
    ? Math.min(100, Math.max(1, requestedSize))
    : 20;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const requestedPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(totalPages, Math.max(1, requestedPage))
    : 1;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: items.length,
    totalPages,
  };
}

export function summarize(sites: Site[], admin: boolean): SiteSummary {
  const result: SiteSummary = {
    total: sites.length,
    done: 0,
    progress: 0,
    todo: 0,
    startCount: 0,
    endCount: 0,
    ownStartCount: 0,
    ownEndCount: 0,
    workers: [],
  };
  const workers = new Map<number, { workerId: number; startCount: number; endCount: number }>();
  for (const site of sites) {
    const status = statusOf(site);
    result[status === 'DONE' ? 'done' : status === 'IN_PROGRESS' ? 'progress' : 'todo']++;
    for (const phase of ['START', 'END'] as const) {
      const m = site.inspections[phase];
      if (!m) continue;
      result[phase === 'START' ? 'startCount' : 'endCount']++;
      if (m.workerId === 11) result[phase === 'START' ? 'ownStartCount' : 'ownEndCount']++;
      if (admin) {
        const worker = workers.get(m.workerId) ?? {
          workerId: m.workerId,
          startCount: 0,
          endCount: 0,
        };
        worker[phase === 'START' ? 'startCount' : 'endCount']++;
        workers.set(m.workerId, worker);
      }
    }
  }
  result.workers = [...workers.values()];
  return result;
}

export function settlementRows(sites: Site[], params: URLSearchParams): SettlementRow[] {
  const worker = params.get('workerId'),
    phaseFilter = params.get('phase'),
    from = params.get('startDate'),
    until = params.get('endDate');
  return filterSites(sites, params)
    .flatMap((s) =>
      (['START', 'END'] as const).flatMap((phase) => {
        const m = s.inspections[phase];
        return m &&
          (!worker || m.workerId === Number(worker)) &&
          (!phaseFilter || phase === phaseFilter) &&
          (!from || m.date >= from) &&
          (!until || m.date <= until)
          ? [
              {
                siteId: s.id,
                managementNo: s.managementNo,
                zone: s.zone,
                phase,
                workerId: m.workerId,
                workerName: m.workerName,
                date: m.date,
                fee: m.fee ?? 0,
              },
            ]
          : [];
      }),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.siteId - b.siteId || a.phase.localeCompare(b.phase),
    );
}
