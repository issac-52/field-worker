package com.meter.fieldwork.inspection;

import static org.assertj.core.api.Assertions.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class InspectionRulesTest {
  @Test
  void decimalUsageIsExactAndMissingPhaseDoesNotInventZero() {
    assertThat(InspectionRules.usage(new BigDecimal("0.1"), new BigDecimal("0.3")))
        .isEqualByComparingTo("0.2");
    assertThat(InspectionRules.usage(null, BigDecimal.TEN)).isNull();
  }

  @Test
  void reversedAndNegativeReadingsAreRejected() {
    assertThatThrownBy(() -> InspectionRules.usage(BigDecimal.TEN, BigDecimal.ONE))
        .isInstanceOf(com.meter.fieldwork.global.ApiException.class);
    assertThatThrownBy(
            () ->
                InspectionRules.validate(
                    InspectionRules.Phase.START, LocalDate.of(2026, 11, 5), new BigDecimal("-1")))
        .isInstanceOf(com.meter.fieldwork.global.ApiException.class);
  }
}
