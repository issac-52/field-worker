import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { setupServer } from 'msw/node';
import { handlers } from '../src/mocks/handlers';
import { store } from '../src/mocks/store';
import { blocks } from '../src/mocks/data';
import { createExportWorkbook, EXPORT_COLUMNS } from '../src/lib/excelExport';
import { collectExportSites } from '../src/lib/exportData';
import type { PageResponse, SiteExportItem } from '../src/types';

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
const controller = new AbortController();
describe('export regression', () => {
  it('preserves the existing export workflow and validation', async () => {
    const worker = await fetch('http://localhost/api/exports/sites');
    expect(worker.status).toBe(403);
    const getPage = async (page: number, scope = '') => {
      const response = await fetch(
        `http://localhost/api/exports/sites?page=${page}&pageSize=100${scope}`,
        { headers: { 'X-Demo-Role': 'ADMIN' } },
      );
      expect(response.status).toBe(200);
      return (await response.json()).data as PageResponse<SiteExportItem>;
    };
    store.sites[0].note = '=HYPERLINK("https://example.invalid","literal")';
    const records = await collectExportSites(
      (page) => getPage(page),
      controller.signal,
      () => {},
    );
    expect(records.length).toBe(12);
    expect(records.every((item) => !('photos' in item))).toBeTruthy();
    expect(records[0].managementNo).toBe('0012');
    const scoped = await collectExportSites(
      (page) => getPage(page, `&smallBlockId=${records[0].smallBlockId}`),
      controller.signal,
      () => {},
    );
    expect(scoped.every((item) => item.smallBlockId === records[0].smallBlockId)).toBeTruthy();
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
    expect(sheet.rowCount).toBe(15);
    expect(sheet.columnCount).toBe(EXPORT_COLUMNS.length);
    expect(sheet.getCell('B4').value).toBe('0012');
    expect(sheet.getCell('O4').value).toBe(store.sites[0].note);
    expect(sheet.getCell('O4').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('Q4').value).toBe(records[0].inspections.START!.reading);
    expect(sheet.getCell('P4').value instanceof Date).toBeTruthy();
    expect(sheet.getCell('AD4').value).toBe(
      records[0].inspections.END!.reading - records[0].inspections.START!.reading,
    );
    expect(EXPORT_COLUMNS.length).toBe(35);
    expect(records.every((item) => !('locationMap' in item))).toBeTruthy();
    expect(!EXPORT_COLUMNS.some((column) => column.includes('위치도'))).toBeTruthy();
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
    expect(collected.length).toBe(12050);
    expect(requests).toBe(121);
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      (() =>
        collectExportSites(
          (page) => getPage(page),
          cancelled.signal,
          () => {},
        ))(),
    ).rejects.toThrow();
    await expect(
      (() =>
        collectExportSites(
          async (page) => ({ items: [records[0]], page, pageSize: 1, total: 2, totalPages: 2 }),
          controller.signal,
          () => {},
        ))(),
    ).rejects.toThrow(/중복/);
    await expect(
      (() =>
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
        ))(),
    ).rejects.toThrow(/변경/);
  });
});
