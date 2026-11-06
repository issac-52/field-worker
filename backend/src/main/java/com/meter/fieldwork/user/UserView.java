package com.meter.fieldwork.user;

import com.meter.fieldwork.user.entity.User;
import com.meter.fieldwork.user.entity.UserRole;

public record UserView(
    Long id,
    String name,
    UserRole role,
    String username,
    boolean active,
    boolean mustChangePassword) {
  public static UserView of(User user) {
    return new UserView(
        user.getId(),
        user.getNickname(),
        user.getRole(),
        user.getLoginId(),
        user.isActive(),
        user.isMustChangePassword());
  }
}
