package com.meter.fieldwork.global;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meter.fieldwork.auth.SessionGuard;
import com.meter.fieldwork.auth.SessionUser;
import com.meter.fieldwork.user.repository.UserRepository;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {
  @Bean
  PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  UserDetailsService userDetailsService(UserRepository users) {
    return username ->
        new SessionUser(
            users
                .findByLoginIdIgnoreCase(username)
                .orElseThrow(() -> new UsernameNotFoundException("Invalid credentials")));
  }

  @Bean
  @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
  SecurityFilterChain securityFilterChain(
      HttpSecurity http, UserRepository users, ObjectMapper json) throws Exception {
    return http.cors(cors -> {})
        .csrf(csrf -> csrf.csrfTokenRepository(new HttpSessionCsrfTokenRepository()))
        .requestCache(cache -> cache.disable())
        .authorizeHttpRequests(
            auth ->
                auth.requestMatchers("/api/health", "/api/auth/csrf", "/api/auth/login")
                    .permitAll()
                    .requestMatchers(
                        "/api/admin/**", "/api/fee-rules/**", "/api/settlements", "/api/exports/**")
                    .hasRole("ADMIN")
                    .anyRequest()
                    .authenticated())
        .formLogin(
            login ->
                login
                    .loginProcessingUrl("/api/auth/login")
                    .successHandler(
                        (request, response, authentication) ->
                            write(
                                json,
                                response,
                                200,
                                ApiResult.ok(java.util.Map.of("authenticated", true))))
                    .failureHandler(
                        (request, response, exception) ->
                            write(
                                json,
                                response,
                                401,
                                ApiResult.error("INVALID_CREDENTIALS", "로그인 정보를 확인하세요."))))
        .logout(
            logout ->
                logout
                    .logoutUrl("/api/auth/logout")
                    .logoutSuccessHandler(
                        (request, response, authentication) ->
                            write(json, response, 200, ApiResult.ok(null))))
        .exceptionHandling(
            errors ->
                errors
                    .authenticationEntryPoint(
                        (request, response, exception) ->
                            write(
                                json,
                                response,
                                401,
                                ApiResult.error("UNAUTHENTICATED", "로그인이 필요합니다.")))
                    .accessDeniedHandler(
                        (request, response, exception) ->
                            write(
                                json,
                                response,
                                403,
                                ApiResult.error("FORBIDDEN", "요청 권한 또는 CSRF 토큰을 확인하세요."))))
        .addFilterBefore(new SessionGuard(users, json), AuthorizationFilter.class)
        .build();
  }

  private static void write(
      ObjectMapper json, HttpServletResponse response, int status, Object body) throws IOException {
    response.setStatus(status);
    response.setContentType("application/json;charset=UTF-8");
    json.writeValue(response.getOutputStream(), body);
  }

  @Bean
  CorsConfigurationSource corsConfigurationSource(
      @Value("${app.cors.allowed-origins:http://localhost:5173}") String origins) {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(Arrays.stream(origins.split(",")).map(String::trim).toList());
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("Content-Type", "X-CSRF-TOKEN"));
    config.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
  }
}
