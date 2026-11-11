package com.meter.fieldwork.excel;

import org.springframework.jdbc.core.JdbcTemplate;

/** Serializes upload checks and address fills without blocking ordinary site reads/writes. */
final class ExcelUploadLock {
  private ExcelUploadLock() {}

  static void acquire(JdbcTemplate db) {
    db.execute("select pg_advisory_xact_lock(4285103)");
  }
}
