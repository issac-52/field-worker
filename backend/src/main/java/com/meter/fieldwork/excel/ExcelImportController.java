package com.meter.fieldwork.excel;

import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.global.ApiResult;
import java.io.IOException;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/admin/imports")
public class ExcelImportController {
  private final ExcelImportService imports;

  private final ExcelRepairService repairs;

  public ExcelImportController(ExcelImportService imports, ExcelRepairService repairs) {
    this.repairs = repairs;
    this.imports = imports;
  }

  @PostMapping(consumes = "multipart/form-data")
  ApiResult<?> upload(
      @RequestParam MultipartFile file,
      @RequestParam(defaultValue = "false") boolean visibleOnly,
      @AuthenticationPrincipal SessionUser actor)
      throws IOException {
    try (var stream = file.getInputStream()) {
      return ApiResult.ok(
          imports.importWorkbook(stream, actor == null ? null : actor.id(), visibleOnly));
    }
  }

  @PostMapping(value = "/repair", consumes = "multipart/form-data")
  ApiResult<?> repair(
      @RequestParam MultipartFile file,
      @RequestParam(defaultValue = "false") boolean visibleOnly,
      @AuthenticationPrincipal SessionUser actor)
      throws IOException {
    try (var stream = file.getInputStream()) {
      return ApiResult.ok(repairs.repair(stream, actor.id(), visibleOnly));
    }
  }

  @GetMapping("/{id}")
  ApiResult<?> result(@PathVariable UUID id) {
    return ApiResult.ok(imports.result(id));
  }
}
