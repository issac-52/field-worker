package com.meter.fieldwork.user.entity;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/*
  유저정보 테이블
*/
@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User {

  // ID (PK ID)
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  // 유저 ID (실사용 id)
  @Column(nullable = false, length = 80)
  private String loginId;

  // 닉네임
  @Column(nullable = false, length = 100)
  private String nickname;

  @Column(nullable = false)
  private String password;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private UserRole role;

  @Column(name = "is_active", nullable = false)
  private boolean isActive = true;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(nullable = false)
  private boolean mustChangePassword = true;

  @Column(nullable = false)
  private long credentialVersion;

  @Version private long version;

  public static User issue(String loginId, String nickname, String passwordHash, UserRole role) {
    User user = new User();
    user.loginId = loginId;
    user.nickname = nickname;
    user.password = passwordHash;
    user.role = role;
    user.createdAt = Instant.now();
    return user;
  }

  public void changePassword(String hash, boolean temporary) {
    password = hash;
    mustChangePassword = temporary;
    credentialVersion++;
  }

  public void rename(String name) {
    nickname = name;
  }

  public void setActive(boolean active) {
    if (isActive != active) {
      isActive = active;
      credentialVersion++;
    }
  }
}
