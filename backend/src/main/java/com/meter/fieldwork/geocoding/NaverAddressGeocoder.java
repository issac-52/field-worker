package com.meter.fieldwork.geocoding;

import com.fasterxml.jackson.databind.JsonNode;
import com.meter.fieldwork.global.ApiException;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class NaverAddressGeocoder implements AddressGeocoder {
  private final RestClient client;
  private final String key;
  private final String secret;

  public NaverAddressGeocoder(
      @Value("${NAVER_GEOCODING_CLIENT_ID:}") String key,
      @Value("${NAVER_GEOCODING_CLIENT_SECRET:}") String secret) {
    this.key = key;
    this.secret = secret;
    var factory =
        new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
    factory.setReadTimeout(Duration.ofSeconds(5));
    client =
        RestClient.builder()
            .requestFactory(factory)
            .baseUrl("https://maps.apigw.ntruss.com")
            .build();
  }

  @Override
  public Match find(String address) {
    if (key.isBlank() || secret.isBlank())
      throw new ApiException(503, "GEOCODING_NOT_CONFIGURED", "서버의 NAVER Geocoding 키 설정이 필요합니다.");
    try {
      var body =
          client
              .get()
              .uri(
                  b ->
                      b.path("/map-geocode/v2/geocode")
                          .queryParam("query", address)
                          .queryParam("count", 1)
                          .build())
              .header("x-ncp-apigw-api-key-id", key)
              .header("x-ncp-apigw-api-key", secret)
              .retrieve()
              .body(JsonNode.class);
      return parse(body);
    } catch (ApiException ex) {
      throw ex;
    } catch (org.springframework.web.client.RestClientResponseException ex) {
      throw providerError(ex.getStatusCode().value());
    } catch (Exception ex) {
      // Provider exceptions can contain the personal address/credentials; do not expose them.
      throw new ApiException(
          502, "GEOCODING_UNAVAILABLE", "주소 변환 서비스 호출에 실패했습니다. API 권한·할당량·연결을 확인하세요.");
    }
  }

  static ApiException providerError(int status) {
    return switch (status) {
      case 401, 403 ->
          new ApiException(502, "GEOCODING_ACCESS_DENIED", "NAVER Geocoding 키 또는 API 권한을 확인하세요.");
      case 429 ->
          new ApiException(
              502,
              "GEOCODING_RATE_LIMITED",
              "NAVER Geocoding 호출 한도에 도달했습니다. 할당량을 확인하고 잠시 후 다시 실행하세요.");
      default ->
          new ApiException(
              502, "GEOCODING_UNAVAILABLE", "NAVER Geocoding 연결 또는 응답에 문제가 있습니다. 잠시 후 다시 실행하세요.");
    };
  }

  static Match parse(JsonNode body) {
    if (body == null || !"OK".equals(body.path("status").asText()))
      throw new ApiException(502, "GEOCODING_UNAVAILABLE", "주소 변환 서비스 응답을 확인할 수 없습니다.");
    if (body.path("addresses").isEmpty()) return null;
    var item = body.path("addresses").get(0);
    var lat = new java.math.BigDecimal(item.path("y").asText());
    var lon = new java.math.BigDecimal(item.path("x").asText());
    if (lat.abs().compareTo(java.math.BigDecimal.valueOf(90)) > 0
        || lon.abs().compareTo(java.math.BigDecimal.valueOf(180)) > 0)
      throw new ApiException(502, "INVALID_COORDINATES", "주소 변환 결과의 좌표 범위가 올바르지 않습니다.");
    return new Match(lat, lon, item.path("roadAddress").asText(item.path("jibunAddress").asText()));
  }
}
