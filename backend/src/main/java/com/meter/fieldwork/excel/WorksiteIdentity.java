package com.meter.fieldwork.excel;

/** Legacy hidden-row deletion identity, separate from address-only registration checks. */
record WorksiteIdentity(String number, String address, String name) {
  static WorksiteIdentity from(ExcelRows.Row row) {
    return of(row.cell("C"), row.cell("E"), row.cell("D"));
  }

  static WorksiteIdentity of(String number, String address, String name) {
    if (number != null && !number.isBlank()) return new WorksiteIdentity(number, null, null);
    String a = normalize(address), n = normalize(name);
    return a.isEmpty() || n.isEmpty() ? null : new WorksiteIdentity(null, a, n);
  }

  // Same ASCII whitespace set as the database identity function. Do not infer address equivalence.
  static String normalize(String value) {
    return value == null ? "" : value.replaceAll("[ \\t\\n\\r\\f\\u000B]+", " ").trim();
  }
}
