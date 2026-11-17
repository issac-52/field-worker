package com.meter.fieldwork.excel;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.meter.fieldwork.PostgresIntegrationTest;
import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.user.repository.UserRepository;
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
class FinalExcelImportTest extends PostgresIntegrationTest {
  @Autowired JdbcTemplate db;
  @Autowired MockMvc mvc;
  @Autowired UserRepository users;

  SessionUser actor() {
    long id =
        db.queryForObject(
            "insert into users(login_id,nickname,password,role,must_change_password)"
                + " values(?,'Test','unused','ADMIN',false) returning id",
            Long.class,
            UUID.randomUUID().toString());
    return new SessionUser(users.findById(id).orElseThrow());
  }

  byte[] book(
      String sheetName,
      boolean legacy,
      String number,
      String name,
      String address,
      boolean duplicate)
      throws Exception {
    try (var b = new XSSFWorkbook();
        var out = new ByteArrayOutputStream()) {
      if (!legacy)
        b.createSheet("Unrelated reference").createRow(0).createCell(0).setCellValue("Ignored");
      var s = b.createSheet(sheetName);
      var h = s.createRow(legacy ? 1 : 2);
      Map<String, String> headers =
          legacy
              ? Map.of("C", "수용가번호", "D", "수용가명", "E", "새주소")
              : Map.ofEntries(
                  Map.entry("C", "수용가번호"),
                  Map.entry("D", "수용가명"),
                  Map.entry("E", "새주소"),
                  Map.entry("F", "주소"),
                  Map.entry("L", "업종"),
                  Map.entry("M", "구경"),
                  Map.entry("N", "가구수"),
                  Map.entry("Q", "하"),
                  Map.entry("AC", "상호"),
                  Map.entry("AD", "계량기번호"),
                  Map.entry("AE", "수전번호"),
                  Map.entry("AF", "대블럭"),
                  Map.entry("AG", "소블럭"),
                  Map.entry("AH", "검침담당"),
                  Map.entry("AI", "정례검침일"),
                  Map.entry("AJ", "관리번호"));
      headers.forEach(
          (col, v) ->
              h.createCell(org.apache.poi.ss.util.CellReference.convertColStringToIndex(col))
                  .setCellValue(v));
      for (int i = 0; i < (duplicate ? 2 : 1); i++) {
        var r = s.createRow((legacy ? 2 : 3) + i);
        Map<String, String> values =
            new HashMap<>(
                Map.of("C", number, "D", i == 0 ? name : "Ignored duplicate", "E", address));
        if (!legacy)
          values.putAll(
              Map.ofEntries(
                  Map.entry("F", "Fictional old road"),
                  Map.entry("G", "REMOTE-IGNORED"),
                  Map.entry("H", "REMOVAL-IGNORED"),
                  Map.entry("L", "일반용"),
                  Map.entry("M", "25"),
                  Map.entry("N", "3"),
                  Map.entry("Q", "하값"),
                  Map.entry("R", "MONTHLY-IGNORED"),
                  Map.entry("AC", "Fictional shop"),
                  Map.entry("AD", "METER-NEW"),
                  Map.entry("AE", "SUPPLY"),
                  Map.entry("AF", "MIDDLE"),
                  Map.entry("AG", "SMALL"),
                  Map.entry("AH", "Fictional reader"),
                  Map.entry("AI", "15"),
                  Map.entry("AJ", "DUPLICABLE")));
        values.forEach(
            (col, v) ->
                r.createCell(org.apache.poi.ss.util.CellReference.convertColStringToIndex(col))
                    .setCellValue(v));
      }
      b.write(out);
      return out.toByteArray();
    }
  }

