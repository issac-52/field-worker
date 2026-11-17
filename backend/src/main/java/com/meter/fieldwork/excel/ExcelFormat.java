package com.meter.fieldwork.excel;

import java.util.Map;

/** Explicit workbook layouts, normalized to the existing basic-information keys. */
public enum ExcelFormat {
  LEGACY,
  FINAL;

  public static final String FINAL_SHEET = "@@@수용가 전수(검침조사)";
  static final Map<String, String> FINAL_COLUMNS =
      Map.ofEntries(
          Map.entry("C", "C"),
          Map.entry("D", "D"),
          Map.entry("E", "E"),
          Map.entry("F", "F"),
          Map.entry("L", "I"),
          Map.entry("M", "J"),
          Map.entry("N", "K"),
          Map.entry("Q", "L"),
          Map.entry("AC", "AX"),
          Map.entry("AD", "G"),
          Map.entry("AE", "AZ"),
          Map.entry("AF", "B"),
          Map.entry("AG", "BB"),
          Map.entry("AH", "BC"),
          Map.entry("AI", "BD"),
          Map.entry("AJ", "BE"));

  int headerIndex() {
    return this == FINAL ? 2 : 1;
  }

  String column(String input) {
    return this == FINAL ? FINAL_COLUMNS.get(input) : input;
  }
}
