import type { PageResponse, SiteExportItem } from '../types';

export async function collectExportSites(
  fetchPage: (page: number) => Promise<PageResponse<SiteExportItem>>,
  signal: AbortSignal,
  progress: (loaded: number, total: number) => void,
) {
  const records: SiteExportItem[] = [];
  const ids = new Set<number>();
  let total: number | undefined;
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    signal.throwIfAborted();
    const result = await fetchPage(page);
    signal.throwIfAborted();
    total ??= result.total;
    if (total !== result.total || result.page !== page || (page > 1 && pages !== result.totalPages))
      throw new Error('다운로드 중 대상이 변경되었습니다. 다시 다운로드하세요.');
    pages = result.totalPages;
    for (const item of result.items) {
      if (ids.has(item.id)) throw new Error('중복된 수용가가 조회되었습니다. 다시 다운로드하세요.');
      ids.add(item.id);
      records.push(item);
    }
    progress(records.length, total);
  }
  if (records.length !== total)
    throw new Error('일부 수용가를 읽지 못했습니다. 다시 다운로드하세요.');
  return records;
}
