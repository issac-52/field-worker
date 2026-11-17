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

  @Transactional(isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
  public ImportResult importWorkbook(InputStream stream, Long actor) {
    return importWorkbook(stream, actor, false);
  }

  @Transactional(isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
  public ImportResult importWorkbook(InputStream stream, Long actor, boolean visibleOnly) {
    return importWorkbook(stream, actor, visibleOnly, ExcelFormat.LEGACY, false);
  }

  @Transactional(isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
  public ImportResult importWorkbook(
      InputStream stream,
      Long actor,
      boolean visibleOnly,
      ExcelFormat format,
      boolean updateExisting) {
    var context = new ImportContext(UUID.randomUUID());
    ExcelUploadLock.acquire(jdbc);
    jdbc.query(
        "select consumer_number,worksite_identity_text(address) as address_key from worksites",
        (org.springframework.jdbc.core.RowCallbackHandler)
            row -> {
              String number = row.getString("consumer_number"),
                  address = row.getString("address_key");
              if (number != null) context.existingNumbers.add(number);
              if (!address.isEmpty()) context.existingAddresses.add(address);
            });
    jdbc.update("insert into import_jobs(id,created_by) values(?,?)", context.id, actor);
    new ExcelRows()
        .read(
            stream,
            format,
            row -> {
              context.sheetOrder.computeIfAbsent(row.sheet(), key -> context.sheetOrder.size());
              if (++context.total > 50000)
                throw new ApiException(400, "TOO_MANY_ROWS", "업로드는 최대 50,000행입니다.");
              if (visibleOnly && row.hidden()) {
                context.hidden++;
                context.skip(row, "HIDDEN_ROW", null);
                return;
              }
              String number = row.cell("C");
              String address = WorksiteIdentity.normalize(row.cell("E"));
              var current = new FirstRow(row.sheet(), row.number());
              if (number.isBlank()) {
                if (address.isEmpty()) {
                  context.skip(row, "MISSING_ADDRESS", null);
                  return;
                }
                if (context.existingAddresses.contains(address)) {
                  context.skip(
                      row, "DUPLICATE_ADDRESS_WITHOUT_NUMBER", context.firstAddresses.get(address));
                  return;
                }
              } else {
                var first = context.seen.putIfAbsent(number, current);
                if (first != null) {
                  context.skip(row, "DUPLICATE_IN_FILE", first);
                  return;
                }
                if (context.existingNumbers.contains(number)) {
                  if (updateExisting) {
                    if (updateBasic(row, actor)) context.updated++;
                    else context.unchanged++;
                    if (!address.isEmpty()) context.existingAddresses.add(address);
                    return;
                  }
                  context.skip(row, "ALREADY_EXISTS", null);
                  return;
                }
                context.existingNumbers.add(number);
              }
              if (!address.isEmpty()) {
                context.existingAddresses.add(address);
                context.firstAddresses.putIfAbsent(address, current);
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
            context.updated,
            context.unchanged,
            context.duplicates,
            context.exists,
            context.invalid,
            context.hidden,
            List.copyOf(context.skipped));
    jdbc.update("update import_jobs set result=?::jsonb where id=?", json(result), context.id);
    return result;
  }

  // Only imported basic information is editable here; operational data never enters this whitelist.
  private static final Map<String, String> BASIC_FIELDS =
      Map.ofEntries(
          Map.entry("B", "middle_block"),
          Map.entry("BB", "small_block"),
          Map.entry("D", "name"),
          Map.entry("E", "address"),
          Map.entry("F", "old_address"),
          Map.entry("G", "meter_number"),
          Map.entry("H", "meter_presence_raw"),
          Map.entry("I", "industry"),
          Map.entry("BE", "management_number"));
  private static final Set<String> SOURCE_FIELDS = Set.of("J", "K", "L", "AX", "AZ", "BC", "BD");

  private boolean updateBasic(ExcelRows.Row row, Long actor) {
    var existing =
        jdbc.queryForMap(
            "select *,source_cells::text as source_json from worksites where consumer_number=? for"
                + " update",
            row.cell("C"));
    Map<String, String> source;
    try {
      source =
          json.readValue(
              (String) existing.get("source_json"),
              new com.fasterxml.jackson.core.type.TypeReference<
                  LinkedHashMap<String, String>>() {});
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException(ex);
    }
    var updates = new LinkedHashMap<String, Object>();
    var before = new LinkedHashMap<String, Object>();
    var after = new LinkedHashMap<String, Object>();
    BASIC_FIELDS.forEach(
        (col, field) -> {
          String incoming = row.cell(col);
          if (!incoming.isBlank() && !Objects.equals(incoming, existing.get(field))) {
            updates.put(field, incoming);
            before.put(field, existing.get(field));
            after.put(field, incoming);
          }
        });
    // Compare the address actually sent to the geocoder; an unused old address is irrelevant.
    String previousAddress = geocodingAddress(existing.get("address"), existing.get("old_address"));
    String nextAddress =
        geocodingAddress(
            updates.getOrDefault("address", existing.get("address")),
            updates.getOrDefault("old_address", existing.get("old_address")));
    if (!previousAddress.equals(nextAddress)
        && (existing.get("latitude") != null || existing.get("longitude") != null)) {
      for (String coordinate : List.of("latitude", "longitude")) {
        updates.put(coordinate, null);
        before.put(coordinate, existing.get(coordinate));
        after.put(coordinate, null);
      }
    }
    var columns = new HashSet<>(BASIC_FIELDS.keySet());
    columns.addAll(SOURCE_FIELDS);
    for (String col : columns) {
      String incoming = row.cell(col);
      if (!incoming.isBlank() && !Objects.equals(incoming, source.get(col))) {
        before.put("source." + col, source.get(col));
        after.put("source." + col, incoming);
        source.put(col, incoming);
      }
    }
    if (after.isEmpty()) return false;
    var assignments = new ArrayList<String>();
    var args = new ArrayList<Object>();
    updates.forEach(
        (field, value) -> {
          assignments.add(field + "=?");
          args.add(value);
        });
    assignments.add("source_cells=?::jsonb");
    args.add(json(source));
    assignments.add("updated_at=clock_timestamp()");
    args.add(existing.get("id"));
    jdbc.update(
        "update worksites set " + String.join(",", assignments) + " where id=?", args.toArray());
    jdbc.update(
        "insert into worksite_edits(site_id,actor_id,before_value,after_value)"
            + " values(?,?,?::jsonb,?::jsonb)",
        existing.get("id"),
        actor,
        json(before),
        json(after));
    return true;
  }

  private static String geocodingAddress(Object address, Object oldAddress) {
    String primary = Objects.toString(address, "").strip();
    return primary.isBlank() ? Objects.toString(oldAddress, "").strip() : primary;
  }

  private void flush(ImportContext context) {
    if (context.batch.isEmpty()) return;
    String sql =
        """
        insert into worksites(consumer_number,middle_block,small_block,name,address,old_address,meter_number,
          meter_presence_raw,industry,management_number,source_cells,source_sheet,source_row,import_job_id)
        values(?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?,?) on conflict do nothing
        """;
    List<Object[]> arguments = new ArrayList<>();
    for (var row : context.batch)
      arguments.add(
          new Object[] {
            row.cell("C").isBlank() ? null : row.cell("C"),
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
    for (int i = 0; i < counts.length; i++) {
      var row = context.batch.get(i);
      if (counts[i] == 0) {
        context.skip(
            row,
            row.cell("C").isBlank() ? "DUPLICATE_ADDRESS_WITHOUT_NUMBER" : "ALREADY_EXISTS",
            null);
        continue;
      }
      if (counts[i] != 1)
        throw new IllegalStateException(
            "JDBC driver must return exact insert counts; disable reWriteBatchedInserts");
      context.inserted++;
    }
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
    int total, inserted, updated, unchanged, duplicates, exists, invalid, hidden;
    final Map<String, Integer> sheetOrder = new LinkedHashMap<>();
    final Map<String, FirstRow> seen = new LinkedHashMap<>();
    final Map<String, FirstRow> firstAddresses = new HashMap<>();
    final Set<String> existingNumbers = new HashSet<>();
    final Set<String> existingAddresses = new HashSet<>();
    final List<ExcelRows.Row> batch = new ArrayList<>(500);
    final List<SkippedRow> skipped = new ArrayList<>();

    ImportContext(UUID id) {
      this.id = id;
    }

    void skip(ExcelRows.Row row, String reason, FirstRow first) {
      switch (reason) {
        case "HIDDEN_ROW" -> {}
        case "DUPLICATE_IN_FILE" -> duplicates++;
        case "ALREADY_EXISTS" -> exists++;
        default -> invalid++;
      }
      skipped.add(
          new SkippedRow(
              row.sheet(),
              row.number(),
              row.cell("C").isBlank() ? null : row.cell("C"),
              reason,
              first == null ? null : first.sheet(),
              first == null ? null : first.number()));
    }
  }
}
