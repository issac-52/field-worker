package com.meter.fieldwork.excel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.meter.fieldwork.PostgresIntegrationTest;
import java.io.ByteArrayOutputStream;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMockMvc
class ExcelImportIntegrationTest extends PostgresIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired ExcelImportService imports;

  byte[] workbook(String... numbers) throws Exception {
    try (var workbook = new XSSFWorkbook();
        var out = new ByteArrayOutputStream()) {
      var sheet = workbook.createSheet("Input");
      var header = sheet.createRow(1);
      header.createCell(2).setCellValue("수용가번호");
      header.createCell(3).setCellValue("수용가명");
      header.createCell(4).setCellValue("새주소");
      for (int base : new int[] {12, 24, 36})
        for (int month = 1; month <= 9; month++)
          header.createCell(base + month - 1).setCellValue(String.format("2026.%02d.", month));
      for (int i = 0; i < numbers.length; i++) {
        var row = sheet.createRow(i + 2);
        row.createCell(2).setCellValue(numbers[i]);
        row.createCell(3).setCellValue("Fictional " + i);
        row.createCell(4).setCellValue("Test address");
        row.createCell(12).setCellValue(123 + i);
        row.createCell(24).setCellValue(2);
        row.createCell(36).setCellValue(500);
      }
      workbook.write(out);
      return out.toByteArray();
    }
  }

  @Test
  void firstRowWinsAndReportPreservesExcelRowNumbersAndLeadingZeros() throws Exception {
    var file =
        new MockMultipartFile(
            "file",
            "synthetic.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            workbook("00001", "00001", "", "00002"));
    mvc.perform(
            multipart("/api/admin/imports")
                .file(file)
                .with(user("admin").roles("ADMIN"))
                .with(csrf()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.totalRows").value(4))
        .andExpect(jsonPath("$.data.inserted").value(2))
        .andExpect(jsonPath("$.data.duplicateInFile").value(1))
        .andExpect(jsonPath("$.data.invalid").value(1))
        .andExpect(jsonPath("$.data.skippedRows[0].rowNumber").value(4))
        .andExpect(jsonPath("$.data.skippedRows[0].firstRowNumber").value(3))
        .andExpect(jsonPath("$.data.skippedRows[0].reason").value("DUPLICATE_IN_FILE"));
    assertThat(
            jdbc.queryForObject(
                "select name from worksites where consumer_number='00001'", String.class))
        .isEqualTo("Fictional 0");
    mvc.perform(
            multipart("/api/admin/imports")
                .file(file)
                .with(user("admin").roles("ADMIN"))
                .with(csrf()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.inserted").value(0))
        .andExpect(jsonPath("$.data.alreadyExists").value(2))
        .andExpect(jsonPath("$.data.duplicateInFile").value(1));
    assertThat(
            jdbc.queryForObject(
                "select count(*) from source_monthly_values where site_id in (select id from"
                    + " worksites where consumer_number in ('00001','00002'))",
                Integer.class))
        .isEqualTo(18);
  }

  @Test
  void workerCannotUploadAndInvalidWorkbookIsRejected() throws Exception {
    var file =
        new MockMultipartFile(
            "file", "broken.xlsx", "application/octet-stream", new byte[] {1, 2, 3});
    mvc.perform(
            multipart("/api/admin/imports")
                .file(file)
                .with(user("worker").roles("WORKER"))
                .with(csrf()))
        .andExpect(status().isForbidden());
    mvc.perform(
            multipart("/api/admin/imports")
                .file(file)
                .with(user("admin").roles("ADMIN"))
                .with(csrf()))
        .andExpect(status().isBadRequest());
  }

  @Test
  void concurrentImportsCannotDuplicateOrOverwriteRows() throws Exception {
    String prefix = java.util.UUID.randomUUID().toString();
    byte[] data = workbook(prefix + "01", prefix + "02", prefix + "01");
    try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
      var barrier = new java.util.concurrent.CyclicBarrier(2);
      java.util.concurrent.Callable<ImportResult> task =
          () -> {
            barrier.await();
            return imports.importWorkbook(new java.io.ByteArrayInputStream(data), null);
          };
      var first = executor.submit(task);
      var second = executor.submit(task);
      var a = first.get(30, java.util.concurrent.TimeUnit.SECONDS);
      var b = second.get(30, java.util.concurrent.TimeUnit.SECONDS);
      assertThat(a.inserted() + b.inserted()).isEqualTo(2);
      assertThat(a.alreadyExists() + b.alreadyExists()).isEqualTo(2);
      assertThat(a.duplicateInFile() + b.duplicateInFile()).isEqualTo(2);
    }
  }

  @Test
  void malformedLaterSheetRollsBackPreviouslyFlushedBatch() throws Exception {
    String prefix = java.util.UUID.randomUUID().toString();
    String[] numbers =
        java.util.stream.IntStream.range(0, 501).mapToObj(i -> prefix + i).toArray(String[]::new);
    byte[] data;
    try (var book = new XSSFWorkbook(new java.io.ByteArrayInputStream(workbook(numbers)));
        var out = new ByteArrayOutputStream()) {
      book.createSheet("Broken").createRow(1).createCell(0).setCellValue("Wrong header");
      book.write(out);
      data = out.toByteArray();
    }
    long jobs = jdbc.queryForObject("select count(*) from import_jobs", Long.class);
    org.assertj.core.api.Assertions.assertThatThrownBy(
            () -> imports.importWorkbook(new java.io.ByteArrayInputStream(data), null))
        .isInstanceOf(com.meter.fieldwork.global.ApiException.class);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from worksites where consumer_number like ?",
                Integer.class,
                prefix + "%"))
        .isZero();
    assertThat(jdbc.queryForObject("select count(*) from import_jobs", Long.class)).isEqualTo(jobs);
  }

  @Test
  void twentyThousandSyntheticConsumersCanBeImportedWithoutPrivateFile() throws Exception {
    String prefix = "synthetic-" + java.util.UUID.randomUUID();
    try (var book = new org.apache.poi.xssf.streaming.SXSSFWorkbook(100);
        var out = new ByteArrayOutputStream()) {
      var sheet = book.createSheet("Synthetic");
      var header = sheet.createRow(1);
      header.createCell(2).setCellValue("수용가번호");
      header.createCell(3).setCellValue("수용가명");
      header.createCell(4).setCellValue("새주소");
      for (int base : new int[] {12, 24, 36})
        for (int month = 1; month <= 9; month++)
          header.createCell(base + month - 1).setCellValue(String.format("2026.%02d.", month));
      for (int i = 0; i < 20000; i++) {
        var row = sheet.createRow(i + 2);
        row.createCell(2).setCellValue(prefix + String.format("%05d", i));
        row.createCell(3).setCellValue("Synthetic only");
      }
      book.write(out);
      long start = System.nanoTime();
      var result =
          imports.importWorkbook(new java.io.ByteArrayInputStream(out.toByteArray()), null);
      assertThat(result.totalRows()).isEqualTo(20000);
      assertThat(result.inserted()).isEqualTo(20000);
      System.out.println(
          "SYNTHETIC_IMPORT rows=20000 elapsedMs=" + (System.nanoTime() - start) / 1_000_000);
    }
  }

  @Test
  void rejectsChangedMonthlyHeadersInsteadOfAssigningWrongYear() throws Exception {
    byte[] data;
    try (var book = new XSSFWorkbook(new java.io.ByteArrayInputStream(workbook("wrong-year")));
        var out = new ByteArrayOutputStream()) {
      book.getSheetAt(0).getRow(1).createCell(12).setCellValue("2025.01.");
      book.write(out);
      data = out.toByteArray();
    }
    org.assertj.core.api.Assertions.assertThatThrownBy(
            () -> imports.importWorkbook(new java.io.ByteArrayInputStream(data), null))
        .isInstanceOf(com.meter.fieldwork.global.ApiException.class);
  }
}
