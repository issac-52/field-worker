package com.meter.fieldwork.excel;

import java.util.List;
import java.util.UUID;

public record ImportResult(
    UUID jobId,
    int totalRows,
    int inserted,
    int duplicateInFile,
    int alreadyExists,
    int invalid,
    int hiddenRows,
    List<SkippedRow> skippedRows) {
  public record SkippedRow(
      String sheet,
      int rowNumber,
      String consumerNumber,
      String reason,
      String firstSheet,
      Integer firstRowNumber) {}
}
