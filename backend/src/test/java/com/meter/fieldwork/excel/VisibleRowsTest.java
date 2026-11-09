package com.meter.fieldwork.excel;

import static org.assertj.core.api.Assertions.*;

import java.io.*;
import java.util.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

class VisibleRowsTest {
  static byte[] workbook(String visible, String hidden) throws Exception {
    try (var book = new XSSFWorkbook();
        var out = new ByteArrayOutputStream()) {
      var sheet = book.createSheet("Test");
      var h = sheet.createRow(1);
      h.createCell(2).setCellValue("수용가번호");
      h.createCell(3).setCellValue("수용가명");
      h.createCell(4).setCellValue("새주소");
      sheet.createRow(2).createCell(2).setCellValue(hidden);
      sheet.getRow(2).setZeroHeight(true);
      sheet.createRow(3).createCell(2).setCellValue(visible);
      book.write(out);
      return out.toByteArray();
    }
  }

  @Test
  void reportsHiddenRowsAndOriginalNumbersWithoutDroppingVisibleRows() throws Exception {
    var rows = new ArrayList<ExcelRows.Row>();
    new ExcelRows().read(new ByteArrayInputStream(workbook("visible", "hidden")), rows::add);
    assertThat(rows).hasSize(2);
    assertThat(rows.getFirst().hidden()).isTrue();
    assertThat(rows.getFirst().number()).isEqualTo(3);
    assertThat(rows.getLast().hidden()).isFalse();
    assertThat(rows.getLast().cell("C")).isEqualTo("visible");
  }
}
