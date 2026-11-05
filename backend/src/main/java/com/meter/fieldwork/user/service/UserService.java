package com.meter.fieldwork.user.service;

import com.meter.fieldwork.global.ApiException;
import com.meter.fieldwork.user.UserView;
import com.meter.fieldwork.user.entity.User;
import com.meter.fieldwork.user.entity.UserRole;
import com.meter.fieldwork.user.repository.UserRepository;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class UserService {
  private final UserRepository users;
  private final PasswordEncoder passwords;
  private final JdbcTemplate jdbc;

  public UserService(UserRepository users, PasswordEncoder passwords, JdbcTemplate jdbc) {
    this.users = users;
    this.passwords = passwords;
    this.jdbc = jdbc;
  }

  public UserView issue(String username, String name, String temporaryPassword) {
    return UserView.of(create(username, name, temporaryPassword, UserRole.WORKER));
  }

  public UserView bootstrap(String username, String name, String temporaryPassword) {
    // Serialize concurrent initialization commands in this database.
    jdbc.execute("select pg_advisory_xact_lock(41012026)");
    if (users.existsByRole(UserRole.ADMIN))
      throw new ApiException(409, "ADMIN_EXISTS", "관리자 계정이 이미 존재합니다.");
    return UserView.of(create(username, name, temporaryPassword, UserRole.ADMIN));
  }

  private User create(String username, String name, String password, UserRole role) {
    if (username == null || !username.matches("[A-Za-z0-9_.-]{3,32}"))
      throw new IllegalArgumentException();
    validateName(name);
    validatePassword(password);
    if (users.existsByLoginIdIgnoreCase(username))
      throw new ApiException(409, "USERNAME_EXISTS", "이미 사용 중인 아이디입니다.");
    return users.saveAndFlush(User.issue(username, name.trim(), passwords.encode(password), role));
  }

  @Transactional(readOnly = true)
  public UserView get(Long id) {
    return UserView.of(users.findById(id).orElseThrow(UserService::notFound));
  }

  @Transactional(readOnly = true)
  public List<UserView> list() {
    return users.findAll(org.springframework.data.domain.Sort.by("id")).stream()
        .map(UserView::of)
        .toList();
  }

  public void changePassword(Long id, String current, String replacement) {
    User user = users.lockById(id).orElseThrow(UserService::notFound);
    validatePassword(replacement);
    if (current == null
        || !passwords.matches(current, user.getPassword())
        || passwords.matches(replacement, user.getPassword()))
      throw new ApiException(400, "INVALID_PASSWORD", "현재 비밀번호와 다른 새 비밀번호를 입력하세요.");
    user.changePassword(passwords.encode(replacement), false);
  }

  public void reset(Long id, String temporaryPassword) {
    validatePassword(temporaryPassword);
    worker(id).changePassword(passwords.encode(temporaryPassword), true);
  }

  public UserView update(Long id, String name, Boolean active) {
    User user = worker(id);
    if (name == null && active == null) throw new IllegalArgumentException();
    if (name != null) {
      validateName(name);
      user.rename(name.trim());
    }
    if (active != null) user.setActive(active);
    return UserView.of(user);
  }

  private User worker(Long id) {
    User user = users.lockById(id).orElseThrow(UserService::notFound);
    if (user.getRole() != UserRole.WORKER) throw notFound();
    return user;
  }

  private static ApiException notFound() {
    return new ApiException(404, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
  }

  private static void validateName(String name) {
    if (name == null || name.isBlank() || name.trim().length() > 40)
      throw new IllegalArgumentException();
  }

  private static void validatePassword(String password) {
    if (password == null
        || password.length() < 8
        || password.length() > 64
        || password.getBytes(StandardCharsets.UTF_8).length > 72)
      throw new IllegalArgumentException();
  }
}
