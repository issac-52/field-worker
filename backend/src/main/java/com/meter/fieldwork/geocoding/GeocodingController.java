package com.meter.fieldwork.geocoding;

import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.global.ApiResult;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class GeocodingController {
  private final GeocodingService service;

  public GeocodingController(GeocodingService service) {
    this.service = service;
  }

  @PostMapping("/api/admin/geocoding")
  ApiResult<?> run(
      @RequestBody GeocodingService.Request request, @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(service.run(request, actor.id()));
  }
}
