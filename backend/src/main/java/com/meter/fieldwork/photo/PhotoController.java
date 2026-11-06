package com.meter.fieldwork.photo;

import static com.meter.fieldwork.worksite.WorksiteController.admin;

import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.global.ApiResult;
import com.meter.fieldwork.worksite.WorksiteService;
import java.io.IOException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/sites/{site}/photos")
public class PhotoController {
  private final PhotoService photos;
  private final WorksiteService sites;

  public PhotoController(PhotoService photos, WorksiteService sites) {
    this.photos = photos;
    this.sites = sites;
  }

  @PostMapping(consumes = "multipart/form-data")
  ApiResult<?> upload(
      @PathVariable long site,
      @RequestParam PhotoService.Slot slot,
      @RequestParam MultipartFile file,
      @AuthenticationPrincipal SessionUser actor)
      throws IOException {
    photos.upload(site, slot, file.getBytes(), actor.id(), null, admin(actor));
    return ApiResult.ok(sites.detail(site, admin(actor)));
  }

  @PutMapping(value = "/{id}", consumes = "multipart/form-data")
  ApiResult<?> replace(
      @PathVariable long site,
      @PathVariable long id,
      @RequestParam MultipartFile file,
      @AuthenticationPrincipal SessionUser actor)
      throws IOException {
    photos.upload(site, null, file.getBytes(), actor.id(), id, admin(actor));
    return ApiResult.ok(sites.detail(site, admin(actor)));
  }

  @DeleteMapping("/{id}")
  ApiResult<?> delete(
      @PathVariable long site, @PathVariable long id, @AuthenticationPrincipal SessionUser actor) {
    photos.delete(site, id, actor.id(), admin(actor));
    return ApiResult.ok(sites.detail(site, admin(actor)));
  }

  @GetMapping("/{id}/content")
  ResponseEntity<byte[]> content(@PathVariable long site, @PathVariable long id) {
    var content = photos.content(site, id);
    return ResponseEntity.ok()
        .header("Cache-Control", "private, no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Type", content.type())
        .body(content.bytes());
  }
}
