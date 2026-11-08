package com.meter.fieldwork.excel;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.meter.fieldwork.PostgresIntegrationTest;
import java.io.*;
import java.util.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMockMvc
class ExcelRepairIntegrationTest extends PostgresIntegrationTest {
  @Autowired JdbcTemplate db;
  @Autowired MockMvc mvc;
  @Autowired com.meter.fieldwork.user.repository.UserRepository users;

  byte[] workbook(String number) throws Exception {
    try (var book = new XSSFWorkbook();
        var out = new ByteArrayOutputStream()) {
      var sheet = book.createSheet("Test");
      var h = sheet.createRow(1);
      h.createCell(2).setCellValue("수용가번호");
      h.createCell(3).setCellValue("수용가명");
      h.createCell(4).setCellValue("새주소");
      for (int base : new int[] {12, 24, 36})
        for (int m = 1; m <= 9; m++)
          h.createCell(base + m - 1).setCellValue(String.format("2026.%02d.", m));
      for (int i = 0; i < 3; i++) {
        var r = sheet.createRow(2 + i);
        r.createCell(2).setCellValue(i == 2 ? "unknown-" + number : number);
        r.createCell(3).setCellValue("Recovered name");
        r.createCell(4).setCellValue("Different address");
        r.createCell(9).setCellValue("15");
        r.createCell(12).setCellValue("999");
      }
      book.write(out);
      return out.toByteArray();
    }
  }

  @Test
  void fillsOnlyMissingBasicFieldsAndPreservesOperationalDataAndIsIdempotent() throws Exception {
    long actorId =
        db.queryForObject(
            "insert into users(login_id,nickname,password,role,must_change_password)"
                + " values(?,'Admin','unused','ADMIN',false) returning id",
            Long.class,
            UUID.randomUUID().toString());
    var actor = new com.meter.fieldwork.auth.SessionUser(users.findById(actorId).orElseThrow());
    String number = UUID.randomUUID().toString();
    UUID job = UUID.randomUUID();
    db.update("insert into import_jobs(id) values(?)", job);
    long site =
        db.queryForObject(
            "insert into"
                + " worksites(consumer_number,name,address,latitude,longitude,note,source_cells,source_sheet,source_row,import_job_id)"
                + " values(?,'  ','Keep address',35,128,'Keep note','{\"D\":\"\",\"AX\":\"Keep"
                + " shop\"}','Original',3,?) returning id",
            Long.class,
            number,
            job);
    var file =
        new MockMultipartFile("file", "test.xlsx", "application/octet-stream", workbook(number));
    mvc.perform(multipart("/api/admin/imports/repair").file(file).with(user(actor)).with(csrf()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.updated").value(1))
        .andExpect(jsonPath("$.data.duplicateInFile").value(1))
        .andExpect(jsonPath("$.data.notFound").value(1));
    var row =
        db.queryForMap(
            "select name,address,latitude,longitude,note,source_cells->>'J' as"
                + " diameter,source_cells->>'AX' as business_name from worksites where id=?",
            site);
    assertThat(row.get("name")).isEqualTo("Recovered name");
    assertThat(row.get("address")).isEqualTo("Keep address");
    assertThat(row.get("note")).isEqualTo("Keep note");
    assertThat(row.get("diameter")).isEqualTo("15");
    assertThat(row.get("business_name")).isEqualTo("Keep shop");
    assertThat(((java.math.BigDecimal) row.get("latitude"))).isEqualByComparingTo("35");
    mvc.perform(multipart("/api/admin/imports/repair").file(file).with(user(actor)).with(csrf()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.updated").value(0))
        .andExpect(jsonPath("$.data.unchanged").value(1));
    assertThat(
            db.queryForObject(
                "select count(*) from worksites where consumer_number=?",
                Integer.class,
                "unknown-" + number))
        .isZero();
  }

  @Test
  void repairRequiresAdminAndCsrf() throws Exception {
    var file =
        new MockMultipartFile("file", "test.xlsx", "application/octet-stream", workbook("test"));
    mvc.perform(
            multipart("/api/admin/imports/repair")
                .file(file)
                .with(user("worker").roles("WORKER"))
                .with(csrf()))
        .andExpect(status().isForbidden());
    mvc.perform(
            multipart("/api/admin/imports/repair").file(file).with(user("admin").roles("ADMIN")))
        .andExpect(status().isForbidden());
  }
}
