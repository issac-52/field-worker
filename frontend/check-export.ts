import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { setupServer } from 'msw/node';
import { handlers } from './src/mocks/handlers';
import { store } from './src/mocks/store';
import { blocks } from './src/mocks/data';
import { createExportWorkbook, EXPORT_COLUMNS } from './src/lib/excelExport';
import { collectExportSites } from './src/lib/exportData';
import type { PageResponse, SiteExportItem } from './src/types';

Object.defineProperty(globalThis, 'location', { value: new URL('http://localhost/') });
const server = setupServer(...handlers);
server.listen({ onUnhandledRequest: 'error' });
const controller = new AbortController();
try {
  const worker = await fetch('http://localhost/api/exports/sites');
  assert.equal(worker.status, 403);
  const getPage = async (page: number, scope = '') => {
    const response = await fetch(
      `http://localhost/api/exports/sites?page=${page}&pageSize=100${scope}`,
      { headers: { 'X-Demo-Role': 'ADMIN' } },
    );
    assert.equal(response.status, 200);
    return (await response.json()).data as PageResponse<SiteExportItem>;
  };
  store.sites[0].note = '=HYPERLINK("https://example.invalid","literal")';
  const records = await collectExportSites(
    (page) => getPage(page),
    controller.signal,
    () => {},
  );
  assert.equal(records.length, 12);
  assert(records.every((item) => !('photos' in item)));
  assert.equal(records[0].managementNo, '0012');
  const scoped = await collectExportSites(
    (page) => getPage(page, `&smallBlockId=${records[0].smallBlockId}`),
    controller.signal,
    () => {},
  );
  assert(scoped.every((item) => item.smallBlockId === records[0].smallBlockId));
  const book = createExportWorkbook(
    records,
    blocks,
    '전체 수용가',
    new Date('2026-10-23T00:00:00Z'),
  );
  const bytes = await book.xlsx.writeBuffer();
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes);
  const sheet = reopened.getWorksheet('검침 데이터')!;
  assert.equal(sheet.rowCount, 15);
  assert.equal(sheet.columnCount, EXPORT_COLUMNS.length);
  assert.equal(sheet.getCell('B4').value, '0012');
  assert.equal(sheet.getCell('O4').value, store.sites[0].note);
  assert.equal(sheet.getCell('O4').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('Q4').value, records[0].inspections.START!.reading);
  assert(sheet.getCell('P4').value instanceof Date);
  assert.equal(
    sheet.getCell('AD4').value,
    records[0].inspections.END!.reading - records[0].inspections.START!.reading,
  );
  assert.equal(EXPORT_COLUMNS.length, 35);
  assert(records.every((item) => !('locationMap' in item)));
  assert(!EXPORT_COLUMNS.some((column) => column.includes('위치도')));
  const many: SiteExportItem[] = Array.from({ length: 12050 }, (_, index) => ({
    ...records[index % records.length],
    id: index + 1,
  }));
  let requests = 0;
  const collected = await collectExportSites(
    async (page) => {
      requests++;
      return {
        items: many.slice((page - 1) * 100, page * 100),
        page,
        pageSize: 100,
        total: many.length,
        totalPages: 121,
      };
    },
    controller.signal,
    () => {},
  );
  assert.equal(collected.length, 12050);
  assert.equal(requests, 121);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(() =>
    collectExportSites(
      (page) => getPage(page),
      cancelled.signal,
      () => {},
    ),
  );
  await assert.rejects(
    () =>
      collectExportSites(
        async (page) => ({ items: [records[0]], page, pageSize: 1, total: 2, totalPages: 2 }),
        controller.signal,
        () => {},
      ),
    /중복/,
  );
  await assert.rejects(
    () =>
      collectExportSites(
        async (page) => ({
          items: [records[page - 1]],
          page,
          pageSize: 1,
          total: page === 1 ? 2 : 3,
          totalPages: 2,
        }),
        controller.signal,
        () => {},
      ),
    /변경/,
  );
  console.log(
    `PASS: admin-only bounded/scoped export, XLSX round-trip ${records.length} rows/${EXPORT_COLUMNS.length} columns, leading zeros, typed dates/numbers, literal user text, 12,050-row paging, cancellation and incomplete/duplicate detection`,
  );
} finally {
  server.close();
}
