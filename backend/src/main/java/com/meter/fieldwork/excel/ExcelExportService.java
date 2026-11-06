package com.meter.fieldwork.excel;

import java.io.IOException;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExcelExportService {
  private final JdbcTemplate db;

  public ExcelExportService(JdbcTemplate db) {
    this.db = db;
  }

  @Transactional(readOnly = true)
  public void write(OutputStream out, String middle, String small) throws IOException {
    try (var workbook = new SXSSFWorkbook(100)) {
      workbook.setCompressTempFiles(true);
      var sheet = workbook.createSheet("현장 검침");
      String[] headers = {
        "수용가번호",
        "중블록",
        "소블록",
        "수용가명",
        "새주소",
        "구주소",
        "계량기번호",
        "계량기 유무 원문",
        "업종",
        "관리번호",
        "START 검침일",
        "START 지침",
        "START 작업자",
        "END 검침일",
        "END 지침",
        "END 작업자",
        "사용량",
        "특이사항 코드",
        "특이사항 상세",
        "비고",
        "작업 상태",
        "사진 수"
      };
      sheet.createFreezePane(0, 1);
      for (int i = 0; i < headers.length; i++) sheet.setColumnWidth(i, 20 * 256);
      var header = sheet.createRow(0);
      for (int i = 0; i < headers.length; i++) header.createCell(i).setCellValue(headers[i]);
      AtomicInteger number = new AtomicInteger(1);
      db.query(
          connection -> {
            var query =
                connection.prepareStatement(
                    """
                    select s.consumer_number,s.middle_block,s.small_block,s.name,s.address,s.old_address,s.meter_number,s.meter_presence_raw,s.industry,s.management_number,
                      a.inspection_date as start_date,a.reading as start_reading,au.nickname as start_worker,
                      b.inspection_date as end_date,b.reading as end_reading,bu.nickname as end_worker,
                      b.reading-a.reading as usage,s.special_condition,s.special_description,s.note,
                      case when b.id is not null then 'DONE' when a.id is not null then 'IN_PROGRESS' else 'TODO' end as status,
                      (select count(*) from photos p where p.site_id=s.id) as photo_count
                    from worksites s left join inspections a on a.site_id=s.id and a.phase='START'
                    left join inspections b on b.site_id=s.id and b.phase='END'
                    left join users au on au.id=a.worker_id left join users bu on bu.id=b.worker_id
                    where (?::text is null or s.middle_block=?) and (?::text is null or s.small_block=?) order by s.id
                    """);
            query.setFetchSize(200);
            query.setString(1, middle);
            query.setString(2, middle);
            query.setString(3, small);
            query.setString(4, small);
            return query;
          },
          (org.springframework.jdbc.core.RowCallbackHandler)
              row -> {
                var target = sheet.createRow(number.getAndIncrement());
                for (int col = 1; col <= headers.length; col++) {
                  // String cells preserve identifiers and prevent spreadsheet formula injection.
                  String value = row.getString(col);
                  if (value != null) target.createCell(col - 1).setCellValue(value);
                }
              });
      workbook.write(out);
    }
  }
}
