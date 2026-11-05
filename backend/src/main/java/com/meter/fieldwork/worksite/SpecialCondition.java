package com.meter.fieldwork.worksite;

public enum SpecialCondition {
  NONE("해당 없음"),
  HOPE("호폐"),
  LOCATION_UNKNOWN("위치불명"),
  STACKED("적재"),
  OTHER("기타");
  public final String label;

  SpecialCondition(String label) {
    this.label = label;
  }
}
