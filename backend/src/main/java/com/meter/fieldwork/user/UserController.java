package com.meter.fieldwork.user;

import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.global.ApiResult;
import com.meter.fieldwork.user.entity.UserRole;
import com.meter.fieldwork.user.service.UserService;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class UserController {
  private final UserService users;

  public UserController(UserService users) {
    this.users = users;
  }

  @GetMapping("/api/users")
  ApiResult<?> users(@AuthenticationPrincipal SessionUser principal) {
    UserView me = users.get(principal.id());
    return ApiResult.ok(me.role() == UserRole.ADMIN ? users.list() : List.of(me));
  }

  @GetMapping("/api/admin/investigators")
  ApiResult<?> investigators(
      @RequestParam(defaultValue = "") String q,
      @RequestParam(required = false) String status,
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "20") int pageSize) {
    if (page < 1
        || pageSize < 1
        || pageSize > 100
        || (status != null && !List.of("active", "inactive").contains(status)))
      throw new IllegalArgumentException();
    String search = q.trim().toLowerCase(Locale.ROOT);
    var all =
        users.list().stream()
            .filter(u -> u.role() == UserRole.WORKER)
            .filter(u -> (u.name() + " " + u.username()).toLowerCase(Locale.ROOT).contains(search))
            .filter(u -> status == null || u.active() == status.equals("active"))
            .toList();
    int totalPages = Math.max(1, (all.size() + pageSize - 1) / pageSize),
        actual = Math.min(page, totalPages);
    int start = Math.min((actual - 1) * pageSize, all.size());
    return ApiResult.ok(
        Map.of(
            "items",
            all.subList(start, Math.min(start + pageSize, all.size())),
            "page",
            actual,
            "pageSize",
            pageSize,
            "total",
            all.size(),
            "totalPages",
            totalPages));
  }

  public record Issue(String username, String name, String temporaryPassword) {}

  @PostMapping("/api/admin/investigators")
  ApiResult<?> issue(@RequestBody Issue body) {
    return ApiResult.ok(users.issue(body.username(), body.name(), body.temporaryPassword()));
  }

  public record Update(String name, Boolean active) {}

  @PatchMapping("/api/admin/investigators/{id}")
  ApiResult<?> update(@PathVariable Long id, @RequestBody Update body) {
    return ApiResult.ok(users.update(id, body.name(), body.active()));
  }

  public record Reset(String temporaryPassword) {}

  @PostMapping("/api/admin/investigators/{id}/reset-password")
  ApiResult<?> reset(@PathVariable Long id, @RequestBody Reset body) {
    users.reset(id, body.temporaryPassword());
    return ApiResult.ok(Map.of("userId", id, "mustChangePassword", true, "resetAt", Instant.now()));
  }
}