  org.springframework.test.web.servlet.ResultActions upload(
      byte[] bytes, SessionUser actor, String format, boolean update) throws Exception {
    return mvc.perform(
        multipart("/api/admin/imports")
            .file(
                new MockMultipartFile(
                    "file",
                    "test.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    bytes))
            .param("format", format)
            .param("updateExisting", String.valueOf(update))
            .with(csrf())
            .with(user(actor)));
  }

  @Test
  void finalFormatMapsOnlyTargetSheetAndExistingFieldsThenUpdatesSamePk() throws Exception {
    var actor = actor();
    String number = UUID.randomUUID().toString();
    String address = "Fictional road " + number;
    byte[] initial = book("@@@수용가 전수(검침조사)", false, number, "Initial", address, true);
    upload(initial, actor, "FINAL", true)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.inserted").value(1))
        .andExpect(jsonPath("$.data.duplicateInFile").value(1));
    var first =
        db.queryForMap(
            "select *,source_cells::text as source from worksites where consumer_number=?", number);
    long id = ((Number) first.get("id")).longValue();
    assertThat(first)
        .containsEntry("meter_number", "METER-NEW")
        .containsEntry("middle_block", "MIDDLE")
        .containsEntry("small_block", "SMALL")
        .containsEntry("industry", "일반용");
    assertThat(first.get("source").toString())
        .contains("Fictional shop", "SUPPLY", "하값")
        .doesNotContain("MONTHLY-IGNORED", "REMOTE-IGNORED", "REMOVAL-IGNORED");
    db.update(
        "update worksites set latitude=35,longitude=128,note='Keep note',meter_presence_raw='완료'"
            + " where id=?",
        id);
    db.update(
        "insert into photos(site_id,slot,object_key,content_type,size_bytes,uploaded_by)"
            + " values(?,'OVERVIEW',?,'image/jpeg',1,?)",
        id,
        UUID.randomUUID().toString(),
        actor.id());
    db.update(
        "insert into"
            + " inspections(site_id,phase,inspection_date,reading,worker_id,fee,settlement_status)"
            + " values(?,'START',current_date,100,?,500,'CONFIRMED')",
        id,
        actor.id());
    byte[] changed = book("@@@수용가 전수(검침조사)", false, number, "Updated", address, false);
    upload(changed, actor, "FINAL", true)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.updated").value(1));
    assertThat(
            db.queryForObject(
                "select id from worksites where consumer_number=?", Long.class, number))
        .isEqualTo(id);
    assertThat(db.queryForObject("select name from worksites where id=?", String.class, id))
        .isEqualTo("Updated");
    assertThat(db.queryForObject("select note from worksites where id=?", String.class, id))
        .isEqualTo("Keep note");
    assertThat(
            db.queryForObject("select latitude::int from worksites where id=?", Integer.class, id))
        .isEqualTo(35);
    assertThat(db.queryForObject("select count(*) from photos where site_id=?", Integer.class, id))
        .isEqualTo(1);
    assertThat(
            db.queryForObject(
                "select settlement_status from inspections where site_id=?", String.class, id))
        .isEqualTo("CONFIRMED");
    upload(changed, actor, "FINAL", true)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.unchanged").value(1))
        .andExpect(jsonPath("$.data.updated").value(0));
    upload(book("@@@수용가 전수(검침조사)", false, number, "", address, false), actor, "FINAL", true)
        .andExpect(status().isOk());
    assertThat(db.queryForObject("select name from worksites where id=?", String.class, id))
        .isEqualTo("Updated");
  }

  @Test
  void legacyCanOptIntoUpdatingButDefaultRegistrationStillSkipsExisting() throws Exception {
    var a = actor();
    String n = UUID.randomUUID().toString();
    String address = "Fictional " + n;
    upload(book("Legacy", true, n, "Before", address, false), a, "LEGACY", false)
        .andExpect(status().isOk());
    upload(book("Legacy", true, n, "After", address, false), a, "LEGACY", true)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.updated").value(1));
    upload(book("Legacy", true, n, "Skipped", address, false), a, "LEGACY", false)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.alreadyExists").value(1));
    assertThat(
            db.queryForObject(
                "select name from worksites where consumer_number=?", String.class, n))
        .isEqualTo("After");
  }

  @Test
  void finalVisibleOnlyPreservesHiddenDataAndNumberlessAddressPolicy() throws Exception {
    var a = actor();
    String n = UUID.randomUUID().toString();
    String address = "Fictional new road " + n;
    byte[] bytes = book("@@@수용가 전수(검침조사)", false, n, "Test", address, false);
    try (var b = new XSSFWorkbook(new ByteArrayInputStream(bytes));
        var out = new ByteArrayOutputStream()) {
      var sheet = b.getSheet("@@@수용가 전수(검침조사)");
      sheet.getRow(3).setZeroHeight(true);
      b.write(out);
      mvc.perform(
              multipart("/api/admin/imports")
                  .file(
                      new MockMultipartFile(
                          "file",
                          "test.xlsx",
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                          out.toByteArray()))
                  .param("format", "FINAL")
                  .param("updateExisting", "true")
                  .param("visibleOnly", "true")
                  .with(csrf())
                  .with(user(a)))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.data.hiddenRows").value(1))
          .andExpect(jsonPath("$.data.inserted").value(0));
    }
    upload(book("@@@수용가 전수(검침조사)", false, "", "", address, false), a, "FINAL", true)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.inserted").value(1));
    upload(book("@@@수용가 전수(검침조사)", false, "", "New name", address, false), a, "FINAL", true)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.invalid").value(1))
        .andExpect(
            jsonPath("$.data.skippedRows[0].reason").value("DUPLICATE_ADDRESS_WITHOUT_NUMBER"));
    assertThat(
            db.queryForObject(
                "select name from worksites where consumer_number is null and address=?",
                String.class,
                address))
        .isEmpty();
  }

  @Test
  void finalSelectionRejectsMissingTargetAndWrongFormatWithoutPartialImport() throws Exception {
    var a = actor();
    String n = UUID.randomUUID().toString();
    upload(book("Other", false, n, "Test", "Fictional", false), a, "FINAL", true)
        .andExpect(status().isBadRequest());
    upload(book("@@@수용가 전수(검침조사)", false, n, "Test", "Fictional", false), a, "LEGACY", true)
        .andExpect(status().isBadRequest());
    assertThat(
            db.queryForObject(
                "select count(*) from worksites where consumer_number=?", Integer.class, n))
        .isZero();
  }

  @Autowired com.meter.fieldwork.worksite.WorksiteService sites;

  @org.junit.jupiter.params.ParameterizedTest
  @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
  void changedAddressClearsCoordinatesAndNextGeocodingUsesNewAddress(boolean legacy)
      throws Exception {
    var a = actor();
    String n = UUID.randomUUID().toString();
    String format = legacy ? "LEGACY" : "FINAL";
    String sheet = legacy ? "Legacy" : ExcelFormat.FINAL_SHEET;
    upload(book(sheet, legacy, n, "Test", "Fictional previous " + n, false), a, format, true)
        .andExpect(status().isOk());
    long id = db.queryForObject("select id from worksites where consumer_number=?", Long.class, n);
    db.update("update worksites set latitude=35,longitude=128 where id=?", id);
    String address = "Fictional updated " + n;
    upload(book(sheet, legacy, n, "Test", address, false), a, format, true)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.updated").value(1));
    assertThat(
            db.queryForObject(
                "select latitude from worksites where id=?", java.math.BigDecimal.class, id))
        .isNull();
    assertThat(
            db.queryForObject(
                "select longitude from worksites where id=?", java.math.BigDecimal.class, id))
        .isNull();
    assertThat(
            db.queryForObject(
                "select before_value->>'latitude' from worksite_edits where site_id=? order by id"
                    + " desc limit 1",
                String.class,
                id))
        .isEqualTo("35.0000000");
    assertThat(
            db.queryForObject(
                "select jsonb_exists(after_value,'latitude') and after_value->>'latitude' is null"
                    + " from worksite_edits where site_id=? order by id desc limit 1",
                Boolean.class,
                id))
        .isTrue();
    db.update("update worksites set middle_block=? where id=?", "Geo " + n, id);
    var geocoder = org.mockito.Mockito.mock(com.meter.fieldwork.geocoding.AddressGeocoder.class);
    org.mockito.Mockito.when(geocoder.find("Test region " + address))
        .thenReturn(
            new com.meter.fieldwork.geocoding.AddressGeocoder.Match(
                new java.math.BigDecimal("36"), new java.math.BigDecimal("129"), address));
    var geocoding = new com.meter.fieldwork.geocoding.GeocodingService(db, geocoder, sites);
    var result =
        geocoding.run(
            new com.meter.fieldwork.geocoding.GeocodingService.Request(
                id - 1, id, "Test region", "Geo " + n, null, null),
            a.id());
    assertThat(result.rows()).hasSize(1);
    assertThat(result.rows().getFirst().status()).isEqualTo("UPDATED");
    assertThat(
            db.queryForObject(
                "select latitude from worksites where id=?", java.math.BigDecimal.class, id))
        .isEqualByComparingTo("36");
    assertThat(
            db.queryForObject(
                "select longitude from worksites where id=?", java.math.BigDecimal.class, id))
        .isEqualByComparingTo("129");
  }

  @org.junit.jupiter.params.ParameterizedTest
  @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
  void fallbackAddressChangesClearCoordinatesOnlyWhenUsedForGeocoding(boolean legacy)
      throws Exception {
    var a = actor();
    String n = UUID.randomUUID().toString();
    String format = legacy ? "LEGACY" : "FINAL";
    String sheet = legacy ? "Legacy" : ExcelFormat.FINAL_SHEET;
    byte[] file = book(sheet, legacy, n, "Test", "", false);
    upload(file, a, format, true).andExpect(status().isOk());
    long id = db.queryForObject("select id from worksites where consumer_number=?", Long.class, n);
    db.update(
        "update worksites set latitude=35,longitude=128,old_address='Fictional previous fallback'"
            + " where id=?",
        id);
    try (var b = new XSSFWorkbook(new ByteArrayInputStream(file));
        var out = new ByteArrayOutputStream()) {
      b.getSheet(sheet).getRow(legacy ? 2 : 3).createCell(5).setCellValue("Fictional new fallback");
      b.write(out);
      file = out.toByteArray();
    }
    upload(file, a, format, true).andExpect(status().isOk());
    assertThat(
            db.queryForObject(
                "select latitude from worksites where id=?", java.math.BigDecimal.class, id))
        .isNull();
    assertThat(
            db.queryForObject(
                "select longitude from worksites where id=?", java.math.BigDecimal.class, id))
        .isNull();
  }

  @org.junit.jupiter.params.ParameterizedTest
  @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
  void sameEffectiveAddressAndBlankUploadsPreserveCoordinates(boolean legacy) throws Exception {
    var a = actor();
    String n = UUID.randomUUID().toString();
    String format = legacy ? "LEGACY" : "FINAL";
    String sheet = legacy ? "Legacy" : ExcelFormat.FINAL_SHEET;
    String address = "Fictional same " + n;
    upload(book(sheet, legacy, n, "Test", address, false), a, format, true)
        .andExpect(status().isOk());
    long id = db.queryForObject("select id from worksites where consumer_number=?", Long.class, n);
    db.update(
        "update worksites set latitude=35,longitude=128,old_address='Old fallback' where id=?", id);
    byte[] file = book(sheet, legacy, n, "Changed name", "  " + address + "  ", false);
    try (var b = new XSSFWorkbook(new ByteArrayInputStream(file));
        var out = new ByteArrayOutputStream()) {
      b.getSheet(sheet)
          .getRow(legacy ? 2 : 3)
          .createCell(5)
          .setCellValue("Different unused fallback");
      b.write(out);
      file = out.toByteArray();
    }
    upload(file, a, format, true).andExpect(status().isOk());
    upload(book(sheet, legacy, n, "Changed name", "", false), a, format, true)
        .andExpect(status().isOk());
    assertThat(
            db.queryForObject(
                "select latitude from worksites where id=?", java.math.BigDecimal.class, id))
        .isEqualByComparingTo("35");
    assertThat(
            db.queryForObject(
                "select longitude from worksites where id=?", java.math.BigDecimal.class, id))
        .isEqualByComparingTo("128");
  }
}
