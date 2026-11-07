package com.meter.fieldwork.excel;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.global.ApiException;
import java.io.InputStream;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExcelRepairService {
  // Explicit whitelist: never touch identifiers, coordinates, readings, notes, photos or monthly
  // history.
  private static final Map<String, String> FIELDS =
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
  private static final Set<String> SOURCE_ONLY = Set.of("J", "K", "L", "AX", "AZ", "BC", "BD");
  private final JdbcTemplate db;
  private final ObjectMapper json;

  public ExcelRepairService(JdbcTemplate db, ObjectMapper json) {
    this.db = db;
    this.json = json;
  }

  public record Row(
      String sheet, int rowNumber, String consumerNumber, String reason, List<String> fields) {}

  public record Result(
      UUID jobId,
      int totalRows,
      int updated,
      int unchanged,
      int duplicateInFile,
      int notFound,
      int invalid,
      List<Row> rows) {}

  @Transactional
  public Result repair(InputStream stream, Long actor) {
    UUID job = UUID.randomUUID();
    db.update("insert into import_jobs(id,created_by) values(?,?)", job, actor);
    var seen = new HashSet<String>();
    var rows = new ArrayList<Row>();
    int[] counts = new int[6];
    new ExcelRows()
        .read(
            stream,
            row -> {
              if (++counts[0] > 50000)
                throw new ApiException(400, "TOO_MANY_ROWS", "업로드는 최대 50,000행입니다.");
              String number = row.cell("C");
              String reason;
              List<String> changed = List.of();
              if (number.isBlank()) {
                reason = "INVALID_CONSUMER_NUMBER";
                counts[5]++;
              } else if (!seen.add(number)) {
                reason = "DUPLICATE_IN_FILE";
                counts[3]++;
              } else {
                var found =
                    db.queryForList(
                        "select *,source_cells::text as source_json from worksites where"
                            + " consumer_number=? for update",
                        number);
                if (found.isEmpty()) {
                  reason = "NOT_FOUND";
                  counts[4]++;
                } else {
                  changed = fill(found.getFirst(), row, actor);
                  if (changed.isEmpty()) {
                    reason = "UNCHANGED";
                    counts[2]++;
                  } else {
                    reason = "UPDATED";
                    counts[1]++;
                  }
                }
              }
              rows.add(new Row(row.sheet(), row.number(), number, reason, changed));
            });
    var result =
        new Result(
            job,
            counts[0],
            counts[1],
            counts[2],
            counts[3],
            counts[4],
            counts[5],
            List.copyOf(rows));
    db.update("update import_jobs set result=?::jsonb where id=?", encode(result), job);
    return result;
  }

  private List<String> fill(Map<String, Object> existing, ExcelRows.Row row, Long actor) {
    Map<String, String> source;
    try {
      source =
          json.readValue(
              (String) existing.get("source_json"),
              new TypeReference<LinkedHashMap<String, String>>() {});
    } catch (Exception ex) {
      throw new IllegalStateException("Cannot read retained source cells", ex);
    }
    var updates = new LinkedHashMap<String, Object>();
    var before = new LinkedHashMap<String, Object>();
    var after = new LinkedHashMap<String, Object>();
    var changed = new ArrayList<String>();
    for (var entry : FIELDS.entrySet()) {
      String col = entry.getKey(), field = entry.getValue();
      String incoming = row.cell(col);
      String retained = source.get(col);
      if (blank(existing.get(field))) {
        // Prefer the original retained value over a later workbook when restoring a missing column.
        String value = blank(retained) ? incoming : retained;
        if (!blank(value)) {
          updates.put(field, value);
          before.put(field, existing.get(field));
          after.put(field, value);
          changed.add(field);
        }
      }
      if (blank(retained) && !blank(incoming)) {
        before.put("source." + col, retained);
        source.put(col, incoming);
        after.put("source." + col, incoming);
        changed.add("source." + col);
      }
    }
    for (String col : SOURCE_ONLY) {
      String incoming = row.cell(col);
      if (blank(source.get(col)) && !blank(incoming)) {
        before.put("source." + col, source.get(col));
        source.put(col, incoming);
        after.put("source." + col, incoming);
        changed.add("source." + col);
      }
    }
    if (changed.isEmpty()) return List.of();
    var assignments = new ArrayList<String>();
    var args = new ArrayList<Object>();
    updates.forEach(
        (field, value) -> {
          assignments.add(field + "=?");
          args.add(value);
        });
    assignments.add("source_cells=?::jsonb");
    args.add(encode(source));
    assignments.add("updated_at=clock_timestamp()");
    args.add(existing.get("id"));
    db.update(
        "update worksites set " + String.join(",", assignments) + " where id=?", args.toArray());
    db.update(
        "insert into worksite_edits(site_id,actor_id,before_value,after_value)"
            + " values(?,?,?::jsonb,?::jsonb)",
        existing.get("id"),
        actor,
        encode(before),
        encode(after));
    return List.copyOf(changed);
  }

  private static boolean blank(Object value) {
    return value == null || value.toString().isBlank();
  }

  private String encode(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (Exception ex) {
      throw new IllegalStateException(ex);
    }
  }
}
