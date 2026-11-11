package com.meter.fieldwork.excel;

import static org.assertj.core.api.Assertions.assertThat;

import com.meter.fieldwork.PostgresIntegrationTest;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

@Tag("manual-excel")
class ManualExcelImportTest extends PostgresIntegrationTest {
  @Autowired ExcelImportService imports;
  @Autowired JdbcTemplate jdbc;

  @Test
  void actualWorkbookAndReupload() throws Exception {
    String path = System.getenv("FIELDWORK_EXCEL_PATH");
    assertThat(path)
        .as("FIELDWORK_EXCEL_PATH is required for this explicitly invoked manual task")
        .isNotBlank();
    var addresses = new java.util.HashSet<String>();
    var numbers = new java.util.HashSet<String>();
    int[] anonymousAccepted = {0};
    try (var stream = Files.newInputStream(Path.of(path))) {
      new ExcelRows()
          .read(
              stream,
              row -> {
                String address = row.cell("E").replaceAll("[ \\t\\n\\r\\f\\u000B]+", " ").trim();
                if (row.cell("C").isBlank()) {
                  if (!address.isEmpty() && addresses.add(address)) anonymousAccepted[0]++;
                } else if (numbers.add(row.cell("C")) && !address.isEmpty()) addresses.add(address);
              });
    }
    long start = System.nanoTime();
    ImportResult first;
    try (var stream = Files.newInputStream(Path.of(path))) {
      first = imports.importWorkbook(stream, null);
    }
    assertThat(first.totalRows()).isEqualTo(19819);
    assertThat(first.inserted()).isEqualTo(19795 + anonymousAccepted[0]);
    assertThat(first.duplicateInFile()).isEqualTo(3);
    assertThat(first.invalid()).isEqualTo(21 - anonymousAccepted[0]);
    assertThat(first.alreadyExists()).isZero();
    assertThat(jdbc.queryForObject("select count(*) from worksites", Integer.class))
        .isEqualTo(first.inserted());
    assertThat(
            jdbc.queryForObject(
                "select to_regclass('public.source_monthly_values')::text", String.class))
        .isNull();
    assertThat(
            jdbc.queryForObject(
                "select count(*) from worksites where source_cells ?| array['M','Y','AK']",
                Integer.class))
        .isZero();
    // Compare normalized fields against retained source cells without logging personal values.
    assertThat(
            jdbc.queryForObject(
                "select count(*) from worksites where name is distinct from"
                    + " coalesce(source_cells->>'D','') or address is distinct from"
                    + " coalesce(source_cells->>'E','') or meter_number is distinct from"
                    + " coalesce(source_cells->>'G','')",
                Integer.class))
        .isZero();
    System.out.printf(
        "PRIVATE_MAPPING_SUMMARY missingNames=%d sourceNames=%d%n",
        jdbc.queryForObject(
            "select count(*) from worksites where coalesce(name,'')=''", Integer.class),
        jdbc.queryForObject(
            "select count(*) from worksites where coalesce(source_cells->>'D','')<>''",
            Integer.class));
    long firstMillis = (System.nanoTime() - start) / 1_000_000;
    start = System.nanoTime();
    try (var stream = Files.newInputStream(Path.of(path))) {
      var second = imports.importWorkbook(stream, null);
      assertThat(second.inserted()).isZero();
      assertThat(second.alreadyExists()).isEqualTo(19795);
      assertThat(second.duplicateInFile()).isEqualTo(first.duplicateInFile());
      assertThat(second.invalid()).isEqualTo(21);
    }
    System.out.printf(
        "PRIVATE_EXCEL_SUMMARY rows=%d inserted=%d duplicates=%d invalid=%d firstMs=%d"
            + " reuploadMs=%d%n",
        first.totalRows(),
        first.inserted(),
        first.duplicateInFile(),
        first.invalid(),
        firstMillis,
        (System.nanoTime() - start) / 1_000_000);
  }
}
