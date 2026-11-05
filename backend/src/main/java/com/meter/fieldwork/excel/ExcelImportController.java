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

  public ExcelImportController(ExcelImportService imports) {
    this.imports = imports;
  }

  @PostMapping(consumes = "multipart/form-data")
  ApiResult<?> upload(@RequestParam MultipartFile file, @AuthenticationPrincipal SessionUser actor)
      throws IOException {
    try (var stream = file.getInputStream()) {
      return ApiResult.ok(imports.importWorkbook(stream, actor == null ? null : actor.id()));
    }
  }

  @GetMapping("/{id}")
  ApiResult<?> result(@PathVariable UUID id) {
    return ApiResult.ok(imports.result(id));
  }
}
