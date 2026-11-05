package com.meter.fieldwork.settlement;

import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.global.ApiResult;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class SettlementController {
  private final SettlementService settlements;

  public SettlementController(SettlementService settlements) {
    this.settlements = settlements;
  }

  @GetMapping("/api/fee-rules")
  ApiResult<?> rules() {
    return ApiResult.ok(settlements.rules());
  }

  @PostMapping("/api/fee-rules")
  ApiResult<?> add(@RequestBody SettlementService.Rule rule) {
    return ApiResult.ok(settlements.add(rule));
  }

  public record Amount(Long amount) {}

  @PatchMapping("/api/fee-rules/{id}")
  ApiResult<?> rate(@PathVariable long id, @RequestBody Amount amount) {
    return ApiResult.ok(settlements.changeRate(id, amount.amount()));
  }

  @GetMapping("/api/settlements")
  ApiResult<?> page(
      @ModelAttribute SettlementService.Filter filter,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int pageSize) {
    return ApiResult.ok(settlements.page(filter, page, pageSize, true));
  }

  @GetMapping("/api/my-settlements")
  ApiResult<?> own(
      @ModelAttribute SettlementService.Filter filter,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int pageSize,
      @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(
        settlements.page(
            new SettlementService.Filter(
                filter.middleBlockId(),
                filter.smallBlockId(),
                actor.id(),
                filter.phase(),
                filter.startDate(),
                filter.endDate()),
            page,
            pageSize,
            false));
  }

  @PostMapping("/api/admin/fee-adjustments/preview")
  ApiResult<?> preview(@RequestBody SettlementService.Adjustment body) {
    return ApiResult.ok(settlements.preview(body));
  }

  @PostMapping("/api/admin/fee-adjustments")
  ApiResult<?> adjust(
      @RequestBody SettlementService.Adjustment body, @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(settlements.adjust(body, actor.id()));
  }

  @GetMapping("/api/admin/fee-adjustments")
  ApiResult<?> history() {
    return ApiResult.ok(settlements.history());
  }

  public record Selection(List<Long> inspectionIds) {}

  @PostMapping("/api/admin/settlements/confirm")
  ApiResult<?> confirm(@RequestBody Selection body, @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(settlements.transition(body.inspectionIds(), actor.id(), false));
  }

  @PostMapping("/api/admin/settlements/pay")
  ApiResult<?> pay(@RequestBody Selection body, @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(settlements.transition(body.inspectionIds(), actor.id(), true));
  }
}
