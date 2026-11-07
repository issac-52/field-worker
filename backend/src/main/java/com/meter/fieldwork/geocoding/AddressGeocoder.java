package com.meter.fieldwork.geocoding;

import java.math.BigDecimal;

public interface AddressGeocoder {
  record Match(BigDecimal latitude, BigDecimal longitude, String address) {}

  Match find(String address);
}
