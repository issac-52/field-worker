package com.meter.fieldwork.excel;

import static org.assertj.core.api.Assertions.*;

import com.meter.fieldwork.PostgresIntegrationTest;
import com.meter.fieldwork.worksite.WorksiteService;
import java.io.*;
import java.util.*;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class MeterRemarkIntegrationTest extends PostgresIntegrationTest {
  @Autowired ExcelImportService imports;
  @Autowired ExcelRepairService repairs;
  @Autowired ExcelExportService exports;
  @Autowired WorksiteService sites;
  @Autowired JdbcTemplate db;

  byte[] workbook(String block, String... values) throws Exception {
    try (var book = new XSSFWorkbook();
        var out = new ByteArrayOutputStream()) {
      var sheet = book.createSheet("Synthetic");
      var header = sheet.createRow(1);
      header.createCell(2).setCellValue("수용가번호");
      header.createCell(3).setCellValue("수용가명");
      header.createCell(4).setCellValue("새주소");
      for (int i = 0; i < values.length; i++) {
        var row = sheet.createRow(i + 2);
        row.createCell(1).setCellValue(block);
        row.createCell(2).setCellValue(block + "-" + i);
        row.createCell(3).setCellValue("Fictional person " + i);
        row.createCell(4).setCellValue("Fictional road " + i);
        row.createCell(7).setCellValue(values[i]);
      }
      book.write(out);
      return out.toByteArray();
    }
  }

  @Test
  @SuppressWarnings("unchecked")
  void importsAndExportsOnlyCompletedPresenceAndMovesOtherTextToSeparateRemarks() throws Exception {
    String block = UUID.randomUUID().toString();
    String[] raw = {"완료", " 완료 ", "미설치", "위치 확인 필요", "", "=1+1", "완료(추가 확인)"};
    String[] remarks = {"", "", "미설치", "위치 확인 필요", "", "=1+1", "완료(추가 확인)"};
    var result = imports.importWorkbook(new ByteArrayInputStream(workbook(block, raw)), null);
    assertThat(result.inserted()).isEqualTo(raw.length);
    db.update(
        "update worksites set note='Keep field note',special_condition='HOPE' where middle_block=?",
        block);
    for (int i = 0; i < raw.length; i++) {
      var stored =
          db.queryForMap(
              "select id,meter_presence_raw,source_cells->>'H' as original from worksites where"
                  + " consumer_number=?",
              block + "-" + i);
      long id = ((Number) stored.get("id")).longValue();
      var detail = sites.detail(id, true);
      assertThat(detail.get("meterPresenceRaw")).isEqualTo(i < 2 ? "완료" : "");
      assertThat(detail.get("importRemark")).isEqualTo(remarks[i]);
      assertThat(detail.get("note")).isEqualTo("Keep field note");
      assertThat(((Map<?, ?>) detail.get("specialCondition")).get("code")).isEqualTo("HOPE");
      assertThat(stored.get("meter_presence_raw")).isEqualTo(raw[i]);
      assertThat(Objects.toString(stored.get("original"), "")).isEqualTo(raw[i]);
    }
    var page = sites.page(new WorksiteService.Filter(block, null, null, null), 1, 100, false);
    for (var item : (List<Map<String, Object>>) page.get("items")) {
      var detail = sites.detail(((Number) item.get("id")).longValue(), false);
      assertThat(item.get("importRemark")).isEqualTo(detail.get("importRemark"));
    }
    // Older rows can have H only in retained source cells, before repair has filled a column.
    db.update("update worksites set meter_presence_raw='' where consumer_number=?", block + "-2");
    long oldId =
        db.queryForObject(
            "select id from worksites where consumer_number=?", Long.class, block + "-2");
    assertThat(sites.detail(oldId, true).get("importRemark")).isEqualTo("미설치");
    var out = new ByteArrayOutputStream();
    exports.write(out, block, null);
    try (var book = new XSSFWorkbook(new ByteArrayInputStream(out.toByteArray()))) {
      var sheet = book.getSheetAt(0);
      assertThat(sheet.getRow(0).getCell(7).getStringCellValue()).isEqualTo("계량기 유무");
      assertThat(sheet.getRow(0).getCell(20).getStringCellValue()).isEqualTo("비고");
      for (int i = 0; i < raw.length; i++) {
        var row = sheet.getRow(i + 1);
        assertThat(row.getCell(7).getStringCellValue()).isEqualTo(i < 2 ? "완료" : "");
        assertThat(row.getCell(17).getStringCellValue()).isEqualTo("호폐");
        assertThat(row.getCell(20).getStringCellValue()).isEqualTo(remarks[i]);
        assertThat(row.getCell(20).getCellType()).isEqualTo(CellType.STRING);
      }
    }
  }

  @Test
  void repairClassifiesNewHWithoutOverwritingExistingSourceOrFieldConditions() throws Exception {
    String block = UUID.randomUUID().toString();
    imports.importWorkbook(new ByteArrayInputStream(workbook(block, "", "기존 확인 내용")), null);
    long actor =
        db.queryForObject(
            "insert into users(login_id,nickname,password,role) values(?,'Test"
                + " admin','unused','ADMIN') returning id",
            Long.class,
            block);
    repairs.repair(new ByteArrayInputStream(workbook(block, "미설치", "완료")), actor);
    long first =
        db.queryForObject(
            "select id from worksites where consumer_number=?", Long.class, block + "-0");
    long second =
        db.queryForObject(
            "select id from worksites where consumer_number=?", Long.class, block + "-1");
    assertThat(sites.detail(first, true).get("meterPresenceRaw")).isEqualTo("");
    assertThat(sites.detail(first, true).get("importRemark")).isEqualTo("미설치");
    assertThat(sites.detail(second, true).get("importRemark")).isEqualTo("기존 확인 내용");
    assertThat(
            db.queryForObject(
                "select source_cells->>'H' from worksites where id=?", String.class, second))
        .isEqualTo("기존 확인 내용");
  }
}
