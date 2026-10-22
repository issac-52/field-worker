package com.meter.fieldwork.user.entity;

import jakarta.persistence.*;

import java.time.Instant;

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

}
