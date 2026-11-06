package com.meter.fieldwork.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.global.ApiResult;
import com.meter.fieldwork.user.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class SessionGuard extends OncePerRequestFilter {
  private final UserRepository users;
  private final ObjectMapper json;
  private static final Set<String> PASSWORD_ROUTES =
      Set.of("/api/me", "/api/auth/me", "/api/auth/password", "/api/auth/csrf", "/api/auth/logout");

  public SessionGuard(UserRepository users, ObjectMapper json) {
    this.users = users;
    this.json = json;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    var authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null && authentication.getPrincipal() instanceof SessionUser principal) {
      var user = users.findById(principal.id()).orElse(null);
      if (user == null
          || !user.isActive()
          || user.getCredentialVersion() != principal.credentialVersion()) {
        var session = request.getSession(false);
        if (session != null) session.invalidate();
        SecurityContextHolder.clearContext();
        reject(response, 401, "SESSION_REVOKED", "다시 로그인하세요.");
        return;
      }
      if (user.isMustChangePassword()
          && !PASSWORD_ROUTES.contains(
              request.getRequestURI().substring(request.getContextPath().length()))) {
        reject(response, 403, "PASSWORD_CHANGE_REQUIRED", "비밀번호를 먼저 변경하세요.");
        return;
      }
    }
    chain.doFilter(request, response);
  }

  private void reject(HttpServletResponse response, int status, String code, String message)
      throws IOException {
    response.setStatus(status);
    response.setContentType("application/json;charset=UTF-8");
    json.writeValue(response.getOutputStream(), ApiResult.error(code, message));
  }
}
