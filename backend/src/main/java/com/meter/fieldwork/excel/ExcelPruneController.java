package com.meter.fieldwork.excel;

import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.global.ApiResult;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/admin/imports/prune")
public class ExcelPruneController {
  private final ExcelPruneService service;

  public ExcelPruneController(ExcelPruneService service) {
    this.service = service;
  }

  @PostMapping("/preview")
  ApiResult<?> preview(@RequestParam MultipartFile file, @AuthenticationPrincipal SessionUser actor)
      throws java.io.IOException {
    try (var input = file.getInputStream()) {
      return ApiResult.ok(service.preview(input, actor.id()));
    }
  }

  public record Confirm(String confirmation) {}

  @PostMapping("/{id}/execute")
  ApiResult<?> execute(
      @PathVariable UUID id,
      @RequestBody Confirm request,
      @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(service.execute(id, actor.id(), request.confirmation()));
  }
}
