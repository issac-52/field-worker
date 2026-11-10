package com.meter.fieldwork.worksite;

import java.util.Objects;

/** Read/display mapping of original Excel H values; never overwrite the retained source. */
public record ImportedMeterInfo(String presence, String remark) {
  public static ImportedMeterInfo fromRaw(String raw, String retainedSource) {
    String value = raw == null || raw.isBlank() ? Objects.toString(retainedSource, "") : raw;
    value = value.strip();
    return "완료".equals(value) ? new ImportedMeterInfo("완료", "") : new ImportedMeterInfo("", value);
  }
}
