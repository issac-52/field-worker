import ExcelJS from 'exceljs';
import type { Block, SiteExportItem } from '../types';
import { statusOf } from '../types';

export const EXPORT_COLUMNS = [
  '수용가 ID',
  '관리번호',
  '중블록',
  '소블록',
  '성명',
  '주소',
  '급수전번호',
  '업종',
  '계량기번호',
  '봉인여부',
  '급수구역',
  '위도',
  '경도',
  '진행상태',
  '특이사항',
  'START 검침일',
  'START 지침',
  'START 조사자 ID',
  'START 조사자',
  'START 작업비',
  'START 등록시각 (UTC)',
  'START 수정시각 (UTC)',
  'END 검침일',
  'END 지침',
  'END 조사자 ID',
  'END 조사자',
  'END 작업비',
  'END 등록시각 (UTC)',
  'END 수정시각 (UTC)',
  '검침량 (END-START)',
  '작업비 합계',
  '원경사진 등록',
  'START 근경 등록',
  'END 근경 등록',
  '위치도 상태',
  '위치도 저장 방식',
  '위치도 생성시각 (UTC)',
  '위치도 기준 위도',
  '위치도 기준 경도',
  '위치도 확대',
  '위치도 가로',
  '위치도 세로',
  '위치도 생성 버전',
  '위치도 객체 키',
] as const;

const date = (value?: string) =>
  value ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : null;

export function createExportWorkbook(
  records: SiteExportItem[],
  blocks: Block[],
  scope: string,
  createdAt = new Date(),
) {
  const book = new ExcelJS.Workbook();
  book.creator = 'Field Worker';
  book.created = createdAt;
  const sheet = book.addWorksheet('검침 데이터', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }],
  });
  sheet.addRow([`검침 데이터 · ${scope} · ${records.length.toLocaleString()}건`]);
  sheet.mergeCells(1, 1, 1, EXPORT_COLUMNS.length);
  sheet.addRow([
    '현재 조회된 저장값입니다. 사진은 등록 여부만 포함하며 이미지 파일은 포함하지 않습니다. MOCK 위치도는 실제 파일이 아닙니다.',
  ]);
  sheet.mergeCells(2, 1, 2, EXPORT_COLUMNS.length);
  sheet.addRow([...EXPORT_COLUMNS]);
  const names = new Map(blocks.map((block) => [block.id, block.name]));
  for (const site of records) {
    const start = site.inspections.START;
    const end = site.inspections.END;
    const image = site.locationMap.image;
    const phaseValues = (value: typeof start) => [
      date(value?.date),
      value?.reading ?? null,
      value?.workerId ?? null,
      value?.workerName ?? '',
      value?.fee ?? null,
      date(value?.recordedAt),
      date(value?.updatedAt),
    ];
    const values = [
      site.id,
      site.managementNo,
      names.get(site.middleBlockId) ?? site.middleBlockId,
      names.get(site.smallBlockId) ?? site.zone,
      site.name,
      site.address,
      site.waterNo,
      site.industry,
      site.meterNo,
      site.sealed ? '봉인' : '미봉인',
      site.supplyArea,
      site.latitude,
      site.longitude,
      { TODO: '미처리', IN_PROGRESS: '시작검침완료', DONE: '완료' }[statusOf(site)],
      site.note,
      ...phaseValues(start),
      ...phaseValues(end),
      start && end ? end.reading - start.reading : null,
      (start?.fee ?? 0) + (end?.fee ?? 0),
      ...(['OVERVIEW', 'START_CLOSEUP', 'END_CLOSEUP'] as const).map((slot) =>
        site.photoSlots.includes(slot) ? '등록' : '미등록',
      ),
      !image ? '미저장' : site.locationMap.stale ? '업데이트 필요' : '저장 완료',
      image?.storageMode ?? '',
      date(image?.generatedAt),
      image?.centerLatitude ?? null,
      image?.centerLongitude ?? null,
      image?.zoomLevel ?? null,
      image?.imageWidth ?? null,
      image?.imageHeight ?? null,
      image?.generationVersion ?? '',
      image?.storageKey ?? '',
    ];
    if (values.some((value) => typeof value === 'string' && value.length > 32767))
      throw new Error(`관리번호 ${site.managementNo}: 엑셀 셀 최대 길이를 초과한 내용이 있습니다.`);
    // Strings stay literal strings; user input is never interpreted as an Excel formula.
    sheet.addRow(values);
  }
  sheet.columns.forEach((column, index) => {
    column.width = [5, 14, 43].includes(index) ? 42 : index === 4 ? 16 : 21;
  });
  for (const index of [2, 7, 9]) sheet.getColumn(index).numFmt = '@';
  for (const index of [16, 23]) sheet.getColumn(index).numFmt = 'yyyy-mm-dd';
  for (const index of [21, 22, 28, 29, 37]) sheet.getColumn(index).numFmt = 'yyyy-mm-dd hh:mm:ss';
  for (const index of [17, 24, 30]) sheet.getColumn(index).numFmt = '#,##0.###';
  for (const index of [20, 27, 31]) sheet.getColumn(index).numFmt = '#,##0';
  sheet.getRow(1).font = { bold: true, size: 15, color: { argb: 'FF12634D' } };
  sheet.getRow(1).height = 30;
  sheet.getRow(2).font = { size: 10, color: { argb: 'FF60766E' } };
  sheet.getRow(2).height = 24;
  const header = sheet.getRow(3);
  header.height = 32;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF087E71' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: records.length + 3, column: EXPORT_COLUMNS.length },
  };
  return book;
}

export async function createExcelBytes(records: SiteExportItem[], blocks: Block[], scope: string) {
  const book = createExportWorkbook(records, blocks, scope);
  const data = await book.xlsx.writeBuffer();
  return new Uint8Array(data);
}
