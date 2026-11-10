package com.meter.fieldwork.worksite;

import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.global.ApiResult;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class WorksiteController {
  private final WorksiteService sites;

  public WorksiteController(WorksiteService sites) {
    this.sites = sites;
  }

  public static boolean admin(SessionUser actor) {
    return actor.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
  }

  @GetMapping("/api/sites")
  ApiResult<?> list(
      @ModelAttribute WorksiteService.Filter filter,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int pageSize,
      @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(sites.page(filter, page, pageSize, admin(actor)));
  }

  @GetMapping("/api/sites/{id}")
  ApiResult<?> detail(@PathVariable long id, @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(sites.detail(id, admin(actor)));
  }

  @GetMapping("/api/blocks")
  ApiResult<?> blocks() {
    return ApiResult.ok(sites.blocks());
  }

  @GetMapping("/api/site-summary")
  ApiResult<?> summary(
      @ModelAttribute WorksiteService.Filter filter, @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(sites.summary(filter, actor.id(), admin(actor)));
  }

  public record Condition(SpecialCondition code, String description) {}

  @PatchMapping("/api/sites/{id}/special-condition")
  ApiResult<?> condition(
      @PathVariable long id,
      @RequestBody Condition body,
      @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(
        sites.condition(id, actor.id(), body.code(), body.description(), admin(actor)));
  }

  public record ConsumerNumber(String consumerNumber) {}

  @PatchMapping("/api/admin/sites/{id}/consumer-number")
  ApiResult<?> registerConsumerNumber(
      @PathVariable long id,
      @RequestBody ConsumerNumber body,
      @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(sites.registerConsumerNumber(id, actor.id(), body.consumerNumber()));
  }

  public record Note(String note) {}

  @PatchMapping("/api/sites/{id}/note")
  ApiResult<?> note(
      @PathVariable long id, @RequestBody Note body, @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(sites.note(id, actor.id(), body.note(), admin(actor)));
  }
}
