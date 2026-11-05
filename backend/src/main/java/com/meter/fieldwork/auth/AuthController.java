package com.meter.fieldwork.auth;

import com.meter.fieldwork.global.ApiResult;
import com.meter.fieldwork.user.UserView;
import com.meter.fieldwork.user.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
public class AuthController {
  private final UserService users;

  public AuthController(UserService users) {
    this.users = users;
  }

  @GetMapping({"/api/me", "/api/auth/me"})
  ApiResult<UserView> me(@AuthenticationPrincipal SessionUser principal) {
    return ApiResult.ok(users.get(principal.id()));
  }

  @GetMapping("/api/auth/csrf")
  ApiResult<?> csrf(CsrfToken token) {
    return ApiResult.ok(Map.of("headerName", token.getHeaderName(), "token", token.getToken()));
  }

  public record PasswordChange(String currentPassword, String newPassword) {}

  @PatchMapping("/api/auth/password")
  ApiResult<?> password(
      @AuthenticationPrincipal SessionUser principal,
      @RequestBody PasswordChange body,
      HttpServletRequest request) {
    users.changePassword(principal.id(), body.currentPassword(), body.newPassword());
    var session = request.getSession(false);
    if (session != null) session.invalidate();
    SecurityContextHolder.clearContext();
    return ApiResult.ok(Map.of("loginRequired", true));
  }
}
