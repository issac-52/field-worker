package com.meter.fieldwork.document;

import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.global.ApiResult;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/exports/cards")
public class DocumentController {
  private final DocumentService service;

  public DocumentController(DocumentService service) {
    this.service = service;
  }

  @PostMapping
  ApiResult<?> create(
      @RequestBody DocumentService.Request request, @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(Map.of("id", service.create(request, actor.id())));
  }

  @GetMapping
  ApiResult<?> list(@AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(service.list(actor.id()));
  }

  @GetMapping("/{id}")
  ApiResult<?> status(@PathVariable UUID id, @AuthenticationPrincipal SessionUser actor) {
    return ApiResult.ok(service.status(id, actor.id()));
  }

  @GetMapping("/{id}/download-check")
  ApiResult<?> check(@PathVariable UUID id, @AuthenticationPrincipal SessionUser actor) {
    service.checkWholeDownload(id, actor.id());
    return ApiResult.ok(Map.of("ready", true));
  }

  @GetMapping("/{id}/download")
  void whole(
      @PathVariable UUID id,
      @AuthenticationPrincipal SessionUser actor,
      jakarta.servlet.http.HttpServletResponse response)
      throws java.io.IOException {
    response.setContentType("application/zip");
    response.setHeader(
        "Content-Disposition", "attachment; filename=inspection-cards-" + id + ".zip");
    response.setHeader("Cache-Control", "no-store");
    service.writeWholeZip(id, actor.id(), response.getOutputStream());
  }

  @GetMapping("/{id}/parts/{part}")
  ResponseEntity<byte[]> download(
      @PathVariable UUID id, @PathVariable int part, @AuthenticationPrincipal SessionUser actor) {
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType("application/zip"))
        .header("Content-Disposition", "attachment; filename=cards-" + id + "-" + part + ".zip")
        .cacheControl(CacheControl.noStore())
        .body(service.download(id, part, actor.id()));
  }
}
