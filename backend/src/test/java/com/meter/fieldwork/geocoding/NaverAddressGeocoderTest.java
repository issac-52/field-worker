package com.meter.fieldwork.geocoding;

import static org.assertj.core.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.global.ApiException;
import org.junit.jupiter.api.Test;

class NaverAddressGeocoderTest {
  ObjectMapper json = new ObjectMapper();

  @Test
  void ambiguousAndMissingResultsAreNeverAssigned() throws Exception {
    assertThat(
            NaverAddressGeocoder.parse(
                json.readTree("{\"status\":\"OK\",\"meta\":{\"totalCount\":0},\"addresses\":[]}")))
        .isNull();
    assertThat(
            NaverAddressGeocoder.parse(
                json.readTree(
                    "{\"status\":\"OK\",\"meta\":{\"totalCount\":2},\"addresses\":[{},{}]}")))
        .isNull();
  }

  @Test
  void providerXYMeansLongitudeLatitude() throws Exception {
    var match =
        NaverAddressGeocoder.parse(
            json.readTree(
                "{\"status\":\"OK\",\"meta\":{\"totalCount\":1},\"addresses\":[{\"x\":\"128.7\",\"y\":\"35.8\",\"roadAddress\":\"Test"
                    + " road\"}]}"));
    assertThat(match.latitude()).isEqualByComparingTo("35.8");
    assertThat(match.longitude()).isEqualByComparingTo("128.7");
  }

  @Test
  void missingKeysFailWithActionableMessage() {
    assertThatThrownBy(() -> new NaverAddressGeocoder("", "").find("Test road"))
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("키 설정");
  }
}
