package com.meter.fieldwork.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.meter.fieldwork.PostgresIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

@AutoConfigureMockMvc
class AuthIntegrationTest extends PostgresIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  final String password = "Fictional-pass-123";

  @BeforeEach
  void seed() {
    jdbc.update("delete from users where lower(login_id) in ('admin','worker','newworker')");
    for (String role : new String[] {"ADMIN", "WORKER"}) {
      jdbc.update(
          "insert into users(login_id,nickname,password,role) values(?,?,?,?)",
          role.toLowerCase(),
          "Test " + role,
          new BCryptPasswordEncoder().encode(password),
          role);
    }
  }

  MockHttpSession login(String username) throws Exception {
    return (MockHttpSession)
        mvc.perform(
                post("/api/auth/login")
                    .with(csrf())
                    .param("username", username)
                    .param("password", password))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andReturn()
            .getRequest()
            .getSession(false);
  }

  MockHttpSession changed(String username) throws Exception {
    MockHttpSession session = login(username);
    mvc.perform(
            patch("/api/auth/password")
                .session(session)
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"currentPassword\":\""
                        + password
                        + "\",\"newPassword\":\"Changed-pass-456\"}"))
        .andExpect(status().isOk());
    return (MockHttpSession)
        mvc.perform(
                post("/api/auth/login")
                    .with(csrf())
                    .param("username", username)
                    .param("password", "Changed-pass-456"))
            .andExpect(status().isOk())
            .andReturn()
            .getRequest()
            .getSession(false);
  }

  @Test
  void anonymousAndDemoHeaderCannotAuthenticate() throws Exception {
    mvc.perform(get("/api/users").header("X-Demo-Role", "ADMIN"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.success").value(false));
  }

  @Test
  void firstLoginIsRestrictedUntilPasswordChange() throws Exception {
    MockHttpSession session = login("worker");
    mvc.perform(get("/api/me").session(session))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.mustChangePassword").value(true))
        .andExpect(jsonPath("$.data.password").doesNotExist());
    mvc.perform(get("/api/users").session(session))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
    mvc.perform(get("/api/users").session(changed("worker")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()").value(1));
  }

  @Test
  void csrfRequiredForLoginAndPasswordChange() throws Exception {
    mvc.perform(post("/api/auth/login").param("username", "worker").param("password", password))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/auth/csrf"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.token").isString());
    mvc.perform(
            patch("/api/auth/password")
                .session(login("worker"))
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void inactiveUserCannotLogIn() throws Exception {
    jdbc.update("update users set is_active=false where login_id='worker'");
    mvc.perform(
            post("/api/auth/login")
                .with(csrf())
                .param("username", "worker")
                .param("password", password))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void workerCannotIssueAccounts() throws Exception {
    mvc.perform(
            post("/api/admin/investigators")
                .session(changed("worker"))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"username\":\"newworker\",\"name\":\"Test\",\"temporaryPassword\":\"Temporary123\"}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void adminIssuesHashedAccountAndRejectsCaseInsensitiveDuplicate() throws Exception {
    MockHttpSession admin = changed("admin");
    String body =
        "{\"username\":\"NewWorker\",\"name\":\"Test\",\"temporaryPassword\":\"Temporary123\"}";
    mvc.perform(
            post("/api/admin/investigators")
                .session(admin)
                .with(csrf())
                .contentType("application/json")
                .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.role").value("WORKER"))
        .andExpect(jsonPath("$.data.mustChangePassword").value(true));
    String hash =
        jdbc.queryForObject(
            "select password from users where lower(login_id)='newworker'", String.class);
    assertThat(new BCryptPasswordEncoder().matches("Temporary123", hash)).isTrue();
    mvc.perform(
            post("/api/admin/investigators")
                .session(admin)
                .with(csrf())
                .contentType("application/json")
                .content(body.replace("NewWorker", "newworker")))
        .andExpect(status().isConflict());
  }

  @Test
  void resetAndDeactivationRevokeExistingSessions() throws Exception {
    MockHttpSession worker = changed("worker"), admin = changed("admin");
    Long id = jdbc.queryForObject("select id from users where login_id='worker'", Long.class);
    mvc.perform(
            post("/api/admin/investigators/" + id + "/reset-password")
                .session(admin)
                .with(csrf())
                .contentType("application/json")
                .content("{\"temporaryPassword\":\"" + password + "\"}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/me").session(worker)).andExpect(status().isUnauthorized());
    MockHttpSession temporary = login("worker");
    mvc.perform(
            patch("/api/admin/investigators/" + id)
                .session(admin)
                .with(csrf())
                .contentType("application/json")
                .content("{\"active\":false}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/me").session(temporary)).andExpect(status().isUnauthorized());
  }

  @Test
  void wrongPasswordCannotChangeCredential() throws Exception {
    mvc.perform(
            patch("/api/auth/password")
                .session(login("worker"))
                .with(csrf())
                .contentType("application/json")
                .content(
                    "{\"currentPassword\":\"incorrect\",\"newPassword\":\"Changed-pass-456\"}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void realCsrfTokenSessionRotationAndLogoutWorkTogether() throws Exception {
    var csrfResult = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
    var anonymous = (MockHttpSession) csrfResult.getRequest().getSession(false);
    String originalId = anonymous.getId();
    String token =
        new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(csrfResult.getResponse().getContentAsString())
            .at("/data/token")
            .asText();
    var logged =
        mvc.perform(
                post("/api/auth/login")
                    .session(anonymous)
                    .header("X-CSRF-TOKEN", token)
                    .param("username", "worker")
                    .param("password", password))
            .andExpect(status().isOk())
            .andReturn();
    var session = (MockHttpSession) logged.getRequest().getSession(false);
    assertThat(session.getId()).isNotEqualTo(originalId);
    var newToken =
        mvc.perform(get("/api/auth/csrf").session(session)).andExpect(status().isOk()).andReturn();
    token =
        new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(newToken.getResponse().getContentAsString())
            .at("/data/token")
            .asText();
    mvc.perform(post("/api/auth/logout").session(session).header("X-CSRF-TOKEN", token))
        .andExpect(status().isOk());
    assertThat(session.isInvalid()).isTrue();
  }
}
