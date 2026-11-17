package com.meter.fieldwork.excel;

import static org.assertj.core.api.Assertions.*;

import com.meter.fieldwork.PostgresIntegrationTest;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** Explicitly invoked private-workbook check; prints counts only, never source values. */
@Tag("manual-excel")
class FinalWorkbookValidationTest extends PostgresIntegrationTest {
  @Autowired ExcelImportService imports;
  @Autowired JdbcTemplate db;

  @Test
  void finalWorkbookCanBeImportedAndReuploadedWithoutRecreatingSites() throws Exception {
    String path = System.getenv("FIELDWORK_EXCEL_PATH");
    assertThat(path).isNotBlank();
    long actor =
        db.queryForObject(
            "insert into users(login_id,nickname,password,role) values(?,'Synthetic"
                + " admin','unused','ADMIN') returning id",
            Long.class,
            UUID.randomUUID().toString());
    int[] parsed = {0};
    try (var input = Files.newInputStream(Path.of(path))) {
      new ExcelRows()
          .read(
              input,
              ExcelFormat.FINAL,
              row -> {
                assertThat(row.sheet()).isEqualTo(ExcelFormat.FINAL_SHEET);
                assertThat(row.cells().keySet())
                    .isSubsetOf(
                        "B", "C", "D", "E", "F", "G", "I", "J", "K", "L", "AX", "AZ", "BB", "BC",
                        "BD", "BE");
                parsed[0]++;
              });
    }
    ImportResult first, second;
    try (var input = Files.newInputStream(Path.of(path))) {
      first = imports.importWorkbook(input, actor, false, ExcelFormat.FINAL, true);
    }
    assertThat(first.totalRows()).isEqualTo(parsed[0]);
    assertThat(first.inserted()).isPositive();
    long count = db.queryForObject("select count(*) from worksites", Long.class);
    long max = db.queryForObject("select max(id) from worksites", Long.class);
    try (var input = Files.newInputStream(Path.of(path))) {
      second = imports.importWorkbook(input, actor, false, ExcelFormat.FINAL, true);
    }
    assertThat(second.inserted()).isZero();
    assertThat(second.updated()).isZero();
    assertThat(db.queryForObject("select count(*) from worksites", Long.class)).isEqualTo(count);
    assertThat(db.queryForObject("select max(id) from worksites", Long.class)).isEqualTo(max);
    assertThat(
            db.queryForObject(
                "select count(*) from worksites where name is distinct from"
                    + " coalesce(source_cells->>'D','') or address is distinct from"
                    + " coalesce(source_cells->>'E','') or meter_number is distinct from"
                    + " coalesce(source_cells->>'G','')",
                Long.class))
        .isZero();
    System.out.printf(
        "FINAL_WORKBOOK_COUNTS rows=%d inserted=%d duplicates=%d invalid=%d reuploadUnchanged=%d"
            + " reuploadInvalid=%d%n",
        first.totalRows(),
        first.inserted(),
        first.duplicateInFile(),
        first.invalid(),
        second.unchanged(),
        second.invalid());
  }
}
