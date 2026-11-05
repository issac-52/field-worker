package com.meter.fieldwork.excel;

import static com.meter.fieldwork.excel.ImportResult.SkippedRow;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.global.ApiException;
import java.io.InputStream;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExcelImportService {
  private final JdbcTemplate jdbc;
  private final ObjectMapper json;

  public ExcelImportService(JdbcTemplate jdbc, ObjectMapper json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  @Transactional
  public ImportResult importWorkbook(InputStream stream, Long actor) {
    var context = new ImportContext(UUID.randomUUID());
    jdbc.update("insert into import_jobs(id,created_by) values(?,?)", context.id, actor);
    new ExcelRows()
        .read(
            stream,
            row -> {
              context.sheetOrder.computeIfAbsent(row.sheet(), key -> context.sheetOrder.size());
              if (++context.total > 50000)
                throw new ApiException(400, "TOO_MANY_ROWS", "업로드는 최대 50,000행입니다.");
              String number = row.cell("C");
              if (number.isBlank()) {
                context.skip(row, "INVALID_CONSUMER_NUMBER", null);
                return;
              }
              var first = context.seen.putIfAbsent(number, new FirstRow(row.sheet(), row.number()));
              if (first != null) {
                context.skip(row, "DUPLICATE_IN_FILE", first);
                return;
              }
              context.batch.add(row);
              if (context.batch.size() == 500) flush(context);
            });
    flush(context);
    // File duplicates are discovered while parsing; DB conflicts while flushing. Restore Excel
    // order.
    var sheetOrder = context.sheetOrder;
    context.skipped.sort(
        Comparator.comparingInt(
                (SkippedRow row) -> sheetOrder.getOrDefault(row.sheet(), Integer.MAX_VALUE))
            .thenComparingInt(SkippedRow::rowNumber));
    ImportResult result =
        new ImportResult(
            context.id,
            context.total,
            context.inserted,
            context.duplicates,
            context.exists,
            context.invalid,
            List.copyOf(context.skipped));
    jdbc.update("update import_jobs set result=?::jsonb where id=?", json(result), context.id);
    return result;
  }

  private void flush(ImportContext context) {
    if (context.batch.isEmpty()) return;
    String sql =
        """
        insert into worksites(consumer_number,middle_block,small_block,name,address,old_address,meter_number,
          meter_presence_raw,industry,management_number,source_cells,source_sheet,source_row,import_job_id)
        values(?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?,?) on conflict(consumer_number) do nothing
        """;
    List<Object[]> arguments = new ArrayList<>();
    for (var row : context.batch)
      arguments.add(
          new Object[] {
            row.cell("C"),
            row.cell("B"),
            row.cell("BB"),
            row.cell("D"),
            row.cell("E"),
            row.cell("F"),
            row.cell("G"),
            row.cell("H"),
            row.cell("I"),
            row.cell("BE"),
            json(row.cells()),
            row.sheet(),
            row.number(),
            context.id
          });
    int[] counts = jdbc.batchUpdate(sql, arguments);
    List<Object[]> monthly = new ArrayList<>();
    for (int i = 0; i < counts.length; i++) {
      var row = context.batch.get(i);
      if (counts[i] == 0) {
        context.skip(row, "ALREADY_EXISTS", null);
        continue;
      }
      if (counts[i] != 1)
        throw new IllegalStateException(
            "JDBC driver must return exact insert counts; disable reWriteBatchedInserts");
      context.inserted++;
      for (int month = 1; month <= 9; month++) {
        monthly.add(
            new Object[] {
              java.sql.Date.valueOf(java.time.LocalDate.of(2026, month, 1)),
              row.cells()
                  .get(org.apache.poi.ss.util.CellReference.convertNumToColString(11 + month)),
              row.cells()
                  .get(org.apache.poi.ss.util.CellReference.convertNumToColString(23 + month)),
              row.cells()
                  .get(org.apache.poi.ss.util.CellReference.convertNumToColString(35 + month)),
              row.cell("C")
            });
      }
    }
    jdbc.batchUpdate(
        "insert into source_monthly_values(site_id,month,group_a,group_b,group_c) select id,?,?,?,?"
            + " from worksites where consumer_number=?",
        monthly);
    context.batch.clear();
  }

  @Transactional(readOnly = true)
  public Object result(UUID id) {
    var values =
        jdbc.queryForList("select result::text from import_jobs where id=?", String.class, id);
    if (values.isEmpty()) throw new ApiException(404, "IMPORT_NOT_FOUND", "업로드 결과를 찾을 수 없습니다.");
    try {
      return json.readTree(values.getFirst());
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException(ex);
    }
  }

  private String json(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException(ex);
    }
  }

  private record FirstRow(String sheet, int number) {}

  private static class ImportContext {
    final UUID id;
    int total, inserted, duplicates, exists, invalid;
    final Map<String, Integer> sheetOrder = new LinkedHashMap<>();
    final Map<String, FirstRow> seen = new LinkedHashMap<>();
    final List<ExcelRows.Row> batch = new ArrayList<>(500);
    final List<SkippedRow> skipped = new ArrayList<>();

    ImportContext(UUID id) {
      this.id = id;
    }

    void skip(ExcelRows.Row row, String reason, FirstRow first) {
      switch (reason) {
        case "DUPLICATE_IN_FILE" -> duplicates++;
        case "ALREADY_EXISTS" -> exists++;
        default -> invalid++;
      }
      skipped.add(
          new SkippedRow(
              row.sheet(),
              row.number(),
              row.cell("C"),
              reason,
              first == null ? null : first.sheet(),
              first == null ? null : first.number()));
    }
  }
}
