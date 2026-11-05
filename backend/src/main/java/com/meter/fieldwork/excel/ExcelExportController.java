package com.meter.fieldwork.excel;

import com.meter.fieldwork.global.ApiResult;
import com.meter.fieldwork.worksite.WorksiteService;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
public class ExcelExportController {
  private final ExcelExportService exports;
  private final WorksiteService sites;

  public ExcelExportController(ExcelExportService exports, WorksiteService sites) {
    this.exports = exports;
    this.sites = sites;
  }

  @GetMapping("/api/exports/sites.xlsx")
  ResponseEntity<StreamingResponseBody> download(
      @RequestParam(required = false) String middleBlockId,
      @RequestParam(required = false) String smallBlockId) {
    return ResponseEntity.ok()
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("Content-Disposition", "attachment; filename=fieldwork.xlsx")
        .header("Cache-Control", "no-store")
        .body(out -> exports.write(out, middleBlockId, smallBlockId));
  }

  @GetMapping("/api/exports/sites")
  ApiResult<?> page(
      @ModelAttribute WorksiteService.Filter filter,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int pageSize) {
    var result = new java.util.LinkedHashMap<>(sites.page(filter, page, pageSize, true));
    var items = (List<?>) result.get("items");
    result.put(
        "items",
        items.stream()
            .map(
                item -> {
                  var site =
                      sites.detail(((Number) ((Map<?, ?>) item).get("id")).longValue(), true);
                  var photos = (List<?>) site.remove("photos");
                  site.put(
                      "photoSlots",
                      photos.stream().map(photo -> ((Map<?, ?>) photo).get("slot")).toList());
                  return site;
                })
            .toList());
    return ApiResult.ok(result);
  }
}
