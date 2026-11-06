package com.meter.fieldwork.inspection;

import com.meter.fieldwork.global.ApiException;
import java.math.BigDecimal;
import java.time.LocalDate;

public final class InspectionRules {
  public enum Phase {
    START,
    END
  }

  private InspectionRules() {}

  public static void validate(Phase phase, LocalDate date, BigDecimal reading) {
    if (phase == null
        || date == null
        || reading == null
        || reading.signum() < 0
        || reading.precision() > 30
        || Math.abs(reading.scale()) > 10
        || date.getYear() != (phase == Phase.START ? 2026 : 2027))
      throw new ApiException(400, "INVALID_MEASUREMENT", "단계별 검침일과 0 이상의 지침을 확인하세요.");
  }

  public static BigDecimal usage(BigDecimal start, BigDecimal end) {
    if (start == null || end == null) return null;
    if (end.compareTo(start) < 0)
      throw new ApiException(400, "END_BELOW_START", "END 지침은 START 지침보다 작을 수 없습니다.");
    return end.subtract(start);
  }
}
