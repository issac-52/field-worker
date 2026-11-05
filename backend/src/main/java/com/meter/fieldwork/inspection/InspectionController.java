package com.meter.fieldwork.inspection;

import static com.meter.fieldwork.inspection.InspectionRules.Phase;
import static com.meter.fieldwork.worksite.WorksiteController.admin;

import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.global.ApiResult;
import com.meter.fieldwork.worksite.WorksiteService;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sites/{id}/measurements")
public class InspectionController {
  private final InspectionService inspections;
  private final WorksiteService sites;

  public InspectionController(InspectionService inspections, WorksiteService sites) {
    this.inspections = inspections;
    this.sites = sites;
  }

  public record Record(Phase phase, LocalDate date, BigDecimal reading, Long workerId) {}

  @PostMapping
  ApiResult<?> record(
      @PathVariable long id, @RequestBody Record body, @AuthenticationPrincipal SessionUser actor) {
    inspections.record(
        id, body.phase(), body.date(), body.reading(), body.workerId(), actor.id(), admin(actor));
    return ApiResult.ok(sites.detail(id, admin(actor)));
  }

  public record Correction(LocalDate date, BigDecimal reading, Instant expectedUpdatedAt) {}

  @GetMapping("/{phase}/history")
  ApiResult<?> history(
      @PathVariable long id,
      @PathVariable Phase phase,
      @RequestParam(required = false) Long beforeId,
      @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(inspections.history(id, phase, beforeId, actor.id(), admin(actor)));
  }

  @PatchMapping("/{phase}")
  ApiResult<?> correct(
      @PathVariable long id,
      @PathVariable Phase phase,
      @RequestBody Correction body,
      @AuthenticationPrincipal SessionUser actor) {
    inspections.correct(
        id, phase, body.date(), body.reading(), body.expectedUpdatedAt(), actor.id(), admin(actor));
    return ApiResult.ok(sites.detail(id, admin(actor)));
  }
}
